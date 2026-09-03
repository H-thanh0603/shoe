# BACKEND.md — FOOTWEAR E-COMMERCE BACKEND SPECIFICATION

## 01 — ROLE

Bạn là:

- Senior Backend Engineer
- Software Architect
- Database Engineer
- Security Engineer
- E-commerce System Engineer

Frontend / UX/UI của dự án đã được xây dựng.

**Nhiệm vụ hiện tại: xây dựng toàn bộ Backend + Database + Business Logic + API để kết nối với frontend hiện có.**

Không redesign frontend nếu không cần thiết.

Không phá vỡ UI/UX hiện tại.

Backend phải được xây dựng theo hướng:

> Production-ready E-commerce Backend.

---

# 02 — FIRST RULE

## KHÔNG CODE NGAY

Trước tiên hãy đọc toàn bộ source code hiện tại.

Phân tích:

- frontend architecture
- routes
- pages
- components
- API calls hiện có
- mock data
- types/interfaces
- product model đang được frontend giả định
- cart state
- authentication state
- checkout flow
- order flow
- admin UI
- search
- filters
- wishlist
- reviews

Sau đó tạo:

```text
BACKEND_IMPLEMENTATION_PLAN.md
```

Trong đó mô tả:

1. Backend architecture
2. Database architecture
3. Entity relationship
4. API design
5. Authentication
6. Authorization
7. Product system
8. Inventory
9. Cart
10. Order
11. Payment
12. Coupon
13. Review
14. Search
15. Admin
16. Security
17. Caching
18. Background jobs
19. Testing
20. Deployment

Chỉ bắt đầu code sau khi đã phân tích frontend.

---

# 03 — ARCHITECTURE

Nếu project chưa có backend architecture rõ ràng, ưu tiên:

```text
Frontend
   ↓
API
   ↓
Controller
   ↓
Service
   ↓
Repository / ORM
   ↓
PostgreSQL
```

Các thành phần hỗ trợ:

```text
Redis
Queue
Object Storage
Payment Provider
Email Service
```

Không để business logic nằm trực tiếp trong API route/controller.

---

# 04 — RECOMMENDED STACK

Nếu project hiện tại chưa cố định backend stack:

### Backend

Ưu tiên:

- Node.js
- TypeScript
- NestJS

hoặc backend framework tương đương nếu project hiện tại đã sử dụng framework khác.

### Database

PostgreSQL.

### ORM

Prisma hoặc Drizzle.

### Cache

Redis.

### Validation

Zod / class-validator tùy framework.

### Authentication

Secure session hoặc JWT architecture phù hợp.

### Background jobs

BullMQ + Redis hoặc tương đương.

---

# 05 — DATABASE

Thiết kế database thực tế.

Core entities:

```text
User
Role
Permission

Product
ProductVariant
ProductImage
Category
Brand
Collection

Size
Color

Inventory
InventoryTransaction

Cart
CartItem

Wishlist
WishlistItem

Order
OrderItem

Payment
PaymentTransaction

ShippingAddress

Coupon
Promotion

Review
ReviewImage

Notification

AuditLog
```

---

# 06 — USER

User:

```text
id
email
password_hash
name
avatar
phone
status
email_verified
created_at
updated_at
```

Không lưu plaintext password.

---

# 07 — ROLE

Hỗ trợ:

```text
CUSTOMER
ADMIN
STAFF
```

Không hard-code authorization ở frontend.

Backend phải kiểm tra quyền.

---

# 08 — PRODUCT

Product:

```text
id
name
slug
description
short_description
brand_id
category_id
status
base_price
compare_at_price
seo_title
seo_description
created_at
updated_at
```

Product không trực tiếp quản lý stock theo size/color.

---

# 09 — PRODUCT VARIANT

Variant là phần cực kỳ quan trọng.

Ví dụ:

```text
Nike Air X
```

Variants:

```text
White / 40
White / 41
White / 42

Black / 40
Black / 41
Black / 42
```

Variant:

```text
id
product_id
sku
size_id
color_id
price
compare_at_price
barcode
status
```

SKU phải unique.

---

# 10 — PRODUCT IMAGE

Một product có nhiều image.

Có:

```text
id
product_id
variant_id nullable
url
alt
sort_order
is_primary
```

Có thể gắn ảnh riêng cho từng màu.

---

# 11 — CATEGORY

Hỗ trợ category hierarchy.

Ví dụ:

```text
Shoes
 ├── Sneakers
 ├── Running
 ├── Basketball
 ├── Lifestyle
 └── Training
```

