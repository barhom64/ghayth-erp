# Layered RBAC v2 — نظام الصلاحيات الطبقي

> **الهدف**: استبدال نظام الصلاحيات المسطّح القديم (80 صلاحية CRUD فقط) بنموذج هرمي كامل مكوَّن من 5 طبقات + سقوف اعتماد + فصل مهام (SoD)، قابل بالكامل للتحكم من الواجهة.

---

## 1. المبدأ الحاكم — Employee-First

> **"نمنع الخطر، لا نمنع العمل."**

| السلوك | الافتراضي |
|---|---|
| الموظف على بياناته الشخصية، إجازاته، راتبه، مهامه، طلباته | ✅ **مفتوح بلا منح صلاحية** ولا يمكن للمسؤول إلغاؤه |
| الموظف على بيانات قسمه (مشترك) | ✅ مفتوح للقراءة افتراضياً |
| الموظف على بيانات قسم آخر | ❌ مغلق ما لم يُمنح |
| المدير على فريقه/قسمه | ✅ مفتوح هرمياً تلقائياً |

التطبيق: كل ميزة في الـcatalog مُعلَّمة `selfService: true` تتجاوز كل فحص صلاحية وتُمنح للموظف بصاحب البيانات.

---

## 2. النموذج الطبقي — 5 طبقات + Cross-cutting

```
Layer 1 — Module          مثال: hr / finance / fleet / projects
Layer 2 — Feature         مثال: hr.payroll / hr.payroll.runs / hr.payroll.my_payslip
Layer 3 — Action          view / list / create / update / delete / approve / export ...
Layer 4 — Scope           self / team / department / branch / company / all  (هرمي)
Layer 5 — Field           visible / masked / hidden / readonly  (لكل حقل حساس)

Cross: Approval Limits    حد مالي للاعتماد + dual-control
Cross: SoD Rules          قواعد فصل المهام (مَن يُنشئ لا يَعتمد)
Cross: User Overrides     grant/revoke لكل مستخدم بانتهاء صلاحية اختياري
```

---

## 3. البنية التحتية

### 3.1 الجداول

| الجدول | الغرض |
|---|---|
| `feature_catalog` | مرجع كل ميزة في النظام (تُزرع من الكود عند الإقلاع) |
| `rbac_roles` | تعريف الأدوار لكل شركة + قوالب عامة |
| `rbac_role_grants` | الطبقة الرئيسية: role × feature × actions × scope |
| `rbac_field_policies` | سياسة الحقول الحساسة (مخفي/مقنّع/...) |
| `rbac_approval_limits` | سقوف الاعتماد المالي |
| `rbac_user_grants` | تجاوزات على مستوى المستخدم (grant/revoke + expiry) |
| `rbac_user_roles` | ربط المستخدم بأدواره في الشركة |
| `rbac_role_history` | سجل تدقيق كل تعديل على دور |
| `rbac_sod_rules` | قواعد فصل المهام |
| `rbac_cache_version` | نسخة الكاش (تُرفَع عند أي تعديل) |

كلها في `migrations/109_layered_rbac_v2.sql` — idempotent وقابلة لإعادة التشغيل.

### 3.2 الكود

| الملف | الدور |
|---|---|
| `lib/rbac/featureCatalog.ts` | كاتلوج الميزات (~60 ميزة، spine النظام) |
| `lib/rbac/authzEngine.ts` | محرّك التفويض: `checkAccess()` يقيّم الطبقات الـ5 |
| `lib/rbac/authorize.ts` | middleware الاستخدام: `authorize({ feature, action, ... })` |
| `lib/rbac/autoMigrate.ts` | يحوّل الأدوار القديمة إلى v2 عند الإقلاع |
| `lib/rbac/catalogSync.ts` | يدفع الـcatalog من الكود إلى الـDB |
| `routes/rbacV2.ts` | API الإدارة (mounted at `/rbac/v2`) |
| `pages/admin/rbac-v2-tab.tsx` | واجهة الإدارة (تبويب "الصلاحيات الطبقية") |

---

## 4. الاستخدام في الـ Routes الجديدة

