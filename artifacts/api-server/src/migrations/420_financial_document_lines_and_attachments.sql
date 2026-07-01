-- 420_financial_document_lines_and_attachments.sql
-- توحيد صفحات الإنشاء المالية — م١ (نموذج البيانات). مرجع: docs/finance-audit/25 §١١
-- ومهمة #2994 (الخيار ب المعتمد من المالك ٢٦‑٠٦).
--
-- WHAT:
--   financial_document_lines  — بنود مهيكلة للمستند المالي (سند قبض/صرف):
--     صنف/كمية/وحدة/سعر/ضريبة + حساب مشتقّ + بُعد. اليوم قبض/صرف يخزّن مبلغًا
--     مفردًا فقط (vouchers/expenses من 105_missing_tables.sql)، والمصروف يلصق
--     البند نصًّا في الوصف — فلا تُحفظ الكمية/الوحدة مهيكلة. هذا الجدول يحفظها.
--   financial_attachments     — مرفق لكل مستند و«لكل بند» عبر lineId. اليوم
--     المرفق رابط مفرد على المستند فقط (فجوة موثّقة في الكود:
--     expenses-create.tsx «needs a future financial_attachments table»).
--   financial_line_allocations — توزيع البند الواحد على أكثر من كيان تشغيلي
--     (مثل: صيانة ٩٬٠٠٠ على ٣ مركبات ٣٬٠٠٠ لكلٍّ). بدونه يُجبَر المستخدم على
--     تجزئة السطر يدويًا — ضد التوجيه الذكي. allocationType: amount/percent/
--     quantity، مع costBearer لكل جزء (تفريع حوكمي — الدستور).
--
-- DESIGN: additive + idempotent. الربط بالمستند polymorphic
--   (documentKind ∈ voucher|expense + documentId) — لا FK صلب على documentId
--   لأن PostgreSQL لا يدعم FK لجدولين؛ CHECK + فهرس يضبطانه. lineId له FK صلب
--   على financial_document_lines (ON DELETE CASCADE) فيحقّق «مرفق لكل بند».
--   عزل المستأجر (الدستور قاعدة ٧): companyId FK صلب على companies + branchId.
-- SAFETY: لا مساس بالدفتر في هذه الدفعة — لا FK مالي، لا قيد، لا journal_lines،
--   لا تعديل/حذف جداول قائمة. مجرّد جدولَي تخزين فارغَين. الترحيل من البنود إلى
--   journal_lines يأتي في دفعة الحفظ المستقلة مع assertion tests على سطور القيد
--   (الدستور قاعدة ٣ المطلقة). نفس نمط 398_fleet_accidents (الجدول أولًا).
--
-- @rollback:
--   BEGIN;
--     DROP TABLE IF EXISTS financial_attachments;
--     DROP TABLE IF EXISTS financial_line_allocations;
--     DROP TABLE IF EXISTS financial_document_lines;
--   COMMIT;

BEGIN;

-- 1) بنود المستند المالي المهيكلة
CREATE TABLE IF NOT EXISTS financial_document_lines (
  id              BIGSERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"      INTEGER,
  "documentKind"  VARCHAR(20) NOT NULL CHECK ("documentKind" IN ('voucher', 'expense')),
  "documentId"    INTEGER NOT NULL,
  "lineNo"        INTEGER NOT NULL DEFAULT 1,
  "itemId"        INTEGER,                       -- كتالوج الأصناف (يُربط في م٤)
  "itemName"      TEXT,
  "description"   TEXT,
  "quantity"      NUMERIC(14,3) NOT NULL DEFAULT 1,   -- يسمح بالكسور (لتر/كيلو)
  "unit"          VARCHAR(40),                   -- مشتقّة من الصنف، قابلة للتعديل
  "unitPrice"     NUMERIC(14,2) NOT NULL DEFAULT 0,
  "taxCodeId"     INTEGER,
  "taxAmount"     NUMERIC(14,2) NOT NULL DEFAULT 0,
  "lineTotal"     NUMERIC(14,2) NOT NULL DEFAULT 0,
  "accountCode"   VARCHAR(40),                   -- الحساب المقابل المشتقّ (فارغ=توجيه تلقائي)
  "costCenter"    VARCHAR(60),                   -- بُعد السطر (تجاوز اختياري — م٤)
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  -- أهداف FK مركّبة تربط الأبناء بهوية السطر (المستأجر + المستند) — عزل المستأجر (قاعدة ٧)
  CONSTRAINT uq_fin_doc_lines_id_company UNIQUE (id, "companyId"),
  CONSTRAINT uq_fin_doc_lines_identity UNIQUE (id, "companyId", "documentKind", "documentId")
);
CREATE INDEX IF NOT EXISTS idx_fin_doc_lines_doc
  ON financial_document_lines ("documentKind", "documentId", "lineNo");
