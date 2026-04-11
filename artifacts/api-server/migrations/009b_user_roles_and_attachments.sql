CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "roleKey" VARCHAR(50) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "modules" JSONB NOT NULL DEFAULT '[]',
  "level" INTEGER NOT NULL DEFAULT 10,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("userId", "roleKey")
);

ALTER TABLE requests ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

INSERT INTO user_roles ("userId", "roleKey", "label", "modules", "level")
SELECT u.id, 'owner', 'مالك النظام',
  '["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","admin","comms","legal","crm","marketing","store","support","settings"]'::jsonb,
  100
FROM users u WHERE u.role = 'admin' OR u.role = 'owner'
ON CONFLICT ("userId", "roleKey") DO NOTHING;