```ts
import { authorize, maskFields } from "../lib/rbac/authorize.js";

// نمط معياري لكل endpoint
router.get("/payroll/payslips/:id",
  authMiddleware,
  authorize({
    feature: "hr.payroll.runs",
    action: "view",
    resource: { table: "payroll_runs", idParam: "id" },
  }),
  async (req, res) => {
    const data = await rawQuery(/* ... use req.access?.scopeFilter ... */);
    // 🔑 يمسح الحقول الحساسة تلقائياً وفق سياسة الدور
    res.json(maskFields(req, { data }));
  }
);

// لإجراء يحتاج سقف اعتماد
router.post("/invoices/:id/approve",
  authMiddleware,
  authorize({
    feature: "finance.invoices",
    action: "approve",
    resource: { table: "invoices", idParam: "id" },
    amount: { from: "body", field: "amount", currency: "SAR" },
  }),
  handler
);
```

---

## 5. واجهة الإدارة — `/admin` → "الصلاحيات الطبقية"

| التبويب | المحتوى |
|---|---|
| **الصلاحيات** | شجرة ميزات + checkbox لكل action + dropdown للنطاق |
| **الحقول الحساسة** | لكل ميزة، اختر mode لكل حقل (ظاهر/مقنّع/مخفي/قراءة) |
| **سقوف الاعتماد** | لكل approve action، حدّد المبلغ الأقصى + dual-control |

| الزر | الوظيفة |
|---|---|
| **محاكاة** | "اعرض كـ مستخدم X" — يعرض ما يصل إليه مستخدم محدد فعلياً |
| **نسخ** | استنساخ الدور (مع كل grants/fields/limits) — اختياري كقالب عام |
| **السجل** | كل تعديل على الدور (مَن، متى، ماذا) |
| **حفظ** | يحفظ التبويب الحالي (grants أو fields أو limits) |

---

## 6. ضمانات السلامة

| الضمان | كيف يُطبَّق |
|---|---|
| **Self-service لا يُلغى** | `authzEngine.checkAccess()` يفحص `selfService` قبل أي شيء آخر |
| **Owner لا يتجاوز sand-box** | الـmiddleware يعطيه bypass مع تسجيل في `security_log` |
| **Cache invalidation تلقائي** | كل تعديل يستدعي `bumpCacheVersion(companyId)` — TTL 30s |
| **Backward compat** | الـ`requirePermission` القديم لم يُلمس، يعمل بالتوازي |
| **SoD detector تلقائي** | `GET /rbac/v2/sod` يكشف الانتهاكات ويعرضها في banner أحمر |
| **Validation عند الحفظ** | الـAPI يرفض actions/scopes غير معرّفة في الـcatalog |

---

## 7. الترحيل (Migration)

عند إقلاع السيرفر بعد دمج الـ migration:

1. `runMigrations()` — تنشئ الجداول
2. `syncFeatureCatalog()` — تدفع الـcatalog من الكود إلى الـDB
3. `syncLegacyToV2()` — لكل شركة:
   - تنشئ `rbac_roles` للأدوار الـ14 الموجودة
   - تترجم كل `module:action` قديم إلى `rbac_role_grants` v2 مع scope مناسب
   - تربط المستخدمين عبر `rbac_user_roles` بناءً على `employee_assignments.role`

كل العمليات **idempotent** — السيرفر يستطيع إعادة التشغيل بأمان.

---

## 8. تشغيل المحرّك يدوياً

```bash
# Smoke test الـAPI
curl http://localhost:5000/api/rbac/v2/features
curl http://localhost:5000/api/rbac/v2/roles
curl http://localhost:5000/api/rbac/v2/sod
curl -X POST http://localhost:5000/api/rbac/v2/simulate \
     -H "Content-Type: application/json" \
     -d '{"userId": 5, "feature": "hr.payroll.runs", "action": "view"}'
```

---

## 8.5 ABAC Conditions — شروط ديناميكية على الصلاحية

كل grant في `rbac_role_grants.conditions` يقدر يحمل JSON يضيّق متى تنطبق
الصلاحية. الشروط المدعومة:

