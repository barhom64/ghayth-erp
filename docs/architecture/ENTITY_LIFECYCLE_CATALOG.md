# فهرس دورات حياة الكيانات — ENTITY_LIFECYCLE_CATALOG

> المرحلة 2 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** كل سجل له حالة، وكل انتقال حالة له شرط (صلاحية + سياسة) وأثر. آلة الحالة تمنع الانتقالات غير الصالحة.
> **يُبنى على:** `ENTITY_CATALOG.md` + `docs/blueprints/*` (دورات الحياة التفصيلية) + `lib/lifecycleEngine` (محرّك الانتقال).

---

## 1. النمط القياسي العابر

```
draft ──submit──► submitted ──approve──► approved ──post──► posted
                      │                       │
                   reject                  (cancel/reopen/close/reverse حسب الكيان)
                      ▼
                  rejected
```

كل انتقال يحرسه: **صلاحية الإجراء** (`featureCatalog.action`) + **شرط الحالة الحالية** (`abacConditions.statusIn`) + **سياسة** (مثل: لا حذف بعد الاعتماد).

---

## 2. دورات الحياة الخاصة (مرجع المخططات)

| الكيان | دورة الحياة | الحراسة | المرجع |
|---|---|---|---|
| إجازة HR | pending → approved/rejected | نطاق المعتمد | `blueprints/hr-attendance.md` |
| تأديب HR | pending_inquiry → justified → recommendation → gm_decision → appeal → completed/dismissed | 5 مراحل، المدير العام يقرر | `blueprints/hr-discipline.md` |
| تشغيل رواتب | draft → posted (ذرّي) | فصل احتساب/اعتماد (SoD critical) | `blueprints/hr-payroll.md` |
| فاتورة (مالية/عمرة) | draft → posted (حاجز GL) → paid → settled | SoD + حد + GL ناجح | `blueprints/finance-invoices.md`, `umrah.md` |
| رحلة أسطول | in_progress → completed/cancelled | التكلفة عند النهاية | `blueprints/fleet.md` |
| عقد عقاري | draft → active → expired/terminated | آلة حالة تمنع وحدتين نشطتين | `blueprints/properties-ejar.md` |
| قضية قانونية | pending → scheduled → completed → appealed → closed | جلسة → التزام + إشعار | `blueprints/legal.md` |
| موظف | candidate → onboarding → active → terminated | تحويلات #1413 §12 | `audit/inventory/hr.md` |
| حساب مستخدم | active → disabled (لا حذف الموظف) | عند انتهاء الخدمة | `RBAC_EXISTING_ASSETS_AUDIT.md` |

---

## 3. قواعد الانتقال

1. **لا انتقال بلا صلاحية:** الإجراء (submit/approve/…) يحرسه `authorize({feature, action})`.
2. **لا انتقال خارج الآلة:** `lifecycleEngine.applyTransition` يرفض الانتقالات غير المعرّفة.
3. **لا حذف بعد الاعتماد:** سياسة `abacConditions.statusNotIn:["approved","posted"]` على `delete`.
4. **كل انتقال يُسجَّل:** تدقيق + (إشعار إن لزم) + (أثر GL إن لزم).
5. **حالة الموظف ترتبط بالحساب:** انتهاء الخدمة → تعطيل/تقييد الحساب (#1413 §12، اختبار 8).

---

## 4. القرارات

- **دورات الحياة موجودة ومُطبَّقة** عبر `lifecycleEngine` + أعمدة status — تُستخدم وتُوحَّد عرضها بـ `StatusBadge`.
- **الأزرار تُحكَم بحالة السجل** (VIS-005) — يُفصَّل في `ACTION_VISIBILITY_RULES` (مرحلة 4): زر "اعتماد" يظهر فقط في حالة `submitted` ولمن يملك `approve`.
- **التحقق التشغيلي** لكل آلة حالة (هل تمنع الانتقالات السيئة فعلًا) → مرحلة 7.
</content>