Có:

```text
parent_id
```

---

# 12 — BRAND

Brand:

```text
id
name
slug
logo
description
status
```

---

# 13 — COLLECTION

Collection dùng cho campaign.

Ví dụ:

```text
New Drop
Night Runner
Street Future
Limited Edition
```

Có thể liên kết nhiều product.

Dùng many-to-many.

---

# 14 — INVENTORY

Không chỉ có:

```text
stock
```

Thiết kế:

```text
Inventory
InventoryTransaction
```

Inventory:

```text
variant_id
quantity
reserved_quantity
available_quantity
```

---

# 15 — INVENTORY TRANSACTION

Mọi thay đổi inventory phải có lịch sử.

Ví dụ:

```text
RESTOCK
SALE
RESERVATION
RELEASE
RETURN
ADJUSTMENT
DAMAGE
```

Có:

```text
quantity
before_quantity
after_quantity
reference_type
reference_id
created_at
```

---

# 16 — CONCURRENCY / OVERSELLING

Đây là vấn đề bắt buộc phải xử lý.

Không được làm:

```text
stock = stock - quantity
```

một cách đơn giản.

Khi checkout:

```text
BEGIN TRANSACTION

LOCK inventory row

CHECK available quantity

RESERVE STOCK

CREATE ORDER

CREATE ORDER ITEMS

COMMIT
```

Nếu không đủ:

```text
ROLLBACK
```

Không cho phép:

```text
stock = -1
```

hoặc overselling.

---

# 17 — CART

Cart:

```text
id
user_id
status
created_at
updated_at
```

CartItem:

```text
cart_id
variant_id
quantity
```

Không lưu giá cố định từ frontend làm source of truth.

Backend phải lấy giá hiện tại từ database.

---

# 18 — CART VALIDATION

Khi:

- add cart
- update quantity
- checkout

Backend phải kiểm tra:

- product tồn tại
- variant tồn tại
- variant active
- stock
- price
- promotion
- product availability

---

# 19 — WISHLIST

Hỗ trợ:

```text
User
 ↓
Wishlist
 ↓
WishlistItem
 ↓
Product
```

Không cho duplicate wishlist item.

---

# 20 — ORDER

Order:

```text
id
order_number
user_id

subtotal
discount
shipping_fee
tax
total

currency

status
payment_status

shipping_address_snapshot

created_at
updated_at
```

---

# 21 — ORDER ITEM

OrderItem phải lưu snapshot.

```text
product_id
variant_id

product_name
sku
size
color

unit_price
quantity
subtotal
```

Không phụ thuộc hoàn toàn vào Product hiện tại.

Nếu product bị đổi tên sau này:

Order cũ vẫn phải giữ thông tin cũ.

---

# 22 — ORDER STATUS

Thiết kế state machine:

```text
PENDING
↓
CONFIRMED
↓
PROCESSING
↓
SHIPPED
↓
DELIVERED
```

Các nhánh:

```text
CANCELLED
REFUNDED
RETURNED
```

Không cho phép chuyển trạng thái tùy tiện.

Ví dụ:

```text
DELIVERED → PENDING
```

phải bị reject.

---

# 23 — PAYMENT

Tạo abstraction:

```text
PaymentProvider
```

Có thể implement:

```text
COD
Stripe
VNPay
MoMo
```

Backend không được phụ thuộc cứng vào một provider.

---

# 24 — PAYMENT SECURITY

Frontend không được quyết định:

```text
price
discount
shipping
total
payment amount
```

Frontend chỉ gửi:

```text
product/variant
quantity
coupon
shipping information
payment method
```

Backend tính lại toàn bộ.

---

# 25 — PAYMENT CALLBACK

Payment provider callback/webhook phải:

1. Verify signature.
2. Verify order.
3. Verify amount.
4. Verify currency.
5. Verify transaction.
6. Idempotency check.
7. Update payment.
8. Update order.
9. Update inventory.

Không tin callback từ client.

---

# 26 — IDEMPOTENCY

Các API quan trọng phải chống duplicate request.

Đặc biệt:

```text
Create Order
Payment
Payment Webhook
Checkout
Inventory Reservation
```

Ví dụ:

```text
Idempotency-Key
```

Một request gửi lại không được tạo:

- 2 orders
- 2 payments
- trừ stock 2 lần

---

# 27 — COUPON

Coupon:

```text
code
type
value
minimum_order
maximum_discount
usage_limit
per_user_limit
starts_at
expires_at
status
```

Types:

