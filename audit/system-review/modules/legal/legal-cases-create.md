# /legal/cases/create — `artifacts/ghayth-erp/src/pages/create/legal-cases-create.tsx`

## 1. الميتاداتا
- المسار: `/legal/cases/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/legal-cases-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/legalRoutes.tsx:25`
- المجموعة: `legal`
- الكومبوننت: `LegalCasesCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 136
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/legal/cases` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L61: "مسح المسودة" → `clearDraft`
- L129: "(بلا تسمية)" → `() => setLocation("/legal")` 🔒
- L130: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء قضية جديدة — Saudi legal system aware.

| الحقل | المتطلب |
|------|--------|
| Case number | auto-gen — متسلسل per tenant per year |
| Type | civil/commercial/criminal/labor/administrative/family | enum |
| Court | reference data — Saudi courts | FK |
| Counterparty | individual/business/government | with national ID/CR |
| Plaintiff/Defendant | role | enum |
| Subject (موضوع الدعوى) | الوصف | إجباري |
| Claim amount | financial | لو applicable |
| Assigned lawyer | internal/external | FK |
| Hearing date (first) | optional إذا scheduled | for `legal-sessions.md` |
| Statute of limitations | calculated per case type | إجباري — auto-deadline |
| Confidentiality | low/medium/high/critical | enum |
| Attachments | initial documents | راجع `documents.md` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create case | POST `/legal/cases` | `legal_cases` (status=draft) | ✅ |
| Auto-number | counters | per tenant per year | ✅ critical |
| Validate counterparty | exists or create new | راجع `crm/clients.md` لو client | ✅ |
| Validate court | from reference data | ✅ |
| Assign lawyer | with capacity check | لا overload | ⚠ |
| File case (submit to court) | POST `/legal/cases/:id/file` | lifecycle draft → filed | ✅ critical |
| Najz integration (إن مطبق) | external API | راجع `admin-integrations.md` | ⚠ |
| Initial session schedule | optional | راجع `legal-sessions.md` | ✅ |
| Provision for legal costs | initial estimate | راجع `finance-provisions.md` | ⚠ |
| Initial court fee payment | راجع `finance-expenses.md` | ✅ |
| Notification chain | event=`case_filed` → manager, lawyer, finance | راجع `notifications.md` | ✅ |
| Audit log إجباري | كل إنشاء + filing | `audit_logs` | ✅ critical |
| **PDPL** — confidentiality عالية | restrict | ✅ critical |
| RBAC | legal manager + counsel | ✅ |
| تكامل مع `documents-archive.md` (retention 10y+) | ✅ critical |
| تكامل مع `governance-compliance.md` (لو إعلام) | ⚠ |

تحقق يدوي:
- [ ] هل auto-numbering يضمن uniqueness تحت concurrent submissions؟
- [ ] هل statute of limitations محسوبة بدقة per case type (Saudi labor: 1 سنة، civil: 10 سنوات إلخ)؟
- [ ] هل lawyer assignment يفحص workload?
- [ ] هل filing إلى court فعلاً يولّد GL entry للـ court fee?
- [ ] هل external lawyer يستلم scope فقط لهذه القضية (لا cross-case access)؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/legal/cases/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/legal_cases_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
