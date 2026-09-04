#!/usr/bin/env python3
"""Cầu HTTP giữa web KINETIC và agent runtime (Python).
Express xác thực admin trước rồi forward vào đây kèm secret nội bộ —
bridge KHÔNG bao giờ lộ ra ngoài localhost.

    ./agents/run_bridge.sh   # nghe 127.0.0.1:4001, cần AGENTS_VENV + .env

POST /chat {role, session_id, operator, message} -> {text, tools}
  role: "merchant" (duy nhất hiện tại; shopping chat web chưa làm)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

SECRET = os.environ.get("BRIDGE_SECRET", "")

app = FastAPI(title="kinetic-agent-bridge")
_sessions: dict = {}


class ChatIn(BaseModel):
    role: str = "merchant"
    session_id: str
    operator: str = "web"
    message: str


def _build(role: str):
    from pathlib import Path
    blueprint = Path(os.path.expanduser(os.environ.get("BLUEPRINT_DIR", "~/commerce-agents")))
    for sub in ("commerce-common", "shopping-agent/core", "merchant-agent/core",
                "shopping-agent/runtime-messages-api", "merchant-agent/runtime-messages-api"):
        if str(blueprint / sub) not in sys.path:
            sys.path.insert(0, str(blueprint / sub))
    from kinetic_agents import (KineticMerchant, KineticStorefront,
                                kinetic_merchant_config, kinetic_shopping_config,
                                make_llm_client)
    client = make_llm_client()
    if role == "merchant":
        from merchant_agent.types import MerchantSessionState
        from merchant_agent_runtime import MerchantAgent
        agent = MerchantAgent(backend=KineticMerchant(),
                              skills_dir=blueprint / "merchant-agent" / "skills",
                              config=kinetic_merchant_config(), client=client)
        return agent, MerchantSessionState
    from shopping_agent.types import ShoppingSessionState
    from shopping_agent_runtime import ShoppingAgent
    agent = ShoppingAgent(backend=KineticStorefront(),
                          skills_dir=blueprint / "shopping-agent" / "skills",
                          config=kinetic_shopping_config(), client=client)
    return agent, ShoppingSessionState


def _ctx(role: str, session_id: str, operator: str):
    if role == "merchant":
        from merchant_agent.types import MerchantSessionContext
        return MerchantSessionContext(session_id=session_id, merchant_id="kinetic",
                                      operator=operator, timezone="Asia/Ho_Chi_Minh")
    from shopping_agent.types import ShoppingSessionContext
    return ShoppingSessionContext(session_id=session_id, user_id=operator,
                                  timezone="Asia/Ho_Chi_Minh")


@app.post("/chat")
async def chat(body: ChatIn, x_bridge_secret: str = Header(default="")):
    if not SECRET or x_bridge_secret != SECRET:
        raise HTTPException(403, "bad bridge secret")
    if body.role != "merchant":
        raise HTTPException(400, "role web hiện tại chỉ hỗ trợ merchant")
    if not body.message.strip():
        raise HTTPException(400, "message trống")
    text_parts, tools = [], []
    try:
        key = (body.role, body.session_id)
        if key not in _sessions:
            agent, state_cls = _build(body.role)
            _sessions[key] = [agent, _ctx(body.role, body.session_id, body.operator),
                              state_cls()]
        agent, session, state = _sessions[key]
        async for event in agent.stream_turn([{"role": "user", "content": body.message}],
                                             session, state):
            kind = getattr(event, "kind", None) or (event.get("kind", "?")
                                                   if isinstance(event, dict) else "?")
            if kind == "text_delta":
                text_parts.append(event.get("text", "") if isinstance(event, dict)
                                  else getattr(event, "text", ""))
            elif kind == "tool_call":
                name = event.get("name", "?") if isinstance(event, dict) else "?"
                if name not in tools:
                    tools.append(name)
    except Exception as e:
        return {"text": f"Lỗi agent: {e}", "tools": tools, "error": True}
    return {"text": "".join(text_parts).strip(), "tools": tools}
