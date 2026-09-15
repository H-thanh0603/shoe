# BACKUP DRILLS LOG

## 2026-09-15 — Drill dump logic (người drill: agent + owner)

- File: `backups/kinetic-2026-09-04_1530.dump` (145KB, custom format, PG 18.6)
- Cách: `pg_restore -f` → sed remap `public.` → `drill_20260915.` → nạp vào schema tạm (user `kinetic` không có CREATEDB nên không tạo DB riêng được)
- Kết quả: **PASS** — 22 bảng, products 26/26, variants 260/260, users 1
  (orders 0 — dump ngày 04/09 chưa có đơn, đúng kỳ vọng)
- Lưu ý: sed phải remap cả `COPY public.` + `ALTER TABLE ONLY public.` + giữ
  opclass `gin_trgm_ops` (không prefix schema). CREATE lặp → bỏ qua được.
- Dọn: `DROP SCHEMA drill_20260915 CASCADE` — đã dọn sạch.
- Chưa drill: PITR base+WAL (cần docker), offsite pull (chưa cấu hình remote).
- RTO đo được: ~10 phút (dump logic).
