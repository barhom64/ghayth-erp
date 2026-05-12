# audit/system-review/ — منهجية المراجعة الشاملة

> فهرس صفحة-صفحة لـ 382 مسار في `artifacts/ghayth-erp/src/routes/`، مع
> ربط كل زر بحركته الخلفية، تتبّع التكاملات المتقاطعة، فحص النمذجة،
> واكتشاف البيانات الثابتة.

---

## ما الموجود هنا

```
audit/system-review/
├── INDEX.md                  ← الفهرس الرئيسي (KPIs + جدول الوحدات)
├── methodology.md            ← المنهجية المختصرة
├── README.md                 ← أنت هنا
├── findings/
│   ├── FINDINGS.csv          ← كل المشاكل في صف واحد
│   ├── hardcoded-data.md
│   ├── orphan-buttons.md
│   ├── broken-integrations.md
│   └── modeling-gaps.md
├── modules/
│   ├── finance/
│   │   ├── _module.md        ← نظرة عامة للوحدة
│   │   ├── finance-invoices.md
│   │   └── ... (67 ورقة)
│   ├── hr/                   ← 81 ورقة
│   ├── properties/           ← 30 ورقة
│   ├── ... (20+ وحدة)
│   └── careers-portal/, client-portal/  ← مرجع لـ PORTALS_TEST_MATRIX.md
└── tooling/
    ├── run-all.mjs           ← orchestrator
    ├── page-inventory.mjs
    ├── button-handler-scan.mjs
    ├── api-to-audit-map.mjs
    ├── schema-link.mjs
    ├── hardcoded-data-scan.mjs
    ├── build-findings.mjs
    ├── generate-pages.mjs
    ├── merge-runtime-results.mjs
    ├── build-module-index.mjs
    └── _*.json               ← outputs المشتركة بين السكربتات
```

---

## كيف تشغّله

```bash
# توليد كامل (لكل 382 صفحة + كل النتائج)
pnpm run audit:system-review --include-all

# وحدة واحدة فقط
node audit/system-review/tooling/run-all.mjs --module=fleet

# الموجة الأولى (finance + hr + governance) كافتراضي
node audit/system-review/tooling/run-all.mjs
```

كل تشغيل يستغرق ~10 ثوان. السكربتات كلها **read-only** على كود المنتج.

---

## بنية ورقة الصفحة

كل ورقة في `modules/<m>/<page>.md` تحوي 6 أقسام إلزامية:

1. **الميتاداتا** — المسار، الملف، الـ route file، الكومبوننت، الكيان المستنبط.
2. **الأزرار والإجراءات** — جدول CTA × API × Audit/Event/Lifecycle/Permission/Tenant/Tx.
3. **الحركات ذات الصلة (Cross-Module Transactions)** — *يُملأ يدوياً* بحركات GL، الأرصدة، الإشعارات، الموافقات، التكاملات الخارجية.
4. **النمذجة** — جدول Drizzle، أعمدة audit/tenant/FK.
5. **البيانات الوهمية الثابتة** — كل ما اكتشفه الـ scanner.
6. **النتيجة (Verdict)** — verdict من runtime audit (PASS/FAIL/PARTIAL) + screenshot.

---

## §3-Preservation Guard

السكربتات تعيد توليد §1, §2, §4, §5, §6 آلياً في كل تشغيل. لكن:

> **§3 المكتوب يدوياً يُحفَظ.**

إذا §3 تبدأ بـ `- [ ] **TBD**` فهي قالب — تُستبدل بالقالب الجديد.
إذا §3 تحوي محتوى آخر — تبقى كما هي.

العداد عند نهاية كل تشغيل يطبع:
```
generate-pages: 382 files written, 49 §3 hand-filled preserved
```

---

## دقة الـ Scanner (قبل/بعد)

| الفئة | المسح الأول | الآن |
|-------|-------------|------|
| broken-integration | 58 | 0 |
| missing-audit | 22 (مخفية) | 0 |
| orphan-button | 118 | 0 |
| hardcoded-inline-data-array | 61 | 0 |
| hardcoded-dummy-phone | 10 | 0 |
| modeling-no-createdAt | 14 | 0 |
| **TOTAL** | 268 | **0** |

التحسينات مفصّلة في commit messages لـ PRs #379, #445.

---

## كيف تضيف ورقة §3 معزّزة يدوياً

افتح أي ورقة في `modules/<m>/<page>.md` واستبدل القسم 3 بمحتواك:

```markdown
## 3. الحركات ذات الصلة (Cross-Module Transactions)

وصف موجز للعملية. المرجع: `docs/blueprints/...`.

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| الحركة A | xxx | `route.ts:Line` | `table` | ✅ موجود |
| الحركة B | yyy | … | … | ⚠ تحقق |

تحقق يدوي:
- [ ] سؤال 1
- [ ] سؤال 2
```

ثم شغّل `pnpm run audit:system-review --include-all` للتأكد من حفظ §3.

---

## أمثلة على أوراق §3 معزّزة (49 ورقة جاهزة)

كل واحدة منها توثّق سلسلة Cross-Module Transactions كاملة:

- **`finance/finance-invoices.md`** — GL + ZATCA + إشعار + workflow
- **`hr/hr-payroll.md`** — WPS + GOSI + atomicity (الأكثر تعقيداً)
- **`hr/hr-exit.md`** — gratuity + clearances + GOSI cancellation
- **`properties/properties-owners.md`** — IBAN + WHT + توزيع GL
- **`umrah/umrah-pilgrims.md`** — باقات + عمولة + ZATCA B2C
- ... راجع `INDEX.md` لقائمة الـ 49 كاملة

---

## إضافة ENTITY_MAP entry للحصول على audit تلقائي

عند إضافة endpoint جديد يكتب لـ DB:

1. أضف لـ `artifacts/api-server/src/middlewares/auditMiddleware.ts`:
   ```typescript
   const ENTITY_MAP = {
     ...,
     "/new/path": "new_entity",
   };
   const ENTITY_TABLE_MAP = {
     ...,
     new_entity: "new_table",
   };
   ```

2. تحقق أن `new_table` موجود فعلاً (احذر من التهجئة).

3. شغّل الـ audit:
   ```bash
   pnpm run audit:system-review --include-all
   ```
   ستلاحظ `missing-audit` ينخفض إذا كان الـ endpoint مذكوراً في الجدول.

41 prefix مضافة حالياً تغطي كل العمليات الرئيسية.

---

## المتبقي

| المتبقي | الوصف | الإجراء |
|---------|-------|---------|
| §3 يدوي | 333 ورقة لا تزال TBD | إضافة حسب الأولوية |
| runtime audit حديث | يحتاج stack شغّال | `pnpm run audit:runtime` |
| Mock data audit | لا يكتشف mock داخل tests أو fixtures | (خارج النطاق) |

---

## المراجع

- `methodology.md` — المنهجية المختصرة
- `INDEX.md` — لوحة KPIs
- `findings/FINDINGS.csv` — تصدير CSV لكل المشاكل
- خطة كاملة: `/root/.claude/plans/resilient-twirling-crab.md`
- Blueprints الوحدات: `docs/blueprints/`
- نموذج الإحالة: `docs/entity-action-matrix.md`, `docs/action-url-registry.md`
