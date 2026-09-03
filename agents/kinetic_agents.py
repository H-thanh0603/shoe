# KINETIC adapters for anthropics/commerce-agents (Apache-2.0 blueprint).
#
# Implements StorefrontBackend + MerchantBackend over the KINETIC Express API
# (server/routes/*). Needs the blueprint packages importable:
#
#   PYTHONPATH=<blueprint>/commerce-common:<blueprint>/shopping-agent/core:<blueprint>/merchant-agent/core
#
# Env:
#   KINETIC_API            base URL, default http://localhost:3000
#   KINETIC_WEB_URL        storefront URL for handoff links, default http://localhost:3000
#   KINETIC_ADMIN_EMAIL    default admin@kinetic.vn (dev seed)
#   KINETIC_ADMIN_PASSWORD required for merchant writes/reads (no default on purpose)
#
# Conventions:
# - Family id = product slug. Variant id = "<slug>::<size>" (sizes are EU ints).
# - Currency is VND (no decimals); blueprint floats carry whole dongs.
# - Shopper sessions are guests (own cookie jar each); order history is
#   ref-code lookup only — see get_orders/get_order notes.
# - Merchant staged changes live in an in-memory ledger; only apply_change writes.

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import requests

from merchant_agent.backend import MerchantBackend
from merchant_agent.changes import ChangeNotApplicable
from merchant_agent.types import (
    ActorKind,
    AlertCounts,
    BusinessSnapshot,
    Campaign,
    CampaignDraft,
    ChangeItem,
    ChangeKind,
    ChangeStatus,
    DataLimitation,
    InventoryActionItem,
    InventoryAlert,
    Listing,
    ListingDetails,
    ListingFilters,
    MerchantSessionContext,
    MetricSeries,
    OrderIssue,
    PriceUpdateItem,
    PricingContext,
    PromotionDraft,
    StagedChange,
)
from shopping_agent.backend import NotOffered, StorefrontBackend, Unavailable
from shopping_agent.types import (
    Cart,
    CartItem,
    CheckoutHandoff,
    Disclosure,
    FulfillmentOption,
    Order,
    OrderItem,
    OrderStatus,
    Policy,
    Product,
    ProductDetails,
    SearchFilters,
    ShoppingSessionContext,
    UserPreferences,
)

API = os.environ.get("KINETIC_API", "http://localhost:3000")
WEB = os.environ.get("KINETIC_WEB_URL", "http://localhost:3000")

MAX_RESTOCK = 500
PRICE_DELTA_CAP_PCT = 20.0
PROMO_DISCOUNT_CAP_PCT = 50.0


class KineticError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code


class KineticClient:
    """requests.Session + envelope unwrap. One instance per agent session
    (shopper) so guest carts don't leak across sessions."""

    def __init__(self, base: str = API):
        self.base = base.rstrip("/")
        self.session = requests.Session()
        self._admin = False

    def call(self, method: str, path: str, **kw):
        r = self.session.request(method, self.base + path, timeout=20, **kw)
        try:
            body = r.json()
        except ValueError:
            raise KineticError(r.status_code, "BAD_RESPONSE", f"HTTP {r.status_code}")
        if not r.ok or not body.get("success"):
            err = body.get("error", {}) if isinstance(body, dict) else {}
            raise KineticError(r.status_code, err.get("code", "INTERNAL"),
                               err.get("message", f"HTTP {r.status_code}"))
        return body.get("data")

    def get(self, path: str, **kw):
        return self.call("GET", path, **kw)

    def post(self, path: str, body: dict | None = None, **kw):
        return self.call("POST", path, json=body or {}, **kw)

    def patch(self, path: str, body: dict | None = None, **kw):
        return self.call("PATCH", path, json=body or {}, **kw)

    def delete(self, path: str, **kw):
        return self.call("DELETE", path, **kw)

    def login_admin(self):
        email = os.environ.get("KINETIC_ADMIN_EMAIL", "admin@kinetic.vn")
        password = os.environ.get("KINETIC_ADMIN_PASSWORD", "")
        if not password:
            raise KineticError(401, "NO_ADMIN_CREDS", "Set KINETIC_ADMIN_PASSWORD")
        self.post("/api/v1/auth/login", {"email": email, "password": password})
        self._admin = True


