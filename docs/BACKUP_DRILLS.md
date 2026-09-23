# BACKUP DRILLS LOG

## 2026-09-23 — Drill PITR job + backup mới (người drill: agent + owner)

- Job mới `pitr_drill` (`services/jobs.js` + migration `026_jobs_pitr.sql`):
  cron.js enqueue định kỳ khi set `PITR_BASE_DIR` (`PITR_CRON=0` để tắt).
- Thử physical `pg_basebackup` trước — **fail đúng như dự đoán**: role dev
  `kinetic` không có REPLICATION ("permission denied to start WAL sender"),
  không sudo để grant. Handler có fallback tự động: **logical `pg_dump -Fc`**
  vào cùng vị trí + ghi file `MODE` cảnh báo mất khả năng PITR điểm giữa.
- Kết quả: **PASS (logical)** — `base-2026-09-23T05-25-22-*` 140KB, 305 TOC
  entries, `pg_restore -l` đọc được; RTO đo được < 1s dump.
- Docker daemon chưa chạy trên máy này — khi bật container postgres (image có
  `pg_basebackup` + quyền superuser trong container) job sẽ tự đi đường physical.
- Offsite pull (rclone) vẫn chưa cấu hình — cần remote trước khi drill được.
- Job test đã dọn khỏi bảng `jobs`; thư mục drill để lại `/tmp/kinetic-pitr/`
  (tmpfs — tự mất khi reboot, không rác trong repo).

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
