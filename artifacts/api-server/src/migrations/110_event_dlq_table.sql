-- Create event_dlq (dead letter queue) table for failed event processing
CREATE TABLE IF NOT EXISTS event_dlq (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    "eventName" TEXT,
    payload JSONB NOT NULL,
    error TEXT NOT NULL,
    "companyId" INTEGER,
    "retryCount" INTEGER DEFAULT 0,
    "resolvedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_dlq_unresolved_idx
  ON event_dlq ("createdAt" DESC) WHERE ("resolvedAt" IS NULL);

CREATE INDEX IF NOT EXISTS event_dlq_company_idx
  ON event_dlq ("companyId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS event_dlq_event_idx
  ON event_dlq ("eventName") WHERE ("resolvedAt" IS NULL);
