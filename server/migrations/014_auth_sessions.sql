-- 014: phiên refresh lưu DB để rotation + phát hiện dùng lại token cũ (reuse = nghi đánh cắp).
-- Access token vẫn stateless; thu hồi nó qua blacklist jti / mốc logout-all trên cache (Redis).
CREATE TABLE IF NOT EXISTS auth_sessions (
  sid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_jti TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip          TEXT,
  ua          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
-- gen_random_uuid() cần pgcrypto (có sẵn trên mọi Postgres mới)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
