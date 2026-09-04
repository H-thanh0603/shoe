-- 015: RBAC đầy đủ — roles + permissions + gán role + audit log.
-- users.role='admin' giữ nguyên nghĩa superuser (bypass mọi check).
-- Staff nhận quyền qua user_roles → roles → role_permissions → permissions.
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- slug: kho, cskh, marketing, ke-toan
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,   -- 'orders:read', 'products:write', ...
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

-- audit: ai làm gì, với cái gì, khi nào (không update/delete — chỉ append)
CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,            -- 'order.transition', 'product.create', ...
  entity     TEXT NOT NULL DEFAULT '',-- 'order', 'product', 'coupon', 'role', ...
  entity_id  TEXT NOT NULL DEFAULT '',
  meta       JSONB NOT NULL DEFAULT '{}',
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- permissions chuẩn của shop
INSERT INTO permissions (key, description) VALUES
  ('orders:read', 'Xem đơn hàng'),
  ('orders:write', 'Chuyển trạng thái / hủy đơn'),
  ('products:read', 'Xem sản phẩm (admin)'),
  ('products:write', 'Tạo / sửa / ẩn-hiện sản phẩm'),
  ('inventory:write', 'Nhập / điều chỉnh tồn kho'),
  ('coupons:read', 'Xem mã giảm giá'),
  ('coupons:write', 'Tạo / sửa mã giảm giá'),
  ('analytics:read', 'Xem dashboard & báo cáo'),
  ('agent:read', 'Xem agent changes'),
  ('agent:use', 'Chat với merchant agent'),
  ('agent:write', 'Stage / duyệt / gỡ agent changes'),
  ('ops:manage', 'Cache, jobs, vận hành'),
  ('users:manage', 'Quản lý user & phân vai trò'),
  ('audit:read', 'Xem audit log')
ON CONFLICT (key) DO NOTHING;

-- roles mặc định
INSERT INTO roles (name, description) VALUES
  ('kho', 'Thủ kho: tồn kho + xem đơn/sản phẩm'),
  ('cskh', 'CSKH: xử lý đơn hàng'),
  ('marketing', 'Marketing: coupon + campaign agent'),
  ('ke-toan', 'Kế toán: xem đơn + báo cáo')
ON CONFLICT (name) DO NOTHING;

-- gán quyền mặc định cho từng role
WITH m(role, perm) AS (VALUES
  ('kho', 'products:read'), ('kho', 'inventory:write'), ('kho', 'orders:read'),
  ('cskh', 'orders:read'), ('cskh', 'orders:write'), ('cskh', 'products:read'),
  ('marketing', 'coupons:read'), ('marketing', 'coupons:write'),
  ('marketing', 'analytics:read'), ('marketing', 'agent:read'), ('marketing', 'agent:use'),
  ('ke-toan', 'orders:read'), ('ke-toan', 'analytics:read'), ('ke-toan', 'coupons:read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM m JOIN roles r ON r.name = m.role JOIN permissions p ON p.key = m.perm
ON CONFLICT DO NOTHING;
