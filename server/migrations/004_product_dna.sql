-- 004: personalization — purpose + DNA scores + weather/spec tags
-- (plan THE SHOE THAT KNOWS YOU phase 1)
ALTER TABLE products
  ADD COLUMN purpose    TEXT CHECK (purpose IN ('running','street','court','daily','trail')),
  ADD COLUMN perf       INTEGER CHECK (perf BETWEEN 0 AND 100),
  ADD COLUMN comfort    INTEGER CHECK (comfort BETWEEN 0 AND 100),
  ADD COLUMN style      INTEGER CHECK (style BETWEEN 0 AND 100),
  ADD COLUMN durability INTEGER CHECK (durability BETWEEN 0 AND 100),
  ADD COLUMN daily      INTEGER CHECK (daily BETWEEN 0 AND 100),
  ADD COLUMN tags       TEXT;  -- JSON array: 'water-resistant' | 'breathable' | 'gore-tex' | ...
