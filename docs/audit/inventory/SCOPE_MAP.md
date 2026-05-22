# خريطة النطاق — SCOPE_MAP

> **النوع:** جرد ثابت (Static inventory) — المرحلة أ من تكليف Inventory Auditor المستقل.
> **التاريخ:** 2026-05-21
> **المستودع:** `barhom64/ghayth-erp` — الفرع `claude/nice-ride-xWdwq`
> **المدقّق:** مدقّق جرد مستقل ومحايد — لا كتابة كود، لا إصلاح، لا فتح PR.
> **القاعدة:** لا يُقبل أي تصنيف ✅ من تقرير سابق دون تحقّق مستقل في الكود/الـ schema.

---

## 0. ملاحظات منهجية على الاستطلاع

1. **المكدّس الفعلي:** Node.js 24 + Express 5 + Raw SQL عبر `pg` Pool + Drizzle ORM. قاعدة البيانات **PostgreSQL** حصرًا — لا MySQL (خلافًا لما ورد في نص التكليف؛ تأكيد من `replit.md` ومن استخدام `nextval()`/`TIMESTAMPTZ`/`information_schema` في كل المهاجرات). يُسجَّل هذا كأول خلاف مع افتراض التكليف.
2. **ملف `ghayth-review-complete.docx` غير موجود في المستودع.** البحث (`find -iname "*.docx"` و`*ghayth-review*`) لم يُرجِع شيئًا. أقرب مادة متاحة: `attached_assets/Pasted--Technical-Full-Verification--*.txt` (ملفّان). لذا لا يمكن التحقق من رقم «38% معدل تشغيل» — يُعامَل كمدخل سياقي مفقود.
3. **مجلّدا مهاجرات:** يوجد `artifacts/api-server/src/migrations/` (164 ملف) و`artifacts/api-server/migrations/` (93 ملف). الـ migration runner (`src/lib/migrate.ts:400` → `resolve(__dirname,"./migrations")`) يطبّق **`src/migrations/` فقط**. المجلّد الأعلى **لا يُطبَّق إطلاقًا** — يُسجَّل في جرد Foundation كـ `dead`.
4. **مصادر التحقّق المقروءة:** شجرة المستودع كاملة، `routes/index.ts`، 80 ملف route خلفي، 15 ملف route أمامي، `replit.md` (ذاكرة معمارية)، وتقارير `docs/audit/` السابقة (HR/Finance/Umrah/Unverified-Paths) كنقاط تحقّق لا حقائق.
5. **التقارير السابقة المعتمدة كأرضية تحقّق:** `FUNCTIONAL_HR_VERIFICATION.md` · `FUNCTIONAL_FINANCE_VERIFICATION.md` · `FUNCTIONAL_UMRAH_VERIFICATION.md` · `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` · سلسلة `*_CERTIFICATION.md`.

---

## 1. عدّ الصفحات الأمامية لكل مسار

التطبيق الرئيسي: `artifacts/ghayth-erp` — موجِّه `wouter`، تعريفات المسارات في `src/routes/*.tsx` (15 ملفًا)، نقطة الدخل `App.tsx`. إجمالي إدخالات المسارات المُسجَّلة عبر الملفات الـ15: **395 إدخالًا** (`grep -cE '^\s*\{ path:'`).

