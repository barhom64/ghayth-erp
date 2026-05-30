# مواصفة مفسّر الصلاحيات — PERMISSION_EXPLAINER_SPEC

> المرحلة 3 — تنفيذ **#1413 §8** · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** يجيب بالعربية الواضحة: "لماذا يستطيع/لا يستطيع المستخدم تنفيذ إجراء؟"
> **يُبنى على:** `authzEngine.checkAccess` (يُرجِع السبب + الدور المطابق + النطاق + حد الاعتماد) — يغلّفه بشرح بشري.
>
> **✅ منفّذ (Backend):** `POST /admin/permissions/explain` في `routes/admin.ts` — يفوّض القرار لـ `checkAccess` (لا منطق تفويض موازٍ) ويُرجِع: `allowed` + `reason` (عربي) + `sourceRole` + `scope` + `approvalLimit`، معزولًا بالشركة. اختبار: `tests/unit/rbacAdminCompletionSmoke.test.ts`. **المتبقّي:** زر "لماذا؟" في الواجهة.

---

## 1. النموذج

`checkAccess` يُرجِع بالفعل سبب القرار (allowed + diagnostics + reason عند الرفض). المفسّر يحوّل ذلك إلى جملة عربية مفهومة لغير التقني.

```
explain(user, feature, action, scope?) →
  {
    allowed: bool,
    reasonAr: "نص عربي واضح",
    source: { role, feature, action, scope, limit? },   ← عند السماح
    blockedBy: { type: "no_grant" | "deny_rule" | "sod" | "limit" | "condition", detailAr } ← عند المنع
  }
```

---

## 2. أمثلة (من #1413 §8 حرفيًا)

**لماذا يستطيع أحمد اعتماد فاتورة؟**
> لأن لديه دور **Finance Approver** يمنحه `finance.invoices: approve` في نطاق **فرع مكة**، بحدّ **≤ 50,000 ر.س**.

**لماذا لا يستطيع حذف فاتورة؟**
> لأنه **لا يملك** `finance.invoices: delete`، **أو** قاعدة منع (Deny) تمنع الحذف **بعد الاعتماد**.

**لماذا لا يستطيع اعتماد ما أنشأه؟**
> لأن قاعدة **فصل المهام** (`finance_invoice_create_approve`) تمنع من أنشأ الفاتورة من اعتمادها.

---

## 3. أنواع المنع وشرحها

| النوع | المصدر | الشرح العربي |
|---|---|---|
| no_grant | لا يوجد grant | "لا يملك صلاحية هذا الإجراء على هذه الميزة." |
| deny_rule | `rbac_user_grants type=revoke` | "صلاحية ممنوعة صراحةً له (تتفوّق على أي منح)." |
| sod | `rbac_sod_rules` | "فصل المهام يمنعه (لا يعتمد ما أنشأ)." |
| limit | `rbac_approval_limits` | "المبلغ يتجاوز حدّ اعتماده (X ر.س)." |
| condition | `abacConditions` | "شرط غير محقّق (الحالة/الفرع/الموسم/ساعات العمل)." |
| scope | نطاق غير مطابق | "خارج نطاقه (فرع/إدارة آخر)." |

---

## 4. عقد النقطة

| النقطة | الوصف |
|---|---|
| `POST /admin/permissions/explain` | `{ userId, feature, action, scope? }` → شرح عربي + المصدر/المانع |
| إعادة استخدام | يستدعي `checkAccess` ويترجم `diagnostics`/`reason` |

---

## 5. القرارات

- **يُبنى المفسّر كطبقة ترجمة** فوق `checkAccess` الموجود — لا منطق تفويض جديد.
- **العربية أولًا** — كل رسالة لغير التقني.
- **يُدمَج في** Effective Permissions Viewer (زر "لماذا؟" بجانب كل صلاحية) و`ROLE_CONFLICT_ANALYZER`.
</content>
