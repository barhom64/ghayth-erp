-- 255_umrah_pilgrims_encrypted_columns_text.sql
--
-- #1594 — real bug found driving the Umrah journey (#1609).
--
-- PROBLEM
-- umrah_pilgrims."passportNumber" and "visaNumber" are varchar(50), but the
-- route stores the ENCRYPTED value (encryptField → "iv_hex:cipher_hex:tag_hex",
-- ~78+ chars even for a short passport). So every pilgrim INSERT crashed with
--   value too long for type character varying(50)
-- i.e. pilgrim creation — the entry point of the whole Umrah journey — was
-- impossible. (The *_hash blind-index columns are varchar(16) and fine:
-- blindIndex slices to 16 hex chars.)
--
-- FIX
-- Widen the two encrypted columns to text so they hold the ciphertext.
--
-- @policy:breaking
--   ALTER COLUMN TYPE is flagged by the policy guard because it cannot tell a
--   widening from a narrowing. varchar(50) → text is a strict WIDENING: no
--   existing value can fail and an older app version is unaffected. Acknowledged
--   per docs/MIGRATION_POLICY.md §4.
--
-- @rollback:
--   ALTER TABLE public.umrah_pilgrims ALTER COLUMN "passportNumber" TYPE varchar(50);
--   ALTER TABLE public.umrah_pilgrims ALTER COLUMN "visaNumber" TYPE varchar(50);
--   (only safe once no encrypted value exceeds 50 chars — i.e. effectively never
--    while field encryption is on.)

ALTER TABLE public.umrah_pilgrims ALTER COLUMN "passportNumber" TYPE text;
ALTER TABLE public.umrah_pilgrims ALTER COLUMN "visaNumber" TYPE text;
