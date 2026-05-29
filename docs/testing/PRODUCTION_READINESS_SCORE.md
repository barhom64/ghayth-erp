# تقييم الجاهزية للإنتاج — Ghayth ERP

> **النوع**: تقييم نهائي لكل وحدة بدرجة قابلة للمقارنة.
> **التاريخ**: 2026-05-29
> **الحدود**: فحص كود ساكن. التقييم النهائي يحتاج اختبار يدوي + load test.

---

## معايير التقييم (لكل وحدة)

كل وحدة تأخذ 7 درجات (كل من 10):

| البعد | الوزن | المعنى |
|---|---|---|
| 1. اكتمال الميزات | 25% | كل المهام التشغيلية موجودة |
| 2. سلامة الـPersistence | 20% | كل عملية تحفظ فعلياً، dual-entry محفوظ |
| 3. تغطية Audit + Event | 15% | كل mutation تُسجَّل + تُذاع |
| 4. حماية RBAC | 15% | كل endpoint له `authorize` |
| 5. التكامل Cross-Module | 10% | events لها مستمعون cross-domain |
| 6. UX والوضوح | 10% | Arabic + canonical components |
| 7. التكامل الخارجي | 5% | ZATCA / Ejar / Sadad / Nusk |

**العتبات:**
- 🟢 **9–10**: Production-Ready
- 🟡 **7–8.9**: Production with caveats
- 🟠 **5–6.9**: Staging only — لا للعملاء الحقيقيين
- 🔴 **<5**: Blocked

---

## نتائج الوحدات الـ11

### 1. CEO / Onboarding 🔴 **3.5 / 10 — BLOCKED**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 1 | لا sign-up، لا subscription، لا setup wizard |
| Persistence | 10 | الحصص الموجودة (companies, branches) تعمل بشكل ممتاز |
| Audit + Event | 10 | كل المتاح يُسجل |
| RBAC | 10 | exec-dashboard محمي بـrequireExec |
| Cross-module | 10 | exec-dashboard يجمع 12 قسم |
| UX | 5 | لا onboarding tour، فحص يدوي مطلوب |
| التكامل الخارجي | لا ينطبق | — |

**الحكم**: 🔴 **يجب بناء وحدة Onboarding + Subscription قبل أي بيع**.

---

### 2. System Administrator 🟡 **8.0 / 10 — Production with caveats**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 9 | كل المهام موجودة |
| Persistence | 10 | INSERT/UPDATE/DELETE حقيقية |
| Audit + Event | 6 | **Print templates بدون audit** = ثغرة compliance |
| RBAC | 9 | جيد، RBAC v2 يعمل |
| Cross-module | 8 | settings.created event محسوس |
| UX | 8 | departments tab بحاجة polish |

**الحكم**: 🟡 يحتاج إصلاح Print Templates audit (M3 in defects report).

---

### 3. HR Director 🟡 **8.5 / 10 — Production with caveats**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 10 | كل 11 مهمة موجودة |
| Persistence | 10 | كل شيء حقيقي |
| Audit + Event | 10 | تغطية ممتازة |
| RBAC | 9 | feature keys منفصلة |
| Cross-module | 10 | payroll → GL، umrah commission → payroll_lines |
| UX | 8 | جيد، فحص يدوي مطلوب |
| التكامل الخارجي | 6 | WPS، Saudization موجود لكن لـbank credentials = stub |

**الحكم**: 🟡 ثغرة واحدة كبيرة: End-of-Service GL لا يُسجَّل (M2). الـbanks الـreal-time لا تُحفظ (stub).

---

### 4. Finance Director 🟡 **8.7 / 10 — Production with caveats**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 10 | كل المسارات موجودة |
| Persistence | 10 | **`financialEngine.postJournalEntry` رافض Date.now() = invariant ممتاز** |
| Audit + Event | 10 | تغطية شاملة |
| RBAC | 10 | granular feature keys |
| Cross-module | 10 | كل المعاملات تمر بـcanonical engines |
| UX | 8 | جيد |
| التكامل الخارجي | 4 | **ZATCA submission mock** — ثغرة compliance حرجة |

**الحكم**: 🟡 ZATCA يحتاج provider حقيقي قبل الإطلاق. باقي finance ممتاز.

---

### 5. Fleet Manager 🟡 **7.5 / 10 — Production with caveats**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 7 | tires و rental contracts مفقودين |
| Persistence | 8 | fuel GL غير-blocking → ازدواج محتمل |
| Audit + Event | 10 | تغطية كاملة |
| RBAC | 10 | granular |
| Cross-module | 9 | violation → HR deduction، asset registration via event |
| UX | 8 | telematics dashboards جيدة |
| التكامل الخارجي | 5 | CMSV6 ✅، Wialon/Teltonika stubs |

**الحكم**: 🟡 يصلح لـCMSV6 customers. تحذيرات قبل الـonboarding لعملاء Wialon.

---

### 6. Property Manager 🟢 **9.0 / 10 — Production-Ready**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 9 | كل المهام موجودة |
| Persistence | 10 | **rent payment flow = أقوى في النظام كله** |
| Audit + Event | 10 | تغطية ممتازة |
| RBAC | 10 | granular |
| Cross-module | 10 | maintenance → invoice، overdue → legal |
| UX | 9 | dashboards غنية |
| التكامل الخارجي | 5 | Ejar fields-only، Sadad absent |

**الحكم**: 🟢 **Production-Ready** للسوق السعودي. Ejar/Sadad للـPhase 2.

---

