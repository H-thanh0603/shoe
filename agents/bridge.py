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

# Chống DoS/RAM: tối đa phiên + lock chống 2 turn cùng lúc phá state +
# trần turn/phiên (context phình + tốn tiền).
MAX_SESSIONS = 50
MAX_TURNS = 30
_sessions: dict = {}
_locks: dict = {}


def _evict_if_full():
    while len(_sessions) >= MAX_SESSIONS:
        _sessions.pop(next(iter(_sessions)))
        _locks.pop(next(iter(_locks)), None)


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


async def _run_turn(agent, session, state, message):
    """Yield (kind, payload) — dùng chung cho /chat (gom) và /chat_stream (live)."""
    text_parts, tools = [], []
    async for event in agent.stream_turn([{"role": "user", "content": message}],
                                         session, state):
        kind = getattr(event, "kind", None) or (event.get("kind", "?")
                                               if isinstance(event, dict) else "?")
        if kind == "text_delta":
            t = event.get("text", "") if isinstance(event, dict) else getattr(event, "text", "")
            text_parts.append(t)
            yield "text", t
        elif kind == "tool_call":
            name = event.get("name", "?") if isinstance(event, dict) else "?"
            if name not in tools:
                tools.append(name)
                yield "tool", name
    yield "done", {"text": "".join(text_parts).strip(), "tools": tools}


def _get_or_build(body: ChatIn):
    import asyncio
    key = (body.role, body.session_id)
    if key not in _sessions:
        _evict_if_full()
        agent, state_cls = _build(body.role)
        _sessions[key] = [agent, _ctx(body.role, body.session_id, body.operator),
                          state_cls(), 0]  # [.., turn_count]
        _locks[key] = asyncio.Lock()
    entry = _sessions[key]
    if entry[3] >= MAX_TURNS:
        raise RuntimeError("Phiên chat đã quá 30 lượt — tải lại trang để bắt đầu phiên mới (gọn context, rẻ hơn).")
    entry[3] += 1
    return entry[0], entry[1], entry[2], _locks[key]


def _check(body: ChatIn, secret: str):
    if not SECRET or secret != SECRET:
        raise HTTPException(403, "bad bridge secret")
    if body.role != "merchant":
        raise HTTPException(400, "role web hiện tại chỉ hỗ trợ merchant")
    if not body.message.strip():
        raise HTTPException(400, "message trống")


@app.post("/chat")
async def chat(body: ChatIn, x_bridge_secret: str = Header(default="")):
    _check(body, x_bridge_secret)
    text, tools = "", []
    try:
        agent, session, state, lock = _get_or_build(body)
        async with lock:  # 1 turn/phiên tại 1 thời điểm — chống race state
            async for kind, payload in _run_turn(agent, session, state, body.message):
                if kind == "text":
                    text += payload
                elif kind == "tool":
                    tools.append(payload)
    except Exception as e:
        return {"text": f"Lỗi agent: {e}", "tools": tools, "error": True}
    return {"text": text.strip(), "tools": tools}


@app.post("/chat_stream")
async def chat_stream(body: ChatIn, x_bridge_secret: str = Header(default="")):
    from fastapi.responses import StreamingResponse
    import json as _json
    _check(body, x_bridge_secret)

    async def gen():
        try:
            agent, session, state, lock = _get_or_build(body)
            async with lock:
                async for kind, payload in _run_turn(agent, session, state, body.message):
                    yield f"data: {_json.dumps({'kind': kind, 'payload': payload})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'kind': 'error', 'payload': str(e)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")
