# مصفوفة الفجوات — Ghaith Operating Foundation Audit (GAP MATRIX)

> **النوع:** مصفوفة فجوات مدعومة بالمستودع — ناتج Workflow "Ghaith Operating Foundation Audit".
> **التاريخ:** 2026-05-30 · **الأساس:** `main` @ `2fa977c` · **المنهج:** فحص الكود الفعلي بسبعة وكلاء متوازين (لا افتراض). كل بند مدعوم بـ `file:line` / route / API / component.
> **التصنيف:** ✅ مكتمل · 🟡 جزئي · 🔴 مفقود.
> **يُكمّل:** `GHAITH_FOUNDATION_IMPLEMENTATION_STATUS.md` (مصالحة الفجوات مع الـ PRs).

---

## 0. الخلاصة التنفيذية

| المحور | مكتمل | جزئي | مفقود |
|---|---|---|---|
| RBAC والمستخدمون | 7 | 3 | 0 |
| الظهور والتنقّل | 5 | 1 | 2 |
| الرحلات التشغيلية | 5 | 2 | 1 (واجهة تهيئة) |
| الخدمات المشتركة | 13 | 1 | 0 |
| المالية | 6 | 4 | 0 |
| الأسطول والعمرة | 9 | 2 | 0 |

**النتيجة:** البنية الأساسية لـ #1413/#1418 **مكتملة في الكود**. الفجوات المتبقّية الأعلى قيمة **معمارية مالية** (توحيد ترحيل GL) و**تجربة** (أزرار حسب حالة السجل، واجهة تهيئة الشركة)، وكلها تحتاج تحقق staging أو قرار منتج — لا تُنفَّذ عمياء.

---

## 1. RBAC والمستخدمون

| القدرة | الحالة | الدليل |
|---|---|---|
| تعدد الأدوار (محرك + جداول) | ✅ | `migrations/109_layered_rbac_v2.sql:43-72` (rbac_user_roles UNIQUE+is_primary) · `lib/rbac/authzEngine.ts:161-178` (CTE تكراري) |
| الصلاحية الخماسية | ✅ | `lib/rbac/featureCatalog.ts` · `abacConditions.ts:30-179` · `authzEngine.ts:400-613` |
| تسجيل الدور بالتدقيق (RBAC-001) | ✅ | `migration 235` active_role_key · `auditMiddleware.ts:190-203` · `auth.ts` ORDER BY is_primary |
| إنشاء سريع موظف+حساب+أدوار (RBAC-002) | ✅ | `routes/admin.ts` POST `/onboard` (ذرّي) |
| عارض الصلاحيات النهائية (RBAC-004) | ✅ | GET `/admin/users/:id/effective-permissions` · `pages/admin/user-onboarding.tsx` |
| مفسّر الصلاحية (RBAC-004) | ✅ | POST `/admin/permissions/explain` |
| الحقول الحساسة | ✅ | `rbac_field_policies` · `featureCatalog sensitiveFields` · `authorize.ts applyFieldPolicy` |
| تبديل الصفة (الواجهة) | ✅ | `contexts/app-context.tsx` selectedRole + x-selected-role |
| فصل المهام / SoD | 🟡 | تنفيذ وقت التشغيل `sodEnforcement.ts` + `rbac_sod_rules` (5 قواعد)؛ **لا واجهة تحليل/إنشاء قواعد** |
| توحيد الكتالوجين (RBAC-003) | 🟡 | مُجَسَّر: `isKnownPermission()` يقبل الاثنين؛ الإزالة الكاملة = إعادة هيكلة 30+ مسارًا |
| مؤلّف الأدوار (عمق الواجهة) | 🟡 | `/admin/roles` (قديم) + `/admin/rbac-matrix` يتعايشان؛ محرّر حقول/حدود v2 جزئي |

---

## 2. الظهور والتنقّل