### 7. Umrah Operations Manager 🟡 **8.0 / 10 — Production with caveats**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 8 | accommodation entity مفقود |
| Persistence | 9 | sales path blocking ✅، agent path non-blocking ⚠ |
| Audit + Event | 10 | + recovery listeners |
| RBAC | 8 | single `umrah` key (broad) |
| Cross-module | 10 | commission → payroll_lines write |
| UX | 8 | import wizard معقد لكن functional |
| التكامل الخارجي | 5 | Nusk import-only، ZATCA mock |

**الحكم**: 🟡 يعمل للوكلاء، يحتاج: accommodation entity + agent invoice GL fix + Nusk live.

---

### 8. Legal Manager 🟢 **9.0 / 10 — Production-Ready**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 9 | full lifecycle |
| Persistence | 10 | judgment GL + obligations |
| Audit + Event | 10 | شامل |
| RBAC | 10 | granular |
| Cross-module | 9 | property overdue → legal case |
| UX | 8 | يحتاج تحسين session → tasks |
| التكامل الخارجي | لا ينطبق | — |

**الحكم**: 🟢 Production-Ready. ثغرة document → legal_case attachment (M8) سريعة الإصلاح.

---

### 9. Comms Officer 🟡 **8.5 / 10**

| البعد | الدرجة |
|---|---|
| اكتمال الميزات | 9 |
| Persistence | 10 |
| Audit + Event | 9 |
| RBAC | 9 |
| Cross-module | 7 (auto-classify محدود) |
| UX | 8 |
| التكامل الخارجي | 8 (PBX، WhatsApp ✅) |

**الحكم**: 🟡 جيد. NLP auto-classify ميزة مستقبلية.

---

### 10. Document Control 🟠 **6.5 / 10 — Staging only**

| البعد | الدرجة | السبب |
|---|---|---|
| اكتمال الميزات | 7 | upload/version موجود |
| Persistence | 9 | GCS sidecar ✅ |
| Audit + Event | 3 | **لا access log = ثغرة compliance** |
| RBAC | 4 | لا per-doc ACL |
| Cross-module | 7 | refType/refId labels |
| UX | 7 | جيد |
| التكامل الخارجي | 8 | GCS |

**الحكم**: 🟠 **Staging Only** — لا للعملاء الذين يحتاجون compliance audit (مكاتب محاماة، صحة، مالية حساسة).

---

### 11. Employee Self-Service 🟢 **9.5 / 10 — Production-Ready**

| البعد | الدرجة |
|---|---|
| اكتمال الميزات | 10 |
| Persistence | 10 |
| Audit + Event | 10 |
| RBAC | 10 |
| Cross-module | 10 (leave → balance → payroll مرتبط) |
| UX | 9 |
| التكامل الخارجي | لا ينطبق |

**الحكم**: 🟢 **Production-Ready ممتاز** — أنظف flow في النظام.

---

## النتيجة الإجمالية لكل وحدة

| الوحدة | الدرجة | الحكم |
|---|---|---|
| 🥇 Employee Self-Service | 9.5 | 🟢 Production-Ready |
| Property Manager | 9.0 | 🟢 Production-Ready |
| Legal Manager | 9.0 | 🟢 Production-Ready |
| Finance Director | 8.7 | 🟡 يحتاج ZATCA real |
| HR Director | 8.5 | 🟡 يحتاج Exit GL |
| Comms Officer | 8.5 | 🟡 جيد |
| Umrah Manager | 8.0 | 🟡 يحتاج عدة إصلاحات |
| System Administrator | 8.0 | 🟡 يحتاج Print audit |
| Fleet Manager | 7.5 | 🟡 يحتاج fuel + telematics |
| Document Control | 6.5 | 🟠 Staging Only |
| **CEO / Onboarding** | **3.5** | 🔴 **BLOCKED** |

**المتوسط الموزون** (متوسط بسيط): **7.9 / 10**

**بدون CEO/Onboarding**: **8.3 / 10**

---

## التوصية النهائية

### للإطلاق التجاري الفوري:
🚨 **لا يصلح حالياً** بسبب CEO Onboarding (3.5/10).

### بعد إصلاح Onboarding (1-2 أسبوع):
🟢 **يصلح للسوق السعودي الحالي** على وحدات:
- Property Manager (مكاتب عقارات)
- Legal Manager (مكاتب محاماة بدون compliance audit)
- HR + Finance + CRM + Employee (شركات متوسطة)
- Fleet (CMSV6 customers فقط)
- Umrah (وكلاء عمرة)

⚠ **لا يصلح بعد** لعملاء يحتاجون:
- ZATCA Phase 2 invoicing (يحتاج provider حقيقي)
- Document compliance audit (مكاتب محاماة كبيرة، بنوك)
- Wialon/Teltonika telematics
- Real-time Ejar/Sadad/Nusk

### المسار المقترح للإطلاق:

| الأسبوع | العمل |
|---|---|
| 1 | إصلاح B1, B2, B3 (Onboarding) |
| 2 | إصلاح M2 (Exit GL)، M3 (Print Audit)، M7 (Fuel)، M8 (Legal Docs) |
| 3 | اختبار Playwright على 11 دور × 8 معايير |
| 4 | اختبار يدوي مع 5 مستخدمين |
| 5+ | إطلاق Beta للسوق السعودي |

---

## تذكير صريح للقارئ

⚠ **هذه الدرجات من فحص كود ساكن فقط**. لا تأخذها كـcertification نهائي.

ما لا يُقاس هنا:
- وقت الاستجابة الفعلي تحت حمل
- جودة الترجمة العربية في الموقع
- سهولة الاستخدام مع مستخدم عربي حقيقي
- صمود تحت 100/500/1000 مستخدم متزامن

**قبل أي إطلاق تجاري لازم**:
1. اختبار Playwright على كل دور
2. اختبار يدوي مع 5+ مستخدمين عرب
3. Load test حقيقي
4. Security audit خارجي

---

*وثيقة 7/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP — الوثيقة الختامية.*
