-- 007: review ảnh (JSONB data-URL, không cần object storage) + vote hữu ích
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS review_votes (
  id         SERIAL PRIMARY KEY,
  review_id  INT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_votes(review_id);