# ---------------------------------------------------------------------------
# Shared product mapping
# ---------------------------------------------------------------------------

def _family_of(item: dict, variants: list[dict] | None = None) -> Product:
    sizes = [str(v["size"]) for v in (variants or [])]
    in_stock = any(v["stock"] > 0 for v in (variants or [])) if variants is not None else True
    return Product(
        product_id=item["slug"],
        title=item["name"],
        brand=item.get("brand"),
        price=float(item["price_vnd"]),
        currency="VND",
        category=item.get("purpose") or None,
        labels=[t for t in [item.get("tag")] if t],
        attributes={"collection": item.get("collection_name") or ""},
        in_stock=in_stock,
        short_description=(item.get("description") or "")[:200] or None,
        options={"size": sizes} if sizes else {},
    )


def _variant_of(family_slug: str, item: dict, variant: dict) -> Product:
    return Product(
        product_id=f"{family_slug}::{variant['size']}",
        title=f"{item['name']} (size {variant['size']})",
        brand=item.get("brand"),
        price=float(item["price_vnd"]),
        currency="VND",
        category=item.get("purpose") or None,
        in_stock=variant["stock"] > 0,
        option_values={"size": str(variant["size"])},
        variant_of=family_slug,
    )


def _split_variant(product_id: str) -> tuple[str, str | None]:
    if "::" in product_id:
        slug, size = product_id.split("::", 1)
        return slug, size
    return product_id, None


# ---------------------------------------------------------------------------
# Shopping agent
# ---------------------------------------------------------------------------

KINETIC_POLICIES = [
    ("shipping", "Phí vận chuyển", "shipping",
     "Miễn phí vận chuyển cho đơn từ 2.000.000₫. Dưới ngưỡng phí 30.000₫ toàn quốc, giao 2–4 ngày."),
    ("returns", "Đổi size 30 ngày", "returns",
     "Đổi size miễn phí trong 30 ngày nếu giày chưa mang ra ngoài. Hoàn tiền 200% nếu phát hiện hàng fake."),
    ("payment", "Thanh toán", "payment",
     "Thanh toán khi nhận hàng (COD). VNPay đang tích hợp — hiện checkout chỉ nhận COD."),
    ("tracking", "Tra cứu đơn hàng", "orders",
     "Mỗi đơn có mã dạng KIN-XXXXXX. Nhập mã tại trang Tra cứu đơn để xem trạng thái và chi tiết."),
    ("coupons", "Mã giảm giá", "pricing",
     "Nhập mã ở bước thanh toán để xem mức giảm ngay. Ví dụ mã mẫu: WELCOME10 (-10%), FREESHIP (miễn phí vận chuyển)."),
    ("sizing", "Chọn size", "sizing",
     "Size EU 39–44, phom true-to-size. Giữa 2 size nên lấy size lớn hơn khi chân bè."),
]


