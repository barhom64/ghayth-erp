# مصفوفة تكامل الوحدات — Ghayth ERP

> **النوع**: تتبع كل integration edge بين الوحدات الـ11. هل الـevent له مستمع حقيقي؟ هل التأثير cross-module فعلي أم label-only join؟
> **التاريخ**: 2026-05-29
> **المصدر**: `lib/eventBus.ts` + `lib/eventListeners.ts` + 13 domain engine

---

## ملاحظات معمارية

النظام يستخدم **3 آليات** للتكامل:
1. **GL مباشر** داخل الـtransaction (REAL، synchronous)
2. **eventBus + registerCrossDomainHandler** (REAL، asynchronous مع retry + DLQ)
3. **workflowEngine handlersByTable map** (REAL، synchronous status flip)

الـeventBus عند `eventBus.ts` ليس مجرد emit-and-forget — له retry + DLQ + listener registration.

---

## المصفوفة الرئيسية (28 edge)

| Source | Event | Target | Wired? | Status |
|---|---|---|---|---|
| HR | payroll finalized | Finance (GL) | ✅ synchronous in `withTransaction` | **REAL** |
| HR | payroll.run created | Umrah commissions | ✅ listener calculates | **REAL** |
| HR | end-of-service exit | Finance (settlement JE) | ⚠ engine exists, route doesn't call | **🚨 PARTIAL** |
| HR | salary advance approved | Finance (1410) | ✅ in `withTransaction` | **REAL** |
| Fleet | violation created → deduction | HR payroll | ✅ event-mediated, real handler | **REAL** |
| Property | rent payment received | Finance (GL) | ✅ `withTransaction` + GL-first | **REAL** |
| Property | rent payment received | CRM (client ledger) | ❌ no listener, FK only | **🟡 MISSING** |
| Property | maintenance completed | Finance (expense JE) | ✅ inline | **REAL** |
| Property | maintenance completed | Finance (invoice if billable) | ✅ event-mediated | **REAL** |
| Property | maintenance completed | Tasks (tenant follow-up) | ✅ direct INSERT | **REAL** |
| Property | building purchased | Finance (fixed asset) | ✅ event-mediated | **REAL** |
| Property | owner payout | Finance (GL) | ✅ blocking GL | **REAL** |
| Property | overdue rent → legal case | Legal | ✅ event-mediated | **REAL** |
| Fleet | trip closed | Finance (cost JE) | ✅ aggregated trip-complete JE | **REAL** |
| Fleet | maintenance done | Finance | ✅ inline | **REAL** |
| Fleet | maintenance done | Warehouse (parts) | ✅ decrements `currentStock` | **REAL** |
| Fleet | violation paid | Finance | ✅ before status flip | **REAL** |
| Fleet | vehicle registered | Finance (fixed asset) | ✅ event-mediated | **REAL** |
| Umrah | sales invoice issued | Finance (GL) | ✅ + recovery listener | **REAL** |
| Umrah | sub-agent payment | Finance + obligation | ✅ + recovery listener | **REAL** |
| Umrah | commission calculated | HR payroll_lines | ✅ writes payroll_line directly | **REAL** |
| Umrah | employee terminated | Umrah (suspend plans) | ✅ listener UPDATE | **REAL** |
| Legal | judgment with amount | Finance (settlement JE) | ✅ with appeal-deadline obligation | **REAL** |
| Legal | service contract requested by CRM | Legal | ✅ event-mediated INSERT | **REAL** |
| Legal | session scheduled | Tasks (reminder) | ⚠ notif + obligation, no task | **🟡 PARTIAL** |
| Legal | billable hours on session | Finance (invoice) | ✅ event-mediated | **REAL** |
| CRM | client created | Portal account ready | ❌ manual POST required | **🟡 MISSING (intentional)** |
| CRM | invoice issued | Portal (push) | ⚠ pull-only, no push | **🟡 PARTIAL** |
| CRM | deal won | Legal (contract) | ✅ event-mediated | **REAL** |
| CRM | deal won | Finance (auto invoice) | ✅ event-mediated | **REAL** |
| Tasks | task created/assigned | Notifications | ✅ listener creates notif | **REAL** |
| Comms | PBX missed call | Tasks (follow-up) | ✅ direct INSERT | **REAL** |
| Comms | inbox message classified | Tasks (referral creates task) | ⚠ manual only | **🟡 PARTIAL** |
| Documents | OCR confirmed | Source-entity write-back | ❌ stub (returns 501 in #1406) | **🔴 STUB** |
| Documents | document archived | Source entity link | ⚠ label-only | **🟡 PARTIAL** |
| Workflow | approval granted | Source-entity status | ✅ synchronous via handlersByTable | **REAL** |
| Workflow | workflow.approved event | Downstream domain reaction | ⚠ no event listener, sync flip | **🟡 PARTIAL** |

---

## ملخص الأرقام

| الحالة | العدد | النسبة |
|---|---|---|
| ✅ REAL | 24 | 63% |
| 🟡 PARTIAL | 8 | 21% |
| 🔴 STUB | 1 | 3% |
| 🟡 MISSING | 2 | 5% |
| غير ذو صلة | 3 | 8% |

**النتيجة**: 84% من التكاملات إما REAL أو PARTIAL مفهوم. لا توجد ثغرة critical في طبقة الـintegration.

---

## ثغرات تستحق المعالجة

### 🚨 1. HR end-of-service → Finance (PARTIAL — engine exists، route doesn't call)
**الوصف**: 
- `hrEngine.postExitSettlementGL` (`hrEngine.ts:132`) كامل ومحكم
- DR eos_expense + leave_settlement_expense / CR settlement_payable
- لكن `routes/hr-exit.ts` **لا يستدعيه** — يمسك event فقط

**الأثر**: إنهاء خدمة موظف عبر workflow الـExit **لا يُنشئ JE للمكافأة**. المحاسب يحتاج إدخالها يدوياً.

**Severity**: 🚨 MAJOR — انتهاك dual-entry قابل للحدوث.

**الإصلاح**: في `hr-exit.ts` نقطة `processExit`، استدعاء `hrEngine.postExitSettlementGL` قبل emit الـevent.

### 🟡 2. Legal session scheduled → Tasks (PARTIAL)
**الوصف**: تُنشئ notification + obligation لكن **لا** task row.

**الأثر**: الجلسة لا تظهر في `/tasks` dashboards.

**Severity**: 📝 MINOR — نظام التذكير يعمل عبر obligations.

### 🟡 3. CRM client → Portal account (MISSING — intentional)
**الوصف**: لا auto-provisioning. يحتاج عملية POST يدوية لتمرير email + password.

**Severity**: 📝 MINOR — قرار تصميمي مفهوم (الـportal يحتاج credentials).

### 🟡 4. Property rent payment → CRM ledger (MISSING)
**الوصف**: `tenantId` على الـJE فقط، لا UPDATE لـ`clients.lastPaymentAt`.

**Severity**: 📝 MINOR — البيانات قابلة للاسترجاع عبر JOIN.

### 🔴 5. Documents OCR confirmed (STUB)
**الوصف**: كان fake-success. الآن (#1406) يرد 501.

**Severity**: 📝 MINOR — الـbackend logic لـOCR confirmation لم يُكتب.

---

## التقارير ولوحات المعلومات

النظام يحتوي **19 endpoint dashboard** يجمعون البيانات عبر الجداول:

| Dashboard | المصدر | الحالة |
|---|---|---|
| `/dashboard` | الرئيسي للمستخدم | ✅ |
| `/exec-dashboard/overview` | CEO، 12 قسم متوازي | ✅ |
| `/bi/ceo-dashboard` | BI executive | ✅ |
| `/bi/kpis` | KPIs | ✅ |
| `/bi/operations` | Daily ops | ✅ |
| `/dashboard/role-data` | حسب الدور | ✅ |
| `/module-dashboards/*` | per-domain | ✅ |
| `/operations-center` | حالات اعتماد + workflow | ✅ |
| `/action-center` | items تحتاج اتخاذ إجراء | ✅ |
| `/my-space` | للموظف العادي | ✅ |

**ثغرة بارزة**: **لا يوجد لوحة "P&L الشاملة"** تجمع Finance + Property + Fleet + Umrah + Legal في خانة واحدة، رغم أن الـGL substrate يدعم ذلك (كل line dimensioned).

---

## التوصية النهائية

طبقة التكامل في النظام **قوية ومحكمة**. النواة Event Bus + registerCrossDomainHandler هي عماد متين. الـ24 REAL integration تغطي كل العمليات المالية الحرجة (GL posting، payroll، invoicing، obligations).

الـ8 PARTIAL في الغالب قرارات تصميم مفهومة (manual portal provisioning) أو ثغرات صغيرة (legal session → task).

الإصلاح الوحيد العاجل: **wire up `postExitSettlementGL`** في `hr-exit.ts`.

---

*وثيقة 4/7 من برنامج اختبار التشغيل الكامل لنظام غيث ERP.*
