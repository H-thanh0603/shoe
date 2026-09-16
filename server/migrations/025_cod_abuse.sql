-- 025: chống bom hàng COD — hash SĐT để đếm đơn (phone chính mã hoá PII, không query được).
-- phone_hash = sha256(normalize(phone)): '0...' 10 số. Không đảo ngược từ hash ra SĐT nguyên
-- trong thực tế (dù không gian SĐT hẹp — đây là rào abuse, bí mật do cột enc lo).
CREATE TABLE IF NOT EXISTS cod_abuse (
  phone_hash TEXT PRIMARY KEY,
  attempts   INT NOT NULL DEFAULT 1,
  last_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