class KineticStorefront(StorefrontBackend):
    def __init__(self, client: KineticClient | None = None):
        self.api = client or KineticClient()

    # -- Catalog --

    async def search_products(self, session, query, filters=None, limit=8):
        params = {"q": query, "limit": min(limit, 24)}
        data = self.api.get("/api/v1/products", params=params)
        items = data["items"] if isinstance(data, dict) else data
        out = []
        for it in items[:limit]:
            try:
                detail = self.api.get(f"/api/v1/products/{it['slug']}")
            except KineticError:
                continue
            fam = _family_of(detail, detail.get("variants", []))
            if filters and filters.min_rating:
                continue  # ratings live on details, not search
            out.append(fam)
        return out

    async def get_product_details(self, session, product_id):
        slug, size = _split_variant(product_id)
        try:
            item = self.api.get(f"/api/v1/products/{slug}")
        except KineticError as e:
            return None if e.status == 404 else (_ for _ in ()).throw(e)
        variants = item.get("variants", [])
        if size is not None:
            v = next((x for x in variants if str(x["size"]) == size), None)
            if v is None:
                return None
            return ProductDetails(**_variant_of(slug, item, v).model_dump(),
                                  long_description=item.get("description"))
        try:
            reviews = self.api.get(f"/api/v1/products/{slug}/reviews")
        except KineticError:
            reviews = {"items": [], "avgRating": 0, "count": 0}
        fam = _family_of(item, variants)
        return ProductDetails(
            **fam.model_dump(exclude={"rating", "review_count"}),
            long_description=item.get("description"),
            specs={"collection": item.get("collection_name") or "—",
                   "purpose": item.get("purpose") or "all"},
            review_highlights=[r["content"] for r in reviews.get("items", [])[:2] if r.get("content")],
            rating=reviews.get("avgRating") or None,
            review_count=reviews.get("count") or 0,
            variants=[_variant_of(slug, item, v) for v in variants],
        )

    # -- Cart --

    def _cart(self) -> Cart:
        data = self.api.get("/api/v1/cart")
        items = []
        for it in data["items"]:
            slug, size = it["slug"], str(it["size"])
            items.append(CartItem(
                product_id=f"{slug}::{size}",
                title=f"{it['name']} (size {size})",
                price=float(it["priceVnd"]),
                quantity=it["qty"],
                option_values={"size": size},
                variant_of=slug,
            ))
        return Cart(items=items, currency="VND")

    def _numeric_variant(self, slug: str, size: str) -> dict:
        item = self.api.get(f"/api/v1/products/{slug}")
        v = next((x for x in item.get("variants", []) if str(x["size"]) == size), None)
        if v is None:
            raise Unavailable(f"size {size} does not exist")
        return item, v

    async def get_cart(self, session):
        return self._cart()

    async def add_to_cart(self, session, product_id, quantity):
        slug, size = _split_variant(product_id)
        if size is None:
            raise Unavailable(f"{slug} needs a size — pick one in stock")
        item, v = self._numeric_variant(slug, size)
        if v["stock"] <= 0:
            sibs = ", ".join(str(x["size"]) for x in item["variants"] if x["stock"] > 0) or "none"
            raise Unavailable(f"{slug} size {size} out of stock; in stock: {sibs}")
        try:
            self.api.post("/api/v1/cart/items", {"variantId": v["id"], "qty": quantity})
        except KineticError as e:
            if e.code == "OUT_OF_STOCK":
                raise Unavailable(str(e)) from e
            raise
        return self._cart()

    async def update_cart_item(self, session, product_id, quantity):
        slug, size = _split_variant(product_id)
        data = self.api.get("/api/v1/cart")
        line = None
        if size is not None:
            item, v = self._numeric_variant(slug, size)
            line = next((x for x in data["items"] if x["variantId"] == v["id"]), None)
        if line is None:
            return self._cart()
        try:
            self.api.patch(f"/api/v1/cart/items/{line['itemId']}", {"qty": quantity})
        except KineticError as e:
            if e.code == "OUT_OF_STOCK":
                raise Unavailable(str(e)) from e
            raise
        return self._cart()

    async def remove_from_cart(self, session, product_id):
        slug, size = _split_variant(product_id)
        data = self.api.get("/api/v1/cart")
        if size is not None:
            try:
                _, v = self._numeric_variant(slug, size)
            except Unavailable:
                return self._cart()
            line = next((x for x in data["items"] if x["variantId"] == v["id"]), None)
            if line:
                self.api.delete(f"/api/v1/cart/items/{line['itemId']}")
        return self._cart()

    # -- Customer context --

    async def get_preferences(self, session):
        return UserPreferences(user_id=session.user_id,
                               preferences={"store": "KINETIC", "currency": "VND"})

    async def checkout_handoff(self, session, cart):
        return [CheckoutHandoff(url=f"{WEB}/#shop", label="Mở giỏ hàng & thanh toán")]

    # -- Orders and policies --

    _STATUS = {"pending": OrderStatus.PROCESSING, "paid": OrderStatus.PROCESSING,
               "shipped": OrderStatus.SHIPPED, "done": OrderStatus.DELIVERED,
               "cancelled": OrderStatus.CANCELLED}

    async def get_orders(self, session, limit=5):
        # Guest sessions have no persistent identity on the storefront —
        # order lookup works per ref code via get_order.
        return []

    async def get_order(self, session, order_id):
        try:
            o = self.api.get(f"/api/v1/orders/ref/{order_id.strip().upper()}")
        except KineticError as e:
            return None if e.status == 404 else (_ for _ in ()).throw(e)
        return Order(
            order_id=o["ref_code"],
            status=self._STATUS.get(o["status"], OrderStatus.PROCESSING),
            placed_at=datetime.fromisoformat(o["created_at"]),
            items=[OrderItem(product_id=f"order::{n}", title=it["name_snapshot"],
                             quantity=it["qty"], price=float(it["unit_price_vnd"]),
                             option_values={"size": str(it["size_snapshot"])})
                   for n, it in enumerate(o["items"])],
            total=float(o["total_vnd"]),
            currency="VND",
            tracking_url=f"{WEB}/#/tra-don/{o['ref_code']}",
        )

    async def search_policies(self, session, query):
        q = query.lower()
        scored = [(sum(w in (title + " " + c).lower() for w in q.split()), pid, title, cat, c)
                  for pid, title, cat, c in KINETIC_POLICIES]
        hits = [x for x in scored if x[0] > 0] or [(0, *p) for p in KINETIC_POLICIES[:2]]
        hits.sort(reverse=True)
        return [Policy(policy_id=pid, title=title, category=cat, content=c)
                for _, pid, title, cat, c in hits[:3]]

    async def get_fulfillment_options(self, session, product_ids):
        return [FulfillmentOption(method="shipping", eta="2–4 ngày toàn quốc", fee=30000.0)]


