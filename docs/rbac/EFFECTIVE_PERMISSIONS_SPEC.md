# مواصفة الصلاحيات الفعّالة — EFFECTIVE_PERMISSIONS_SPEC

> المرحلة 3 — تنفيذ **#1413 §8** · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** حساب وعرض الصلاحيات النهائية للمستخدم من كل أدواره، مع سبب كل صلاحية.
> **يُبنى على:** `authzEngine.loadEffectiveGrants` (CTE تكراري موجود) + `GET /permissions/my` (يحترم `x-selected-role`).

---

## 1. خوارزمية الحساب (موجودة)

```
الصلاحيات الفعّالة(user, company, selectedRole?) =
   اتحاد grants كل الأدوار المسندة (عبر شجرة rbac_roles بـ CTE تكراري)
   + rbac_user_grants (type=grant)
   − rbac_user_grants (type=revoke)         ← Deny يتفوّق
   ∩ (إن وُجد selectedRole: حصر على ذلك الدور)
   مع: حقول حساسة (rbac_field_policies) + حدود اعتماد (rbac_approval_limits) + شروط (abacConditions)
```

القواعد (#1413 §8): تجميع الأدوار؛ Deny > Allow؛ النطاق الأعلى لا يلغي الحساسية؛ الحقول الحساسة بسياسة مستقلة؛ عرض مصدر الصلاحية (من أي دور).

---

## 2. الواجهة المطلوبة (Effective Permissions Viewer)

```
المستخدم: أحمد محمد       [الصفة النشطة: محاسب ▼]
بحث: [finance.invoices ▼] [approve ▼]
─────────────────────────────────────
الميزة            | الإجراء | النطاق   | المصدر (الدور)        | الحد
finance.invoices  | view    | فرع مكة | محاسب عرض            | —
finance.invoices  | create  | فرع مكة | محاسب إنشاء          | —
finance.invoices  | approve | فرع مكة | Finance Approver     | ≤ 50,000 ر.س
finance.invoices  | delete  | —       | ✗ غير ممنوح / Deny بعد الاعتماد
```

- **يُظهر المصدر:** من أي دور جاءت كل صلاحية (`diagnostics.matchedRoleIds`).
- **يُظهر النطاق والحد** لكل (ميزة×إجراء).
- **بحث** بالميزة/الإجراء.
- **معاينة "كما يراه المستخدم"** (#1413 §7): تبديل الصفة النشطة.

---

## 3. عقد النقاط

| النقطة | الحالة | التطوير |
|---|---|---|
| `GET /permissions/my` | موجود (يحترم selectedRole) | يُستخدم |
| `GET /admin/users/:id/effective-permissions` | يُضاف | عرض per-user للمدير + المصدر |
| `diagnostics` في AccessResult | موجود (`matchedRoleIds/grantedActions/grantedScope`) | يُعرَض في الواجهة |

---

## 4. القرارات

- **الحساب موجود وصحيح** — العمل في **واجهة عرض** per-user مع المصدر (مفقودة، RBAC-004).
- **تربط بـ** `PERMISSION_EXPLAINER_SPEC` (لماذا يستطيع/لا يستطيع) و`ROLE_CONFLICT_ANALYZER`.
- **اختبار القبول:** `RBAC_MULTI_ROLE_ACCEPTANCE_TESTS` (مدير النظام يراجع الصلاحيات النهائية).
</content>