```text
PERCENTAGE
FIXED
FREE_SHIPPING
```

Backend phải validate coupon.

Không tin discount từ frontend.

---

# 28 — PROMOTION

Hỗ trợ:

- product discount
- category discount
- collection discount
- flash sale
- limited drop

Thiết kế promotion engine riêng.

Không hard-code:

```text
if product == X:
    discount = 30%
```

---

# 29 — PRICE CALCULATION

Tạo:

```text
PricingService
```

Flow:

```text
Product Price
 ↓
Variant Price
 ↓
Promotion
 ↓
Coupon
 ↓
Subtotal
 ↓
Shipping
 ↓
Tax
 ↓
Final Total
```

Một nguồn tính giá duy nhất.

---

# 30 — SEARCH

Search backend hỗ trợ:

- product name
- SKU
- brand
- category
- collection

Có:

- pagination
- filtering
- sorting
- price range
- size
- color
- brand
- category
- availability

Không load toàn bộ product database về frontend.

---

# 31 — SEARCH TECHNOLOGY

Ban đầu có thể sử dụng PostgreSQL:

- indexes
- full-text search
- trigram
- fuzzy matching

Khi dữ liệu lớn:

Có thể chuyển sang:

- Elasticsearch
- OpenSearch
- Meilisearch
- Typesense

Thiết kế abstraction để có thể thay search engine.

---

# 32 — PRODUCT API

Ví dụ:

```text
GET /api/v1/products
GET /api/v1/products/:slug

GET /api/v1/categories
GET /api/v1/categories/:slug

GET /api/v1/brands
GET /api/v1/collections

GET /api/v1/search
```

---

# 33 — CART API

```text
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id
DELETE /api/v1/cart
```

---

# 34 — WISHLIST API

```text
GET    /api/v1/wishlist
POST   /api/v1/wishlist/:productId
DELETE /api/v1/wishlist/:productId
```

---

# 35 — CHECKOUT API

```text
POST /api/v1/checkout/validate
POST /api/v1/orders
GET  /api/v1/orders
GET  /api/v1/orders/:id
POST /api/v1/orders/:id/cancel
```

---

# 36 — REVIEW API

```text
GET  /api/v1/products/:id/reviews
POST /api/v1/products/:id/reviews
PATCH /api/v1/reviews/:id
DELETE /api/v1/reviews/:id
```

Chỉ user đủ điều kiện mới được đánh giá.

Ưu tiên:

```text
Verified Purchase
```

---

# 37 — AUTH API

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout

POST /api/v1/auth/refresh

POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password

POST /api/v1/auth/verify-email
```

---

# 38 — USER API

```text
GET   /api/v1/me
PATCH /api/v1/me
GET   /api/v1/me/orders
GET   /api/v1/me/wishlist
GET   /api/v1/me/addresses
```

---

# 39 — ADMIN API

Admin endpoints phải tách rõ.

Ví dụ:

```text
/api/v1/admin/products
/api/v1/admin/orders
/api/v1/admin/users
/api/v1/admin/inventory
/api/v1/admin/promotions
/api/v1/admin/reviews
```

Tất cả phải có authorization.

---

# 40 — PAGINATION

Không trả:

```text
SELECT * FROM products
```

rồi gửi toàn bộ frontend.

API phải pagination.

Ví dụ:

```text
?page=1
&limit=24
```

Có metadata:

```json
{
  "page": 1,
  "limit": 24,
  "total": 1250,
  "totalPages": 53
}
```

Với dữ liệu rất lớn, cân nhắc cursor pagination.

---

# 41 — API RESPONSE

Chuẩn hóa response.

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product not found"
  }
}
```

Không trả stack trace production.

---

# 42 — VALIDATION

Tất cả input từ client phải validate.

Ví dụ:

```text
email
password
quantity
size
coupon
address
phone
```

Không tin frontend validation.

Frontend validation chỉ phục vụ UX.

Backend validation mới là security boundary.

---

# 43 — AUTHORIZATION

Kiểm tra server-side:

```text
Customer
Staff
Admin
```

Ví dụ:

User A không thể:

```text
GET /orders/user-B-order
```

chỉ bằng cách sửa ID.

Phải chống:

- IDOR
- privilege escalation
- broken access control

---

# 44 — SECURITY

Audit:

### Authentication

- brute force
- credential stuffing
- session theft
- token theft

### API

- SQL injection
- XSS
- CSRF
- SSRF
- IDOR
- rate-limit bypass

### E-commerce

