# المصفوفة الموحّدة للعيوب — SYSTEM_INVENTORY_MATRIX

> **النوع:** مصفوفة جرد موحّدة — المرحلة د من تكليف Inventory Auditor المستقل.
> **التاريخ:** 2026-05-21 · **المستودع:** `barhom64/ghayth-erp`
> **المصدر:** 11 ملف جرد مساري في `docs/audit/inventory/` — كل صف هنا عيب واحد له معرّف فريد قابل للإشارة.
> **الإجمالي:** 184 عيبًا.

## مفاتيح التصنيف

- **النوع** (خمسة فقط): `dead` · `mismatch` · `duplicate` · `conflict` · `scaling`.
- **الخطورة** (ثلاثة فقط): `blocking` (يُعطّل تدفّقًا تشغيليًا أو يكسر بيانات) · `impairing` (يُضعِف الوظيفة دون تعطيلها) · `cosmetic` (تجميلي/منخفض الأثر).
- **التعقيد** (ثلاثة فقط): `narrow` (إصلاح موضعي) · `structural` (يحتاج تغييرًا بنيويًا) · `strategic-decision` (يحتاج قرار مالك قبل التنفيذ).
- **الموجة** المقترحة (4 موجات): **م1** = كل العيوب blocking · **م2** = impairing + structural · **م3** = impairing + narrow · **م4** = cosmetic + scaling + strategic-decision.

## التوزيع الكلّي

| البُعد | القيم |
|---|---|
| حسب النوع | dead 78 · mismatch 45 · conflict 22 · scaling 20 · duplicate 19 |
| حسب الخطورة | blocking 22 · impairing 98 · cosmetic 64 |
| حسب الموجة | م1: 22 · م2: 30 · م3: 52 · م4: 80 |
| حسب المسار | Finance 27 · Properties 22 · Umrah 19 · Communications 17 · Support 17 · HR 16 · CRM 15 · Foundation 15 · Fleet 13 · Warehouses 12 · Projects 11 |

---

## 1. العيوب الحاجبة (blocking) — 22 عيبًا — الموجة 1

| ID | المسار | النوع | الوصف الموجز | الخطورة | التعقيد | التبعية | الموجة |
|---|---|---|---|---|---|---|---|
| HR-005 | HR | dead | جسر «التوظيف → موظف» غير موجود — `PATCH /recruitment/applications/:id` يحدّث `status` فقط دون `INSERT INTO employees` | blocking | structural | employees route | م1 |
| FIN-001 | Finance | conflict | `match-invoice` لا يُرحّل قيد `DR GRNI / CR AP` — AP منقوصة وGRNI متراكمة | blocking | structural | محرّك GRN | م1 |
| FIN-002 | Finance | conflict | `chk_purchase_orders_status` لا يحوي `invoice_mismatch`/`payment_scheduled` → Postgres 23514 | blocking | structural | FIN-003 | م1 |
| FIN-003 | Finance | conflict | `schedule-payment` يُرحّل GL قبل `applyTransition` → قيد يتيم عند فشل CHECK | blocking | structural | FIN-002 | م1 |
| FIN-004 | Finance | dead | `GET /salary-advances` يُثبّت `'active' AS status` → أزرار الاعتماد لا تظهر | blocking | narrow | — | م1 |
| FIN-006 | Finance | dead | `PATCH /vouchers/:id/approve` يفلتر `ref LIKE 'VOUCHER%'` بينما السندات `RV-/PV-` | blocking | narrow | — | م1 |
| FIN-008 | Finance | dead | المطابقة البنكية لا تُرحّل أي قيد تسوية/تصفية | blocking | structural | — | م1 |
| FIN-010 | Finance | dead | `POST /finance/projects/:id/costs` غير موجود → زر «إضافة تكلفة» 404 | blocking | narrow | PRJ-003 | م1 |
| PROP-001 | Properties | conflict | زر «إنهاء العقد» يرسل `PATCH status=terminated` المرفوض؛ `/terminate` بلا واجهة | blocking | structural | — | م1 |
| PROP-002 | Properties | mismatch | تعديل المبنى يرسل `floors`؛ `property_buildings` بلا العمود → SQL 42703 | blocking | narrow | قرار schema | م1 |
| PROP-003 | Properties | mismatch | `pay`/`late-rent/escalate` يستعلمان `rent_payments.companyId/deletedAt` غير الموجودَين → SQL 42703 | blocking | narrow | — | م1 |
| PROP-004 | Properties | mismatch | `late_rent_actions.phase` عمود `integer` والكود يكتبه نصًّا → SQL 22P02 | blocking | narrow | قرار schema | م1 |
| FLT-001 | Fleet | dead | زرّا «إكمال/إلغاء» الرحلة يستدعيان `PATCH` بحالة نهائية يرفضها الخادم 409 | blocking | narrow | endpoints complete/cancel | م1 |
| FLT-010 | Fleet | mismatch | `waypoints` INSERT و`/alerts` يقرآن `fleet_gps_tracking.companyId` غير الموجود → خطأ SQL | blocking | narrow | — | م1 |
| PRJ-001 | Projects | mismatch | `PATCH /projects/tasks/:id` يكتب `progress` على `project_tasks` بلا عمود → خطأ SQL | blocking | structural | يعطّل تبويب المهام + gantt | م1 |
| PRJ-002 | Projects | dead | `POST /finance/projects/:id/costs` غير معرّف → زر تسجيل التكلفة 404 | blocking | narrow | FIN-010 | م1 |
| PRJ-003 | Projects | mismatch | `POST /finance/projects` يُدرج `ref`/`branchId` غير الموجودَين في `projects` → خطأ SQL | blocking | narrow | — | م1 |
| WH-007 | Warehouses | conflict | حركات `warehouse_movements` تُدرَج بلا `branchId` بينما `GET /movements` يفرض scope الفرع → تختفي عن مستخدمي الفرع | blocking | structural | — | م1 |
| CRM-006 | CRM | duplicate | زر «تحويل» العميل المحتمل ينشئ عميلًا مكرّرًا دائمًا ويكتب `status` خارج enum | blocking | structural | CRM-005 | م1 |
| CRM-013 | CRM | conflict | جدول `clients` بلا قيد UNIQUE؛ `totalRevenue` يُزاد من CRM والمالية بقواعد متعارضة → احتساب مزدوج | blocking | strategic-decision | المالية + العمرة | م1 |
| COM-003 | Communications | mismatch | `letters-create` يرسل قناة `letter` يرفضها `sendCommunicationSchema` | blocking | narrow | — | م1 |
| FND-001 | Foundation | dead | مجلّد `artifacts/api-server/migrations/` (93 ملف) غير مُطبَّق إطلاقًا | blocking | narrow | — | م1 |

