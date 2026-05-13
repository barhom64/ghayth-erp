# /projects/risks — `artifacts/ghayth-erp/src/pages/projects/risks.tsx`

## 1. الميتاداتا
- المسار: `/projects/risks`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/projects/risks.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:93`
- المجموعة: `operations`
- الكومبوننت: `ProjectRisks`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `risks`
- سطور الملف: 288
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L229: "(بلا تسمية)" → `() => setShowForm(false)`

### القراءات (GET)
- GET `/projects?limit=100`



## 3. الحركات ذات الصلة (Cross-Module Transactions)

سجل مخاطر المشروع — Risk Register (PMI/PRINCE2-aligned).

| الفئة | المثال |
|------|--------|
| Schedule risk | delay in delivery |
| Cost risk | budget overrun |
| Resource risk | key person leaves |
| Technical risk | tech does not work |
| External risk | regulatory change |
| Operational risk | process failure |
| Financial risk | currency, payment delays |
| Reputational | brand damage |
| Compliance | regulatory breach |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| List risks | GET `/projects/:id/risks` | `project_risks` | ✅ |
| Add risk | POST | with category + impact + probability | ✅ |
| Risk score | calculated | impact × probability | ✅ |
| Status: identified → assessed → mitigated → closed | lifecycle | ✅ |
| Owner assigned | accountability | ✅ |
| Mitigation plan | actions | required for high-risk | ✅ |
| Contingency plan | fallback | required for critical | ⚠ |
| Provisions in budget (لو high) | reserved | راجع `finance-budget.md` | ⚠ |
| Linked tasks (mitigation actions) | راجع `projects-tasks.md` | ✅ |
| Escalation (لو risk realized) | event=`risk_realized` | راجع `notifications.md` | ✅ critical |
| Risk realized → issue tracking | راجع `support.md` لو applicable | ⚠ |
| Compliance impact | راجع `governance-compliance.md` لو applicable | ⚠ |
| Provision in financials (IFRS) | راجع `finance-provisions.md` لو probable+measurable | ✅ critical |
| Audit log إجباري | كل تعديل risk score | `audit_logs` | ✅ |
| RBAC | project manager + risk officer | ✅ |
| Periodic review | scheduled | راجع `automation.md` | ⚠ |

تحقق يدوي:
- [ ] هل risk scoring matrix consistent across projects (5×5 typical)؟
- [ ] هل high-risk requires escalation للـ steering committee؟
- [ ] هل provisions في الـ financials linked to assessed risks؟
- [ ] هل risk register reviewed بشكل دوري (weekly/biweekly)؟
- [ ] هل mitigation actions tracked كـ tasks بـ deadlines؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `risks` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/projects/risks`
- لقطة: `audit/screenshots/projects_risks.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