- price manipulation
- coupon abuse
- inventory abuse
- payment manipulation
- order manipulation

### Upload

- malicious files
- MIME spoofing
- oversized files
- executable upload

---

# 45 — RATE LIMITING

Rate limit các endpoint nhạy cảm:

```text
login
register
forgot-password
search
review
checkout
coupon
payment
```

Không áp dụng một limit giống nhau cho mọi API.

---

# 46 — REDIS

Redis có thể dùng cho:

```text
session
cache
rate limit
temporary inventory reservation
hot products
popular products
search suggestions
```

Không dùng Redis làm source of truth cho dữ liệu quan trọng nếu PostgreSQL là database chính.

---

# 47 — CACHE

Cache:

```text
Product detail
Category
Collection
Popular products
Product listing
```

Không cache dữ liệu nhạy cảm sai cách.

Đặc biệt:

- inventory realtime
- payment
- user-specific cart

phải được xử lý cẩn thận.

---

# 48 — CACHE INVALIDATION

Khi admin thay đổi product:

```text
Update Product
 ↓
Database
 ↓
Invalidate Cache
```

Không để frontend tiếp tục nhận product cũ quá lâu.

---

# 49 — BACKGROUND JOBS

Dùng queue cho:

- email
- order confirmation
- payment processing tasks
- image processing
- notifications
- abandoned cart
- analytics
- cache warming
- search indexing

Không chạy tác vụ nặng trong HTTP request.

---

# 50 — IMAGE STORAGE

Không lưu image binary trực tiếp trong PostgreSQL.

Sử dụng:

```text
Object Storage
+
CDN
```

Database chỉ lưu:

```text
image URL
metadata
```

---

# 51 — DATABASE INDEX

Phân tích query trước khi tạo index.

Các index quan trọng có thể gồm:

```text
Product.slug
Product.status

ProductVariant.sku
ProductVariant.product_id

Order.order_number
Order.user_id
Order.status
Order.created_at

Review.product_id

Inventory.variant_id

Coupon.code
```

Có thể dùng composite index dựa trên query thực tế.

Không tạo index bừa bãi.

---

# 52 — DATABASE CONSTRAINTS

Sử dụng database constraint khi phù hợp:

```text
UNIQUE
NOT NULL
FOREIGN KEY
CHECK
```

Ví dụ:

```text
quantity > 0
price >= 0
discount >= 0
```

Không chỉ validate ở application layer.

---

# 53 — TRANSACTIONS

Transaction bắt buộc cho các flow quan trọng:

```text
Checkout
Order creation
Inventory reservation
Payment state update
Refund
Order cancellation
```

---

# 54 — ORDER CANCELLATION

Khi cancel order:

```text
Order
 ↓
Validate state
 ↓
Cancel
 ↓
Release inventory
 ↓
Refund nếu cần
 ↓
Create audit log
```

Không chỉ:

```text
status = CANCELLED
```

---

# 55 — RETURN / REFUND

Thiết kế để có thể mở rộng:

```text
ReturnRequest
Refund
RefundItem
```

Flow:

```text
DELIVERED
 ↓
RETURN REQUEST
 ↓
APPROVED
 ↓
RECEIVED
 ↓
REFUND
```

---

# 56 — NOTIFICATIONS

Notification:

```text
ORDER_CONFIRMED
ORDER_SHIPPED
ORDER_DELIVERED
PAYMENT_SUCCESS
PAYMENT_FAILED
PROMOTION
```

Có:

```text
read
unread
```

---

# 57 — AUDIT LOG

Admin actions phải có audit log.

Ví dụ:

```text
Admin changed product price.

Admin changed inventory.

Admin cancelled order.

Admin banned user.
```

Lưu:

```text
actor
action
entity
entity_id
before
after
timestamp
ip
```

Không log dữ liệu nhạy cảm.

---

# 58 — TIMEZONE

Database lưu UTC.

Frontend convert sang timezone người dùng.

Không dùng local server time làm source of truth.

---

# 59 — API VERSIONING

Sử dụng:

```text
/api/v1
```

Thiết kế để sau này có:

```text
/api/v2
```

mà không phá client cũ.

---

# 60 — OBSERVABILITY

Backend phải có:

- structured logging
- request ID
- error logging
- database query monitoring
- latency monitoring
- health check

Endpoints:

```text
/health
/ready
```

---

# 61 — TESTING

Viết test cho:

### Unit

- PricingService
- CouponService
- InventoryService
- OrderService
- PaymentService

### Integration

- auth
- product
- cart
- checkout
- order
- inventory

