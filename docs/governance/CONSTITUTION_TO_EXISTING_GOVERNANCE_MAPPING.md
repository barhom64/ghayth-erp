# خريطة ربط دستور غيث v3 بالحوكمة الموجودة

> الغرض من هذا الملف منع التكرار ومنع تضارب المراجع.
> دستور غيث v3 هو طبقة 0، والملفات القائمة في المستودع هي طبقات تفسير وتنفيذ وحراسة.

---

## جدول الربط

| مادة الدستور | المعنى | الملف/المرجع القائم | حالة التغطية | ملاحظات تنفيذية |
|---|---|---|---|---|
| 1 الهوية والرؤية | العميل مركز النظام + صفحة واحدة + لا حفظ بسيط | `docs/governance/غيث_العقيدة_الحاكمة.md`، `docs/ux/USER_WORK_CENTERS.md` | جزئي | يحتاج استمرار ربط مساحة العمل الموحدة بكل مسار جديد. |
| 2 مساحة العمل الموحدة | أول شاشة تعرض المهام والاعتمادات والتنبيهات | `docs/ux/USER_WORK_CENTERS.md`، `docs/architecture/VISIBILITY_GOVERNANCE_MATRIX.md` | جزئي | يجب منع صفحات يتيمة لا تظهر في workspace/visibility. |
| 3 الموظف متعدد التعيينات | الشخص غير التعيين | `docs/architecture/ENTITY_CATALOG.md`، `docs/architecture/ENTITY_OWNERSHIP_MATRIX.md` | جيد | كل role grant يجب أن يرتبط بـ `assignmentId` نشط. |
| 4 استقلال المسارات | كل مسار مستقل وحدوده واضحة | `docs/architecture/ENTITY_OWNERSHIP_MATRIX.md`، `docs/core-services/CORE_SERVICES_INVENTORY.md` | جيد | يحتاج Service Contract Catalog للتفصيل. |
| 5 القائد والمساند | القائد يقرر والمساند يخدم | `ENTITY_OWNERSHIP_MATRIX.md`، `VISIBILITY_GOVERNANCE_MATRIX.md` | جيد | الخدمات المساندة لا تظهر كمسارات مستقلة لغير المخول. |
| 6 قفل الحدود | لا كتابة عابرة إلا بعقد خدمة | `docs/governance/غيث_العقيدة_الحاكمة.md` §1، guards/audit scripts | جيد | أي cross-domain write يحتاج Contract. |
| 7 التفعيل الجزئي | Service mode حسب الاشتراك | `VISIBILITY_GOVERNANCE_MATRIX.md` | جزئي | فجوة قائمة: طبقة التفعيل/الاشتراك مذكورة كناقصة. |
| 8 منهجيات مستقلة | لا نسخ منهجية مسار لمسار | `docs/blueprints/*` | جزئي | يجب اكتمال Blueprints لكل مسار قائد. |
| 9 مصدر الحقيقة الواحد | مالك واحد لكل كيان | `ENTITY_OWNERSHIP_MATRIX.md` | جيد | أي كيان جديد يحتاج تحديث المصفوفة. |
| 10 Event First | كل كتابة ذات أثر تولد حدثاً | `غيث_العقيدة_الحاكمة.md` §10، `artifacts/api-server/src/routes/events.ts` | جزئي | يحتاج `EVENT_CATALOG.md` بعقود payload/version. |
| 11 الكيانات الجذرية | لا تابع بلا جذر | `ENTITY_CATALOG.md`، `ENTITY_OWNERSHIP_MATRIX.md` | جيد | أي Root جديد يصعد للمجلس. |
| 12 فصل الواجهة | الواجهة لا تحمل منطق الأعمال | `غيث_العقيدة_الحاكمة.md` §5 ترتيب المكتبات | جزئي | يحتاج فحص PR للواجهات الثقيلة. |
| 13 العزل متعدد الشركات | tenant scoped + branch scoped | `غيث_العقيدة_الحاكمة.md` §9، `VISIBILITY_GOVERNANCE_MATRIX.md` | جيد | لا `companyId` من body. |
| 14 RBAC حسب التعيين | الدور مرتبط بالتعيين | `ENTITY_OWNERSHIP_MATRIX.md`، `lib/rbacCatalog.ts` | جزئي | يحتاج `RBAC_PERMISSION_CATALOG.md`. |
| 15 قواعد معمارية | صفحة أم، اختيار ذكي، أثر متوقع | `VISIBILITY_GOVERNANCE_MATRIX.md`، blueprints | جزئي | يحتاج Checklist قبول UI. |
| 16 GL/Subledger/Dimensions | المالية حاجز | `غيث_العقيدة_الحاكمة.md` §1، financial engine/mappings | جيد | لا literal accounts ولا direct JE. |
| 17 منع الترحيل على الأب | `allowPosting=false` | financial mappings/guards | جزئي | يجب إضافة assertion عند توسعة المالية. |
| 18 No Physical Delete | soft delete/archive | `غيث_العقيدة_الحاكمة.md` §9 | جزئي | يحتاج سياسة حذف موحدة لكل جدول. |
| 19 تصنيف البيانات | مرجعي/إعدادات/تشغيلي/تعاقدي | `ENTITY_CATALOG.md` | جزئي | يحتاج Data Classification column لاحقاً. |
| 20 القواعد العشر | شروط التسليم | هذا الملف + checklist | جيد بعد إضافة checklist | تستخدم في PR template. |
| 21 التصعيد | GL/مسارات/Root Entities | `CONSTITUTION_GOVERNANCE_POLICY.md` | مضاف | أي قرار مصعد يسجل كـ ADR/Owner Decision. |

---

## قرارات عدم التكرار

1. لا ننشئ `ENTITY_OWNERSHIP_MATRIX` جديداً لأن الموجود هو المرجع.
2. لا ننشئ `ENTITY_CATALOG` جديداً لأن الموجود مبني على جرد فعلي.
3. لا نستبدل `غيث_العقيدة_الحاكمة.md`؛ نربطه بالدستور كوثيقة تشغيلية.
4. لا نضيف Blueprints عامة إذا كان للمسار Blueprint قائم؛ نكمل الناقص فقط.

---

## الملفات المطلوب إكمالها فوق الموجود

- `docs/architecture/EVENT_CATALOG.md`
- `docs/architecture/SERVICE_CONTRACT_CATALOG.md`
- `docs/architecture/RBAC_PERMISSION_CATALOG.md`
- `docs/governance/CONSTITUTION_COMPLIANCE_CHECKLIST.md`
- `docs/governance/CONSTITUTION_GOVERNANCE_POLICY.md`

---

## قاعدة العمل

عند تنفيذ ميزة جديدة، لا يبحث المطور عن رأي شفهي إذا وجد الحكم هنا. يرجع للملف المختص، ويوثق في PR أي بند طبّقه أو خالفه مع سبب وتصعيد.
