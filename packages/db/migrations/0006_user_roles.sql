-- 0006: papéis de conta e último acesso. Só `admin` administra contas em /admin (sistema fechado).
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE users ADD COLUMN last_login_at timestamptz;
UPDATE users SET role = 'admin' WHERE username = 'admin';
