-- Migration 010: Approval system enhancements
-- Add notes and approval tracking to requests

ALTER TABLE requests ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "reviewedBy" INTEGER;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "returnReason" TEXT;

-- Add 'returned' as a valid status concept (no enum constraint needed, status is varchar)

-- Approval action log for full audit trail
CREATE TABLE IF NOT EXISTS approval_actions (
  id SERIAL PRIMARY KEY,
  "entityType" VARCHAR(50) NOT NULL, -- 'request', 'leave', 'purchase_request', 'purchase_order', 'expense'
  "entityId" INTEGER NOT NULL,
  action VARCHAR(30) NOT NULL, -- 'approved', 'rejected', 'returned', 'escalated'
  notes TEXT,
  "actionBy" INTEGER REFERENCES users(id),
  "actionByName" VARCHAR(255),
  "companyId" INTEGER,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_actions_entity ON approval_actions("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_approval_actions_company ON approval_actions("companyId");

-- System control settings for central panel
INSERT INTO settings (scope, "scopeId", key, value) VALUES
  ('system', 0, 'approval.require_notes_on_reject', '"true"'),
  ('system', 0, 'approval.require_notes_on_return', '"true"'),
  ('system', 0, 'approval.max_return_count', '3'),
  ('system', 0, 'approval.auto_escalate_hours', '48'),
  ('system', 0, 'system.allow_self_approval', '"false"'),
  ('system', 0, 'system.notifications_enabled', '"true"'),
  ('system', 0, 'system.attachment_max_size_mb', '5'),
  ('system', 0, 'system.attachment_max_count', '10')
ON CONFLICT DO NOTHING;