| البند | الحالة | الدليل |
|---|---|---|
| بوابة الوحدة على التوجيه (VIS-001) | ✅ | `App.tsx:67` tagRoutes(umrahRoutes,"umrah") + ModuleRoute:104-115 |
| التفعيل الجزئي (VIS-002) | ✅ | `app-context.tsx:450` isFeatureEnabled · `migration 236` · `/permissions/my` disabledFeatures |
| القائمة مصدر واحد + فلترة | ✅ | `sidebar-layout.tsx:733` filterItems (8 أقسام) |
| تحقق registry | ✅ | `routes/registry.ts` isRegisteredRoute |
| واجهة RBAC موصولة | ✅ | `pages/admin/user-onboarding.tsx` + adminRoutes + sidebar |
| استهلاك `perm` (VIS-003) | 🟡 | القائمة تستهلكه (`itemPermAllowed:729`)؛ **التوجيه لا** — يبقى module/subKey خشن |
| ظهور الأزرار حسب حالة السجل (VIS-005) | 🔴 | `GuardedButton` يفحص الصلاحية فقط؛ **لا `visibleWhenStatus`** — منطق الحالة مبعثر بالصفحات |
| واسم نضج الصفحة (VIS-004/006) | 🔴 | لا حقل maturity/beta على إدخالات المسار؛ لا إخفاء بيئي للناقص |

---

## 3. الرحلات التشغيلية

| الرحلة | الحالة | الدليل / الفجوة |
|---|---|---|
| موظف → دخول | ✅ | `routes/employees.ts` POST / · `admin.ts` /users · /onboard |
| مستخدم متعدد الأدوار | ✅ | POST `/admin/onboard` |
| مصروف → اعتماد → GL | ✅ | finance routes + approval_actions + createGuardedJournalEntry |
| عقد عقاري → تحصيل | ✅ | `routes/properties.ts` (آلة حالة) + rent_payments + obligations |
| قضية → جلسة → تنبيه | ✅ | `routes/legal.ts` + obligations؛ N9 (مهمة) أُغلق #1426 |
| إنشاء شركة → تفعيل | 🟡→🔴 | `lib/companyBootstrap.ts` يزرع البنية؛ **لا واجهة تهيئة self-serve** (حاجز B1/B2/B3) |
| رحلة نقل → إغلاق | 🟡 | قيد 4 أسطر + قلب الحالة؛ **خطر ازدواج عدّ الوقود** عند الإغلاق |
| مجموعة عمرة → فاتورة | ✅ (مع ملاحظة) | فاتورة GL-حاجزة بأبعاد؛ ملاحظة: umrahEngine non-blocking swallow |
| **اتساق ترحيل GL (عابر)** | 🔴 معماري | 3 سياسات/3 لحظات ترحيل عبر 6 مسارات (CROSS_TRACK_ANALYSIS) — **أعلى فجوة قيمة** |

---

## 4. الخدمات المشتركة (13/14 مركزية)

| الخدمة | الحالة | مركزية؟ | الدليل |
|---|---|---|---|
| المهام · الاعتماد · الإشعارات · التعليقات · الطباعة · BI · التقويم · AI · الترقيم · الأحداث | ✅ ×10 | نعم | tasks/approvalActions/notificationEngine/entityMeta/print/bi/calendar/aiEngine/numberingService/eventBus |
| الوثائق/المرفقات | ✅ | نعم (موحّد) | `migration 237` (umrah_attachments→documents) · employee_documents يُبقى (امتثال) |
| المراسلات | ✅ | نعم | `messageSender.ts` + message_log |
| التدقيق | ✅ | نعم | createAuditLog + active_role_key + ENTITY_MAP موسّع (FND-006) |
| SLA/التصعيد | 🟡 | مقصور على الدعم | `supportSlaEscalation.ts` غير معمّم على (entityType,entityId) |

---

## 5. المالية

