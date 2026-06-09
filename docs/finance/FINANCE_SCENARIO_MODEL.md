# FINANCE_SCENARIO_MODEL

> المهمة: #1945 / المهمة الأم #1715
> الكود: `artifacts/ghayth-erp/src/lib/finance/scenario-model.ts`
> الاختبارات: `artifacts/api-server/tests/unit/financeScenarioModel.test.ts`

## الفكرة

كل شاشة مالية يجب أن تُقاد بـ **اختيار متدرّج**، لا بقائمة حقول مرقّعة:

```
1. نوع العملية      →  2. المجال / المسار   →  3. السيناريو
→ 4. تفاصيل السيناريو (الحقول ذات الصلة فقط)
→ 5. التوجيه المحاسبي المتوقع (الحساب من resolveAccountCode)
→ 6. الأثر التشغيلي (تذكرة / سجل وقود / إنشاء أصل …)
→ 7. المهمة المستقبلية (تذكير / إهلاك / تجديد …)
→ 8. الاعتماد / الدفع / الترحيل (حسب المسار)
→ 9. التجاوز اليدوي المتقدم (بصلاحية وسبب، عند الحاجة فقط)
```

**لا يظهر أي حقل قبل أن يكون له معنى.** لا يُقبل ترقيع حقول منفردة بدون نموذج
سيناريو مركزي.

## لماذا سجلّ مركزي؟

نفس المعرفة كانت موزّعة على ثلاثة أماكن يجب أن تتطابق:

| الموضع | المسؤولية |
|---|---|
| `AllocationTargetSelect` (FE) | أيّ الحقول تظهر لكل «هدف» |
| `deriveSpecializedAccount` (api-server) | غرض حساب الأستاذ لكل هدف |
| `deriveOperationalEffectHint` (api-server) | الأثر التشغيلي + المهمة المستقبلية |

عند تغيير أحدها دون الآخر يحدث انحراف صامت (حقل يظهر بلا حساب، أو حساب بلا
أثر). السجلّ المركزي يجمع ذلك في **مصدر حقيقة واحد**: يُعلَن السيناريو مرة
واحدة، وكل طبقة تقرأ منه.

## البنية

`scenario-model.ts` يصدّر:

- `FinanceDomain` + `DOMAIN_LABELS` — المجالات (مركبة/عقار/عمرة/مشروع/مخزون/
  أصل ثابت/وثيقة/موظف/مورد-عميل/عام).
- `ScenarioFieldSpec` — وصف حقل واحد (key, label, kind, required?, options?,
  hint?). الـ `kind` يقرّر أيّ عنصر تحكّم يرسمه الـ Renderer.
- `ScenarioEffect` — الأثر التشغيلي (maintenance_ticket | fuel_log |
  asset_creation | document_record | tenant_claim | stock_movement | null).
- `FinanceScenario` — السيناريو (id, domain, label, fields[], accountPurpose,
  capitalize?, costCenterSource, effect, futureTask?).
- `FINANCE_SCENARIOS` — السجلّ نفسه.
- `scenariosForDomain(domain)` — السيناريوهات المتاحة لمجال (الـ Renderer
  يعرض هذه **فقط**).
- `resolveScenario(scenarioId)` — الـ Resolver الذي يستدعيه الـ Renderer
  والمعاينة بعد اختيار السيناريو.

### التطابق مع الخادم (مُختبَر)

كل `accountPurpose` في السجلّ هو نفس مفتاح الغرض الذي يولّده
`deriveSpecializedAccount` للعملية المكافئة. اختبار
`financeScenarioModel.test.ts` يثبت هذا التطابق سيناريو-بسيناريو (FE purpose ==
backend purpose، وكذلك الرسملة capitalize). أيّ تغيير في طرف دون الآخر يكسر
الاختبار — وهو بالضبط «الترقيع» الممنوع.

| المفتاح (accountPurpose) | الغرض |
|---|---|
| `vehicle_fuel_expense` | وقود المركبات |
| `vehicle_maintenance_expense` | صيانة المركبات |
| `property_maintenance_expense` | صيانة العقارات |
| `umrah_cost` | تكاليف العمرة |
| `project_cost` | تكاليف المشاريع |
| `inventory_receipt` | استلام مخزون (رسملة) |
| `fixed_asset_purchase` | شراء أصل (رسملة) |
| `general_expense` | مصروف عام |

## الخارطة (Roadmap)

| المرحلة | المحتوى | الحالة |
|---|---|---|
| **1** | السجلّ المركزي + الـ Resolvers (حقول/حساب/مركز تكلفة/أثر/مهمة) + الاختبارات + التوثيق + Field Audit | **هذا الـ PR** |
| **2** | `AllocationTargetSelect` يرسم من السجلّ بدل قوائمه الخاصة | تالٍ |
| **3** | `deriveSpecializedAccount` / `deriveOperationalEffectHint` يقرآن نفس المفاتيح (يستخدمانها أصلًا) — يُغلَق التطابق برمجيًا | تالٍ |
| **4** | المصروفات/السندات/الفواتير/الإدخال تعيد استخدام النموذج، وتُحذف الحقول القديمة («الجهة المرتبطة» + الحساب/مركز التكلفة الخام + «تم الدفع» اليدوي) | تالٍ |

## ما لا يفعله هذا الـ PR (عمدًا)

لتجنّب «نصف هجرة» في PR واحد ضخم: المرحلة 1 لا تعدّل واجهة المصروف نفسها بعد.
هي تُرسي الأساس المختبَر الذي تصدر منه المراحل التالية، وتوثّق قرارات التنظيف
في [`FINANCE_EXPENSE_FORM_FIELD_AUDIT.md`](./FINANCE_EXPENSE_FORM_FIELD_AUDIT.md).
بهذا يصبح كل تغيير لاحق في الواجهة **اشتقاقًا من النموذج**، لا ترقيعًا.

## مراجع

- [`FINANCE_EXPENSE_FORM_FIELD_AUDIT.md`](./FINANCE_EXPENSE_FORM_FIELD_AUDIT.md)
- [`FINANCE_ALLOCATION_TARGETS.md`](./FINANCE_ALLOCATION_TARGETS.md)
- [`FINANCE_OPERATION_CONTEXT_MATRIX.md`](./FINANCE_OPERATION_CONTEXT_MATRIX.md)
