#!/bin/sh
# Offsite backup: đồng bộ dumps + base mới nhất + WAL ra remote qua rclone/restic
# (cấu hình sẵn remote tên `offsite:`). Chạy sau job backup compose (cron host mỗi 6h).
# Không có remote → log + exit 0 (không vỡ deploy).
# Env: OFFSITE_REMOTE (mặc định offsite:kinetic-backup), OFFSITE_RETENTION (mặc định 30d).
set -eu
REMOTE="${OFFSITE_REMOTE:-offsite:kinetic-backup}"
cd "$(dirname "$0")/.."

if ! command -v rclone >/dev/null 2>&1; then
  echo "[offsite] rclone chưa cài — bỏ qua (cài: apt install rclone + cấu hình remote offsite:)"
  exit 0
fi
if ! rclone lsd "${REMOTE%%:*+}:" >/dev/null 2>&1; then
  echo "[offsite] remote ${REMOTE} chưa cấu hình — bỏ qua (rclone config)"
  exit 0
fi
echo "[offsite] sync dumps mới (7 ngày) → ${REMOTE}/dumps/"
rclone copy ./backups "${REMOTE}/dumps/" --include "*.dump" --max-age 7d --progress
LATEST_BASE=$(ls -dt ./backups/base/base-* 2>/dev/null | head -n 1 || true)
if [ -n "$LATEST_BASE" ]; then
  echo "[offsite] sync base mới nhất ($LATEST_BASE) + WAL 48h → ${REMOTE}/"
  rclone copy "$LATEST_BASE" "${REMOTE}/base/$(basename "$LATEST_BASE")/" --progress
  rclone copy ./backups/wal "${REMOTE}/wal/" --max-age 48h --progress
fi
echo "[offsite] xong — kiểm tra: rclone ls ${REMOTE}/ | head"
