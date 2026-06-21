-- 401_custom_fields.sql
-- ميزة: الحقول المخصّصة لكل شركة (#2719) — باعتماد إبراهيم («كلها»).
-- معماري، **غير دفتري**. يتيح لكل شركة تعريف حقول إضافية لأي كيان (عميل/مشروع/…)
-- وتخزين قيمها بنمط EAV دون تعديل جداول الكيانات (لا أعمدة عابرة، لا مساس
-- بالمخطط القائم).
--
-- DDL-only (لا seed) → seed-drift safe. > baseline-cutoff (297) ليعمل على
-- fresh/CI. كل العبارات idempotent.
--
-- @rollback: DROP TABLE IF EXISTS custom_field_values; DROP TABLE IF EXISTS custom_field_definitions;

-- تعريفات الحقول: ما الحقول الإضافية التي عرّفتها الشركة لكل نوع كيان.
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "entityType"  TEXT NOT NULL,                       -- client | project | vehicle | ...
  "fieldKey"    TEXT NOT NULL,                       -- مفتاح تقني فريد ضمن (company, entityType)
  label         TEXT NOT NULL,                       -- التسمية العربية الظاهرة
  "fieldType"   TEXT NOT NULL DEFAULT 'text',        -- text | number | date | boolean | select
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- خيارات نوع select: ["أ","ب"]
  required      BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);
-- مفتاح فريد للحقل ضمن (الشركة، نوع الكيان) — لا تكرار مفتاح حقل لنفس الكيان.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfd_company_entity_key
  ON custom_field_definitions ("companyId", "entityType", "fieldKey") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_cfd_company_entity
  ON custom_field_definitions ("companyId", "entityType") WHERE "deletedAt" IS NULL;

-- قيم الحقول: قيمة كل حقل مخصّص لكل صفّ كيان (EAV).
CREATE TABLE IF NOT EXISTS custom_field_values (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "fieldId"     BIGINT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  "entityType"  TEXT NOT NULL,
  "entityId"    INTEGER NOT NULL,
  value         TEXT,                                -- القيمة كنصّ (تُفسَّر حسب fieldType)
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- قيمة واحدة لكل (حقل، صفّ كيان) — upsert على هذا المفتاح.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfv_field_entity
  ON custom_field_values ("fieldId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_cfv_company_entity
  ON custom_field_values ("companyId", "entityType", "entityId");
