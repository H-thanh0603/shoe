#!/usr/bin/env python3
"""Smoke test KINETIC adapters against a live API (no model calls, no API key).
Run: ./agents/run_smoke.sh  (needs server up + KINETIC_ADMIN_PASSWORD for merchant part)
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kinetic_agents import (  # noqa: E402
    KineticClient,
    KineticMerchant,
    KineticStorefront,
    Unavailable,
)
from merchant_agent.types import (  # noqa: E402
    CampaignDraft,
    InventoryActionItem,
    MerchantSessionContext,
    PriceUpdateItem,
    PromotionDraft,
)
from shopping_agent.types import ShoppingSessionContext  # noqa: E402

PASS, FAIL = "✓", "✗"
results = []


def check(name, cond, extra=""):
    results.append(cond)
    print(f"{PASS if cond else FAIL} {name} {extra}")


async def main():
    shop = KineticStorefront()
    s = ShoppingSessionContext(session_id="smoke-1", user_id="guest-smoke",
                               timezone="Asia/Ho_Chi_Minh")

    # -- catalog --
    found = await shop.search_products(s, "air", limit=3)  # API match tên/brand
    check("search_products", len(found) > 0, f"({len(found)} kq)")
    fam = next((p for p in found if p.has_options), None) or found[0]
    det = await shop.get_product_details(s, fam.product_id)
    check("get_product_details family", det is not None and len(det.variants) > 0,
          f"({len(det.variants)} sizes, rating={det.rating})")
    var = next((v for v in det.variants if v.in_stock), None)
    out = next((v for v in det.variants if not v.in_stock), None)
    if var:
        vdet = await shop.get_product_details(s, var.product_id)
        check("get_product_details variant", vdet is not None and vdet.in_stock)
    check("get_product_details unknown", await shop.get_product_details(s, "nope") is None)

    # -- policies/fulfillment/preferences --
    prefs = await shop.get_preferences(s)
    check("get_preferences", prefs.user_id == "guest-smoke")
    pols = await shop.search_policies(s, "shipping cost")
    check("search_policies", len(pols) > 0, f"({pols[0].policy_id})")
    ff = await shop.get_fulfillment_options(s, [fam.product_id])
    check("get_fulfillment_options", ff and ff[0].fee == 30000.0)
    ho = await shop.checkout_handoff(s, await shop.get_cart(s))
    check("checkout_handoff", ho and ho[0].url.endswith("#shop"))

    # -- cart lifecycle (guest jar riêng, xong dọn sạch) --
    c0 = await shop.get_cart(s)
    check("get_cart starts empty", c0.item_count == 0)
    if var:
        c1 = await shop.add_to_cart(s, var.product_id, 1)
        check("add_to_cart", c1.item_count == 1, f"(total={c1.subtotal})")
        c2 = await shop.update_cart_item(s, var.product_id, 2)
        check("update_cart_item", c2.item_count == 2)
        c3 = await shop.remove_from_cart(s, var.product_id)
        check("remove_from_cart", c3.item_count == 0)
    try:
        await shop.add_to_cart(s, fam.product_id, 1)
        check("add family → Unavailable", False)
    except Unavailable as e:
        check("add family → Unavailable", True, f"({e})")
    if out:
        try:
            await shop.add_to_cart(s, out.product_id, 1)
            check("add out-of-stock → Unavailable", False)
        except Unavailable as e:
            check("add out-of-stock → Unavailable", True, f"({e})")

    # -- cart share: giỏ agent → link → gộp vào giỏ user (MOVE) --
    if var:
        from kinetic_agents import KineticClient
        agent2, user2 = KineticStorefront(), KineticClient()
        s2 = ShoppingSessionContext(session_id="smoke-share", user_id="guest-share",
                                    timezone="Asia/Ho_Chi_Minh")
        await agent2.add_to_cart(s2, var.product_id, 1)
        token = agent2.api.share_token
        check("share token", bool(token))
        claimed = user2.post("/api/v1/cart/claim", {"token": token})
        check("claim merged", claimed.get("merged", 0) == 1
              and any(i["variantId"] for i in claimed["items"]),
              f"(giỏ user {claimed['count']} món)")
        check("claim MOVE nguồn", (await agent2.get_cart(s2)).item_count == 0)
        # dọn giỏ user sau test
        user2.delete("/api/v1/cart")

    # -- orders --
    check("get_orders guest → []", await shop.get_orders(s) == [])
    check("get_order unknown → None", await shop.get_order(s, "KIN-XXXXXX") is None)

    # -- merchant (cần admin) --
    if not os.environ.get("KINETIC_ADMIN_PASSWORD"):
        print("-- thiếu KINETIC_ADMIN_PASSWORD: bỏ qua phần merchant")
    else:
        merch = KineticMerchant()
        m = MerchantSessionContext(session_id="smoke-m", merchant_id="kinetic",
                                   operator="smoke", timezone="Asia/Ho_Chi_Minh")
        # dọn change smoke còn sót từ lần chạy crash trước
        for c in await merch.get_pending_changes(m):
            if c.created_by == "smoke":
                await merch.discard_change(m, c.change_id)
        snap = await merch.get_business_snapshot(m)
        check("business_snapshot", snap.orders >= 0, f"(doanh thu={snap.sales})")
        series = await merch.query_metrics(m, "sales")
        check("query_metrics sales", len(series.points) > 0, f"({len(series.points)} điểm)")
        bad = await merch.query_metrics(m, "traffic")
        check("query_metrics traffic → note", not bad.points and bool(bad.note))
        check("campaigns → []", await merch.get_campaign_performance(m) == [])
        listings = await merch.search_listings(m, "kinetic", limit=3)
        check("search_listings", len(listings) > 0)
        full = await merch.get_listing(m, listings[0].listing_id)
        check("get_listing", full is not None and len(full.variants) > 0)
        alerts = await merch.get_inventory_alerts(m)
        check("inventory_alerts", isinstance(alerts, list), f"({len(alerts)} cảnh báo)")
        issues = await merch.get_order_issues(m)
        check("order_issues", isinstance(issues, list), f"({len(issues)} vấn đề)")
        ctx = await merch.get_pricing_context(m, listings[0].listing_id)
        check("pricing_context", ctx is not None and ctx.max_price_delta_pct == 20.0)

        v1 = full.variants[0].listing_id
        staged = [
            await merch.stage_price_update(m, [PriceUpdateItem(listing_id=v1,
                            new_price=full.price)], note="smoke"),
            await merch.stage_inventory_action(m, [InventoryActionItem(
                            listing_id=v1, action="restock", quantity=1)]),
            await merch.stage_listing_update(m, listings[0].listing_id,
                                             {"description": "Mô tả smoke test"}),
            await merch.stage_promotion(m, PromotionDraft(name="Smoke Test",
                            listing_ids=[listings[0].listing_id], discount_pct=5,
                            starts="2026-01-01", ends="2026-02-01")),
            await merch.stage_campaign(m, CampaignDraft(name="Smoke")),
        ]
        check("stage 5 changes", all(c.status.value == "staged" for c in staged))
        pend = await merch.get_pending_changes(m)
        check("pending_changes", len(pend) >= 5)

        # persist: change sống trong DB, adapter mới vẫn thấy
        merch2 = KineticMerchant()
        check("persist across restart", any(
            c.change_id == staged[0].change_id
            for c in await merch2.get_pending_changes(m)))

        # apply khi chưa duyệt → từ chối
        try:
            await merch.apply_change(m, staged[1].change_id)
            check("apply chưa duyệt → từ chối", False)
        except Exception as e:
            check("apply chưa duyệt → từ chối", "duyệt" in str(e))

        # duyệt qua API (như Admin UI) rồi apply nhập kho +1
        admin = merch.api
        admin.post(f"/api/v1/admin/agent-changes/{staged[1].change_id}/approve",
                   {"approved": True})
        slug, size = v1.split("::")
        variants = admin.get(f"/api/v1/admin/products/{full.listing_id}/variants")
        vid = next(v["id"] for v in variants if str(v["size"]) == size)
        stock0 = next(v["stock"] for v in variants if str(v["size"]) == size)
        applied = await merch.apply_change(m, staged[1].change_id)
        stock1 = next(v["stock"] for v in admin.get(
            f"/api/v1/admin/products/{full.listing_id}/variants")
            if str(v["size"]) == size)
        check("apply sau duyệt (+1 kho)", applied.status.value == "applied"
              and stock1 == stock0 + 1, f"({stock0}→{stock1})")
        # hoàn kho −1 trực tiếp (giữ số liệu sạch sau test)
        admin.post("/api/v1/admin/inventory", {"variantId": vid, "qty": -1})
        for c in [staged[0], staged[2], staged[3], staged[4]]:
            await merch.discard_change(m, c.change_id)
        check("discard all", await merch.get_pending_changes(m) == [])
        mc = await merch.get_merchant_context(m)
        check("merchant_context", len(mc["limitations"]) == 3)

    print(f"\n{sum(results)}/{len(results)} pass")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    asyncio.run(main())