# ---------------------------------------------------------------------------
# Merchant agent
# ---------------------------------------------------------------------------

def _listing_of(p: dict, variants: list[dict] | None = None) -> Listing:
    stock = sum(v["stock"] for v in variants) if variants is not None else int(p.get("total_stock", 0))
    status = "active" if p.get("is_active", True) else "paused"
    if status == "active" and stock <= 0:
        status = "out_of_stock"
    return Listing(
        listing_id=p["slug"],
        title=p["name"],
        status=status,
        price=float(p["price_vnd"]),
        currency="VND",
        stock=stock,
        category=p.get("purpose"),
        attributes={"brand": p.get("brand", ""), "tag": p.get("tag") or ""},
        options={"size": [str(v["size"]) for v in variants]} if variants else {},
    )


class KineticMerchant(MerchantBackend):
    def __init__(self, client: KineticClient | None = None):
        self.api = client or KineticClient()
        self._changes: dict[str, StagedChange] = {}
        self._seq = 0

    def _admin(self) -> KineticClient:
        if not self.api._admin:
            self.api.login_admin()
        return self.api

    def _products(self) -> list[dict]:
        return self._admin().get("/api/v1/admin/products")

    def _resolve(self, listing_id: str) -> tuple[dict, dict | None]:
        """-> (product, variant-or-None). listing_id is a slug or slug::size."""
        slug, size = _split_variant(listing_id)
        products = self._products()
        p = next((x for x in products if x["slug"] == slug or str(x["id"]) == slug), None)
        if p is None:
            raise ChangeNotApplicable(f"unknown listing {listing_id!r}")
        if size is None:
            return p, None
        variants = self._admin().get(f"/api/v1/admin/products/{p['id']}/variants")
        v = next((x for x in variants if str(x["size"]) == size), None)
        if v is None:
            raise ChangeNotApplicable(f"unknown variant {listing_id!r}")
        return p, v

    def _stage(self, session, kind: ChangeKind, summary: str,
               items: list[ChangeItem], payload: dict) -> StagedChange:
        self._seq += 1
        change = StagedChange(
            change_id=f"CHG-{self._seq:03d}",
            kind=kind, summary=summary, items=items,
            created_at=datetime.now(timezone.utc),
            created_by=session.operator, created_by_kind=ActorKind.AGENT,
            currency="VND",
            guardrail_notes=[f"payload:{k}={v}" for k, v in payload.items()],
        )
        self._changes[change.change_id] = (change, payload)
        return change

    def _get_staged(self, change_id: str):
        entry = self._changes.get(change_id)
        if entry is None or entry[0].status != ChangeStatus.STAGED:
            raise ChangeNotApplicable(f"no staged change {change_id!r}")
        return entry

    # -- Performance --

    async def get_business_snapshot(self, session, period=None):
        a = self._admin().get("/api/v1/admin/analytics")
        e = self._admin().get("/api/v1/admin/analytics/events")
        f = e["funnel"]
        return BusinessSnapshot(
            period=period or "30 ngày gần nhất",
            sales=float(a["revenue"]),
            orders=a["orders"],
            traffic=f["sessions"] or None,
            conversion_rate=(f["viewToCart"] / 100) if f["sessions"] else None,
            average_order_value=float(a["aov"]) if a["orders"] else None,
            currency="VND",
            alerts=AlertCounts(low_stock=len(a["lowStock"]),
                               order_issues=a["pendingOrders"],
                               pending_changes=sum(1 for c, _ in self._changes.values()
                                                   if c.status == ChangeStatus.STAGED)),
            note=None if f["sessions"] else "chưa có traffic 30 ngày",
        )

    async def query_metrics(self, session, metric, period=None, granularity="day", segment=None):
        if segment:
            return MetricSeries(metric=metric, granularity=granularity,
                                note="không phân khúc theo danh mục")
        if metric not in ("sales", "revenue", "orders"):
            return MetricSeries(metric=metric, note="chỉ có sales/revenue/orders")
        data = self._admin().get("/api/v1/admin/analytics/series",
                                 params={"metric": "orders" if metric == "orders" else "revenue",
                                         "days": 30})
        from merchant_agent.types import MetricPoint
        return MetricSeries(metric=metric, unit="VND" if metric != "orders" else "đơn",
                            granularity="day",
                            points=[MetricPoint(date=p["day"], value=float(p["value"]))
                                    for p in data["points"]])

    async def get_campaign_performance(self, session, campaign_id=None):
        return []  # no campaign system; see get_merchant_context limitations

    # -- Catalog --

    async def search_listings(self, session, query, filters=None, limit=8):
        q = query.lower()
        scored = [p for p in self._products()
                  if q in (p["name"] + " " + p["brand"] + " " + p["slug"]).lower()]
        if filters and filters.status:
            want_out = filters.status == "out_of_stock"
            scored = [p for p in scored
                      if (int(p.get("total_stock", 0)) <= 0) == want_out
                      or ({"active": True, "paused": False}.get(filters.status) == p.get("is_active"))]
        out = []
        for p in scored[:limit]:
            variants = self._admin().get(f"/api/v1/admin/products/{p['id']}/variants")
            out.append(_listing_of(p, variants))
        return out

    async def get_listing(self, session, listing_id):
        p, _ = self._resolve(listing_id)
        variants = self._admin().get(f"/api/v1/admin/products/{p['id']}/variants")
        try:
            reviews = self.api.get(f"/api/v1/products/{p['slug']}/reviews")
            snippets = [r["content"] for r in reviews.get("items", [])[:3] if r.get("content")]
        except KineticError:
            snippets = []
        fam = _listing_of(p, variants)
        return ListingDetails(
            **fam.model_dump(),
            long_description=p.get("description"),
            review_snippets=snippets,
            variants=[Listing(listing_id=f"{p['slug']}::{v['size']}", title=f"{p['name']} (size {v['size']})",
                              status="active" if v["stock"] > 0 else "out_of_stock",
                              price=float(p["price_vnd"]), currency="VND", stock=v["stock"],
                              option_values={"size": str(v["size"])}, variant_of=p["slug"])
                      for v in variants],
        )

    # -- Inventory and order health --

    async def get_inventory_alerts(self, session):
        a = self._admin().get("/api/v1/admin/analytics")
        alerts = []
        for v in a["lowStock"]:
            slug = next((p["slug"] for p in self._products() if p["name"] == v["name"]), "")
            alerts.append(InventoryAlert(
                listing_id=f"{slug}::{v['size']}" if slug else str(v["id"]),
                title=f"{v['name']} (size {v['size']})",
                kind="low_stock",
                option_values={"size": str(v["size"])},
                variant_of=slug or None,
                stock=v["stock"], threshold=3,
                storefront_visible=True,
            ))
        return alerts

    async def get_order_issues(self, session):
        orders = self._admin().get("/api/v1/admin/orders",
                                   params={"status": "pending", "limit": 100})
        items = orders["items"] if isinstance(orders, dict) else orders
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
        issues = []
        for o in items:
            created = datetime.fromisoformat(o["created_at"])
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created < cutoff:
                issues.append(OrderIssue(
                    issue_id=f"pending-{o['id']}", order_id=o["ref_code"], kind="delayed",
                    summary=f"Đơn {o['ref_code']} chờ xử lý quá 48h ({vnd(o['total_vnd'])})",
                    opened_at=created,
                ))
        return issues

    # -- Pricing --

    async def get_pricing_context(self, session, listing_id):
        p, v = self._resolve(listing_id)
        base = dict(listing_id=listing_id, current_price=float(p["price_vnd"]), currency="VND",
                    max_price_delta_pct=PRICE_DELTA_CAP_PCT,
                    max_promotion_discount_pct=PROMO_DISCOUNT_CAP_PCT)
        if v is None:
            variants = self._admin().get(f"/api/v1/admin/products/{p['id']}/variants")
            return PricingContext(**base, variants=[
                PricingContext(listing_id=f"{p['slug']}::{x['size']}",
                               current_price=float(p["price_vnd"]), currency="VND",
                               option_values={"size": str(x["size"])}) for x in variants])
        return PricingContext(**base, option_values={"size": str(v["size"])})

    # -- Staged writes --

    async def stage_listing_update(self, session, listing_id, fields, note=None):
        p, v = self._resolve(listing_id)
        if v is not None and any(k in fields for k in ("description", "title", "name")):
            raise ChangeNotApplicable("nội dung dùng chung theo sản phẩm — sửa ở mã sản phẩm")
        if any(k in fields for k in ("price", "stock")):
            raise ChangeNotApplicable("giá/tồn kho sửa bằng price/inventory update")
        patch, items = {}, []
        if "title" in fields or "name" in fields:
            patch["name"] = fields.get("title", fields.get("name"))
            items.append(ChangeItem(target=listing_id, field="name",
                                    before=p["name"], after=patch["name"]))
        if "description" in fields:
            patch["description"] = fields["description"]
            items.append(ChangeItem(target=listing_id, field="description", after="…"))
        status = fields.get("status")
        action = None
        if status in ("paused", "active"):
            action = "archive" if status == "paused" else "restore"
            items.append(ChangeItem(target=listing_id, field="status",
                                    before="paused" if not p["is_active"] else "active",
                                    after=status))
        if not items:
            raise ChangeNotApplicable(f"fields {sorted(fields)} không ánh xạ được")
        return self._stage(session, ChangeKind.LISTING_UPDATE,
                           f"Sửa {listing_id}: " + ", ".join(i.field for i in items),
                           items, {"product_id": p["id"], "patch": patch, "action": action})

    async def stage_price_update(self, session, items, note=None):
        changes, payload_items = [], []
        for it in items:
            p, _ = self._resolve(it.listing_id)
            before = float(p["price_vnd"])
            delta = abs(it.new_price - before) / before * 100 if before else 0
            if delta > PRICE_DELTA_CAP_PCT:
                raise ChangeNotApplicable(
                    f"{it.listing_id}: đổi {delta:.1f}% vượt trần {PRICE_DELTA_CAP_PCT}%")
            changes.append(ChangeItem(target=it.listing_id, field="price",
                                      before=before, after=float(it.new_price)))
            payload_items.append({"product_id": p["id"], "priceVnd": int(it.new_price)})
        return self._stage(session, ChangeKind.PRICE_UPDATE,
                           f"Đổi giá {len(changes)} mục", changes, {"prices": payload_items})

    async def stage_inventory_action(self, session, items, note=None):
        changes, payload_items, actions = [], [], []
        for it in items:
            p, v = self._resolve(it.listing_id)
            if it.action == "restock":
                if v is None:
                    raise ChangeNotApplicable("nhập kho phải chỉ rõ size (mã slug::size)")
                if (it.quantity or 0) > MAX_RESTOCK:
                    raise ChangeNotApplicable(f"nhập {(it.quantity)} vượt trần {MAX_RESTOCK}")
                changes.append(ChangeItem(target=it.listing_id, field="stock",
                                          before=v["stock"], after=v["stock"] + (it.quantity or 0)))
                payload_items.append({"variantId": v["id"], "qty": it.quantity or 0})
            elif it.action in ("pause", "activate"):
                if v is not None:
                    raise ChangeNotApplicable("ẩn/hiện theo size chưa hỗ trợ — làm ở cấp sản phẩm")
                actions.append({"product_id": p["id"],
                                "op": "archive" if it.action == "pause" else "restore"})
                changes.append(ChangeItem(target=it.listing_id, field="status", after=it.action))
            else:
                raise ChangeNotApplicable(f"action {it.action} không hỗ trợ")
        return self._stage(session, ChangeKind.INVENTORY_ACTION,
                           f"Kho {len(changes)} mục", changes,
                           {"moves": payload_items, "toggles": actions})

    async def stage_promotion(self, session, promotion):
        if promotion.discount_pct <= 0 or promotion.discount_pct > PROMO_DISCOUNT_CAP_PCT:
            raise ChangeNotApplicable(f"giảm giá phải 0–{PROMO_DISCOUNT_CAP_PCT}%")
        code = re.sub(r"[^A-Z0-9]", "", promotion.name.upper())[:10] or "PROMO"
        return self._stage(
            session, ChangeKind.PROMOTION, f"Coupon {code} -{promotion.discount_pct}%",
            [ChangeItem(target=code, field="coupon", after=f"-{promotion.discount_pct}%")],
            {"coupon": {"code": code, "type": "PERCENTAGE", "value": promotion.discount_pct,
                        "expiresAt": promotion.ends}},
            )

    async def stage_campaign(self, session, campaign):
        change = self._stage(session, ChangeKind.CAMPAIGN, f"Chiến dịch {campaign.name}",
                             [ChangeItem(target=campaign.name, field="campaign",
                                         after=campaign.objective or "")],
                             {"campaign": campaign.model_dump()})
        change.guardrail_notes.append("KINETIC chưa có hệ thống campaign — apply sẽ từ chối, tạo tay")
        return change

    async def get_pending_changes(self, session):
        return [c for c, _ in self._changes.values() if c.status == ChangeStatus.STAGED]

    async def apply_change(self, session, change_id):
        change, payload = self._get_staged(change_id)
        api = self._admin()
        try:
            if change.kind == ChangeKind.LISTING_UPDATE:
                if payload.get("patch"):
                    api.patch(f"/api/v1/admin/products/{payload['product_id']}", payload["patch"])
                if payload.get("action"):
                    api.patch(f"/api/v1/admin/products/{payload['product_id']}/{payload['action']}")
            elif change.kind == ChangeKind.PRICE_UPDATE:
                for pr in payload["prices"]:
                    api.patch(f"/api/v1/admin/products/{pr['product_id']}", {"priceVnd": pr["priceVnd"]})
            elif change.kind == ChangeKind.INVENTORY_ACTION:
                for m in payload["moves"]:
                    api.post("/api/v1/admin/inventory", m)
                for t in payload["toggles"]:
                    api.patch(f"/api/v1/admin/products/{t['product_id']}/{t['op']}")
            elif change.kind == ChangeKind.PROMOTION:
                api.post("/api/v1/admin/coupons", payload["coupon"])
            elif change.kind == ChangeKind.CAMPAIGN:
                raise ChangeNotApplicable("KINETIC chưa có hệ thống campaign — tạo tay")
        except ChangeNotApplicable:
            raise
        except KineticError as e:
            raise RuntimeError(f"apply thất bại: {e}") from e
        change.status = ChangeStatus.APPLIED
        change.applied_at = datetime.now(timezone.utc)
        change.applied_by = session.operator
        return change

    async def discard_change(self, session, change_id, actor_kind=ActorKind.OPERATOR):
        entry = self._changes.get(change_id)
        if entry is None:
            raise ChangeNotApplicable(f"no change {change_id!r}")
        change, _ = entry
        change.status = ChangeStatus.DISCARDED
        change.discarded_at = datetime.now(timezone.utc)
        change.discarded_by = session.operator
        change.discarded_by_kind = actor_kind
        return change

    async def get_merchant_context(self, session):
        return {"store": "KINETIC", "currency": "VND",
                "limitations": [DataLimitation(source="campaigns",
                                               note="chưa có hệ thống campaign"),
                                DataLimitation(source="buyer-messages",
                                               note="không có tin nhắn khách"),
                                DataLimitation(source="traffic-daily",
                                               note="chỉ có sessions 30 ngày, không series")]}