```jsonc
{
  "statusIn":      ["draft", "pending"],     // حالة السجل ضمن قائمة
  "statusNotIn":   ["closed", "cancelled"],
  "amountMax":     10000,                    // المبلغ ≤ سقف
  "amountMin":     100,
  "ownRecord":     true,                     // المنشئ = المستخدم
  "ownDepartment": true,                     // قسم السجل = قسم المستخدم
  "ownBranch":     true,
  "businessHours": { "from": 8, "to": 18 },  // ضمن ساعات العمل
  "daysOfWeek":    [0,1,2,3,4],              // أحد..خميس (دوام السعودية)
  "ipPrefixIn":    ["10.0.0.","192.168."],   // IP من شبكة محددة
  "emergencyDisabled": true                  // مُجمَّد في حالة طوارئ
}
```

كل الشروط **AND-combined** — أي شرط يفشل → الـgrant يُرفض. المحرّك يجرّب
كل matching grants ويختار الأول الذي تنجح شروطه؛ إن فشلت كلها يُرجع
الرفض الأكثر تفصيلاً.

أمثلة عملية:
- **مدير لا يعتمد إلا الفواتير في حالة draft**: `{ statusIn: ["draft"] }`
- **محاسب لا يعتمد إلا حتى 5,000 ر.س**: `{ amountMax: 5000 }`
- **صلاحية مؤقتة في ساعات الدوام فقط**: `{ businessHours: { from: 8, to: 17 } }`
- **مدير لا يعتمد طلبه**: `{ ownRecord: false }` على الـapprove
- **اعتماد مالي حصراً من شبكة المكتب**: `{ ipPrefixIn: ["10.0.0."] }`

---

## 9. وصفة ترحيل route قديم إلى `authorize()`

كل ملف route من ملفات الـ80 يمكن ترحيله بنفس النمط. مثال على `GET /hr/leaves/:id`:

**قبل** (legacy):
```ts
router.get("/leaves/:id", requirePermission("hr:read"), async (req, res) => {
  const scope = req.scope!;
  const id = parseId(req.params.id, "id");
  const [item] = await rawQuery(
    `SELECT ... FROM hr_leave_requests
     WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, scope.companyId]
  );
  if (!item) throw new NotFoundError("...");
  res.json(item);
});
```

**بعد** (v2):
```ts
router.get("/leaves/:id",
  authorize({
    feature: "hr.leaves",
    action: "view",
    resource: { table: "hr_leave_requests", idParam: "id" },  // 🔑 تفعيل scope check
  }),
  async (req, res) => {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [item] = await rawQuery(
      `SELECT ... FROM hr_leave_requests
       WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!item) throw new NotFoundError("...");
    // 🔑 يخفي تلقائياً الحقول الحساسة وفق سياسة دور المستخدم
    res.json(maskFields(req, item));
  }
);
```

**ما يكسبه الـroute:**
- ✅ يحترم scope الدور (لا حاجة لـ`requireOwnership` يدوياً)
- ✅ يخفي الحقول حسب `rbac_field_policies`
- ✅ خطأ 403 يرجع رسالة عربية + code قابل للقراءة + اقتراح حل

**خطوات الترحيل لكل route:**
1. حدّد الميزة المناسبة من `featureCatalog.ts` (أو أضِف ميزة جديدة).
2. حدّد الـaction (`view` لـGET، `create` لـPOST، إلخ).
3. أضِف `resource: { table, idParam }` إذا الـroute يقرأ سجلاً واحداً.
4. لـapprove actions، أضِف `amount: { from: "body", field: "amount" }`.
5. غلّف الـresponse بـ`maskFields(req, payload)`.
6. احذف `requirePermission` و`requireOwnership` القديمة.

**نمط الترحيل الجماعي**:
احذف الترحيل الجماعي. اتبع المسار التدريجي ملف-بملف، عبر PRs صغيرة (5-10 routes/PR) لتسهيل المراجعة.

---

## 10. ما يلي

- [ ] تحويل الـ80 route file تدريجياً من `requirePermission` إلى `authorize()` (3-4 أسابيع، PRs صغيرة)
- [ ] Distributed cache invalidation (Redis pub/sub) للنشر متعدد العمليات
- [ ] ABAC conditions (`{ statusIn: ["draft"] }`) في `rbac_role_grants.conditions`
- [ ] إضافة قواعد SoD مخصصة لكل قطاع
- [ ] Time-bound grants (`rbac_user_grants.expires_at`) — جدول موجود، يحتاج cron تنظيف
