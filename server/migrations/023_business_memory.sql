-- 023: business memory cho merchant agent (kind='business').
-- Cùng bảng agent_memory: session_key='biz' (shop-level, không theo admin),
-- user_id = admin set (audit ai set). Không có kind CHECK nên chỉ cần index.
CREATE INDEX IF NOT EXISTS idx_agent_memory_biz ON agent_memory(session_key, kind);
