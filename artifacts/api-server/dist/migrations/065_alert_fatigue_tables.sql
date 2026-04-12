CREATE TABLE IF NOT EXISTS alert_mute_rules (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "alertType" VARCHAR(100) NOT NULL,
  "muteUntil" TIMESTAMPTZ,
  reason TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ,
  UNIQUE ("assignmentId", "alertType")
);

CREATE INDEX IF NOT EXISTS idx_alert_mute_rules_assignment ON alert_mute_rules("assignmentId");
CREATE INDEX IF NOT EXISTS idx_alert_mute_rules_company ON alert_mute_rules("companyId");

CREATE TABLE IF NOT EXISTS alert_fatigue_settings (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "assignmentId" INTEGER NOT NULL REFERENCES employee_assignments(id) ON DELETE CASCADE,
  "alertType" VARCHAR(100),
  "muteUntil" TIMESTAMPTZ,
  reason TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_fatigue_settings_assignment ON alert_fatigue_settings("assignmentId");

ALTER TABLE smart_alerts ADD COLUMN IF NOT EXISTS "isRead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE smart_alerts ADD COLUMN IF NOT EXISTS "isDismissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE smart_alerts ADD COLUMN IF NOT EXISTS "suggestedAction" TEXT;
ALTER TABLE smart_alerts ADD COLUMN IF NOT EXISTS "relatedType" VARCHAR(100);
ALTER TABLE smart_alerts ADD COLUMN IF NOT EXISTS "relatedId" INTEGER;
