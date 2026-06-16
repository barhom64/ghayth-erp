# HR-REV-6 — مراجعة صفحات العرض

> **Issue:** [#2225](https://github.com/barhom64/ghayth-erp/issues/2225)
> **يبني على:** HR-REV-0 (§5 ملف 360، §7 اللوحات) · HR-REV-2 (الدمج) · HR-REV-3 (لوحة التفعيل)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14 · **الحالة:** read-only.

**مفتاح:** ✅ مثبت · 🔴 ناقص · 🚩 شكلي/مكرر.

---

## 0. الملخص

صفحات العرض الأساسية **موجودة وتشغيلية** (Command Center، 360، approval-inbox). الناقص: **لوحات تشغيل موحّدة** (Activation/Deficiencies/Access) وتحويل «صفحات tab الشكلية» إلى تبويبات 360.

---

## 1. جرد صفحات العرض — ✅

| الصفحة | تشغيلي/أرشيفي | الإجراء المتاح | الدور | القرار |
|--------|----------------|-----------------|-------|--------|
| `/hr` Command Center | تشغيلي (8 KPIs قابلة للنقر) | تنقّل + اعتماد | HR | **keep** |
| `/employees/:id` 360 (18 tab) | تشغيلي | تحرير + lifecycle | HR | **keep** (المركز الحقيقي) |
| `/employees` | تشغيلي | فلاتر + bulk + إنشاء | HR/مدير | **keep** |
| `/hr/approvals` inbox | تشغيلي | اعتماد/رفض موحّد | HR/مدير | **keep** |
| `employee-activation` | تشغيلي | تفعيل/تعليق/إنهاء | HR | **merge** → Activation Board |
| `onboarding-review` | تشغيلي | مهام | HR | **merge** → Activation Board |
| `expiring-documents` | تشغيلي (قائمة) | — | HR | **merge** → Deficiencies Board |
| `delegations`/`accruals` | عرض | — | HR | 🚩 **→ tab** (لا تشغيل جماعي) |

---

## 2. المراكز/اللوحات المطلوبة (الفجوات)

### 2.1 HR Command Center — موجود ✅ (يحتاج إثراء)
الموجود: 8 KPIs (موظفون/حضور/إجازات معلقة/آخر راتب/سلف/وقت إضافي/نهاية خدمة/مخالفات).
🔴 **إضافة:** موظفون قيد التفعيل · ناقص بيانات · عقود/وثائق تنتهي · عهد مفتوحة · صلاحيات غير متوافقة · تحقيقات معلقة.

### 2.2 Employee 360 — موجود ✅ (18 tab، HR-REV-0 §5)
المركز الحقيقي. القاعدة: ما هو tab هنا **لا يكون صفحة قائمة مستقلة** (مدخل قرارات الدمج HR-REV-2).

### 2.3 Activation Board — 🔴 ناقص (موحّد)
كل موظف قيد التفعيل: الناقص · المسؤول · منذ متى · SLA. (توحيد activation+onboarding — HR-REV-3 §5).

### 2.4 Role/Access Board — 🔴 ناقص
صلاحيات حسب المسمى · صلاحيات شاذة · مؤقتة قاربت الانتهاء. (يبني على HR-REV-1؛ بيانات `rbac_user_grants` temporary موجودة).

### 2.5 Deficiencies Board — 🔴 ناقص (موحّد)
ناقص هوية/عقد/بنك/رخصة/سياسة حضور/اعتماد راتب. موجود جزئيًا في 360 و`expiring-documents` بلا لوحة جامعة.

---

## 3. قاعدة العرض (تأكيد #2225)

- 🚩 لا صفحة قائمة بلا إجراء أو insight.
- 🚩 لا صفحة منفصلة لما هو tab داخل 360 إلا بتشغيل جماعي حقيقي.
- لا عرض بيانات حساسة بلا صلاحية ونطاق (يرتبط بـ visible+403 — HR-REV-1).

---

## 4. خريطة عرض HR الجديدة + القرارات

| الإجراء | الصفحات |
|---------|---------|
| keep (مراكز تشغيل) | `/hr`, `/employees`, `/employees/:id`, `/hr/approvals` |
| merge → 3 لوحات موحّدة | activation+onboarding → **Activation Board**؛ expiring-documents (+نواقص 360) → **Deficiencies Board**؛ صلاحيات → **Access Board** |
| → tab في 360 | delegations, accruals, employee-score |
| إثراء | Command Center (+6 طوابير) |

## 5. ADR
| # | القرار |
|---|--------|
| ADR-HR-13 | تصميم اللوحات الثلاث الموحّدة (Activation/Deficiencies/Access) |

— نهاية HR-REV-6 —