| المسار | عدد الصفحات الموجَّهة | مصدر العدّ |
|---|---|---|
| HR (الموارد البشرية) | **93** | `hrRoutes.tsx` (86) + 7 صفحات خدمة ذاتية في `miscRoutes` (`my-attendance`, `my-leave-request`, `my-payslip`, `my-performance`, `my-documents`, `my-loans`, `my-overtime`) |
| Finance (المالية) | **69** | `financeRoutes.tsx` (67) + تبويبا الإعدادات (`accounting-mappings-tab`, `zatca-settings-tab`) |
| Fleet (الأسطول) | **26** | `fleetRoutes.tsx` |
| Warehouses (المستودعات) | **13** | `miscRoutes.tsx` — قسم `warehouse/*` |
| Properties (العقارات) | **30** | `propertyRoutes.tsx` |
| Projects (المشاريع) | **9** | `miscRoutes.tsx` — `projects/*` (6) + `tasks/*` (3) |
| CRM | **9** | `miscRoutes.tsx` — `clients/*` (3) + `crm/*` (6) |
| Support (الدعم) | **5** | `miscRoutes.tsx` — `support/*` |
| Communications (الاتصالات الإدارية) | **6** | `commsRoutes.tsx` |
| Umrah (العمرة) | **32** | `umrahRoutes.tsx` |
| Foundation (الطبقة العرضية) | **~50** | `adminRoutes.tsx` (16) + `settingsRoutes.tsx` (7) + صفحات admin الفرعية (`pages/admin/*` ≈ 18) + `login` + لوحات عرضية مشتركة (dashboard/action-center/operations-center/exec-dashboard/calendar/activity-log/notifications) |
| **خارج المسارات العشرة المسماة** | **~62** | Legal (13) · Governance (14) · BI (10) · Store (6) · Documents (7) · Requests (6) · Marketing (2) + صفحات منوّعة. تُعامَل عرضيًا عبر CROSS_TRACK_ANALYSIS، لا تُفرَد بملف جرد. |

> **ملاحظة:** العدّ يحسب «إدخالات المسار» لا «ملفات الصفحات» — بعض المسارات تشترك في مكوّن واحد (مثل `/governance/policies` و`/governance/risks` كلاهما يعرض `Governance`). إجمالي ملفات الصفحات الفعلية ≈ 428 (مؤكَّد من `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md` §3 ومن `find pages -name '*.tsx'`).

---

## 2. عدّ نقاط الـ API الخلفية لكل مسار

الخادم: `artifacts/api-server` — 80 ملف route في `src/routes/`، كلها مُركَّبة في `routes/index.ts` (لا orphan routers). العدّ بـ `grep -cE '\.(get|post|put|patch|delete)\('` على كل ملف.

| المسار | ملفات الـ routes | إجمالي نقاط الـ API | تفصيل |
|---|---|---|---|
| HR | 9 | **215** | `hr.ts` 124 · `hr-discipline.ts` 24 · `recruitment.ts` 13 · `training.ts` 13 · `hr-contracts.ts` 12 · `employees.ts` 10 · `hr-overtime.ts` 7 · `hr-loans.ts` 6 · `hr-exit.ts` 6 |
| Finance | 17 | **263** | `hardening` 30 · `purchase` 28 · `invoices` 27 · `algorithms` 27 · `journal` 23 · `vendors` 18 · `reports` 16 · `accounting-engine` 15 · `budget` 14 · `custodies` 12 · `accounts` 10 · `gl-helpers` 10 · `zatca` 9 · `recurring` 6 · `vendor-contracts` 5 · `cost-centers` 5 · `collection` 3 |
| Fleet | 1 | **46** | `fleet.ts` |
| Warehouses | 1 | **27** | `warehouse.ts` |
| Properties | 1 | **55** | `properties.ts` |
| Projects | 2 | **35** | `projects.ts` 27 · `tasks.ts` 8 |
| CRM | 2 | **25** | `crm.ts` 16 · `clients.ts` 9 |
| Support | 1 | **18** | `support.ts` |
| Communications | 4 | **52** | `notification-engine.ts` 20 · `communications.ts` 19 · `correspondence.ts` 7 · `notifications.ts` 6 |
| Umrah | 2 | **101** | `umrah.ts` 50 · `umrah-entities.ts` 51 |
| Foundation | ~30 | **~340** | `admin` 51 · `rbacV2` 34 · `settings` 35 · `bi` 44 · `governance` 35 · `legal` 30 · `documents` 23 · `intelligence` 27 · `requests` 16 · `workflows` 18 · `print` 17 · `export` 12 · `store` 11 · `moduleDashboards` 11 · `automation` 10 · `entityMeta` 9 · `gov-integrations` 9 · `marketing` 12 · `auth` 7 · `permissions` 7 · `health` 6 · `rules` 6 · `import` 6 · `pdpl` 5 · `scheduled-reports` 5 · `events` 4 · `digital-signature` 3 · `storage` 3 · `auditLogs` 3 · `activityLog` 2 · `approvalActions` 2 · `dashboard` 7 · `mySpace` 6 · `actionCenter` 1 · `calendar` 1 · `search` 1 · `impactPreview` 1 · `activityIngest` 1 · `clientPortal` 16 · `careersPortal` 9 · `publicData` 3 · `operationsCenter` 3 · `execDashboard` 3 · `obligations` 8 · `accounting-engine`(مشترك) |
| **الإجمالي التقريبي للنظام** | **80 ملف** | **~1480 نقطة** | — |

