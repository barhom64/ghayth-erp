-- Migration 164: add missing createdAt column on system_settings
-- Fixes cronScheduler.ts:3052 'rate-limit alerter state save failed'
-- (recurring every 2 min). Tracked as bug #190 in follow-ups.
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP NOT NULL DEFAULT now();
