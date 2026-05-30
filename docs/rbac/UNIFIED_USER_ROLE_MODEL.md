# النموذج الموحّد للمستخدم والأدوار — UNIFIED_USER_ROLE_MODEL

> المرحلة 3 — **Ghaith Operating Foundation** (#1418) · تنفيذ **#1413** · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** الموظف هو الأصل، المستخدم حساب الدخول، الدور يحدد ماذا يفعل، النطاق يحدد أين. مستخدم واحد بأدوار متعددة — لا مستخدم منفصل لكل مسار.
> **يُبنى على:** `RBAC_EXISTING_ASSETS_AUDIT.md` (الأصول المجرودة) — هذا تصميم فوق الموجود، لا بناء جديد.

---

## 1. الكيانات الثلاثة وعلاقتها

```
متقدّم وظيفة (Candidate)  ──قبول──►  موظف (Employee)  ──إنشاء حساب──►  مستخدم (User)
   ليس موظفًا بعد            الشخص التشغيلي (الأصل)        حساب الدخول
                                     │                          │
                                     │                    يحمل أدوارًا متعددة
                                     │                          │
                              employee_assignments        rbac_user_roles (N أدوار)
                              (شركة/فرع/إدارة/منصب)        كل دور + نطاق + انتهاء اختياري
```

| الكيان | الجدول | الدور في النموذج |
|---|---|---|
| الموظف | `employees` + `employee_assignments` | الشخص؛ الأصل لكل تنفيذ (#1413 §17) |
| المستخدم | `users` | حساب الدخول؛ مرتبط بموظف واحد |
| الدور | `rbac_roles` | يحدد الإجراءات المسموحة |
| إسناد الدور | `rbac_user_roles` (UNIQUE: userId+companyId+role_id) | **تعدد الأدوار** + branchId/departmentId + expires_at + is_primary |
| الصلاحية | `rbac_role_grants` | (feature × actions × scope × conditions) |
| الاستثناء | `rbac_user_grants` | منح/منع لكل مستخدم + expires_at (صلاحيات مؤقتة + Deny) |

---

## 2. القواعد الأساسية (#1413)

1. **مستخدم واحد لكل شخص** — لا مستخدم مالي ومستخدم عمرة ومستخدم نقل لنفس الشخص. أدوار متعددة على حساب واحد.
2. **الموظف ≠ المستخدم** — الموظف قد يوجد بلا حساب؛ الحساب يُعطَّل دون حذف الموظف.
3. **الدور يحدد الفعل، النطاق يحدد المكان** — `(feature×action)` + `scope (self/branch/company/all)`.
4. **Deny يتفوّق على Allow** — `rbac_user_grants type=revoke` يمنع حتى لو منح دور آخر.
5. **الحقول الحساسة بسياسة مستقلة** — `rbac_field_policies` (راتب/IBAN/هوية).
6. **كل تنفيذ يُسجَّل بالصفة** — الدور النشط في التدقيق (RBAC-001).

---

## 3. الصلاحية الخماسية (مؤكَّدة موجودة)

```
الصلاحية = Module (المسار) × Feature (الميزة) × Action (الإجراء) × Scope (النطاق) × Conditions (الشروط)
```

- **Actions:** view/list/create/update/delete/submit/approve/reject/cancel/reopen/close/export/print/share/import (مدعومة في `featureCatalog`).
- **Scopes:** self/team/department/department_tree/branch/branches/company/multi_company/all (مدعومة في `authzEngine`).
- **Conditions:** amountMax/statusIn/ownRecord/branch/season/businessHours… (`abacConditions`).
- **حدود الاعتماد:** `rbac_approval_limits` (max_amount + dual_control).

---

## 4. تحويلات حالة الموظف ↔ الحساب (#1413 §12)

```
candidate → (قبول) → onboarding → (اعتماد) → active employee → (إنشاء) → user + roles
active employee → (انتهاء خدمة) → terminated → الحساب يُعطَّل/يُقيَّد حسب السياسة
```

---

## 5. ما الموجود وما يُطوَّر (لا بناء موازٍ)

| العنصر | الحالة | القرار |
|---|---|---|
| تعدد الأدوار (الجداول + المحرك) | موجود ✅ | يُستخدم |
| النطاق/الشروط/الحدود/الحقول الحساسة | موجود ✅ | يُستخدم |
| Deny/الصلاحيات المؤقتة | موجود (`rbac_user_grants`) ✅ | يُستخدم |
| تسجيل الدور بالتدقيق | مفقود ❌ (RBAC-001) | يُطوَّر (`RBAC_AUDIT_CONTEXT_SPEC`) |
| إنشاء سريع موحّد | مفقود ❌ (RBAC-002) | يُبنى (`USER_QUICK_CREATE_FLOW`) |
| واجهة مؤلّف الأدوار السهلة | جزئي | يُطوَّر (`ROLE_COMPOSER_SPEC`) |
| Effective viewer / Conflict analyzer (واجهة) | مفقود ❌ | يُبنى فوق المحرك |
| توحيد الكتالوجين | مكرر (RBAC-003) | يُدمَج |

---

## 6. القرارات

- **النموذج الموحّد قائم بنيويًا** — التنفيذ يكمّل التجربة والتدقيق فوق الموجود، لا نظام جديد.
- **المواصفات التفصيلية:** `USER_QUICK_CREATE_FLOW`, `ROLE_COMPOSER_SPEC`, `EFFECTIVE_PERMISSIONS_SPEC`, `PERMISSION_EXPLAINER_SPEC`, `ROLE_CONFLICT_ANALYZER`, `RBAC_AUDIT_CONTEXT_SPEC`, `MULTI_ROLE_EMPLOYEE_JOURNEY`.
</content>