> أرقام الـ API هنا تَعُدّ تعريفات `router.METHOD(...)` الصريحة. بعض الملفات تركّب على بادئات متعددة (مثل `requests` على `/requests` و`/request-catalog`). الإجمالي يقارب رقم `SERVICES_INDEX.md` المذكور في `replit.md` («928 endpoint») لكنه أعلى — يُرجَّح أن `SERVICES_INDEX` قديم؛ يُسجَّل كخلاف وثائقي محتمل يحتاج تأكيدًا في المرحلة ب.

---

## 3. عدّ المهاجرات المؤثرة لكل مسار

المجموعة المُطبَّقة فعليًا: `src/migrations/*.sql` = **164 ملفًا**. العدّ أدناه بكلمات مفتاحية على أسماء الملفات (تقريبي — بعض الملفات تمسّ أكثر من مسار).

| المسار | عدد المهاجرات المؤثرة (تقريبي) | أبرز الملفات |
|---|---|---|
| HR | ~28 | `009_hr_phase2`, `034_hr_discipline_regulation`, `082_hr_excuse_requests`, `098/099_employee_contracts`, `102_payroll_commission`, `109_salary_history`, `182/183_hr_lifecycle_updatedat` |
| Finance | ~36 | `018/074_soft_delete_financial`, `036_three_way_match`, `066_finance_phase2`, `091_cost_centers`, `119_financial_posting_failures`, `122_journal_entries_sourcekey`, `139_zatca_phase2`, `140_multi_currency`, `148/172_fx_realized`, `181_invoices_approval` |
| Fleet | ~3 | `179_legal_sessions_and_fleet_preventive`, `062_phase5_*` (مشترك) |
| Warehouses | ~7 | `019_materials_used`, `035_inventory_projects_gl`, `145_warehouse_movements_gl`, `146_lots_writeoff_journal`, `172z_warehouse_base_tables`, `173_inventory_movement_lot_serial` |
| Properties | ~4 | `026_property_buildings`, `031_ejar_compliance`, `071_property_lease_lifecycle` |
| Projects | ~5 | `027_projects_permissions_seed`, `035_inventory_projects_gl` (مشترك) |
| CRM | ~7 | `021/022_client_portal`, `088_client_employee_missing_columns`, `130_seed_crm_pipeline_stages`, `177_clients_tax_number`, `143_clients_attachments` |
| Support | ~1 | `171_support_tickets_branchId` |
| Communications | ~6 | `069/072_official_letters`, `090_correspondence_numbering`, `132_seed_notification_templates`, `171_print_engine_foundations` |
| Umrah | ~24-31 | `067-074_umrah_*`, `093-097_umrah_phase2/3`, `101_umrah_invoicing`, `112-115_umrah_*`, `150-154_umrah_*`, `170/171_umrah_*`, `184_violation_penalty_link`, `185_transport_pilgrims` |
| Foundation | ~29 | `057_pdpl`, `058-060_push_subscriptions_encryption`, `061_migration_reconciliation`, `062_custom_roles`, `068_rbac_catalog_seed`, `109_layered_rbac_v2`, `110_event_dlq`, `118_fk_indexes`, `124_cross_tenant_scoping`, `125/150_companyid_indexes`, `170_idempotency_keys`, `175_portal_token_version` |

---

## 4. تقدير حجم العمل لكل مسار

التقدير دالةٌ في: (عدد الصفحات × عدد الـ APIs × كثافة العيوب المتوقّعة من التقارير السابقة). مقياس الحجم: **صغير / متوسط / كبير / ضخم**.

