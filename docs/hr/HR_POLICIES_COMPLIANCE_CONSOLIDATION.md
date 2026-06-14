# HR-REV-7 — مركز السياسات والامتثال: توحيد الجزاءات والسياسات والانضباط

> **Issue:** [#2226](https://github.com/barhom64/ghayth-erp/issues/2226)
> **يبني على:** HR-REV-0 (§3.9) · HR-REV-2 (عنقود المخالفات) · إصلاح authz (justify/appeal — PR #2272)
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14 · **الحالة:** read-only.

**مفتاح:** ✅ مثبت · 🚩 تشتّت · 🏛 قرار.

---

## 0. المشكلة (مثبتة)

الانضباط مشتّت على **5 صفحات** (HR-REV-0 §3.9): `violations` · `violations/management` · `penalty-escalation` · `auto-detection` · `discipline/regulation` (+ `discipline/memos/:id`). يخلط بين **السياسة** و**الواقعة** و**الجزاء**.

---

## 1. التمييز المفاهيمي الإلزامي

| المفهوم | المعنى | الكيان |
|---------|--------|--------|
| **Policy** | قاعدة/لائحة | `hr_discipline_regulation` (regulation page) |
| **Violation/Incident** | واقعة | `employee_violations` |
| **Disciplinary Action** | قرار جزاء | محضر `hr_inquiry_memos` |
| **Approval Workflow** | اعتماد | حالات المحضر + appeal-decision |
| **Payroll Impact** | أثر مالي | خصم (المالية خادم) |
| **Appeal** | اعتراض | `appeal` (مُصلَح authz في PR #2272) |

🚩 **السياسة ليست صفحة الجزاءات** — `discipline/regulation` تبقى canonical للسياسة؛ البقية تتوحّد.

---

## 2. جرد القرار (canonical = مركز امتثال واحد)

| الصفحة | القرار |
|--------|--------|
| `discipline/regulation` | **keep** (السياسة/اللائحة) |
| `violations` (نظرة عامة) | **keep** كـtab «الوقائع» في المركز |
| `violations/management` | 🟡 **merge منفّذ جزئيًا** (2026-06-14): أُزيل من القائمة → /hr/violations المبوّبة؛ المسار deep-link. متابعة: دمج عرض stats كتبويب ثم retire. |
| `penalty-escalation` | **→ tab** «التصعيد» |
| `auto-detection` | **→ tab** «الرصد التلقائي» |
| `discipline/memos/:id` | deep-link |

⇒ **مركز الامتثال** بتبويبات: السياسات · الوقائع · المحاضر/الجزاءات · التصعيد · الرصد · الاعتراضات.

---

## 3. نموذج الحالات الموحّد

المطلوب (#2226) مقابل المثبت من `hr-discipline.ts`:

| الحالة المطلوبة | المثبت في المحضر | ملاحظة |
|-----------------|-------------------|--------|
| draft | (إنشاء) | ✅ |
| reported | pending_employee | ✅ الموظف يُبلَّغ/يبرّر |
| under_review | pending_manager | ✅ توصية المدير |
| pending_approval | (قبل approved) | ✅ |
| approved | approved | ✅ |
| payroll_posted | (خصم مُرحَّل) | 🔴 ربط مالي صريح ناقص |
| appealed | appeal_pending | ✅ (authz مُصلَح) |
| closed | appeal_accepted/closed | ✅ |
| cancelled | cancelled | ✅ |

---

## 4. ربط الأثر (Impact Linking)

| الأثر | الحالة |
|-------|--------|
| audit | ✅ `logMemoEvent` لكل انتقال |
| event | ✅ lifecycle transitions |
| **payroll deduction** | 🚩 **القرار في HR، التنفيذ في المالية** — يجب ألا ينفّذ HR الخصم مباشرة |
| employee 360 | ✅ tab «المخالفات» (مؤشر تصعيد) |
| reports | 🔴 يحتاج ربطًا |

---

## 5. القواعد الصارمة (تأكيد #2226)

- ✅ السياسات ≠ صفحة الجزاءات.
- ✅ الجزاء لا ينشأ بلا واقعة/سبب/مستند/اعتماد (المحضر يفرض incident + regulation article).
- 🚩 **الأثر المالي لا ينفّذه HR مباشرة** — HR يقرّر، المالية خادم للقيد.
- 🚩 لا تظهر صفحة جزاءات لمن لا يملك صلاحية (✅ مضبوط: مجموعة الامتثال محكومة بـ`perm` صريح — HR-REV-1 §4).

---

## 6. ADR
| # | القرار |
|---|--------|
| ADR-HR-06 | بنية مركز الامتثال (tabs) |
| ADR-HR-14 | عقد الأثر المالي للجزاء (HR يقرّر → المالية تُرحّل) |

— نهاية HR-REV-7 —
