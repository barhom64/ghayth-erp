-- 404_user_2fa.sql
-- ميزة: المصادقة الثنائية (2FA / TOTP) — #2712 (الأمان أولًا).
-- يضيف حقول التسجيل فقط على جدول users القائم (لا جدول جديد، لا seed).
-- الإنفاذ عند تسجيل الدخول دفعة لاحقة منفصلة (1ب). السرّ يُخزَّن مشفّرًا عبر
-- fieldEncryption (AES-256-GCM)، والرموز الاحتياطية مُجزّأة (SHA-256) — لا
-- يُخزَّن أي سرّ بنصّ صريح. اختياري بالكامل (الافتراضي FALSE) → لا أحد يُحجب.
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297) ليعمل على
-- fresh/CI. كل العبارات idempotent.
--
-- @rollback: ALTER TABLE users DROP COLUMN IF EXISTS "twoFactorEnabled", DROP COLUMN IF EXISTS "twoFactorSecret", DROP COLUMN IF EXISTS "twoFactorEnrolledAt", DROP COLUMN IF EXISTS "twoFactorBackupCodes";
--
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorEnabled"     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorSecret"      TEXT;        -- سرّ TOTP مشفّر (fieldEncryption)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorEnrolledAt"  TIMESTAMP;   -- وقت التفعيل
ALTER TABLE users ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" JSONB;       -- مصفوفة رموز احتياطية مُجزّأة { hash, usedAt }