| المسار | الصفحات | الـ APIs | كثافة العيوب الأولية | حجم العمل | المبرّر |
|---|---|---|---|---|---|
| HR | 93 | 215 | عالية (تقرير سابق: 67% شغّال، 8 ثغرات حرجة) | **ضخم** | أكبر سطح في النظام؛ `hr.ts` وحده 7424 سطرًا/124 endpoint؛ 5 صفحات ميتة + 3 دورات حياة مكسورة من الواجهة |
| Finance | 69 | 263 | حرجة جدًا (تقرير سابق: 17% شغّال، 15 عيب حرج) | **ضخم** | أعلى مخاطر صحّة مالية؛ اعتماد الفاتورة لا يرحّل GL؛ 17 ملف route متشابك؛ أنظمة GL مزدوجة |
| Umrah | 32 | 101 | عالية (تقرير سابق: 5 فواصل مكسورة) | **كبير** | وحدة مستقلة عميقة؛ 4 محرّكات + 6 cron؛ بعض الفواصل عُولِجت بـ PR #764/#766/#768 — تحتاج إعادة تحقّق |
| Properties | 30 | 55 | متوسطة-عالية (F2/F4 في Unverified-Paths) | **كبير** | `properties.ts` 3972 سطرًا؛ تحوّلات حالة جانبية بلا audit؛ scoping يدوي |
| Foundation | ~50 | ~340 | منهجية (F5/F6/F8/F9/F11) | **كبير** | طبقة عرضية تمسّ كل المسارات؛ RBAC + audit + scoping + cron + env + migration policy |
| Fleet | 26 | 46 | متوسطة (F4/F10) | **متوسط** | `fleet.ts` 3032 سطرًا؛ lifecycle بلا audit؛ استيراد cross-domain لـ `accounting-engine` |
| Communications | 6 | 52 | متوسطة (F5: لا audit لـ comms) | **متوسط** | سطح API كبير نسبيًا مقابل صفحات قليلة؛ notification-engine + correspondence |
| Projects | 9 | 35 | متوسطة (F3: قراءات HR مكرّرة) | **متوسط** | `projects.ts` 2150 سطرًا؛ تكامل مع Finance project-costing |
| Warehouses | 13 | 27 | متوسطة (F1: تكرار حساب التكلفة المرجّحة — 🔴 High) | **متوسط** | عيب صحّة مالية مؤكَّد في حساب الكلفة المرجّحة؛ سطح صغير لكن خطر مرتفع |
| CRM | 9 | 25 | منخفضة-متوسطة | **صغير** | سطح محدود؛ تكامل مع clients/portal |
| Support | 5 | 18 | منخفضة | **صغير** | أصغر مسار؛ canonical path `/support/tickets` |

**ترتيب الأولوية المقترح للمرحلة ب** (حسب المخاطر لا الحجم): Finance → HR → Umrah → Warehouses (خطر مالي رغم صغره) → Properties → Foundation → Fleet → Projects → Communications → CRM → Support.

---

## 5. إجماليات النظام

| المقياس | القيمة |
|---|---|
| إجمالي ملفات الـ routes الخلفية | 80 |
| إجمالي ملفات الـ routes الأمامية | 15 |
| إجمالي إدخالات المسارات الأمامية | 395 |
| إجمالي ملفات صفحات الواجهة | ~428 |
| إجمالي نقاط الـ API (تقريبي) | ~1480 |
| إجمالي المهاجرات المُطبَّقة (`src/migrations/`) | 164 |
| المهاجرات غير المُطبَّقة (`migrations/` العليا — dead) | 93 |
| محرّكات الأعمال (engines) | ~13 (`lifecycle`, `workflow`, `rules`, `proactive`, `discipline`, `policy`, `selfAudit`, `obligations`, `notification`, `kpi`, `pricing`, `journey`, `hrEngine`) |
| وظائف الـ cron | ~70 (`cronScheduler.ts`) |
| ملفات الجرد المطلوب إنتاجها | 13 (هذا الملف + 11 جرد + CROSS + MATRIX + EXECUTIVE) |

---

## 6. الخطوة التالية

المرحلة ب — إنتاج 11 ملف جرد ثابت (`hr.md`, `finance.md`, `fleet.md`, `warehouses.md`, `properties.md`, `projects.md`, `crm.md`, `support.md`, `communications.md`, `umrah.md`, `foundation.md`)، كلٌّ بالجداول الخمسة المطلوبة + قسم «يحتاج Runtime Verification». التحقّق المستقل من كل ادعاء ✅ سابق إلزامي.

*انتهى SCOPE_MAP — مخرَج المرحلة أ. تدقيق ثابت فقط، لا تعديل كود.*