CREATE INDEX IF NOT EXISTS idx_fin_doc_lines_company
  ON financial_document_lines ("companyId", "branchId");

-- 2) توزيع البند الواحد على أكثر من كيان تشغيلي (تقسيم بالمبلغ/النسبة/الكمية)
CREATE TABLE IF NOT EXISTS financial_line_allocations (
  id                BIGSERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"        INTEGER,
  "lineId"          BIGINT NOT NULL,
  "entityType"      VARCHAR(40) NOT NULL,          -- vehicle/employee/property/project/case…
  "entityId"        INTEGER NOT NULL,
  "allocationType"  VARCHAR(20) NOT NULL DEFAULT 'amount'
                      CHECK ("allocationType" IN ('amount', 'percent', 'quantity')),
  "amount"          NUMERIC(14,2),                 -- يُملأ حسب allocationType
  "percent"         NUMERIC(7,4),
  "quantity"        NUMERIC(14,3),
  "costBearer"      VARCHAR(40),                   -- تفريع حوكمي لكل جزء (الدستور)
  "reason"          TEXT,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  -- FK مركّب: companyId الجزء يطابق companyId السطر (لا توزيع عابر للمستأجر)
  CONSTRAINT fk_fin_line_alloc_line FOREIGN KEY ("lineId", "companyId")
    REFERENCES financial_document_lines (id, "companyId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fin_line_alloc_line
  ON financial_line_allocations ("lineId");
CREATE INDEX IF NOT EXISTS idx_fin_line_alloc_entity
  ON financial_line_allocations ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_fin_line_alloc_company
  ON financial_line_allocations ("companyId", "branchId");

-- 3) مرفقات المستند المالي (مستوى المستند + مستوى البند عبر lineId)
CREATE TABLE IF NOT EXISTS financial_attachments (
  id              BIGSERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"      INTEGER,
  "documentKind"  VARCHAR(20) NOT NULL CHECK ("documentKind" IN ('voucher', 'expense')),
  "documentId"    INTEGER NOT NULL,
  "lineId"        BIGINT,                         -- NULL=مرفق المستند (FK مركّب أدناه عند الضبط)
  "url"           TEXT NOT NULL,
  "fileName"      TEXT,
  "mimeType"      VARCHAR(120),
  "documentType"  VARCHAR(40),                   -- وسم: فاتورة/وصل/إشعار تحويل…
  "serialNo"      VARCHAR(40),                   -- ترقيم داخلي (من مركز الترقيم)
  "status"        VARCHAR(20) NOT NULL DEFAULT 'linked'
                    CHECK ("status" IN ('linked', 'needs_replace', 'pending')),
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW(),
  -- FK مركّب: عند ضبط lineId يجب أن يطابق المرفق هوية السطر كاملةً (المستأجر +
  -- المستند) فلا يشير مرفق تحت مستند/شركة إلى سطر مستند/شركة أخرى. lineId=NULL
  -- (مرفق المستند) لا يُفحَص (MATCH SIMPLE).
  CONSTRAINT fk_fin_attach_line FOREIGN KEY ("lineId", "companyId", "documentKind", "documentId")
    REFERENCES financial_document_lines (id, "companyId", "documentKind", "documentId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_fin_attach_doc
  ON financial_attachments ("documentKind", "documentId");
CREATE INDEX IF NOT EXISTS idx_fin_attach_line
  ON financial_attachments ("lineId");
CREATE INDEX IF NOT EXISTS idx_fin_attach_company
  ON financial_attachments ("companyId", "branchId");

COMMIT;
