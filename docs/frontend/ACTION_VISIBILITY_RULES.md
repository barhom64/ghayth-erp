# قواعد ظهور الإجراءات — ACTION_VISIBILITY_RULES

> المرحلة 4 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** الأزرار تظهر حسب **الصلاحية + حالة السجل**. يعالج VIS-005.
> **يُبنى على:** `GuardedButton` (موجود) + `ENTITY_LIFECYCLE_CATALOG` + `featureCatalog`.

---

## 1. القاعدة المزدوجة

```
زر إجراء يَظهر ⇔ can(feature, action, scope)  ∧  حالة السجل ∈ الحالات المسموحة للإجراء
```

اليوم: `GuardedButton` يفحص الصلاحية لكن **حكم حالة السجل مبعثر/يدوي** (VIS-005).

---

## 2. مصفوفة الإجراء × الحالة المسموحة

| الإجراء | يظهر في الحالة | يختفي في |
|---|---|---|
| تعديل (update) | draft, submitted | approved, posted (إلا بصلاحية خاصة) |
| إرسال (submit) | draft | submitted فما بعد |
| اعتماد (approve) | submitted | draft, approved, posted |
| رفض (reject) | submitted | غيرها |
| حذف (delete) | draft (وقبل الاعتماد) | approved, posted |
| إلغاء (cancel) | submitted, approved | posted, closed |
| إعادة فتح (reopen) | closed, rejected | active |
| ترحيل (post) | approved | غيرها |
| طباعة/تصدير | أي حالة (view) | — |

> المصدر: `ENTITY_LIFECYCLE_CATALOG` + شروط `abacConditions.statusIn/statusNotIn` على الخادم.

---

## 3. التصميم المقترح

```
<GuardedButton
   perm="finance.invoices:approve"
   visibleWhenStatus={["submitted"]}      // جديد — يقرأ record.status
   record={invoice}
>اعتماد</GuardedButton>
```

- `GuardedButton` يُطوَّر ليقبل `visibleWhenStatus` + `record`.
- الخادم يبقى الحارس الحقيقي (`authorize` + `abacConditions.statusIn`) — الواجهة للتجربة فقط.

---

## 4. قواعد

1. **الواجهة تُخفي، الخادم يمنع:** إخفاء الزر تجربة؛ المنع الفعلي على الخادم (دفاع بالعمق).
2. **حالة السجل من آلة الحالة:** لا حالات مُرمَّزة يدويًا في كل صفحة — تُشتق من `ENTITY_LIFECYCLE_CATALOG`.
3. **لا زر بلا أثر:** كل زر ظاهر يُنتج أثرًا (`IMPACT_CATALOG`).

---

## 5. القرارات

- **يُطوَّر `GuardedButton`** بحكم الحالة — لا مكوّن جديد.
- **يربط** دفاع الخادم بالعمق (RBAC-006: تعميم الحراس) لمنع الوصول المباشر غير المصرّح.
- **اختبار القبول:** `RBAC_FRONTEND_E2E_SCENARIOS` (ظهور/اختفاء الأزرار حسب الدور والحالة).
</content>