| المجال | الحالة | الدليل |
|---|---|---|
| محرك القيود | ✅ | createJournalEntry/createGuardedJournalEntry |
| الأبعاد على journal_lines | ✅ | `lib/gl/posting.ts` 25-27 عمودًا (PR #1304/#1316) |
| الفواتير/المذكرات | ✅ | `routes/finance-invoices.ts` |
| المشتريات/3-way match | ✅ | `routes/finance-purchase.ts` (goods_receipts.totalAmount) |
| دورة AP (سلف/مذكرات/فواتير مورّد) | ✅ | migrations 232/235 · `finance-vendors.ts` |
| ZATCA/الضرائب | ✅ | `routes/finance-zatca.ts` + WHT (migration 233) |
| **اتساق ترحيل GL** | 🟡 | عدّة posters (posting.ts + per-engine)؛ لا واجهة واحدة |
| بوابات إقفال الفترة | 🟡 | مطبّقة على عدة مسارات؛ غير موحّدة عبر helper واحد |
| financial_posting_failures | 🟡 | guarded poster يكتبها؛ **umrahEngine يبتلع الفشل** (logger.error فقط) |
| عزل المستأجر | 🟡 | buildScopedWhere موجود؛ 68 محمول companyId يدوي (FND-013) |

(17 ملف finance routes · ~304 endpoint)

---

## 6. الأسطول والعمرة

**Fleet:** المركبات/السائقون/الرحلات ✅ · إغلاق→GL ✅ · صيانة+مخزون ✅ · telematics ✅ · **عدّ الوقود 🟡 (خطر ازدواج عند الإغلاق، `routes/fleet.ts` trip-complete)**.

**Umrah:** المواسم/المجموعات/الوكلاء/المعتمرون ✅ · فاتورة مبيعات GL-حاجزة بأبعاد ✅ · العمولة ✅ · المرفقات موحّدة (237) ✅ · بوابة الوحدة ✅ · **GL وكيل/نقل 🟡 (umrahEngine non-blocking swallow)**.

---

## 7. الأعمال المتبقية — مرتّبة بالأولوية

| # | العمل | المحور | الأولوية | لماذا / القيد |
|---|---|---|---|---|
| 1 | **توحيد ترحيل GL** (واجهة واحدة داخل transaction الكيان + كتابة الفشل دائمًا في financial_posting_failures) | مالية+عمرة+أسطول+HR+عقارات | 🔴 حرجة | يغلق: swallow، before/after-transition، ازدواج. يحتاج **CI/staging** — إعادة هيكلة مالية 6 مسارات |
| 2 | **عيب ازدواج عدّ الوقود** عند إغلاق الرحلة | أسطول | 🔴 حرجة | خطأ مالي مباشر — يحتاج **تحقق تشغيلي** |
| 3 | **VIS-005:** `visibleWhenStatus` في GuardedButton + توحيد حكم حالة السجل | UX | 🟠 عالية | إضافي قابل للتحقق عبر CI |
| 4 | **بوابة إقفال فترة موحّدة** على كل مسار ترحيل | مالية | 🟠 عالية | يحتاج staging |
| 5 | **تعميم SLA/التصعيد** (entityType,entityId) | core | 🟠 متوسطة | إضافي |
| 6 | **واجهة تهيئة الشركة** (رحلة 1 الحاجزة) | foundation | 🟡 متوسطة | يحتاج **قرار منتج** |
| 7 | **واجهة SoD + مؤلّف الأدوار v2** | RBAC | 🟡 متوسطة | عمق واجهة |
| 8 | تعميم buildScopedWhere (68 محمول) · VIS-003 routing · VIS-004 maturity · إسقاط umrah_attachments القديم · توحيد الكتالوجين | متعدد | 🟢 منخفضة | تحسينات/نظافة |

---

## 8. ملاحظة صدق
الأرقام والأدلة من فحص الكود الفعلي (7 وكلاء). تقييمات "🟡/عيب" المالية والأسطول مصدرها `docs/audit/inventory/CROSS_TRACK_ANALYSIS.md` + فحص موضعي — **تحتاج تحقق تشغيلي** لتأكيدها النهائي (تعذّر تشغيل التطبيق في الجلسة). البنود 🔴 الكبيرة (توحيد GL، الوقود) إعادة هيكلة مالية لا تُنفَّذ بلا CI/staging.
</content>
