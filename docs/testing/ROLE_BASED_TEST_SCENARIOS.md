# سيناريوهات اختبار حسب الدور — Ghayth ERP

> **النوع**: تقييم 86 مهمة عبر 11 دور بناءً على فحص ساكن.
> **التاريخ**: 2026-05-29
> **التصنيف**: ✅ REAL / 🟡 PARTIAL / 🔴 STUB / 🚫 NO-UI / ❌ NO-HANDLER

---

## 1. CEO Simulator (مالك / مدير عام)

| المهمة | الحالة | تفصيل |
|---|---|---|
| تسجيل / إنشاء شركة جديدة | 🚨 **BLOCKER** | لا UI، `/auth/register` يرد 405 |
| تفعيل الاشتراك | 🚨 **BLOCKER** | لا توجد وحدة subscription أصلاً |
| إعداد النظام لأول مرة | 🚨 **BLOCKER** | `bootstrapAdminUser` يخرج إذا companies فارغة |
| مراجعة التقارير التنفيذية | ✅ REAL | `/exec-dashboard/overview` — 12 قسم متوازي مع `requireExec` |
| مراجعة الصلاحيات | ✅ REAL | `/admin/rbac-matrix` — قراءة كاملة |
| مراجعة لوحات المؤشرات | ✅ REAL | `/dashboard` + `/bi/ceo-dashboard` |

**خلاصة**: المالك **لا يستطيع** تأسيس الشركة بدون مطور. بعد التأسيس، كل شيء جاهز.

---

## 2. System Administrator

| المهمة | الحالة | تفصيل |
|---|---|---|
| إعداد النظام العام | ✅ REAL | `/settings` KV + system-controls، audit + event |
| إنشاء الفروع | ✅ REAL | `branches-tab.tsx` → `POST /settings/branches` |
| إنشاء الإدارات | 🟡 MINOR | يستخدم `CrudSection` generic — 3 حقول فقط |
| إنشاء الأدوار classic | ✅ REAL | `/admin/roles` + permissions toggle |
| إنشاء الأدوار RBAC v2 | 🟡 MINOR | يكتب لـ`rbac_role_history` فقط — لا يظهر في `/admin/logs` |
| إنشاء المستخدمين | 🟡 MAJOR-UX | يطلب `employeeId` موجود مسبقاً، لا modal لإنشاء موظف |
| إدارة قوالب الطباعة | ⚠ **MAJOR** | يحفظ لكن **بدون** audit/event — صامت |
| إدارة قوالب الترقيم | 🟡 MINOR | audit موجود، event مفقود |

**خلاصة**: 7/8 يعمل. القوالب المطبوعة بحاجة إصلاح audit عاجل.

---

## 3. HR Director

| المهمة | الحالة | تفصيل |
|---|---|---|
| الهيكل التنظيمي (الإدارات) | 🟡 MINOR | يستخدم `settings` permission لا `hr.organization` |
| الوظائف / فرص العمل | ✅ REAL | `/recruitment/postings` — audit + event |
| الموظفين (إنشاء/تعديل) | ✅ REAL | `employees.ts:271` + audit + event |
| العقود | ✅ REAL | FSM كامل: draft→submitted→approved→signed→active→terminated/renewed |
| التوظيف (recruitment) | ✅ REAL | full pipeline |
| الحضور | ✅ REAL | check-in/check-out + auto deductions to payroll |
| الإجازات | ✅ REAL | 8 pre-validations + balance reservation + manager notif |
| الجزاءات (discipline) | ✅ REAL | numbered memos via numbering center |
| الأداء | ✅ REAL | KPI snapshots + dashboards |
| التدريب | ✅ REAL | training_courses + participants |
| نهاية الخدمة | ⚠ **MAJOR** | exit workflow يعمل لكن **GL settlement لا يُسجَّل** (engine موجود، route لا يستدعيه) |

**خلاصة**: 10/11 يعمل. End-of-service GL ثغرة محاسبية حقيقية.

---

## 4. Finance Director

| المهمة | الحالة | تفصيل |
|---|---|---|
| دليل الحسابات (CoA) | ✅ REAL | hierarchical mgmt |
| القيود اليدوية | ✅ REAL | عبر `financialEngine.postJournalEntry` |
| الموردين | ✅ REAL | full CRUD + vendor invoices |
| العملاء | ✅ REAL | full CRM CRUD |
| المصروفات | ✅ REAL | expense workflow → GL |
| الفواتير | ✅ REAL | sales + purchase + maintenance + property + umrah |
| الخزائن (treasuries) | ✅ REAL | treasury transfers + reconciliation |
| البنوك | ✅ REAL | bank reconciliation (correctly NO JE — only matchStatus flip) |
| التسويات | ✅ REAL | period close + year-end |
| الإقفالات | ✅ REAL | canonical helper `closeFiscalPeriod` |
| الميزانيات (budgets) | ✅ REAL | budget vs actual reports |
| الضرائب VAT / ZATCA | ⚠ **MAJOR** | `finance-zatca.ts:701`: sandbox returns synthetic clearance، production path لا يحتوي HTTPS call حقيقي لـFatoora |

