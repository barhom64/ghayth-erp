# فهرس الرحلات التشغيلية — OPERATING_JOURNEY_CATALOG

> **النوع:** جرد ثابت + خريطة رحلات — المرحلة 1 من **Ghaith Operating Foundation** (Issue #1418).
> **التاريخ:** 2026-05-29 · **الفرع:** `claude/ghaith-foundation-audit-wdIUf`
> **القاعدة:** غيث يُختبَر بالرحلة لا بالصفحة. كل رحلة = سلسلة إجراءات لكل منها أثر يظهر في حالة أو تقرير أو سجل.
> **مصادر يُبنى عليها (لا تُكرَّر):** `docs/testing/END_TO_END_USER_JOURNEYS.md` · `docs/testing/FULL_OPERATIONAL_ACCEPTANCE_TEST.md` · `docs/testing/MODULE_INTEGRATION_MATRIX.md` · `docs/ledger-impact-registry.md` · `docs/blueprints/*.md`.

---

## 0. الغرض

هذا الفهرس يربط الرحلات الثماني المرجعية (في #1418/#1413) بـ: المسارات والكيانات والخدمات المشتركة التي تلمسها، وحالة الجاهزية الحالية. لا يكرّر تفاصيل الرحلات الموجودة في `END_TO_END_USER_JOURNEYS.md` بل يفهرسها ويصل كلًّا منها بفلسفة غيث (قائد/خادم، أثر، ظهور).

> **حالة الجاهزية** مأخوذة من تقارير الاختبار السابقة + استكشاف الكود؛ ما عليه علامة ⚠️/🚨 يحتاج تحقّقًا تشغيليًا في المرحلة 7.

---

## 1. الخدمات المشتركة المتكررة عبر الرحلات

كل الرحلات تتشارك (لا نسخ لكل مسار): التدقيق `audit_logs` · الأحداث `eventBus/event_outbox` · الإشعارات `notifications` · الترقيم `numbering` · الاعتماد `approval_actions`/`approvalChains` · ترحيل GL الحاجز `createGuardedJournalEntry` · المهام `tasks` · الالتزامات `obligations`. التفصيل في `CORE_SERVICES_INVENTORY.md`.

---

## 2. الرحلات الثماني المرجعية

### رحلة 1 — إنشاء شركة حتى التفعيل
- **القائد:** الأساس (Foundation). **الخادم:** الترقيم، RBAC.
- **الكيانات:** companies, branches, chartOfAccounts, hrLeaveTypes, approvalChains, rbac_roles, numbering_schemes.
- **الخدمة المشتركة:** محرّك `companyBootstrap()` + حدث `company.created`.
- **الأثر:** شركة مفعّلة + هيكل مالي وأدوار مزروعة.
- **الحالة:** 🚨 **حاجز** — لا واجهة تهيئة (bootstrap عبر المطوّر). مرجع: `END_TO_END_USER_JOURNEYS.md §1`.

### رحلة 2 — إنشاء موظف حتى دخوله النظام (+ متعدد الأدوار)
- **القائد:** HR. **الخادم:** RBAC، الإشعارات.
- **الكيانات:** employees, employee_assignments, users, rbac_user_roles, rbac_user_grants.
- **الأثر:** ملف موظف + حساب دخول + أدوار فعّالة.
- **الحالة:** ⚠️ **تجربة** — خطوتان منفصلتان، لا إنشاء سريع موحّد (RBAC-002). يربط مباشرة بـ #1413 §6 و`USER_QUICK_CREATE_FLOW`. مرجع: `END_TO_END_USER_JOURNEYS.md §2`.

### رحلة 3 — إنشاء مصروف حتى الاعتماد والأثر المالي
- **القائد:** Finance. **الخادم:** الاعتماد، التدقيق.
- **الكيانات:** expense_claims/expenses, journal_entries, journal_lines, approval_actions, notifications.
- **الخدمة المشتركة:** `approvalChains` → ترحيل GL حاجز → حدث.
- **الأثر:** قيد `DR 5xxx / CR 1100/2100` يظهر في GL + التقارير.
- **الحالة:** ✅ واقعي. مرجع: `ledger-impact-registry.md §2.3`.

### رحلة 4 — تشغيل رحلة نقل حتى الإغلاق والتقرير
- **القائد:** Fleet. **الخادم:** Finance (GL)، Warehouse (صيانة)، الإشعارات.
- **الكيانات:** fleet_trips, fleet_drivers, fleet_vehicles, fleet_fuel_logs, journal_entries, fleet_alerts.
- **الأثر:** عند الإغلاق → قيد 4 أسطر (وقود + إهلاك + أجر سائق) + قلب حالة المركبة/السائق + تقرير.
- **الحالة:** ⚠️ **عيب يحتاج تحقق** — احتمال ازدواج عدّ الوقود عند الإغلاق. مرجع: `blueprints/fleet.md` + `END_TO_END_USER_JOURNEYS.md §4`.

### رحلة 5 — تشغيل مجموعة عمرة حتى الفاتورة والتقرير
- **القائد:** Umrah. **الخادم:** Finance (GL)، الاعتماد، الترقيم، ZATCA (قابل للتوصيل)، محرّك العمولة.
- **الكيانات:** umrah_groups, umrah_sales_invoices, umrah_payments, umrah_agents, journal_entries, employee_commission_calculations.
- **الأثر:** فاتورة GL-حاجزة بأبعاد (agentId/seasonId) + تخصيص دفعة + عمولة تُحسب بعد الرواتب + تقرير.
- **الحالة:** ✅ قوي (ZATCA افتراضيًا mock). مرجع: `blueprints/umrah.md` + `END_TO_END_USER_JOURNEYS.md §5`.

### رحلة 6 — إنشاء عقد عقاري حتى التحصيل
- **القائد:** Properties. **الخادم:** Finance (GL)، الترقيم، محرّك الالتزامات، آلة الحالة.
- **الكيانات:** rental_contracts, property_units, contract_payment_schedule, rent_payments, obligations, journal_entries.
- **الأثر:** ترقيم العقد + قلب حالة الوحدة→مؤجّرة + جدول دفعات + التزامات (تجديد/إنهاء) + قيد تحصيل `DR Cash / CR AR`.
- **الحالة:** ✅ ممتاز (آلة حالة + التزامات + GL متكاملة). مرجع: `ledger-impact-registry.md §2.6` + `blueprints/properties-ejar.md`.

### رحلة 7 — متابعة قضية حتى الجلسة والتنبيه
- **القائد:** Legal. **الخادم:** الاعتماد، الالتزامات، الإشعارات، Finance (تسوية).
- **الكيانات:** legal_cases, legal_sessions, legal_judgments, legal_judgment_appeals, obligations, notifications.
- **الأثر:** جدولة جلسة → التزام + إشعار؛ حكم بمبلغ → قيد تسوية؛ نافذة استئناف يتتبّعها التزام.
- **الحالة:** ✅ واقعي مع **ربط مهمة جزئي** (الجلسة لا تنشئ مهمة تلقائيًا). مرجع: `blueprints/legal.md` + `ledger-impact-registry.md §2.8`.

### رحلة 8 — تشغيل الرواتب حتى الأثر المالي (داعمة للرحلات)
- **القائد:** HR. **الخادم:** Finance (GL ذرّي)، RBAC، الإشعارات، التدقيق.
- **الكيانات:** payroll_runs, payroll_lines, employee_salary_components, journal_entries, employeeViolations, hr_employee_loans.
- **الأثر:** قيد واحد ذرّي لكل التشغيل (`DR رواتب+GOSI / CR مستحق+GOSI`) — الكل أو لا شيء؛ يطلق حساب العمولة.
- **الحالة:** ✅ ذرّي ومُتحقَّق. مرجع: `blueprints/hr-payroll.md` + `ledger-impact-registry.md §2.4`.

---

## 3. رحلتا الاختبار التجريبيتان (من #1418/التكليف)

| الرحلة | الغرض | المرجع |
|---|---|---|
| موظف غير تقني يستخدم النظام | قياس وضوح العربية والظهور المناسب | يُفصَّل في `NON_TECHNICAL_USER_EXPERIENCE_TESTS` (مرحلة 7) |
| ظهور/إخفاء الصفحات حسب الدور والاشتراك | إثبات `canAccessModule/SubPage` + التفعيل | يربط بـ `PAGE_VISIBILITY_INVENTORY` + VIS-001/VIS-002 |

---

## 4. مصفوفة الرحلة ↔ المسار القائد/الخادم (موجزة)

| الرحلة | القائد | الخوادم | أثر GL | حالة |
|---|---|---|---|---|
| 1 شركة | Foundation | Numbering, RBAC | لا | 🚨 حاجز |
| 2 موظف+دخول | HR | RBAC, Notif | لا | ⚠️ تجربة |
| 3 مصروف | Finance | Approval, Audit | نعم | ✅ |
| 4 رحلة نقل | Fleet | Finance, Warehouse | نعم | ⚠️ عيب وقود |
| 5 عمرة | Umrah | Finance, ZATCA, Commission | نعم | ✅ |
| 6 عقد عقاري | Properties | Finance, Obligations | نعم | ✅ |
| 7 قضية | Legal | Obligations, Notif, Finance | نعم | ✅ (مهمة جزئية) |
| 8 رواتب | HR | Finance, RBAC | نعم | ✅ |

---

## 5. الخلاصة والقرارات

- **أغلب الرحلات واقعية ومتكاملة مع GL والخدمات المشتركة** — البنية صلبة لتأسيس دستور التشغيل.
- **الفجوات المرصودة (للمرحلة 7 لا الآن):** رحلة 1 (لا واجهة تهيئة شركة 🚨)، رحلة 2 (لا إنشاء سريع)، رحلة 4 (عيب وقود يحتاج تحقق)، رحلة 7 (ربط مهمة جزئي).
- **كل رحلة لها قائد وخوادم وأثر** — يثبت مبدأ "المسار القائد/الخادم" و"كل إجراء له أثر". يُفصَّل في المرحلة 2: `PATH_LEADER_SERVICE_MATRIX`, `DECISION_OWNERSHIP_MATRIX`, `IMPACT_CATALOG`.
- **اختبارات القبول** لهذه الرحلات تُكتب في المرحلة 7 (`OPERATING_JOURNEY_ACCEPTANCE_TESTS`) بدل تكرار `END_TO_END_USER_JOURNEYS` الموجود.
</content>
