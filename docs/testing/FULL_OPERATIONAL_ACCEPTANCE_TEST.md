# Full Operational Acceptance Test — برنامج اختبار التشغيل الكامل لـنظام غيث

> **الهدف:** إثبات أن نظام غيث ERP قادر على تشغيل مؤسسة حقيقية بالكامل — من أول تسجيل شركة حتى آخر عملية تشغيلية — دون تدخل المطور أو تعديل يدوي للبيانات.
>
> **المنهجية:** Black-Box Testing عبر الواجهة الأمامية فقط. لا قاعدة بيانات، لا APIs مباشرة، لا تعديل يدوي.

---

## ⚠ تحفظ صريح — اقرأ قبل التقدم

هذه الوثيقة وأخواتها الست **ليست تقرير اختبار يدوي بالمتصفح**. هي **تقييم جاهزية على مستوى الكود** (Code-Level Readiness Assessment) أُنتج بفحص ساكن (static analysis) لكل صفحة UI، تتبع كل استدعاء `useApiMutation` إلى الـbackend handler، والتحقق من:

- وجود الصفحة فعلياً (ليس مجرد route مسجل)
- وصول الزر إلى handler حقيقي (ليس stub يرد 501 الآن)
- تنفيذ الـpersistence فعلياً (INSERT / UPDATE حقيقي)
- إصدار `createAuditLog` و `emitEvent`
- وجود حماية RBAC مناسبة

**ما يثبت كل ذلك يصلح للاعتماد التشغيلي ولا يحتاج اختبار يدوي للتحقق من وجوده.**

**ما لا يستطيع الفحص الساكن إثباته** (ويجب اختباره يدوياً قبل الإطلاق التجاري):

| السؤال | لماذا يحتاج اختبار يدوي |
|---|---|
| هل الـUX سهل وواضح؟ | يحتاج تجربة مستخدم حقيقية |
| هل وقت الاستجابة مقبول؟ | يحتاج قياس فعلي |
| هل النظام يصمد تحت 1000 مستخدم؟ | يحتاج load testing |
| هل الرسائل العربية واضحة في الموقع؟ | يحتاج عيون مستخدم |
| هل المسار الكامل يعمل من البداية للنهاية؟ | يحتاج Playwright E2E |

**الخطوة التالية**: بناء اختبارات Playwright موجَّهة لكل ثغرة كُشفت في هذا التقرير.

---

## 1. منهجية التقييم

كل عملية تشغيلية تُقيَّم وفق **8 معايير قبول** (مأخوذة من طلب المالك):

| # | المعيار | كيف نتحقق منه ساكناً |
|---|---|---|
| 1 | تمت من الواجهة | وجود صفحة + زر يستدعي الـmutation |
| 2 | حفظت البيانات | تتبع الـhandler يصل لـrawExecute/INSERT |
| 3 | أمكن استرجاعها | وجود GET handler يقرأ الصف بنفس الـscope |
| 4 | ظهرت في التقارير | تتبع الجدول في query تقارير |
| 5 | سجل لها Audit | استدعاء `createAuditLog(...)` |
| 6 | أنتجت Event | استدعاء `emitEvent(...)` |
| 7 | احترمت الصلاحيات | `authorize({feature, action})` أو `requireMinLevel(N)` |
| 8 | أثرت على الحالة التشغيلية | إما إصدار JE في الـGL أو تغيير status موثوق |

العملية **تنجح بالكامل** فقط إذا حققت **الثمانية**. أي عملية تحقق 6 من 8 تُصنَّف **MAJOR**، أقل من 4 تُصنَّف **BLOCKER**.

---

## 2. الفرق المُحاكاة (Test Personas) — 11 دور

| # | الدور | الوحدات الرئيسية | حجم المهام |
|---|---|---|---|
| 1 | CEO / مالك / مجلس إدارة | Onboarding, Dashboards, RBAC, KPIs | 6 مهام |
| 2 | System Administrator | Branches, Users, Roles, Templates | 7 مهام |
| 3 | HR Director | Org structure, Employees, Payroll, Leave, Discipline | 11 مهمة |
| 4 | Finance Director | CoA, JE, Vendors, Customers, Invoices, Banks, Tax | 12 مهمة |
| 5 | Fleet Manager | Vehicles, Drivers, Trips, Fuel, Maintenance | 9 مهام |
| 6 | Property Manager | Properties, Units, Contracts, Tenants, Rent | 7 مهام |
| 7 | Umrah Ops Manager | Seasons, Agents, Packages, Pilgrims, Settlements | 10 مهام |
| 8 | Legal Manager | Cases, Contracts, Sessions, Memos | 6 مهام |
| 9 | Comms Officer | Inbox, Outbox, Referrals, Numbering | 5 مهام |
| 10 | Document Control Officer | Archive, Classify, Retrieve | 5 مهام |
| 11 | Employee | Login, Leave, Attendance, Salary view, Advance | 8 مهام |

**إجمالي**: 86 مهمة تشغيلية × 8 معايير قبول = **688 نقطة تحقق**.

---

## 3. مراحل الاختبار