**خلاصة**: 11/12 يعمل. ZATCA submission **mock افتراضياً** — يحتاج provider حقيقي قبل الإطلاق.

---

## 5. Fleet Manager

| المهمة | الحالة | تفصيل |
|---|---|---|
| المركبات | ✅ REAL | + asset registration request via event |
| السائقين | ✅ REAL | reuses `fleet.vehicles` permission |
| الرحلات | ✅ REAL | trip completion GL (4 lines: fuel+driver+depreciation+cash) |
| الوقود | ⚠ **MAJOR** | GL non-blocking — قد يحفظ بدون JE. **ازدواج محتمل** مع trip-complete estimate |
| الصيانة | ✅ REAL | lifecycle + GL on completion + next-service obligation |
| الإطارات | 🚫 **NO-UI** | لا توجد صفحة tires؛ تظهر فقط كـpreventive task type |
| المخالفات | ✅ REAL | blocking GL، driver deduction via event to HR |
| التأمين | ✅ REAL | GL on insurance: 1350 prepaid |
| العقود (تأجير مركبات) | ❌ **NO-UI + NO-HANDLER** | لا توجد |
| التقارير | ✅ REAL | + TCO per-vehicle |
| Telematics (CMSV6) | ✅ REAL | adapter حقيقي + HMAC + replay window |
| Telematics (Wialon/Teltonika) | 🔴 STUB | adapter يرد null، fallback لـmanual |

**خلاصة**: 9/12 يعمل. Tires UI مفقود، فلت rental contracts غير موجودة، Wialon stub، fuel double-counting risk.

---

## 6. Property Manager

| المهمة | الحالة | تفصيل |
|---|---|---|
| العقارات / المباني | ✅ REAL | + asset registration via event |
| الوحدات | ✅ REAL | state machine on status |
| العقود | ✅ REAL | يولّد جدول دفعات + نقل حالة الوحدة + obligations + numbering |
| المستأجرين | ✅ REAL | full CRUD + tenant letters |
| التحصيل (rent payments) | ✅ **EXCELLENT** | `withTransaction` + `FOR UPDATE` + GL-first + rollback safe |
| الصيانة | ✅ REAL | auto-assignment scoring + emergency keyword priority + invoice via event |
| الملاك + مدفوعاتهم (payouts) | ✅ REAL | blocking GL، unique period constraint |
| الودائع | ✅ REAL | blocking GL، hard-delete on failure |
| الفحوصات | ✅ REAL | inspections + occupancy reports |
| Ejar integration | 🟡 **MAJOR** | fields-only، لا API client حقيقي |
| Sadad integration | ❌ **NO-HANDLER** | غير موجود نهائياً |
| التقارير | ✅ REAL | statement + occupancy |

**خلاصة**: 10/12 ممتاز. **أقوى مسار في النظام كله**. Ejar/Sadad غير متكاملين فعلياً.

---

## 7. Umrah Operations Manager

| المهمة | الحالة | تفصيل |
|---|---|---|
| الموسم | ✅ REAL | + close-guard (active pilgrims, unpaid invoices) |
| الوكلاء | ✅ REAL | top-level + sub-agents |
| الباقات | ✅ REAL | full CRUD |
| المعتمرين | ✅ REAL | manual + import wizard |
| النقل | ✅ REAL | GL: Dr 5300 / Cr 2100 |
| السكن (accommodation) | 🚫 **NO-UI** | فقط نص hotelName على الـpilgrim |
| فواتير الوكلاء (commission) | 🟡 MAJOR | GL non-blocking — invoice قد يُحفظ بدون JE |
| فواتير المبيعات (sales) | ✅ EXCELLENT | blocking GL + VAT + dimensioned |
| الدفعات + التسويات | ✅ EXCELLENT | FIFO/explicit allocation، blocking GL |
| الغرامات (penalties) | ✅ REAL | engine + manual + GL |
| المخالفات | ✅ REAL | sub-agent violations |
| Commission plans | ✅ REAL | calculate + simulate + writeback to payroll |
| التقارير | ✅ REAL | daily runsheet + reconciliation + dashboard |
| Nusk integration | 🔴 import-only | لا API client حقيقي |
| ZATCA e-Invoice | 🟡 mock default | provider opt-in per company |

