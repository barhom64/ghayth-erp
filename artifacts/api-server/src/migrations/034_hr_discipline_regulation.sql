-- =============================================================================
-- 034_hr_discipline_regulation.sql
-- لائحة الانضباط الوظيفي ومحاضر الاستفسار (Living HR Discipline Regulation)
--
--   - hr_discipline_regulation:  الكتالوج الحي للمخالفات والجزاءات داخل HR
--   - hr_inquiry_memos:          محضر الإفصاح/الاستفسار (نموذج معتمد)
--   - hr_inquiry_memo_events:    سجل إجراءات المحضر (توقيعات، توصيات، اعتماد)
--
-- يسري العمل بهذه اللائحة بأثر رجعي من تاريخ 2024-10-01م
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) كتالوج المخالفات والجزاءات (حي داخل HR)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_discipline_regulation (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  section           TEXT NOT NULL,                 -- work_time | work_organization | conduct
  "articleNumber"   INTEGER NOT NULL,              -- رقم المخالفة في القسم
  title             TEXT NOT NULL,                 -- وصف المخالفة
  description       TEXT,                          -- وصف إضافي اختياري
  penalty1          TEXT,                          -- أول مرة
  penalty2          TEXT,                          -- ثاني مرة
  penalty3          TEXT,                          -- ثالث مرة
  penalty4          TEXT,                          -- رابع مرة
  "extraDeduction"  TEXT,                          -- بالإضافة إلى حسم أجر ...
  severity          TEXT NOT NULL DEFAULT 'medium',-- low | medium | high | critical
  "isTermination"   BOOLEAN NOT NULL DEFAULT FALSE,-- تؤدي إلى الفصل
  "legalReference"  TEXT,                          -- مرجع نظامي (مادة الثمانون..)
  "effectiveFrom"   DATE NOT NULL DEFAULT DATE '2024-10-01',
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"       TIMESTAMPTZ,
  CONSTRAINT hr_disc_section_chk CHECK (section IN ('work_time','work_organization','conduct'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_disc_company_article_unique
  ON hr_discipline_regulation ("companyId", section, "articleNumber")
  WHERE "companyId" IS NOT NULL AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hr_disc_template_article_unique
  ON hr_discipline_regulation (section, "articleNumber")
  WHERE "companyId" IS NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS hr_disc_company_idx
  ON hr_discipline_regulation ("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_disc_section_idx
  ON hr_discipline_regulation (section) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_disc_active_idx
  ON hr_discipline_regulation ("isActive") WHERE "deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) محضر الإفصاح/الاستفسار — النموذج المعتمد
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_inquiry_memos (
  id                        SERIAL PRIMARY KEY,
  "companyId"               INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"                INTEGER REFERENCES branches(id),
  "memoNumber"              TEXT NOT NULL,                 -- رقم المحضر
  "assignmentId"            INTEGER NOT NULL REFERENCES employee_assignments(id),
  "employeeId"              INTEGER NOT NULL REFERENCES employees(id),
  "regulationId"            INTEGER REFERENCES hr_discipline_regulation(id),
  "violationId"             INTEGER,                        -- employee_violations.id (when auto)
  "incidentType"            TEXT NOT NULL,                  -- late|absence|early_leave|behavior|organization|custom
  "incidentDate"            DATE NOT NULL,
  "incidentDurationMinutes" INTEGER,                        -- للتأخر/المغادرة المبكرة
  "incidentDescription"     TEXT,
  source                    TEXT NOT NULL DEFAULT 'manual', -- manual|auto|manager|hr
  -- Employee response
  justification             TEXT,
  "employeeSignedAt"        TIMESTAMPTZ,
  "employeeDeclined"        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Direct manager recommendation
  "managerId"               INTEGER,                        -- employee_assignments.id
  "managerRecommendation"   TEXT,                           -- approve_excuse|reject_excuse
  "managerComment"          TEXT,
  "managerDecidedAt"        TIMESTAMPTZ,
  -- General manager decision
  "gmId"                    INTEGER,
  "gmDecision"              TEXT,                           -- approved|rejected|other
  "gmComment"               TEXT,
  "gmDecidedAt"             TIMESTAMPTZ,
  -- Applied penalty
  "occurrenceCount"         INTEGER DEFAULT 1 CHECK ("occurrenceCount" BETWEEN 1 AND 4),
  "appliedPenaltyLabel"     TEXT,
  "appliedDeductionAmount"  NUMERIC(14,2) DEFAULT 0,
  "appliedExtraDeduction"   NUMERIC(14,2) DEFAULT 0,
  "terminationDecided"      BOOLEAN NOT NULL DEFAULT FALSE,
  status                    TEXT NOT NULL DEFAULT 'pending_employee',
  "createdBy"               INTEGER,                        -- user id
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"               TIMESTAMPTZ,
  CONSTRAINT hr_memo_status_chk CHECK (status IN (
    'draft','pending_employee','pending_manager','pending_gm',
    'approved','rejected','cancelled','expired'
  )),
  CONSTRAINT hr_memo_incident_chk CHECK ("incidentType" IN (
    'late','absence','early_leave','behavior','organization','gps_out_of_range','custom'
  )),
  CONSTRAINT hr_memo_source_chk CHECK (source IN ('manual','auto','manager','hr'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_memo_number_unique
  ON hr_inquiry_memos ("companyId","memoNumber") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_memo_company_idx
  ON hr_inquiry_memos ("companyId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_memo_assignment_idx
  ON hr_inquiry_memos ("assignmentId") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_memo_status_idx
  ON hr_inquiry_memos (status) WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS hr_memo_incident_date_idx
  ON hr_inquiry_memos ("incidentDate");
CREATE INDEX IF NOT EXISTS hr_memo_violation_idx
  ON hr_inquiry_memos ("violationId") WHERE "violationId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) سجل الإجراءات على المحضر (timeline / audit)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_inquiry_memo_events (
  id           SERIAL PRIMARY KEY,
  "memoId"     INTEGER NOT NULL REFERENCES hr_inquiry_memos(id) ON DELETE CASCADE,
  "companyId"  INTEGER NOT NULL,
  "actorId"    INTEGER,
  "actorRole"  TEXT,             -- employee|direct_manager|hr|gm|system
  action       TEXT NOT NULL,    -- created|justified|manager_recommended|gm_decided|cancelled|penalty_applied|escalated
  payload      JSONB,
  note         TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_memo_events_memo_idx ON hr_inquiry_memo_events ("memoId");
CREATE INDEX IF NOT EXISTS hr_memo_events_action_idx ON hr_inquiry_memo_events (action);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ربط المخالفات بالمحضر (FK soft link)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS "inquiryMemoId" INTEGER;
ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS "regulationId" INTEGER;
ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS "occurrenceCount" INTEGER DEFAULT 1;
ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_inquiry';
ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS viol_memo_idx
  ON employee_violations ("inquiryMemoId") WHERE "inquiryMemoId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS viol_regulation_idx
  ON employee_violations ("regulationId") WHERE "regulationId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) بذور الكتالوج الافتراضي (template at companyId=NULL)
--    المصدر: لائحة الانضباط الوظيفي المعتمدة — سارية من 2024-10-01
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO hr_discipline_regulation
  ("companyId", section, "articleNumber", title, penalty1, penalty2, penalty3, penalty4, "extraDeduction", severity, "isTermination", "legalReference")
VALUES
-- ── أولا: مخالفات تتعلق بمواعيد العمل (16 مادة) ────────────────────────────
(NULL,'work_time',1,'التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن أو عذر مقبول، إذا لم يترتب على ذلك تعطيل عمال آخرين','إنذار كتابي','5%','10%','20%',NULL,'low',FALSE,NULL),
(NULL,'work_time',2,'التأخر عن مواعيد الحضور للعمل لغاية (15) دقيقة دون إذن أو عذر مقبول، إذا ترتب على ذلك تعطيل عمال آخرين','إنذار كتابي','15%','25%','50%',NULL,'medium',FALSE,NULL),
(NULL,'work_time',3,'التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن أو عذر مقبول، إذا لم يترتب على ذلك تعطيل عمال آخرين','10%','15%','25%','50%','بالإضافة إلى حسم أجر دقائق التأخر','medium',FALSE,NULL),
(NULL,'work_time',4,'التأخر عن مواعيد الحضور للعمل أكثر من (15) دقيقة لغاية (30) دقيقة دون إذن أو عذر مقبول، إذا ترتب على ذلك تعطيل عمال آخرين','25%','50%','75%','يوم','بالإضافة إلى حسم أجر دقائق التأخر','high',FALSE,NULL),
(NULL,'work_time',5,'التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن أو عذر مقبول، إذا لم يترتب على ذلك تعطيل عمال آخرين','25%','50%','75%','يوم','بالإضافة إلى حسم أجر دقائق التأخر','high',FALSE,NULL),
(NULL,'work_time',6,'التأخر عن مواعيد الحضور للعمل أكثر من (30) دقيقة لغاية (60) دقيقة دون إذن أو عذر مقبول، إذا ترتب على ذلك تعطيل عمال آخرين','30%','50%','يوم','يومان','بالإضافة إلى حسم أجر دقائق التأخر','high',FALSE,NULL),
(NULL,'work_time',7,'التأخر عن مواعيد الحضور للعمل لمدة تزيد على ساعة دون إذن أو عذر مقبول، سواء ترتب أو لم يترتب على ذلك تعطيل عمال آخرين','إنذار كتابي','يوم','يومان','ثلاثة أيام','بالإضافة إلى حسم أجر ساعات التأخر','high',FALSE,NULL),
(NULL,'work_time',8,'ترك العمل أو الانصراف قبل الميعاد دون إذن أو عذر مقبول بما لا يتجاوز (15) دقيقة','إنذار كتابي','10%','25%','يوم','بالإضافة إلى حسم أجر مدة ترك العمل','medium',FALSE,NULL),
(NULL,'work_time',9,'ترك العمل أو الانصراف قبل الميعاد دون إذن أو عذر مقبول بما يتجاوز (15) دقيقة','10%','25%','50%','يوم','بالإضافة إلى حسم أجر مدة ترك العمل','high',FALSE,NULL),
(NULL,'work_time',10,'البقاء في أماكن العمل أو العودة إليها بعد انتهاء مواعيد العمل دون إذن مسبق','إنذار كتابي','10%','25%','يوم',NULL,'medium',FALSE,NULL),
(NULL,'work_time',11,'الغياب دون إذن كتابي أو عذر مقبول لمدة يوم، خلال السنة العقدية الواحدة','يومان','ثلاثة أيام','أربعة أيام','الحرمان من الترقيات أو العلاوات لمرة واحدة','بالإضافة إلى حسم أجر مدة الغياب','high',FALSE,NULL),
(NULL,'work_time',12,'الغياب المتصل دون إذن كتابي أو عذر مقبول من يومين إلى ستة أيام، خلال السنة العقدية الواحدة','يومان','ثلاثة أيام','أربعة أيام','الحرمان من الترقيات أو العلاوات لمرة واحدة','بالإضافة إلى حسم أجر مدة الغياب','high',FALSE,NULL),
(NULL,'work_time',13,'الغياب المتصل دون إذن كتابي أو عذر مقبول من سبعة أيام إلى عشرة أيام، خلال السنة العقدية الواحدة','أربعة أيام','خمسة أيام','الحرمان من الترقيات أو العلاوات لمرة واحدة','فصل من الخدمة مع المكافأة إذا لم يتجاوز الغياب (30) يوماً','بالإضافة إلى حسم أجر مدة الغياب','critical',TRUE,NULL),
(NULL,'work_time',14,'الغياب المتصل دون إذن كتابي أو عذر مقبول من أحد عشر يوماً إلى أربعة عشر يوماً، خلال السنة العقدية الواحدة','خمسة أيام','الحرمان من الترقيات أو العلاوات لمرة واحدة','فصل من الخدمة طبقاً للمادة (الثمانون) من نظام العمل','-','بالإضافة إلى حسم أجر مدة الغياب','critical',TRUE,'المادة 80 من نظام العمل'),
(NULL,'work_time',15,'الانقطاع عن العمل دون سبب مشروع مدة تزيد على خمسة عشر يوماً متصلة، خلال السنة العقدية الواحدة','الفصل دون مكافأة أو تعويض، على أن يسبقه إنذار كتابي بعد الغياب مدة عشرين يوماً، في نطاق حكم المادة (الثمانون) من نظام العمل',NULL,NULL,NULL,NULL,'critical',TRUE,'المادة 80 من نظام العمل'),
(NULL,'work_time',16,'الغياب عن العمل دون سبب مشروع مدداً تزيد في مجموعها على ثلاثين يوماً، خلال السنة العقدية الواحدة','الفصل دون مكافأة أو تعويض، على أن يسبقه إنذار كتابي بعد الغياب مدة عشرين يوماً، في نطاق حكم المادة (الثمانون) من نظام العمل',NULL,NULL,NULL,NULL,'critical',TRUE,'المادة 80 من نظام العمل'),

-- ── ثانيا: مخالفات تتعلق بتنظيم العمل (18 مادة) ────────────────────────────
(NULL,'work_organization',1,'التواجد دون مبرر في غير مكان العمل المخصص للعامل أثناء وقت الدوام','10%','25%','50%','يوم',NULL,'medium',FALSE,NULL),
(NULL,'work_organization',2,'استقبال زائرين في غير أمور عمل المنشأة في أماكن العمل، دون إذن من الإدارة','إنذار كتابي','10%','15%','25%',NULL,'low',FALSE,NULL),
(NULL,'work_organization',3,'استعمال آلات ومعدات وأدوات المنشأة لأغراض خاصة، دون إذن','إنذار كتابي','10%','25%','50%',NULL,'medium',FALSE,NULL),
(NULL,'work_organization',4,'تدخل العامل دون وجه حق في أي عمل ليس في اختصاصه، أو لم يعهد به إليه','50%','يوم','يومان','ثلاثة أيام',NULL,'high',FALSE,NULL),
(NULL,'work_organization',5,'الخروج أو الدخول من غير المكان المخصص لذلك','إنذار كتابي','10%','15%','25%',NULL,'low',FALSE,NULL),
(NULL,'work_organization',6,'الإهمال في تنظيف الآلات وصيانتها، أو عدم العناية بها، أو عدم التبليغ عما بها من خلل','50%','يوم','يومان','ثلاثة أيام',NULL,'high',FALSE,NULL),
(NULL,'work_organization',7,'عدم وضع أدوات الإصلاح والصيانة واللوازم الأخرى في الأماكن المخصصة لها، بعد الانتهاء من العمل','إنذار كتابي','25%','50%','يوم',NULL,'medium',FALSE,NULL),
(NULL,'work_organization',8,'تمزيق أو إتلاف إعلانات أو بلاغات إدارة المنشأة','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'work_organization',9,'الإهمال في العهد التي بحوزته، مثال: (سيارات، آلات، أجهزة، معدات، أدوات، ...الخ)','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'work_organization',10,'الأكل في مكان العمل، أو غير المكان المعد له، أو في غير أوقات الراحة','إنذار كتابي','10%','15%','25%',NULL,'low',FALSE,NULL),
(NULL,'work_organization',11,'النوم أثناء العمل','إنذار كتابي','10%','25%','50%',NULL,'medium',FALSE,NULL),
(NULL,'work_organization',12,'النوم في الحالات التي تستدعي يقظة مستمرة','50%','يوم','يومان','ثلاثة أيام',NULL,'high',FALSE,NULL),
(NULL,'work_organization',13,'التسكع، أو وجود العامل في غير مكان عمله، أثناء ساعات العمل','10%','25%','50%','يوم',NULL,'medium',FALSE,NULL),
(NULL,'work_organization',14,'التلاعب في إثبات الحضور والانصراف','يوم','يومان','فصل مع المكافأة','-',NULL,'critical',TRUE,NULL),
(NULL,'work_organization',15,'عدم إطاعة الأوامر العادية الخاصة بالعمل، أو عدم تنفيذ التعليمات الخاصة بالعمل، والمعلقة في مكان ظاهر','25%','50%','يوم','يومان',NULL,'high',FALSE,NULL),
(NULL,'work_organization',16,'التحريض على مخالفة الأوامر والتعليمات الخطية الخاصة بالعمل','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'work_organization',17,'التدخين في الأماكن المحظورة، والمعلن عنها للمحافظة على سلامة العمال والمنشأة','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'work_organization',18,'الإهمال أو التهاون في العمل الذي قد ينشأ عنه ضرر في صحة العمال أو سلامتهم، أو في المواد أو الأدوات والأجهزة','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),

-- ── ثالثا: مخالفات تتعلق بسلوك العامل (15 مادة) ────────────────────────────
(NULL,'conduct',1,'التشاجر مع الزملاء أو مع الغير، أو إحداث مشاغبات في مكان العمل','يوم','يومان','ثلاثة أيام','خمسة أيام',NULL,'high',FALSE,NULL),
(NULL,'conduct',2,'التمارض، أو ادعاء العامل كذباً أنه أصيب أثناء العمل، أو بسببه','يوم','يومان','ثلاثة أيام','خمسة أيام',NULL,'high',FALSE,NULL),
(NULL,'conduct',3,'الامتناع عن إجراء الكشف الطبي عند طلب طبيب المنشأة، أو رفض اتباع التعليمات الطبية','يوم','يومان','ثلاثة أيام','خمسة أيام',NULL,'high',FALSE,NULL),
(NULL,'conduct',4,'مخالفة التعليمات الصحية المعلقة بأماكن العمل','50%','يوم','يومان','خمسة أيام',NULL,'high',FALSE,NULL),
(NULL,'conduct',5,'الكتابة على جدران المنشأة، أو لصق إعلانات عليها','إنذار كتابي','10%','25%','50%',NULL,'low',FALSE,NULL),
(NULL,'conduct',6,'رفض التفتيش الإداري عند الانصراف','25%','50%','يوم','يومان',NULL,'high',FALSE,NULL),
(NULL,'conduct',7,'عدم تسليم النقود المحصلة لحساب المنشأة في المواعيد المحددة دون تبرير مقبول','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'conduct',8,'الامتناع عن ارتداء الملابس والأجهزة المقررة للوقاية والسلامة','إنذار كتابي','يوم','يومان','خمسة أيام',NULL,'high',FALSE,NULL),
(NULL,'conduct',9,'تعمد الخلوة مع الجنس الآخر في أماكن العمل','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'conduct',10,'الإيحاء للآخرين بما يخدش الحياء قولاً أو فعلاً','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'conduct',11,'الاعتداء على زملاء العمل بالقول أو الإشارة، أو باستعمال وسائل الاتصال الإلكترونية بالشتم أو التحقير','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL),
(NULL,'conduct',12,'الاعتداء بالإيذاء الجسدي على زملاء العمل، أو على غيرهم بطريقة إباحية','فصل بدون مكافأة أو إشعار أو تعويض؛ بموجب المادة (الثمانون)',NULL,NULL,NULL,NULL,'critical',TRUE,'المادة 80 من نظام العمل'),
(NULL,'conduct',13,'الاعتداء الجسدي أو القولي، أو بأي وسيلة من وسائل الاتصال الإلكترونية على صاحب العمل أو المدير المسؤول أو أحد الرؤساء أثناء العمل أو بسببه','فصل بدون مكافأة أو إشعار أو تعويض؛ بموجب المادة (الثمانون)',NULL,NULL,NULL,NULL,'critical',TRUE,'المادة 80 من نظام العمل'),
(NULL,'conduct',14,'تقديم بلاغ أو شكوى كيدية','ثلاثة أيام','خمسة أيام','فصل مع المكافأة','-',NULL,'critical',TRUE,NULL),
(NULL,'conduct',15,'عدم الامتثال لطلب لجنة التحقيق بالحضور، أو الإدلاء بالأقوال، أو الشهادة','يومان','ثلاثة أيام','خمسة أيام','فصل مع المكافأة',NULL,'critical',TRUE,NULL)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) دالة استنساخ الكتالوج الافتراضي لأي شركة (تُستدعى عند إنشاء شركة جديدة)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr_clone_default_regulation(p_company_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO hr_discipline_regulation
    ("companyId", section, "articleNumber", title, description,
     penalty1, penalty2, penalty3, penalty4, "extraDeduction",
     severity, "isTermination", "legalReference", "effectiveFrom", "isActive")
  SELECT
    p_company_id, section, "articleNumber", title, description,
    penalty1, penalty2, penalty3, penalty4, "extraDeduction",
    severity, "isTermination", "legalReference", "effectiveFrom", TRUE
  FROM hr_discipline_regulation
  WHERE "companyId" IS NULL AND "deletedAt" IS NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) بذر الكتالوج لكل الشركات القائمة
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM companies LOOP
    PERFORM hr_clone_default_regulation(r.id);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) صلاحيات الوحدة — تُمنح لأدوار HR والمدير العام افتراضياً
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, permission)
VALUES
  ('hr_manager','hr:discipline:read'),
  ('hr_manager','hr:discipline:create'),
  ('hr_manager','hr:discipline:update'),
  ('general_manager','hr:discipline:read'),
  ('general_manager','hr:discipline:approve'),
  ('owner','hr:discipline:read'),
  ('owner','hr:discipline:approve')
ON CONFLICT DO NOTHING;