---

## 2. العيوب المُضعِفة (impairing) — 98 عيبًا — الموجات 2 و3 و4

| ID | المسار | النوع | الوصف الموجز | الخطورة | التعقيد | التبعية | الموجة |
|---|---|---|---|---|---|---|---|
| HR-001 | HR | conflict | ترحيل قيد الرواتب يحدث مرتين (`postPayrollRunGL` + `postPayrollPostGL`) | impairing | structural | sourceKey idempotency | م2 |
| HR-002 | HR | conflict | `PATCH /payroll/:id` يقبل `status` نصًّا حرًّا ويسمح بالترحيل من أي حالة | impairing | structural | — | م2 |
| HR-003 | HR | conflict | `violationApprovalAction` ينقل الحالة بلا `fromStates` ولا state machine | impairing | structural | HR-004 | م2 |
| HR-010 | HR | dead | سطح API كبير بلا واجهة (attendance-policy/accruals/delegations/approval-chains) | impairing | structural | قرار منتج | م2 |
| HR-013 | HR | duplicate | `/violations` يعرض `hr_inquiry_memos` و`/management` يعرض `employee_violations` | impairing | structural | HR-003/004 | م2 |
| HR-004 | HR | dead | `penalty-escalation` يُصفّي `status==="active"` غير الموجود → صفحة فارغة | impairing | narrow | — | م3 |
| FIN-005 | Finance | conflict | رفض السلفة لا يعكس حركة `currentBalance` التي حدثت عند الإنشاء | impairing | structural | — | م2 |
| FIN-007 | Finance | conflict | السند يُرحّل GL ويحرّك الرصيد عند الإنشاء بلا دورة اعتماد | impairing | structural | FIN-006 | م2 |
| FIN-013 | Finance | dead | صفحة `journal-manual-detail` بلا أزرار submit/review/post | impairing | structural | — | م2 |
| FIN-014 | Finance | dead | لا واجهة لإقفال فترة مالية | impairing | structural | FIN-015 | م2 |
| FIN-015 | Finance | duplicate | نظاما فترات مالية متوازيان (v1 استدلالي / v2 CRUD) | impairing | structural | — | م2 |
| FIN-016 | Finance | duplicate | دورة GRN/match/payment كاملة غير قابلة للوصول من الواجهة | impairing | structural | FIN-001 | م2 |
| FIN-009 | Finance | mismatch | `ap-aging` يُثبّت `paidAmount=0` → كل التزام معروض بكامل قيمته | impairing | narrow | — | م3 |
| FIN-011 | Finance | dead | `journal.tsx` ينقل إلى `/finance/journal/:id` غير المُسجَّل | impairing | narrow | — | م3 |
| FIN-017 | Finance | mismatch | تبويبا فواتير/مدفوعات المورّد فارغان دائمًا (`vendorId` مُتجاهَل) | impairing | narrow | — | م3 |
| FIN-021 | Finance | duplicate | `/journal-manual/:id/review` و`/approve` خطوتان متطابقتان | impairing | narrow | — | م3 |
| FIN-022 | Finance | mismatch | فحص ملكية العهد يشير إلى جدول `custodies` غير موجود | impairing | narrow | — | م3 |
| FIN-026 | Finance | scaling | `LIMIT 500` + غياب scope فرع على عدة قوائم مالية | impairing | narrow | — | م4 |
| UMR-005 | Umrah | dead | كيان `nusk-invoices` كامل (5 endpoints) بلا أي صفحة | impairing | structural | — | م2 |
| UMR-016 | Umrah | dead | لا صفحة قائمة لـ `umrah_sales_invoices` ولا لـ `umrah_payments` | impairing | structural | — | م2 |
| UMR-001 | Umrah | dead | زر «حذف الموسم» يستدعي `DELETE /seasons/:id` غير الموجود | impairing | narrow | — | م3 |
| UMR-002 | Umrah | dead | لا واجهة تستدعي `assign-pilgrims` رغم جاهزية جدول الربط | impairing | narrow | — | م3 |
| UMR-003 | Umrah | dead | `agent-invoices/:id/record-payment` بلا واجهة | impairing | narrow | — | م3 |
| UMR-006 | Umrah | conflict | `PATCH /invoices/:id` يكتب `status` خامًا يتجاوز STATE_MACHINE | impairing | narrow | — | م3 |
| UMR-009 | Umrah | dead | `pilgrim-create` يلتقط مرفقات لا تُرفَع | impairing | narrow | — | م3 |
| UMR-015 | Umrah | dead | `commission-plans/:id/calculate` و`commission-calculations` بلا واجهة | impairing | narrow | — | م3 |
| UMR-012 | Umrah | scaling | مهام cron العمرة تمرّ على كل الشركات تسلسليًا بانتقال لكل معتمر منفردًا | impairing | structural | — | م4 |
| PROP-005 | Properties | dead | `POST /contracts/:id/renew` كامل المنطق بلا زر واجهة | impairing | narrow | PROP-001 | م3 |
| PROP-006 | Properties | mismatch | `updateUnitSchema` يقبل `name`/`notes` بلا أعمدة في `property_units` | impairing | narrow | قرار schema | م3 |
| PROP-008 | Properties | dead | زر «تسجيل دفعة» يوجّه إلى `/payments/new/pay` فيرمي `parseId("new")` | impairing | narrow | — | م3 |
| PROP-010 | Properties | dead | زر «تعديل» الدفعة يوجّه إلى مسار `/payments/:id/edit` غير مُسجَّل | impairing | narrow | — | م3 |
| PROP-011 | Properties | dead | زر «تعديل» الصيانة يوجّه للقائمة فقط؛ `PATCH /maintenance-requests/:id` بلا واجهة | impairing | narrow | — | م3 |
| PROP-014 | Properties | mismatch | `/approve` يقرأ `mr.createdBy`/`mr.title` غير الموجودَين → الإشعار لا يُرسَل | impairing | narrow | — | م3 |
| PROP-015 | Properties | dead | `POST /maintenance-requests/:id/complete` بلا زر واجهة | impairing | narrow | — | م3 |
| PROP-019 | Properties | scaling | سداد القسط بـ`UPDATE` خام بلا قفل صف → خطر ازدواج قيد GL متزامن | impairing | structural | توحيد lifecycle | م4 |
| PROP-020 | Properties | scaling | تحرير الوحدة `rented→available` بـ`UPDATE` خام بلا تحوّل مُسجَّل | impairing | structural | توحيد lifecycle | م4 |
| FLT-003 | Fleet | mismatch | TCO يعتمد `purchasePrice`/`purchaseDate` غير الموجودَين → قيمة الشراء صفر | impairing | structural | كتلة قيد الأصل | م2 |
| FLT-006 | Fleet | conflict | «التنبيهات» محسوبة لحظيًا بلا جدول؛ «إضافة تنبيه» تنشئ سجل صيانة | impairing | structural | — | م2 |
| FLT-002 | Fleet | mismatch | تعديل الصيانة يرسل `odometer`/`notes` لا يقبلهما الـ schema | impairing | narrow | — | م3 |
| FLT-004 | Fleet | mismatch | `POST /trips` يتجاهل `status`/`endTime` ويُثبّت `in_progress` | impairing | narrow | — | م3 |
| FLT-008 | Fleet | dead | تفاصيل المخالفة المرورية للعرض فقط؛ لا تعديل/حذف/سداد ولا endpoint حذف | impairing | narrow | — | م3 |
| FLT-012 | Fleet | scaling | تحديثات حالة المركبة/السائق بـ`UPDATE` خام بلا audit (12 موضعًا) | impairing | structural | F4 | م4 |
| WH-004 | Warehouses | dead | نوع الحركة `adjustment` متاح بالواجهة لكن `POST /movements` لا يفرّعه | impairing | structural | — | م2 |
| WH-001 | Warehouses | mismatch | `product-detail` يقرأ `unitCost`/`sellingPrice`/`barcode` غير الموجودة → أسعار صفر | impairing | narrow | — | م3 |
| WH-002 | Warehouses | dead | أزرار «تعديل» في 4 صفحات تفاصيل تنتقل لمسارات `/edit` غير معرّفة | impairing | narrow | — | م3 |
| WH-003 | Warehouses | mismatch | `movement-detail` يقرأ 8 حقول غير موجودة في `warehouse_movements` | impairing | narrow | — | م3 |
| WH-006 | Warehouses | mismatch | تفاصيل التصنيف/المورّد تقرأ حقولًا تجميعية لا يُرجِعها `SELECT *` | impairing | narrow | — | م3 |
| WH-008 | Warehouses | dead | `POST /warehouse/transfers` بلا أي واجهة تستدعيه | impairing | narrow | — | م3 |
| WH-009 | Warehouses | dead | `PATCH/DELETE` للتصنيفات والموردين بلا واجهة | impairing | narrow | WH-002 | م3 |
| WH-011 | Warehouses | mismatch | جرد المخزون يكتب `conductedBy/approvedBy=employeeId` → NULL لغير الموظفين | impairing | narrow | — | م3 |
| WH-010 | Warehouses | scaling | `GET /stats` يجمّع على مستوى الشركة بلا فلتر فرع | impairing | structural | WH-007 | م4 |
| PRJ-005 | Projects | conflict | مجموعة حالات `/tasks` تخالف آلة انتقالات `tasks.ts` | impairing | structural | — | م2 |
| PRJ-004 | Projects | dead | `POST /projects/:id/resources` سليم بلا واجهة تستدعيه | impairing | narrow | — | م3 |
| PRJ-006 | Projects | mismatch | `task-detail` يقرأ `assignedToName` والـ API يُرجع `assigneeName` | impairing | narrow | — | م3 |
| PRJ-007 | Projects | dead | زر «تعديل» المهمة يوجّه إلى `/tasks/:id/edit` غير المُسجَّل | impairing | narrow | — | م3 |
| PRJ-008 | Projects | dead | endpoints المعالم (POST/PATCH) بلا واجهة؛ المعالم للقراءة فقط | impairing | narrow | — | م3 |
| CRM-003 | CRM | dead | نموذج إنشاء الفرصة يستدعي `GET /employees` المحمي بصلاحية HR → 403 لمستخدم CRM | impairing | structural | تطبيع RBAC | م2 |
| CRM-004 | CRM | dead | `POST /opportunities/:id/activities` موجود بلا واجهة؛ صفحة النشاطات فارغة | impairing | structural | — | م2 |
| CRM-005 | CRM | dead | نقطة التحويل المعتمدة `POST /opportunities/:id/convert` يتيمة | impairing | structural | CRM-006 | م2 |
| CRM-001 | CRM | mismatch | KPI «الفرص المكسوبة» يقرأ `wonOpportunities` غير المُرجَع → 0 دائمًا | impairing | narrow | — | م3 |
| CRM-002 | CRM | mismatch | نموذج الإنشاء يتيح مراحل `closed_won/closed_lost` يرفضها الخادم 409 | impairing | narrow | — | م3 |
| CRM-008 | CRM | mismatch | صفحة العملاء تعرض `assignedToName`/`status` لا يُرجِعهما `GET /clients` | impairing | narrow | — | م3 |
| CRM-009 | CRM | mismatch | إنشاء العميل يرسل `classification:""` خارج enum فيفشل zod | impairing | narrow | — | م3 |
| CRM-011 | CRM | scaling | `GET /crm/opportunities` يتجاهل `page/limit` ويفرض `LIMIT 500` | impairing | structural | — | م4 |
| CRM-015 | CRM | scaling | `GET /clients/:id` ينفّذ 8 استعلامات تجميعية لكل طلب | impairing | structural | — | م4 |
| SUP-006 | Support | conflict | محدد الحالة يسمح بأي انتقال؛ الخادم يطبّق قائمتين متعارضتين | impairing | structural | SUP-016 | م2 |
| SUP-015 | Support | conflict | ثلاثة مسارات تكتب `slaBreached`/`priority` بقواعد تصعيد مختلفة | impairing | structural | SUP-016 | م2 |
| SUP-016 | Support | duplicate | مخطط انتقالات التذكرة معرّف مرتين متباعدتين | impairing | structural | — | م2 |
| SUP-001 | Support | mismatch | تبويب CSAT يقرأ حقولًا لا يُصدّرها `GET /csat` → أصفار وأسماء undefined | impairing | narrow | — | م3 |
| SUP-004 | Support | dead | `ApprovalActions` يستهدف `PATCH /tickets/:id/approve` غير الموجود → 404 | impairing | narrow | — | م3 |
| SUP-009 | Support | dead | `POST /tickets/:id/field-visit` ميزة كاملة بلا زر واجهة | impairing | narrow | — | م3 |
| SUP-011 | Support | conflict | `/replies` يستخدم `disableBranchScope` بينما `/tickets` يفرض scope الفرع | impairing | narrow | — | م3 |
| SUP-012 | Support | dead | `POST /tickets/:id/csat` بلا واجهة؛ استبيان البريد بلا رابط عامل | impairing | narrow | SUP-001 | م3 |
| SUP-007 | Support | scaling | `GET /tickets` يفرض `LIMIT 500` مع ترقيم وهمي | impairing | structural | — | م4 |
| COM-001 | Communications | dead | `PATCH/DELETE /communications/log/:id` معالجان سليمان بلا واجهة | impairing | structural | — | م2 |
| COM-002 | Communications | dead | `POST/DELETE /routing-rules` بلا واجهة → لا إنشاء قاعدة توجيه | impairing | structural | — | م2 |
| COM-011 | Communications | mismatch | تبويبات السجل ترسل `page` والمعالِجات تقرأ `offset` فقط → تصفّح معطّل | impairing | structural | — | م2 |
| COM-016 | Communications | duplicate | مسارا `/preferences` متعارضان؛ `ON CONFLICT` رباعي لا يطابق القيد الثلاثي → كل إدراج عبره يفشل | impairing | structural | — | م2 |
| COM-004 | Communications | dead | `letters-create` يتجاهل query params الواردة من 3 صفحات؛ `backPath` ميت | impairing | narrow | COM-003 | م3 |
| COM-005 | Communications | dead | زر «رد» المراسلات يُنشئ ردًّا بلا نموذج محتوى | impairing | narrow | — | م3 |
| COM-006 | Communications | dead | زر «تعديل» المراسلة يوجّه إلى `/correspondence/:id/edit` غير المُسجَّل | impairing | narrow | — | م3 |
| COM-007 | Communications | mismatch | زر التعديل يستخدم moduleKey `comms` بدل featureKey `communications` → محجوب | impairing | narrow | COM-006 | م3 |
| COM-008 | Communications | dead | `mark-all-read` بلا زر؛ الواجهة لا تستعمل تصفّح cursor | impairing | narrow | — | م3 |
| COM-009 | Communications | dead | توكن تحقّق واتساب يسقط على ثابت منشور `ghayth_erp_verify` | impairing | narrow | — | م3 |
| COM-010 | Communications | mismatch | `pbxStatusSchema.answeredBy` نص بينما العمود `integer` → خطأ نوع | impairing | narrow | — | م3 |
| COM-012 | Communications | scaling | `GET /correspondence` يُرجع `LIMIT 200` ثابتًا بلا تصفّح | impairing | structural | — | م4 |
| FND-003 | Foundation | duplicate | 68 قراءة `process.env` متناثرة تنقض عقد «المصدر الوحيد» في `config.ts` | impairing | structural | — | م2 |
| FND-004 | Foundation | mismatch | routers حسّاسة مُركَّبة بلا `requireModule`/`requireMinLevel` | impairing | structural | — | م2 |
| FND-008 | Foundation | dead | فشل cron يُسجَّل ولا يُنبَّه ولا واجهة إعادة تشغيل | impairing | structural | — | م2 |
| FND-010 | Foundation | duplicate | كتالوجا RBAC متوازيان (مسطّح / شجري) | impairing | structural | — | م2 |
| FND-002 | Foundation | duplicate | `/api/settings/display` يفكّ JWT يدويًا بدل `verifyToken` | impairing | narrow | — | م3 |
| FND-005 | Foundation | conflict | `GET /events/log` و`/log/stats` بلا أي بوّابة دور | impairing | narrow | — | م3 |
| FND-006 | Foundation | scaling | `auditMiddleware.ENTITY_MAP` يغطّي 42 بادئة ويُغفل 6+ وحدات | impairing | structural | — | م4 |
| FND-007 | Foundation | scaling | أحداث غير حرجة بلا listener تُفقَد عند `PERSIST_ALL_EVENTS=false` | impairing | narrow | — | م4 |
| FND-012 | Foundation | scaling | `push_subscriptions.endpointEncrypted` موجود لكن الكتابة بنصّ صريح | impairing | narrow | — | م4 |
| FND-013 | Foundation | scaling | `buildScopedWhere` غير متبنّى — 68 محمول `companyId` يدوي عبر 17 ملفًا (#685) | impairing | structural | — | م4 |

---

## 3. العيوب التجميلية (cosmetic) — 64 عيبًا — الموجة 4

| ID | المسار | النوع | الوصف الموجز | الخطورة | التعقيد | التبعية | الموجة |
|---|---|---|---|---|---|---|---|
| HR-006 | HR | dead | `salary-components` صفحة إنشاء فقط — لا تعديل/حذف | cosmetic | narrow | — | م4 |
| HR-007 | HR | mismatch | `gracePeriod` يُرسَل ولا يُدرَج في INSERT الورديات | cosmetic | narrow | — | م4 |
| HR-008 | HR | mismatch | `objectives`/`targetAudience` يُسقطهما INSERT التدريب | cosmetic | narrow | — | م4 |
| HR-009 | HR | mismatch | KPI «نشطة» يقرأ `stats.active` غير المُرجَع → صفر | cosmetic | narrow | — | م4 |
| HR-011 | HR | dead | endpoints بلا زر (DELETE payroll/violation، leave cancel/escalate) | cosmetic | narrow | — | م4 |
| HR-012 | HR | duplicate | `/development-plans` مجرّد `export from "./idp"` | cosmetic | narrow | — | م4 |
| HR-016 | HR | duplicate | السلفة في جدولين متوازيين `loan_accounts` و`hr_employee_loans` | cosmetic | structural | — | م4 |
| HR-014 | HR | scaling | جداول السلف/الإخلاء تُنشأ بـ`CREATE TABLE IF NOT EXISTS` وقت التشغيل | impairing | structural | — | م4 |
| HR-015 | HR | scaling | 5 جداول دورة حياة بلا graph مُسجَّل في `lifecycleEngine` | impairing | structural | HR-003 | م4 |
| FIN-012 | Finance | dead | `accountsRouter /journal` كود ميت مُظلَّل | cosmetic | narrow | — | م4 |
| FIN-018 | Finance | mismatch | الإجراء الجماعي لأوامر الشراء يرسل `purchase-order` غير الموجود في `tableMap` | cosmetic | narrow | — | م4 |
| FIN-019 | Finance | duplicate | `PATCH /invoices/:id/approve` صار مسارًا ميتًا يُرحّل بلا GL | cosmetic | narrow | — | م4 |
| FIN-020 | Finance | duplicate | `convert` و`convert-to-po` لتحويل طلب الشراء | cosmetic | narrow | — | م4 |
| FIN-023 | Finance | dead | `POST /custodies/:id/settle` بلا مستهلك | cosmetic | narrow | — | م4 |
| FIN-024 | Finance | dead | 12+ نظامًا فرعيًا ماليًا بلا واجهة (FX/dunning/memos/payment-run/GRN...) | cosmetic | strategic-decision | قرار مالك | م4 |
| FIN-025 | Finance | scaling | توقّع التدفقات 60/90 يومًا يعيد رقم 30 يومًا؛ `?period=` مُتجاهَل | cosmetic | narrow | — | م4 |
| FIN-027 | Finance | dead | `FileDropZone` تجميلي على 6 صفحات إنشاء مالية | cosmetic | narrow | — | م4 |
| UMR-004 | Umrah | dead | `GET /unassigned` و`POST /assign-bulk` بلا واجهة | cosmetic | narrow | — | م4 |
| UMR-007 | Umrah | dead | `PATCH/DELETE /groups` و`DELETE /attachments` تكتب audit بلا event | cosmetic | narrow | — | م4 |
| UMR-008 | Umrah | mismatch | صفحتا تفاصيل الباقة/الموسم تقرآن حقولًا بلا أعمدة → «—» | cosmetic | narrow | — | م4 |
| UMR-010 | Umrah | dead | `reconciliation` لا تمرّر `seasonId` رغم عمل الفلتر خلفيًا | cosmetic | narrow | — | م4 |
| UMR-011 | Umrah | dead | `sub-agents/unlinked` يحسب `seasonId` في فرع `if` فارغ | cosmetic | narrow | — | م4 |
| UMR-013 | Umrah | dead | لا تعديل/حذف لفاتورة الوكيل ولا `PATCH/DELETE /agent-invoices/:id` | cosmetic | narrow | — | م4 |
| UMR-014 | Umrah | duplicate | صفحتا استيراد متوازيتان؛ `/umrah/import/batches` غير مستخدَم | cosmetic | narrow | — | م4 |
| UMR-017 | Umrah | dead | `GET /letters/:id/pdf` و`POST /letters/:id/dispatch` بلا واجهة | cosmetic | narrow | — | م4 |
| UMR-018 | Umrah | scaling | `GET /transport/:id` join بلا ترقيم؛ قوائم العمرة `LIMIT 500` ثابت | cosmetic | narrow | — | م4 |
| UMR-019 | Umrah | conflict | cron overstay يُدرج `umrah_violations` بـ`branchId=0` حرفية | cosmetic | narrow | — | م4 |
| PROP-007 | Properties | dead | شاشة إنشاء الوحدة ترسل `notes` يُسقطه الـ schema | cosmetic | narrow | PROP-006 | م4 |
| PROP-009 | Properties | dead | رابط `/buildings/:id/edit` لمسار غير مُسجَّل | cosmetic | narrow | — | م4 |
| PROP-012 | Properties | dead | `DELETE /units/:id` بلا زر حذف | cosmetic | narrow | — | م4 |
| PROP-013 | Properties | dead | `DELETE /contracts/:id` بلا زر حذف | cosmetic | narrow | — | م4 |
| PROP-016 | Properties | dead | `contract-detail` يمرّر `?contractId=` يتجاهله `/maintenance` و`/inspections` | cosmetic | narrow | — | م4 |
| PROP-017 | Properties | duplicate | `POST /maintenance` تكرار مبسّط لـ`POST /maintenance-requests` | cosmetic | narrow | — | م4 |
| PROP-018 | Properties | mismatch | `PATCH /owners/:id` يستدعي `createAuditLog` بلا `before/after` | cosmetic | narrow | — | م4 |
| PROP-021 | Properties | scaling | `GET /contracts` و`/payments` بحدّ `LIMIT 500` ثابت بلا ترقيم | cosmetic | narrow | — | م4 |
| PROP-022 | Properties | mismatch | توزيع الفنّي يقرأ `tech.specialty` والعمود `speciality` | cosmetic | narrow | — | م4 |
| FLT-005 | Fleet | mismatch | حقل `status` في إنشاء المركبة يُرسَل ويُثبَّت `available` | cosmetic | narrow | — | م4 |
| FLT-007 | Fleet | dead | `PATCH /preventive-plans/:id` كامل الوظيفة بلا زر تعديل واجهة | cosmetic | narrow | — | م4 |
| FLT-009 | Fleet | dead | نموذجا الصيانة/التأمين يرفعان `attachments` بلا schema/تخزين | cosmetic | narrow | — | م4 |
| FLT-011 | Fleet | dead | endpoints دورة حياة الرحلة/الصيانة (complete/cancel/delete) بلا واجهة | cosmetic | narrow | FLT-001 | م4 |
| FLT-013 | Fleet | scaling | تفاصيل السائق تجلب كامل `/fleet/vehicles` لتحديد المركبة المسندة | cosmetic | structural | — | م4 |
| WH-005 | Warehouses | mismatch | `suppliers-create` يرسل `paymentTerms:""` → 0 يُبطل افتراضي 30 | cosmetic | narrow | — | م4 |
| WH-012 | Warehouses | duplicate | helper `updateWeightedAverageCost` موحَّد لكنه غير مُستدعى — شبه ميت | cosmetic | narrow | — | م4 |
| PRJ-009 | Projects | dead | `createProjectSchema` يدعم `phases[]` بلا حقل في نموذج الإنشاء | cosmetic | narrow | — | م4 |
| PRJ-010 | Projects | mismatch | قائمة حالات المخاطر تُغفل الحالة `realized` المعرَّفة خلفيًا | cosmetic | narrow | — | م4 |
| PRJ-011 | Projects | mismatch | `POST /:id/close` يستقبل `{reason}` و`closeProjectSchema` فارغ → يُهمَل | cosmetic | narrow | — | م4 |
| CRM-007 | CRM | dead | `opportunity-detail` `backPath="/crm/opportunities"` مسار غير مُسجَّل | cosmetic | narrow | — | م4 |
| CRM-010 | CRM | dead | `client-detail` `backPath="/crm/clients"` مسار غير مُسجَّل | cosmetic | narrow | — | م4 |
| CRM-012 | CRM | dead | 3 نقاط خلفية يتيمة (`followup-check`/`analytics`/`auto-create`) | cosmetic | structural | — | م4 |
| CRM-014 | CRM | duplicate | خريطة `STAGE_LABELS` مكرّرة في 3 ملفات | cosmetic | narrow | — | م4 |
| SUP-002 | Support | mismatch | محدد «الحالة» في إنشاء التذكرة لا يُرسَل ولا يقبله الـ schema | cosmetic | narrow | — | م4 |
| SUP-003 | Support | duplicate | صفحة `support/kb.tsx` مكرّرة وظيفيًا لتبويب KB | cosmetic | narrow | — | م4 |
| SUP-005 | Support | mismatch | التعديل السطري يعرض مجموعة قيم أولوية/حالة مختلفة عن الخادم | cosmetic | narrow | SUP-006 | م4 |
| SUP-008 | Support | dead | `POST /tickets/check-sla` بلا واجهة؛ يكرّره الـ cron | cosmetic | narrow | — | م4 |
| SUP-010 | Support | dead | `billableAmount` يُشغّل ترحيلًا محاسبيًا بلا واجهة ترسله | cosmetic | narrow | — | م4 |
| SUP-013 | Support | dead | `GET /kb/:id` بلا صفحة تفاصيل مقال | cosmetic | narrow | — | م4 |
| SUP-014 | Support | dead | `POST /kb/:id/feedback` بلا أزرار 👍/👎 | cosmetic | narrow | SUP-013 | م4 |
| SUP-017 | Support | conflict | `schema_pre.sql` يفتقد `support_tickets.branchId` رغم migration 171 | cosmetic | narrow | — | م4 |
| COM-013 | Communications | conflict | قراءة التفضيلات بـ`notifications:list` والحفظ بـ`admin:update` | cosmetic | narrow | — | م4 |
| COM-014 | Communications | dead | `PUT /fallback-chains/:id` بلا واجهة | cosmetic | narrow | — | م4 |
| COM-015 | Communications | dead | `GET /notifications/unread-count` غير مُستهلَك (احتساب محلي) | cosmetic | narrow | — | م4 |
| COM-017 | Communications | mismatch | زر الطباعة يمرّر `entityType="official_letter"` لكيان `correspondence` | cosmetic | narrow | — | م4 |
| FND-009 | Foundation | mismatch | مسارات GET في gov-integrations محروسة بـ`action:"update"` | cosmetic | narrow | — | م4 |
| FND-011 | Foundation | dead | `requireGovAdmin`/`requireGovRead` مُعرَّفتان وغير مُستخدَمتين | cosmetic | narrow | — | م4 |
| FND-014 | Foundation | conflict | إعادة تركيب `/request-catalog` تعيد كتابة `req.url` يدويًا — اقتران هشّ | cosmetic | narrow | — | م4 |
| FND-015 | Foundation | mismatch | `effectiveBranchId` يسقط إلى `0` ويتسرّب لمحمولات `branchId` | cosmetic | narrow | — | م4 |

---

## 4. ملاحظة على دقّة المصفوفة

عيوب التطابق المرتبطة بأعمدة مفقودة (`PROP-002/003/004`, `FLT-010`, `PRJ-001/003`, `WH-001/003`) تُؤكَّد ثابتًا بغياب العمود من `db/schema_pre.sql` **ومن كل المهاجرات الـ164 المُطبَّقة** (تحقّق مستقل بـ`grep`). تبقى الحاجة لتأكيد نهائي مقابل قاعدة بيانات حيّة (انظر قسم Runtime في كل ملف مساري) — وإن تأكّد الغياب فهو يكشف فجوة تغطية في حارس `check:schema-drift` (موثَّقة في `CROSS_TRACK_ANALYSIS.md` §FG4).

*انتهت المصفوفة — مخرَج المرحلة د. كل عيب صف واحد بمعرّف فريد. تدقيق ثابت فقط.*
