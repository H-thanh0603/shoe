# CDN + WAF (Cloudflare) — runbook tay

Phần trong repo đã xong: service `edge` (Nginx) là origin — cache catalog, rate-limit
lớp ngoài, header IP thật. Phần dưới cần làm 1 lần trên dashboard Cloudflare
(free tier đủ), vì liên quan DNS/domain của bạn.

## 0. Chuẩn bị ở server (trước khi trỏ DNS)

1. Chỉ mở port edge ra internet, đóng các port còn lại (ufw/vultr firewall/security group):
   - Mở: `8081` (sau này đổi thành 80/443 khi có domain — xem bước 4).
   - Đóng: `3000-3002` (app), `5433` (postgres debug), `6379` redis không expose sẵn rồi.
2. `docker compose up -d` và chắc `curl localhost:8081/readyz` → `{"ok":true}`.

## 1. Đưa domain lên Cloudflare

1. Tạo tài khoản → Add domain → chọn gói Free.
2. Cloudflare cấp 2 nameserver → đổi NS ở nhà đăng ký domain, chờ hiện Active.
3. DNS record: `A shop.<domain> → <IP server>`, bật proxy (đám mây cam = qua CDN/WAF).

## 2. SSL (15 phút)

SSL/TLS → Encryption mode: **Full (strict)**. Origin Nginx hiện chỉ nghe HTTP —
Cloudflare terminating HTTPS ở edge, nói HTTP về origin qua tunnel nội bộ là đủ cho
bước đầu. Muốn end-to-end HTTPS: bật thêm Origin Certificate (free) + thêm block 443
vào `ops/nginx.conf`.

## 3. Cache rules (CDN)

Caching → Cache Rules, tạo rule cho `shop.<domain>/api/v1/products*`,
`/api/v1/collections*`, `/api/v1/drop*`: **Eligible for cache, TTL 60s**.
App đã gửi `Cache-Control: public, max-age=30` nên Cloudflare tôn trọng luôn —
rule này chỉ để chắc. **Không cache** `/api/v1/cart*`, `/orders*`, `/admin*`,
`/auth*` (theo user) — mặc định Cloudflare không cache khi có cookie `token`
nếu bật "Cache by cookie" thì càng chắc.

Purge khi đổi giá/giao diện: Caching → Purge → Custom Purge URL.

## 4. WAF rules (free: 5 rules, đủ)

Security → WAF → Custom rules:

| # | Nội dung | Hành động |
|---|---|---|
| 1 | URI Path contains `/api/v1/admin` và IP không thuộc văn phòng/VPN | Block (admin chỉ nội bộ) |
| 2 | URI Path contains `/api/v1/auth/` và rate > 20 req/phút/IP | Block 10 phút (chống dò pass, lớp sau rate-limit app) |
| 3 | Country lạ + URI là `/api/v1/orders` + POST burst cao | Managed Challenge |
| 4 | Bot Fight Mode | On (Security → Bots) |

## 5. Kiểm tra sau khi bật

- `curl -s -D- https://shop.<domain>/api/v1/products?limit=1 | grep -i cf-cache-status`
  → `HIT` từ lần 2 (CDN), kèm `X-Cache-Status` của origin.
- Thử login sai 25 lần từ 1 IP → phải ăn 429/block trước khi tới app
  (xem `docker compose logs edge`).
- Uptime check: Jamie? dùng luôn `/readyz` làm healthcheck cho Load Balancing (paid)
  hoặc UptimeRobot free ping `/healthz`.

## Khi nào nâng gói

- Cần `*.domain` + SLA → Pro. Cần rate-limit theo session thay vì IP → Ruleset
  Advanced (paid). Traffic ảnh lớn → R2 + resize ảnh ở edge (thay Unsplash hotlink).