| المرحلة | الاسم | الوصف | الحالة |
|---|---|---|---|
| 1 | First-Time Setup | من شاشة الاشتراك حتى تشغيل أول شركة | راجع `END_TO_END_USER_JOURNEYS.md` |
| 2 | Master Data Setup | شركة، فروع، إدارات، وظائف، مستخدمين | راجع `ROLE_BASED_TEST_SCENARIOS.md` |
| 3 | Daily Operations (30 يوم) | حضور، إجازات، رواتب، فواتير، رحلات | راجع `ROLE_BASED_TEST_SCENARIOS.md` |
| 4 | Cross-Module Operations | تكامل HR↔Finance، Property↔Finance، إلخ | راجع `MODULE_INTEGRATION_MATRIX.md` |
| 5 | Approval Chains | اعتماد، رفض، إحالة، تصعيد | راجع `END_TO_END_USER_JOURNEYS.md` |
| 6 | Security Testing | RBAC، اختراق أفقي ورأسي | راجع `CRITICAL_DEFECTS_REPORT.md` |
| 7 | UX Testing | سهولة، وضوح، عدد النقرات | راجع `UX_AND_USABILITY_REPORT.md` |
| 8 | Stress Testing | 50/100/500/1000 مستخدم | **يحتاج اختبار حقيقي خارج هذا التقرير** |

---

## 4. الوثائق الست المرافقة

| الوثيقة | المحتوى |
|---|---|
| `ROLE_BASED_TEST_SCENARIOS.md` | كل دور من الـ11 مع كل مهامه، نتيجة كل مهمة وفق المعايير الـ8 |
| `END_TO_END_USER_JOURNEYS.md` | رحلات كاملة (Onboarding، Employee leave-to-payroll، Property rent-to-GL، إلخ) |
| `MODULE_INTEGRATION_MATRIX.md` | مصفوفة تكامل بين الـ11 وحدة — هل الـevent له مستمع؟ |
| `UX_AND_USABILITY_REPORT.md` | ملاحظات UX من نمط الكود (مثل: زر "حفظ" بدون تأكيد، خطأ بدون رسالة عربية) |
| `CRITICAL_DEFECTS_REPORT.md` | الـbugs الواضحة: stubs، صفحات بدون backend، endpoints بدون UI، RBAC مفقود |
| `PRODUCTION_READINESS_SCORE.md` | الدرجة النهائية لكل وحدة + التوصية النهائية لكل وحدة (Production / Staging / Block) |

---

## 5. الرموز والتسمية

في الوثائق المرافقة:

| الرمز | المعنى |
|---|---|
| ✅ REAL | الحقل ينفّذ فعلياً (INSERT/UPDATE حقيقي) |
| 🟡 PARTIAL | ينفذ جزء من المتوقع (مثلاً يحفظ لكن بدون audit) |
| 🔴 STUB | يرد 501 الآن (`feature_not_implemented`) — صريح |
| 🟠 FAKE-SUCCESS | يرد `ok:true` بدون تنفيذ — خداع (تم إصلاحه في #1406) |
| ❌ NO-HANDLER | الـUI يستدعي endpoint غير موجود (404) |
| 🚫 NO-UI | الـbackend موجود لكن لا توجد واجهة تستدعيه |
| ⚠ NO-AUDIT | ينفّذ لكن بدون `createAuditLog` |
| ⚠ NO-EVENT | ينفّذ لكن بدون `emitEvent` |
| 🛡 NO-RBAC | endpoint بدون `authorize` (دفع للوصول) |

| Severity | المعنى |
|---|---|
| 🚨 BLOCKER | يمنع التشغيل التجاري — يجب إصلاحه قبل الإطلاق |
| ⚠ MAJOR | يقلل الموثوقية — يجب إصلاحه في الإصدار التالي |
| 📝 MINOR | تحسين بصري أو UX — يمكن تأجيله |

---

## 6. حدود الفحص الساكن

**ما يكشفه الفحص الساكن بدقة:**
- وجود/غياب الصفحة
- وصول الزر للـhandler الصحيح
- استدعاء audit/event/RBAC
- نوع الـpersistence (real/stub/fake)
- وجود/غياب تكامل بين الوحدات

**ما يحتاج اختبار يدوي/Playwright بعد ذلك:**
- ترتيب الحقول في النموذج
- وضوح الرسائل العربية في الموقع
- سرعة التحميل
- سهولة العثور على الميزة
- مسار الاعتماد بأكمله
- الاختبار تحت حمل حقيقي

**الخطوة التالية**: بعد قراءة الوثائق الست، نُشكِّل خطة Playwright تركز على:
1. كل BLOCKER في `CRITICAL_DEFECTS_REPORT.md`
2. كل journey في `END_TO_END_USER_JOURNEYS.md`
3. سيناريوهات الأدوار الأعلى نسبة وقوع في `ROLE_BASED_TEST_SCENARIOS.md`

---

## 7. التواقيع والاعتماد

| الدور | الموقّع | التاريخ | القرار |
|---|---|---|---|
| Test Lead (Static Analysis) | Claude | 2026-05-29 | راجع الـscore النهائي |
| Owner | إبراهيم | TBD | TBD |
| QA Lead (Manual + Playwright) | TBD | TBD | TBD |

---

*هذه الوثيقة جزء من برنامج اختبار التشغيل الكامل لنظام غيث ERP، نسخة 2026-05-29.*
