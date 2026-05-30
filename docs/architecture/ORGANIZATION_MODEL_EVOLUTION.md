# تطور نموذج المنظمة — ORGANIZATION_MODEL_EVOLUTION

> المرحلة 6 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **المبدأ:** يجب أن يتحمّل النظام عدة شركات وعدة فروع وإدارات متداخلة دون كسر.

---

## 1. الوضع الحالي

`companies` → `branches` → `departments` → `positions`، مع `companyId` على كل الجداول، و`buildScopedWhere`/`scopedQuery` للعزل. النطاقات تدعم `multi_company`/`branches` (`authzEngine`).

## 2. الخطر المستقبلي

- تعدد الشركات (مجموعة قابضة) + هياكل إدارة متداخلة (department_tree).
- عزل بيانات صارم عبر الشركات (cross-tenant) — موجود جزئيًا (migration 124).

## 3. مسار التطور

```
الحالي: companyId مسطّح + branches/departments
   ▼
تعزيز: department_tree (parent_department_id) — موجود في scope department_tree
   ▼
تعزيز: مجموعة شركات (company_group) فوق companies للتقارير الموحّدة
   ▼
تعزيز: توحيد العزل عبر buildScopedWhere في كل المسارات (يعالج FND-013)
```

## 4. القواعد

1. **العزل الموحّد:** كل استعلام عبر `buildScopedWhere` — لا محمولات `companyId = $` يدوية (FND-013: 68 محمولًا يدويًا).
2. **النطاق الهرمي:** `department_tree` يدعم الإدارات المتداخلة (موجود).
3. **تعدد الشركات بالنطاق:** `multi_company` للأدوار العابرة (موجود).

## 5. القرار

- **يُعمَّم `buildScopedWhere`** (FND-013) كأولوية نظافة عزل — يُجدوَل في التنفيذ.
- **مجموعة الشركات** مسار تطور موثّق، لا تنفيذ الآن.
</content>