### E2E

Flow:

```text
Register
 ↓
Login
 ↓
Browse Product
 ↓
Choose Variant
 ↓
Add Cart
 ↓
Checkout
 ↓
Create Order
 ↓
Payment
 ↓
Order Confirmation
```

---

# 62 — CRITICAL TEST CASES

Đặc biệt test:

### Inventory race

Hai user mua sản phẩm cuối cùng cùng lúc.

Kết quả:

```text
Only one succeeds.
```

### Duplicate payment webhook

Gửi webhook 2 lần.

Kết quả:

```text
Only one payment recorded.
```

### Duplicate checkout

Request gửi lại.

Kết quả:

```text
Only one order.
```

### Coupon abuse

Một user vượt usage limit.

Kết quả:

```text
Rejected.
```

### Price manipulation

Client gửi:

```text
price = 1
```

Backend:

```text
Ignore client price.
```

---

# 63 — FRONTEND INTEGRATION

Sau khi backend hoàn thành:

Tìm toàn bộ mock data hiện tại.

Thay:

```text
mockProducts
mockCart
mockOrders
mockUsers
```

bằng API thật.

Không sửa UI nếu không cần.

Giữ nguyên:

- design
- animations
- interactions
- responsive layout

Chỉ thay data layer.

---

# 64 — API CLIENT

Frontend nên có:

```text
lib/api/
```

Ví dụ:

```text
products.ts
cart.ts
orders.ts
auth.ts
wishlist.ts
reviews.ts
```

Không gọi fetch trực tiếp lung tung trong component.

---

# 65 — STATE MANAGEMENT

Phân biệt:

### Server state

Sử dụng:

TanStack Query / tương đương.

### Client state

Sử dụng:

Zustand / Context / tương đương.

Không lưu toàn bộ server database vào Zustand.

---

# 66 — ERROR HANDLING FRONTEND

API error phải map thành UX rõ ràng.

Ví dụ:

```text
OUT_OF_STOCK

→ "Sản phẩm vừa hết hàng."
```

```text
INVALID_COUPON

→ "Mã giảm giá không hợp lệ."
```

```text
PAYMENT_FAILED

→ "Thanh toán thất bại. Vui lòng thử lại."
```

---

# 67 — ADMIN BACKEND

Admin phải có API cho:

Products

Variants

Inventory

Orders

Users

Reviews

Coupons

Promotions

Collections

Analytics

---

# 68 — PRODUCT CRUD

Admin:

```text
Create
Read
Update
Archive
Restore
```

Không hard delete product nếu product đã xuất hiện trong order.

Ưu tiên:

```text
soft delete / archive
```

---

# 69 — INVENTORY ADMIN

Admin có thể:

```text
Restock
Adjust
Reserve
Release
```

Mọi adjustment phải tạo:

```text
InventoryTransaction
```

---

# 70 — ORDER ADMIN

Admin có thể:

- view order
- confirm
- process
- ship
- deliver
- cancel
- refund

Mỗi state transition phải được validate.

---

# 71 — ANALYTICS

Backend có thể cung cấp:

```text
Revenue
Orders
Customers
Average Order Value
Top Products
Top Categories
Low Stock
Conversion-related metrics
```

Không query dữ liệu khổng lồ trực tiếp trong request nếu có thể precompute/background aggregation.

---

# 72 — SCALABILITY

Thiết kế để có thể scale:

```text
             Load Balancer
                  ↓
       ┌──────────┼──────────┐
       ↓          ↓          ↓
    API #1     API #2     API #3
       │          │          │
       └──────────┼──────────┘
                  ↓
               Redis
                  ↓
             PostgreSQL
```

Backend phải stateless nếu sử dụng horizontal scaling.

---

# 73 — DATABASE SCALING

Hiện tại:

```text
PostgreSQL Primary
```

Sau này có thể:

```text
Primary
 +
Read Replicas
```

Không thiết kế logic phụ thuộc vào một connection/process duy nhất.

---

# 74 — API PERFORMANCE

Mục tiêu:

- không N+1 queries
- pagination
- caching
- proper indexes
- connection pooling
- efficient joins
- select only required fields

---

# 75 — SECURITY CHECKLIST

Trước khi hoàn thành:

```text
[ ] Password hashing
[ ] Authentication
[ ] Authorization
[ ] Rate limiting
[ ] Input validation
[ ] SQL injection protection
[ ] XSS protection
[ ] CSRF protection
[ ] IDOR protection
[ ] Secure cookies/session
[ ] Secure headers
[ ] File upload validation
[ ] Payment verification
[ ] Price validation
[ ] Inventory protection
[ ] Coupon protection
[ ] Audit logging
[ ] Secret management
```

