# /hr/performance/create — `artifacts/ghayth-erp/src/pages/create/hr/performance-create.tsx`

## 1. الميتاداتا
- المسار: `/hr/performance/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/hr/performance-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:107`
- المجموعة: `hr`
- الكومبوننت: `PerformanceCreate`
- subKey: `performance` | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 254
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/hr/performance` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L142: "مسح المسودة" → `clearDraft`
- L246: "(بلا تسمية)" → `() => setLocation("/hr/performance")` 🔒
- L247: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء تقييم أداء جديد — Performance review creation.

| نوع التقييم | الوصف |
|------------|------|
| Probation | end-of-probation | mandatory pre-permanent |
| Quarterly | كل 3 أشهر | for high-performance roles |
| Mid-year | منتصف السنة | check-in |
| Annual | السنوي | comprehensive |
| 360° | راجع `hr-evaluation-360.md` | peer review |
| Project-based | post-project | per project |
| Pulse | sporadic | continuous |

| الحقل | المتطلب |
|------|--------|
| Employee | FK | إجباري |
| Cycle | enum | إجباري |
| Period (from / to) | إجباري |
| Reviewer (manager) | FK | إجباري |
| KPIs / objectives | per role | from `hr-evaluation-cycles.md` |
| Weights per KPI | sum to 100% | ✅ |
| Self-assessment? | flag | optional but recommended |
| Manager assessment | scores per KPI |
| Comments | qualitative | ✅ |
| Development plan | for next cycle | ⚠ |
| Final score | weighted average | calculated |
| Rating | enum (Exceeds, Meets, Below) |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create review | POST `/hr/performance` | `performance_reviews` (status=draft) | ✅ |
| Validate period (no overlap) | server-side | ✅ |
| Send to employee for self-assessment | event=`performance_review_assigned` | راجع `notifications.md` | ✅ |
| Submit (manager) | finalize | راجع `governance/approvals.md` | ✅ |
| Calibration (manager's manager review) | for consistency | ⚠ |
| Approval (HR final review) | راجع `governance/approvals.md` | ✅ critical |
| Employee acknowledgment | with signature | ✅ critical |
| Append development goals | راجع `hr-development-plans.md` | ⚠ |
| Salary/bonus impact (post-cycle) | راجع `hr-payroll-salary-components.md` | ✅ critical |
| Career progression (promotion) | راجع `hr-transfers.md` | ⚠ |
| Termination trigger (لو chronic underperformance) | راجع `hr-exit.md` | ⚠ critical |
| Training recommendations | راجع `hr-training.md` | ⚠ |
| تكامل مع `hr-evaluation-cycles.md` (cycle config) | ✅ |
| تكامل مع `hr-evaluation-360.md` (360° linkage) | ✅ |
| تكامل مع `hr-payroll-salary-components.md` (raises/bonuses) | ✅ critical |
| تكامل مع `bi-kpis.md` (performance KPIs aggregate) | ✅ |
| Audit log إجباري | `audit_logs` | ✅ critical |
| **PDPL** — performance data highly sensitive | restricted | ✅ critical |
| RBAC | manager + HR + employee (own only) | ✅ critical |

تحقق يدوي:
- [ ] هل calibration step prevents rating inflation/deflation per manager?
- [ ] هل employee acknowledgment mandatory before HR approval?
- [ ] هل salary impact requires CFO approval (not auto)?
- [ ] هل chronic underperformance trigger documented process (لا surprise termination)?
- [ ] هل 360° data anonymous appropriately?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/performance/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/hr_performance_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
