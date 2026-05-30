# مواصفة سياق التدقيق للصلاحيات — RBAC_AUDIT_CONTEXT_SPEC

> المرحلة 3 — تنفيذ **#1413 §9** · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** كل حركة تُسجِّل بأي **صفة (دور)** نُفّذت. يعالج الفجوة الحرجة **RBAC-001**.
> **يُبنى على:** `auditMiddleware` + `authMiddleware` (يحمل `scope.selectedRoleKey`) + `audit_logs`.

---

## 1. المشكلة (RBAC-001 — حرجة)

`auditMiddleware` يسجّل: userId/entity/action/before/after/reason — لكنه **لا يسجّل `selectedRoleKey`** رغم وجوده في `scope` وقت `authMiddleware`. النتيجة: عند تعدد الأدوار لا نعرف **بأي صفة** نُفّذت العملية — يخالف #1413 §9 صراحةً.

---

## 2. الحقول المطلوبة لكل حركة (#1413 §9)

| الحقل | المصدر | الحالة |
|---|---|---|
| الموظف (actor) | `scope.employeeId` | موجود |
| المستخدم | `scope.userId` | موجود |
| **الدور المستخدم (active role)** | `scope.selectedRoleKey` | **مفقود في السجل** ❌ |
| الفرع/الإدارة | `scope.branchId/departmentId` | موجود |
| **الصلاحية التي سمحت** | `access.diagnostics` (feature+action+scope) | غير مُمرَّر للسجل |
| ما تغيّر | before/after diff | موجود |
| متى/السبب | createdAt/reason | موجود |

---

## 3. التغيير المطلوب (تنفيذ)

```
1. authMiddleware: يضع scope.selectedRoleKey + access.diagnostics على req (موجود جزئيًا).
2. auditMiddleware: يقرأ req.scope.selectedRoleKey + req.access.diagnostics
   ويضيفهما إلى حدث audit.{entity}.{action}.
3. audit_logs: عمود جديد active_role_key (+ اختياري granted_permission).
4. مهاجرة idempotent: ALTER TABLE audit_logs ADD COLUMN active_role_key TEXT.
```

مثال السجل بعد الإصلاح (#1413 §9):
```
actor employee: أحمد | user: ahmad@example.com | active role: Fleet Data Entry
permission: fleet.fuel.create | scope: branch=Makkah | action: create fuel log
```

---

## 4. عقد العرض

- سجل التدقيق `/admin/logs` و`/settings/audit-log` يُظهر عمود **"الصفة"** (الدور).
- الخط الزمني `Timeline` على السجل يُظهر "نُفّذ بصفة: …".

---

## 5. القرارات

- **يُطوَّر `auditMiddleware`** لتمرير الدور النشط + الصلاحية — تغيير صغير عالي الأثر، **أولوية تنفيذ**.
- **لا نظام تدقيق جديد** — تطوير الموجود (`createAuditLog` + `audit_logs`).
- **يربط** FND-006 (توسيع `ENTITY_MAP` لتغطية legal/store/governance/…) لاكتمال الأثر.
- **اختبار القبول:** كل اختبار في `RBAC_MULTI_ROLE_ACCEPTANCE_TESTS` يتحقق من ظهور الصفة في السجل.
</content>
