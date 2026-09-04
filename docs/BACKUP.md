# BACKUP & RESTORE

## Tự động (compose)

Service `backup` chạy `pg_dump -Fc` mỗi 24h vào `./backups/kinetic-YYYY-MM-DD_HHMM.dump`,
giữ 7 bản mới nhất (cũ hơn tự xóa). Redis không backup (cache + blacklist + rate-limit
tái tạo được; mất Redis chỉ làm session blacklist/uav quay về fail-open tới khi token hết hạn).

**KHÔNG nằm trong backup:** root `.env` (chứa `JWT_SECRET`) — mất là toàn bộ token cũ vô
giá trị + phải cấp lại cho user. Giữ `.env` trong vault/secret manager riêng.

## Kiểm tra backup còn sống không

```bash
ls -lt backups/ | head
```

## Restore (DB disaster)

```bash
# 1. Dừng app/worker/cron để không ghi trong lúc restore
docker compose stop app worker cron

# 2. Restore vào DB mới (giữ DB cũ phòng sai)
docker compose exec postgres dropdb -U kinetic --if-exists kinetic_restore
docker compose exec postgres createdb -U kinetic kinetic_restore
docker compose exec -T postgres pg_restore -U kinetic -d kinetic_restore < backups/kinetic-YYYY-MM-DD_HHMM.dump

# 3. Verify nhanh: số đơn + sản phẩm khớp kỳ vọng
docker compose exec postgres psql -U kinetic -d kinetic_restore -t -c \
  "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM products) AS products;"

# 4. Trỏ app sang DB đã restore (đổi DATABASE_URL trong compose rồi up lại),
# hoặc rename: drop kinetic cũ → rename kinetic_restore thành kinetic
```

## Restore thử định kỳ

Quý 1 lần: restore bản mới nhất vào `kinetic_restore`, chạy `npm run test:search`
trỏ `DATABASE_URL` vào đó (đọc-only, không ghi) để chắc file dump dùng được.

## RPO/RTO hiện tại

- RPO ~24h (mất tối đa 1 ngày đơn nếu chưa kịp dump). Cần RPO thấp hơn → bật WAL
  archiving / replica streaming (chưa làm).
- RTO ~15 phút (up lại stack + restore dump mới nhất).