---

# 76 — ENVIRONMENT

Tạo:

```text
.env.example
```

Ví dụ:

```text
DATABASE_URL=

REDIS_URL=

JWT_SECRET=

SESSION_SECRET=

STORAGE_URL=

PAYMENT_SECRET=

EMAIL_API_KEY=
```

Không commit secrets.

---

# 77 — DOCKER

Tạo Docker environment:

```text
frontend
backend
postgres
redis
worker
```

Có:

- healthcheck
- persistent volumes
- environment variables

---

# 78 — MIGRATIONS

Database migration phải:

- versioned
- reproducible
- reviewable

Không chỉnh database production thủ công.

---

# 79 — SEED DATA

Tạo seed data đủ thực tế:

```text
50–100 products
```

Mỗi product có:

- variants
- sizes
- colors
- images
- categories
- brands
- collections
- reviews

Tạo một số:

- low stock
- out of stock
- sale
- new
- bestseller
- limited

để frontend có thể test toàn bộ trạng thái.

---

# 80 — DOCUMENTATION

Tạo:

```text
docs/
├── ARCHITECTURE.md
├── DATABASE.md
├── API.md
├── AUTH.md
├── PAYMENT.md
├── INVENTORY.md
├── SECURITY.md
├── TESTING.md
└── DEPLOYMENT.md
```

---

# 81 — IMPLEMENTATION PHASES

## Phase 1

Audit frontend.

## Phase 2

Backend architecture.

## Phase 3

Database schema.

## Phase 4

Authentication.

## Phase 5

Products.

## Phase 6

Inventory.

## Phase 7

Cart.

## Phase 8

Wishlist.

## Phase 9

Pricing / Promotion / Coupon.

## Phase 10

Checkout.

## Phase 11

Orders.

## Phase 12

Payment abstraction.

## Phase 13

Reviews.

## Phase 14

Search.

## Phase 15

Admin.

## Phase 16

Notifications.

## Phase 17

Caching.

## Phase 18

Background jobs.

## Phase 19

Testing.

## Phase 20

Security audit.

## Phase 21

Performance audit.

## Phase 22

Frontend integration.

## Phase 23

Production deployment.

---

# 82 — IMPORTANT: DO NOT BREAK THE UI

Frontend hiện tại đã có UX/UI.

Không được tự ý:

- redesign
- thay layout
- thay animation
- đổi typography
- đổi color
- xóa component

trừ khi cần thiết để sửa bug hoặc tích hợp API.

Nếu frontend đang sử dụng mock type:

```text
Product
ProductVariant
Cart
Order
```

hãy phân tích và thiết kế backend tương thích hoặc tạo adapter.

---

# 83 — FINAL AUDIT

Sau khi hoàn thành backend:

Kiểm tra toàn bộ.

## Functional

- Auth
- Products
- Search
- Cart
- Wishlist
- Checkout
- Orders
- Payment
- Reviews
- Admin

## Database

- constraints
- indexes
- relations
- migrations
- transactions

## Security

- authentication
- authorization
- IDOR
- injection
- payment
- price manipulation

## Performance

- N+1
- slow query
- cache
- pagination
- connection pooling

## Scalability

Đánh giá khi:

```text
1,000 users
10,000 users
100,000 users
1,000,000 users
```

và:

```text
10,000 products
100,000 products
1,000,000 variants
```

---

# 84 — FINAL REPORT

Sau khi hoàn thành, xuất báo cáo:

```text
Backend Architecture Score: /100

Database Score: /100

Security Score: /100

Performance Score: /100

Scalability Score: /100

E-commerce Logic Score: /100

Testing Score: /100

Production Readiness: /100
```

Liệt kê tất cả vấn đề còn tồn tại.

Không được nói:

> "Everything is production ready."

nếu thực tế chưa đạt.

---

# 85 — FINAL PRINCIPLE

Backend phải tuân theo:

> **Frontend creates desire. Backend creates trust.**

Frontend làm người dùng muốn mua.

Backend phải đảm bảo:

```text
Correct Price
Correct Stock
Correct Order
Correct Payment
Correct User
Correct Permission
Correct Data
```

Mục tiêu cuối cùng:

> Xây dựng một backend e-commerce thực tế, an toàn, nhất quán và có khả năng mở rộng để phục vụ website bán giày hiện tại.