**خلاصة**: 11/14 يعمل. Accommodation كـentity مفقود، Nusk import-only، agent invoice GL non-blocking.

---

## 8. Legal Manager

| المهمة | الحالة | تفصيل |
|---|---|---|
| القضايا | ✅ REAL | + lifecycle + financial-risk roll-up |
| العقود | ✅ REAL | + renewal-alerts (90/30/14 days) |
| الجلسات | 🟡 PARTIAL | تُنشئ notification + obligation لكن لا task row |
| المذكرات | ✅ REAL | numbered via numbering center |
| المستندات (مرتبطة بـcases) | ⚠ **MAJOR-UX** | `legal_case` غير في allowed-type whitelist (`documents.ts:269`) — رفع مستند لقضية يفشل |
| الأحكام | ✅ REAL | settlement GL + appeal-deadline obligation |
| التقارير | ✅ REAL | KPI grid مع contingentLiabilities |

**خلاصة**: 6/7 يعمل. **document → legal_case attachment broken** — bug سيحبط المحامين.

---

## 9. Administrative Communications Officer

| المهمة | الحالة | تفصيل |
|---|---|---|
| الوارد (inbox) | ✅ REAL | mailboxSync ingestion (email/PBX/WhatsApp) |
| الصادر (outbox) | ✅ REAL | correspondence with numbering |
| الإحالات (referrals) | ✅ REAL | manual via `convert` endpoint → tasks/tickets/requests |
| الترقيم | ✅ REAL | central numbering center، atomic + per-branch + fiscal-year |
| التتبع | 🟡 MINOR | لا توجد `referral_chain` table — multi-hop forward يفقد intermediate steps |

**خلاصة**: 5/5 يعمل. Referral chain history ضعيف.

---

## 10. Document Control Officer

| المهمة | الحالة | تفصيل |
|---|---|---|
| الأرشفة | ✅ REAL | GCS via Replit sidecar (`objectStorage.ts`) |
| التصنيف | 🟡 MINOR | free-string، لا taxonomy enforcement |
| النسخ (versions) | ✅ REAL | cross-tenant fix at `documents.ts:397-407` |
| الصلاحيات | ⚠ **MAJOR** | لا per-document ACL — صلاحية على مستوى feature فقط |
| الاسترجاع (download/preview) | ⚠ **MAJOR** | لا `document_access_log` — downloads غير مُسجَّلة في audit |
| Retention policy | ❌ **MISSING** | غير موجودة |

**خلاصة**: 3/6 يعمل بشكل كامل. Access log + retention + per-doc ACL ثلاث ثغرات compliance.

---

## 11. Employee Simulator (موظف عادي)

| المهمة | الحالة | تفصيل |
|---|---|---|
| تسجيل الدخول | ✅ REAL | JWT + tokenVersion (PR #1386) |
| طلب إجازة | ✅ REAL | 8 validations + balance reservation + 2-stage chain |
| رفع مستند | ✅ REAL | GCS via sidecar |
| استعراض الراتب | ✅ REAL | `/my-space/payslip` |
| الحضور (check-in/out) | ✅ REAL | + late/early auto-deductions |
| الانصراف | ✅ REAL | (نفس check-out) |
| السلف | ✅ REAL | full loan workflow + GL on disbursement |
| الطلبات الإدارية | ✅ REAL | requests engine |

**خلاصة**: 8/8 يعمل. **Employee self-service journey كامل ومتكامل**.

---

## ملخص نسبة النجاح

| الدور | يعمل | جزئي/مشكلة | لا يعمل | المجموع |
|---|---|---|---|---|
| CEO | 3 | 0 | 3 (BLOCKERS) | 6 |
| System Admin | 5 | 3 | 0 | 8 |
| HR Director | 10 | 1 (MAJOR) | 0 | 11 |
| Finance Director | 11 | 1 (MAJOR ZATCA) | 0 | 12 |
| Fleet Manager | 9 | 1 (fuel) | 2 (tires, rental contracts) | 12 |
| Property Manager | 10 | 2 (Ejar/Sadad) | 0 | 12 |
| Umrah Manager | 11 | 2 (Nusk, agent invoice GL) | 1 (accommodation) | 14 |
| Legal Manager | 6 | 1 (session→task) | 0 | 7 |
| Comms Officer | 5 | 0 | 0 | 5 |
| Doc Control | 3 | 3 | 0 | 6 |
| Employee | 8 | 0 | 0 | 8 |
| **المجموع** | **81** | **14** | **6** | **101** |

**نسبة النجاح**: 80% REAL، 14% PARTIAL، 6% فعلياً مكسور.

أكبر ثغرة: **CEO Onboarding 3/6 BLOCKERS** = النظام **ليس self-service**.

---

*وثيقة 2/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP.*
