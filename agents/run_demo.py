#!/usr/bin/env python3
"""Chat console demo: shopping agent hoặc merchant agent trên API KINETIC thật.
Cần: server chạy, BLUEPRINT_DIR đúng, key của provider (Anthropic hoặc proxy).

    ./agents/run_smoke.sh            # không cần key
    python agents/run_demo.py        # shopping (mặc định)
    python agents/run_demo.py --merchant
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def build(role: str):
    from pathlib import Path
    blueprint = Path(os.environ.get("BLUEPRINT_DIR", "/tmp/commerce-agents"))
    for sub in ("commerce-common", "shopping-agent/core", "merchant-agent/core",
                "shopping-agent/runtime-messages-api", "merchant-agent/runtime-messages-api"):
        sys.path.insert(0, str(blueprint / sub))
    from kinetic_agents import (KineticMerchant, KineticStorefront,
                                kinetic_merchant_config, kinetic_shopping_config,
                                make_llm_client)

    client = make_llm_client()
    if role == "merchant":
        from merchant_agent_runtime import MerchantAgent
        agent = MerchantAgent(backend=KineticMerchant(),
                              skills_dir=blueprint / "merchant-agent" / "skills",
                              config=kinetic_merchant_config(), client=client)
        ctx_kw = dict(session_id="demo-m", merchant_id="kinetic", operator="demo",
                      timezone="Asia/Ho_Chi_Minh")
    else:
        from shopping_agent_runtime import ShoppingAgent
        agent = ShoppingAgent(backend=KineticStorefront(),
                              skills_dir=blueprint / "shopping-agent" / "skills",
                              config=kinetic_shopping_config(), client=client)
        ctx_kw = dict(session_id="demo-s", user_id="guest-demo",
                      timezone="Asia/Ho_Chi_Minh")
    return agent, ctx_kw


async def chat(role: str):
    agent, ctx_kw = build(role)
    if role == "merchant":
        from merchant_agent.types import MerchantSessionContext
        session, state = MerchantSessionContext(**ctx_kw), None
        from merchant_agent.types import MerchantSessionState
        state = MerchantSessionState()
    else:
        from shopping_agent.types import ShoppingSessionContext, ShoppingSessionState
        session, state = ShoppingSessionContext(**ctx_kw), ShoppingSessionState()
    print(f"[{role}] gõ 'quit' để thoát. VD shopping: 'giày chạy bộ dưới 3 triệu còn size 42'")
    while True:
        try:
            text = input("bạn> ").strip()
        except EOFError:
            break
        if text.lower() in ("quit", "exit"):
            break
        if not text:
            continue
        async for event in agent.stream_turn([{"role": "user", "content": text}],
                                             session, state):
            kind = getattr(event, "kind", None) or event.get("kind", "?")
            if kind == "text_delta":
                print(event.get("text", ""), end="", flush=True)
            elif kind in ("turn_complete",):
                print()
        print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--merchant", action="store_true")
    args = ap.parse_args()
    asyncio.run(chat("merchant" if args.merchant else "shopping"))


if __name__ == "__main__":
    main()
