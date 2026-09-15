-- 018: Agent Memory (blueprint #10) + AI Activity Log (blueprint #5).
--
-- agent_memory: preference khách đã xác nhận (preferred brands, size, budget,
-- purpose) — assistant đọc ở turn đầu và lưu khi khách nói rõ. Phân biệt
-- EXPLICIT (khách nói trực tiếp) vs INFERRED (suy ra từ hành vi).
--
-- ai_activity_log: mọi tool call của assistant runtime — thành công, lỗi,
-- bị policy/provenance chặn. Admin xem/lọc theo session, tool, status.

CREATE TABLE IF NOT EXISTS agent_memory (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_key  TEXT NOT NULL,            -- 'user:<id>' hoặc 'anon:<ip-hash>'
  kind         TEXT NOT NULL,            -- 'preference'
  key          TEXT NOT NULL,            -- preferred_brand | shoe_size | budget | preferred_purpose | preferred_style
  value        TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'explicit' CHECK (source IN ('explicit','inferred')),
  confidence   SMALLINT NOT NULL DEFAULT 100,  -- 0–100
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memory_key
  ON agent_memory(session_key, kind, key);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user ON agent_memory(user_id);

CREATE TABLE IF NOT EXISTS ai_activity_log (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL DEFAULT '',
  user_id     INTEGER,                   -- NULL nếu guest (không REFERENCES để không chặn khi user bị xóa)
  agent_name  TEXT NOT NULL DEFAULT 'shopping',   -- 'shopping' | 'merchant'
  agent_id    TEXT NOT NULL DEFAULT '',   -- rate-limit identity (IP-hashed assistant)
  tool        TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('ok','error','blocked')),
  args        JSONB NOT NULL DEFAULT '{}',
  summary     TEXT NOT NULL DEFAULT '',
  error_code  TEXT NOT NULL DEFAULT '',
  session_turn INTEGER,
  request_id  TEXT NOT NULL DEFAULT '',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_activity_session ON ai_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_activity_tool ON ai_activity_log(tool);
CREATE INDEX IF NOT EXISTS idx_ai_activity_created ON ai_activity_log(created_at DESC);
