# مواصفة محرك الظهور — VISIBILITY_ENGINE_SPEC

> المرحلة 4 — **Ghaith Operating Foundation** (#1418) · 2026-05-29 · فرع `claude/ghaith-foundation-audit-wdIUf`
> **الهدف:** محرك ظهور موحّد يحسم (الصفحة/العنصر يظهر؟) من (الدور + النطاق + التفعيل + النضج). يعالج VIS-002/003/004.
> **يُبنى على:** `canAccessModule/canAccessSubPage/minRoleLevel` + `registry` الموجودة + `featureCatalog`. لا محرك بديل — توسعة للموجود.

---

## 1. المعادلة الموحّدة

```
isPageVisible(page, user) =
      isRegisteredRoute(page.path)                         // موجود (registry)
   && isFeatureEnabled(page.feature, company)              // جديد (VIS-002 التفعيل)
   && can(page.feature, "view", scope)                     // مشتق من featureCatalog (VIS-003)
   && (page.maturity === "stable" || canSeeBeta(user))     // جديد (VIS-004 النضج)
```

اليوم: الطبقتان 1 و3(جزئيًا) موجودتان؛ الطبقتان 2 و4 مفقودتان.

---

## 2. المكوّنات

| المكوّن | الموجود | المطلوب |
|---|---|---|
| تسجيل المسار | `registry.isRegisteredRoute` | يُطوَّر ليحمل `feature` + `maturity` (بيانات وصفية) |
| بوابة الوحدة/الميزة | `canAccessModule/SubPage` | يُشتق من `featureCatalog` بدل خرائط ثابتة |
| التفعيل | **مفقود** | جدول/إعداد `company_enabled_features` + `isFeatureEnabled()` |
| النضج | **مفقود** | حقل `maturity: stable|beta|hidden` على إدخال المسار |

---

## 3. تصميم التفعيل (Feature/Subscription)

```
company_enabled_features (companyId, feature_key, enabled)
isFeatureEnabled(feature, company) = خادم عام يُستعلَم مرة عند الدخول ويُخزَّن في AppContext
```

- الميزات الأساسية (selfService) مفعّلة دائمًا (employee-first).
- الخدمة المساندة تظهر **داخل السياق فقط** عند تفعيلها (`SERVICE_MODE_VISIBILITY`).

---

## 4. قواعد

1. **افتراض الإغلاق:** غير مثبَت التخويل/التفعيل → مخفي.
2. **مصدر واحد للصلاحية:** `featureCatalog` يغذّي القائمة + التوجيه + الأزرار (يلغي تكرار `perm` المعطّل).
3. **النضج يحمي الإنتاج:** `beta/hidden` لا تظهر لغير المخوّل (يحل VIS-004/VIS-006).
4. **يُعمَّم على umrah/misc:** بوابة الوحدة تُطبَّق (يحل VIS-001).

---

## 5. القرارات

- **يُطوَّر المحرك الموجود** بطبقتي التفعيل والنضج — لا محرك جديد.
- **أولوية التنفيذ:** (أ) إصلاح VIS-001 (umrah بوابة وحدة)، (ب) طبقة التفعيل.
- **يُكمّله:** `NAVIGATION_CONTEXT_CONTRACT`, `ACTION_VISIBILITY_RULES`, `SERVICE_MODE_VISIBILITY`.
</content>
