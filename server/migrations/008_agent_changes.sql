-- 008: staged changes của merchant agent ra khỏi RAM — restart không mất,
-- duyệt được từ Admin UI. apply_change chỉ chạy khi approved = true.
CREATE TABLE IF NOT EXISTS agent_changes (
  change_id    TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','applied','discarded')),
  summary      TEXT NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  payload      JSONB NOT NULL DEFAULT '{}',
  notes        JSONB NOT NULL DEFAULT '[]',
  created_by   TEXT NOT NULL DEFAULT '',
  operator     TEXT NOT NULL DEFAULT '',
  approved     BOOLEAN NOT NULL DEFAULT false,
  approved_by  TEXT,
  applied_by   TEXT,
  discarded_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_changes_status ON agent_changes(status);
