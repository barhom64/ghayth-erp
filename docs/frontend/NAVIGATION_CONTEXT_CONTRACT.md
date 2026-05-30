# عقد سياق التنقّل — NAVIGATION_CONTEXT_CONTRACT

> المرحلة 4 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** عقد موحّد يحدد ما يوفّره سياق التنقّل (`AppContext`) لكل المكوّنات لاتخاذ قرار الظهور — مصدر واحد.
> **يُبنى على:** `app-context.tsx` الموجود + `VISIBILITY_ENGINE_SPEC`.

---

## 1. العقد — ما يوفّره `AppContext`

| الحقل/الدالة | الموجود | الغرض |
|---|---|---|
| `user`, `userRoles[]` | ✅ | المستخدم وأدواره |
| `selectedRole`, `setSelectedRoleKey` | ✅ | الصفة النشطة + تبديلها |
| `can(perm)` | ✅ | فحص صلاحية module:action |
| `rawPermissions[]` | ✅ | الصلاحيات من `/permissions/my` |
| `canAccessModule(module)` | ✅ | بوابة الوحدة |
| `canAccessSubPage(module, subKey)` | ✅ | بوابة الميزة الفرعية |
| `roleLevel`/`effectiveRoleLevel` | ✅ | المستوى |
| `companies`, `branches`, نطاق مختار | ✅ | النطاق |
| `isFeatureEnabled(feature)` | ❌ مطلوب | بوابة التفعيل (VIS-002) |
| `canSeeBeta()` | ❌ مطلوب | بوابة النضج (VIS-004) |
| `canDo(feature, action, record?)` | ❌ مطلوب | فحص دقيق + حالة السجل (`ACTION_VISIBILITY_RULES`) |

---

## 2. القواعد

1. **مصدر واحد للقرار:** كل مكوّن (قائمة/توجيه/زر) يسأل `AppContext` فقط — ممنوع منطق ظهور محلي خاص.
2. **اتساق التوجيه والقائمة:** كلاهما يستهلك نفس الدوال (مؤكَّد في المرحلة 1).
3. **تبديل الصفة يعيد الحساب:** `setSelectedRoleKey` يحدّث الصلاحيات والقائمة فورًا.
4. **النطاق ضمني:** كل فحص صلاحية يحمل النطاق المختار.

---

## 3. التطوير المطلوب

- إضافة `isFeatureEnabled`, `canSeeBeta`, `canDo(feature, action, record)` إلى العقد.
- اشتقاق `canAccessSubPage`/`perm` من `featureCatalog` (يلغي خرائط `roleKeySubPages` الثابتة — MENU-005).

---

## 4. القرارات

- **`AppContext` هو العقد الوحيد** — يُطوَّر، لا يُستبدل.
- **المكوّنات المشتركة** (`PermissionGate`, `GuardedButton`) تستهلك العقد — لا فحوص متناثرة.
</content>
