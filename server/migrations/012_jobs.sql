-- 012: job queue lưu Postgres — worker đa instance claim bằng FOR UPDATE SKIP LOCKED.
-- Không cần Redis/BullMQ; scale ngang bằng cách chạy thêm process (mỗi job chỉ 1 worker nhận).
CREATE TABLE IF NOT EXISTS jobs (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('order_confirmation','events_cleanup','low_stock_scan')),
  payload     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, run_after, id);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type, status);
