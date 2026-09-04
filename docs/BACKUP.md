# BACKUP & RESTORE

## Tự động (compose)

- **WAL archiving (liên tục, RPO ~5 phút):** postgres ship mọi thay đổi ra
  `./backups/wal/`, segment xoay tối đa 5 phút (`archive_timeout=300`).
- **Base backup vật lý (mỗi 7 ngày, giữ 2 bản):** `./backups/base/base-YYYY-MM-DD/`
  qua `pg_basebackup`. Kết hợp WAL → **PITR về bất kỳ thời điểm nào** (đã verify thật,
  xem dưới).
- **Dump logic (mỗi 24h, giữ 7 bản):** `./backups/kinetic-*.dump` — gọn nhẹ, restore
  nhanh khi chỉ cần lấy lại vài bảng.

Redis không backup (cache + blacklist + rate-limit tái tạo được; mất Redis chỉ làm
session blacklist/uav quay về fail-open tới khi token hết hạn).

**KHÔNG nằm trong backup:** root `.env` (chứa `JWT_SECRET`) — mất là toàn bộ token cũ vô
giá trị + phải cấp lại cho user. Giữ `.env` trong vault/secret manager riêng.

## Kiểm tra backup còn sống không

```bash
ls -lt backups/ | head            # dump mới mỗi 24h?
ls backups/wal/ | tail -3         # WAL mới liên tục?
ls -dt backups/base/base-* | head # base mới trong 7 ngày?
```

## Restore PITR (mất dữ liệu giữa 2 lần dump — cách chính)

Cần: 1 base + toàn bộ WAL từ lúc base tới thời điểm muốn về (`T`).

```bash
# 1. Chuẩn bị data dir từ base (chạy 1 lần, ngoài compose)
docker volume create pitrdata
docker run --rm -e PGDATA=/var/lib/postgresql/18/pitr \
  -v pitrdata:/var/lib/postgresql \
  -v ./backups:/backups:ro postgres:18-alpine sh -c '
  mkdir -p /var/lib/postgresql/18/pitr &&
  tar xzf /backups/base/base-YYYY-MM-DD/base.tar.gz -C /var/lib/postgresql/18/pitr &&
  tar xzf /backups/base/base-YYYY-MM-DD/pg_wal.tar.gz -C /var/lib/postgresql/18/pitr &&
  cat >> /var/lib/postgresql/18/pitr/postgresql.auto.conf <<EOF
restore_command = '"'"'cp /backups/wal/%f %p'"'"'
recovery_target_time = '"'"'YYYY-MM-DD HH:MM:SS+00'"'"'
recovery_target_action = '"'"'promote'"'"'
EOF
  touch /var/lib/postgresql/18/pitr/recovery.signal &&
  chown -R postgres:postgres /var/lib/postgresql'

# 2. Chạy DB restore (port 5434 để không đụng live)
docker run -d --name pitr --network shoe_default -e POSTGRES_PASSWORD=kinetic \
  -e PGDATA=/var/lib/postgresql/18/pitr -v pitrdata:/var/lib/postgresql \
  -v ./backups:/backups:ro -p 5434:5432 postgres:18-alpine
docker logs pitr | grep "ready to accept"  # chờ sẵn sàng

# 3. Verify: dữ liệu tới đúng T chưa, rồi mới trỏ app sang / dump ra và nạp vào live
PGPASSWORD=kinetic psql -h localhost -p 5434 -U kinetic -d kinetic -c "SELECT COUNT(*) FROM orders;"

# 4. Dọn: docker rm -f pitr; docker volume rm pitrdata
```

Đã kiểm chứng 04/09/2026: tạo bảng lúc 15:33:04, DROP lúc 15:33:31, PITR về
15:33:20 → bảng + dòng dữ liệu còn nguyên, lệnh DROP không được replay.

## Restore dump logic (chỉ cần vài bảng / dump nhanh)

```bash
docker compose stop app worker cron
docker compose exec postgres dropdb -U kinetic --if-exists kinetic_restore
docker compose exec postgres createdb -U kinetic kinetic_restore
docker compose exec -T postgres pg_restore -U kinetic -d kinetic_restore < backups/kinetic-YYYY-MM-DD_HHMM.dump
docker compose exec postgres psql -U kinetic -d kinetic_restore -t -c \
  "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM products) AS products;"
```

## RPO/RTO hiện tại

- RPO ~5 phút (WAL). Mất WAL chưa ship (tối đa 1 segment) chỉ khi ổ đĩa chết cùng lúc.
- RTO ~30 phút (PITR: giải nén base + replay WAL + verify).
- Muốn RPO ~giây + failover tự động → standby streaming replica (chưa làm — khi đơn/ngày đủ lớn).
