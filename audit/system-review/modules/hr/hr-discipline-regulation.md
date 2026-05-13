# /hr/discipline/regulation — `artifacts/ghayth-erp/src/pages/hr/discipline-regulation.tsx`

## 1. الميتاداتا
- المسار: `/hr/discipline/regulation`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/hr/discipline-regulation.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/hrRoutes.tsx:137`
- المجموعة: `hr`
- الكومبوننت: `DisciplineRegulation`
- subKey: `violations` | minRoleLevel: —
- الكيان المستنبط: `regulation`
- سطور الملف: 309
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L159: "(بلا تسمية)" → `() => setEditing(a)`
- L275: "(بلا تسمية)" → `() => setEditing(null)` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

لائحة الجزاءات والتأديب — Saudi Labor Law-compliant discipline regulation. مرجع لكل violations.

| المكوّن | المتطلب |
|---------|--------|
| Approved by MoL | mandatory per Saudi Labor Law Article 12 | إجباري — registered with Ministry |
| Display location | mandatory display in workplace | إجباري |
| Translation | Arabic + applicable languages | للموظفين |
| Date approved | tracking | إجباري |
| Date effective | post-approval | إجباري |
| Categories of violations | per type | enum list |
| Penalty matrix | per offense + repetition | structured |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View regulation | GET `/hr/discipline-regulation` | `discipline_regulations` | ✅ |
| Upload approved version (from MoL) | POST | with signature + date | ✅ critical |
| Update penalty matrix | PATCH | requires re-approval from MoL | ✅ critical |
| Version history | snapshots | إجباري | ✅ critical |
| Acknowledgment by employees | per employee | راجع `hr-policy-acknowledgments.md` | ⚠ |
| Linked violations | aggregate | راجع `hr-violations.md` | ✅ |
| Compliance audit | annual | راجع `governance-audits.md` | ✅ |
| Print/Display version | راجع `print-templates` | for office posting | ✅ |
| MoL submission tracking | external | راجع `admin-integrations.md` | ⚠ |
| تكامل مع `hr-violations.md` (rule reference) | ✅ critical |
| تكامل مع `governance-compliance.md` (Saudi Labor Law) | ✅ critical |
| تكامل مع `documents.md` (approved PDF storage) | ✅ critical |
| Audit log إجباري | كل تعديل | `audit_logs` | ✅ critical |
| RBAC | hr-manager + legal review للتعديلات | ✅ critical |

تحقق يدوي:
- [ ] هل regulation has valid MoL approval (not expired)?
- [ ] هل employees acknowledged the current version?
- [ ] هل penalty matrix يطبَّق تلقائياً عند إنشاء violation?
- [ ] هل version history accessible للـ audit وللاستفسارات القانونية?
- [ ] هل update يتطلب MoL re-approval قبل publish?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `regulation` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/hr/discipline/regulation`
- لقطة: `audit/screenshots/hr_discipline_regulation.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