# ---------------------------------------------------------------------------
# Ready-made agent configs (import shopping_agent.config / merchant_agent.config)
# ---------------------------------------------------------------------------

def kinetic_shopping_config():
    from shopping_agent.config import ShoppingAgentConfig
    return ShoppingAgentConfig(
        brand_name="KINETIC",
        assistant_name="trợ lý mua giày KINETIC",
        brand_voice="thẳng thắn, ngắn gọn, nói tiếng Việt",
        domain_search_notes=("Size là số EU 39–44, mỗi size tồn kho riêng; "
                             "purpose: running/street/court/daily/trail. "
                             "Tìm kiếm text chỉ khớp tên/thương hiệu."),
        enable_cart=True,
        enable_orders=True,  # tra cứu theo mã KIN-XXXXXX qua get_order
        enable_policies=True,
        enable_fulfillment=True,
        max_quantity_per_item=10,  # khớp validation cart API
    )


def kinetic_merchant_config():
    from merchant_agent.config import MerchantAgentConfig
    return MerchantAgentConfig(
        brand_name="KINETIC",
        assistant_name="trợ lý vận hành KINETIC",
        max_price_delta_pct=PRICE_DELTA_CAP_PCT,
        max_promotion_discount_pct=PROMO_DISCOUNT_CAP_PCT,
        max_restock_quantity=MAX_RESTOCK,
        require_host_approval=True,  # mọi apply qua mặt duyệt của host
    )
