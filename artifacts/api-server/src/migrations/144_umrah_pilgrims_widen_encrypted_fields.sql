-- Task #190 fix: umrah_pilgrims encrypted columns are too narrow.
--
-- Root cause: routes/umrah.ts wraps passportNumber/visaNumber/mofaNumber/
-- borderNumber with encryptField() before INSERT. encryptField produces
-- "iv_hex:cipher_hex:tag_hex" which is at least 32 + 1 + (plaintext*2) + 1
-- + 32 = 66+ characters even for a 1-char input. The original schema
-- declared these columns as VARCHAR(50), so every POST /api/umrah/pilgrims
-- crashed with "value too long for type character varying(50)" → 500.
--
-- Fix: widen all four encrypted columns to TEXT. The matching *_hash
-- columns stay at VARCHAR(16) — they hold a 16-char blind index, not the
-- ciphertext.
ALTER TABLE umrah_pilgrims ALTER COLUMN "passportNumber" TYPE TEXT;
ALTER TABLE umrah_pilgrims ALTER COLUMN "visaNumber"     TYPE TEXT;
ALTER TABLE umrah_pilgrims ALTER COLUMN "mofaNumber"     TYPE TEXT;
ALTER TABLE umrah_pilgrims ALTER COLUMN "borderNumber"   TYPE TEXT;
