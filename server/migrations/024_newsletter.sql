-- 024: newsletter subscribers (consent record cho footer form).
-- consent_at = lúc đăng ký; unsubscribed_at = 1 chạm huỷ (giữ dòng để chứng minh consent).
CREATE TABLE IF NOT EXISTS newsletter_subs (
  id              SERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  consent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  source          TEXT NOT NULL DEFAULT 'footer'
);
