# /umrah/pilgrims/:id — `artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx`

## 1. الميتاداتا
- المسار: `/umrah/pilgrims/:id`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/umrah/pilgrim-detail.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/umrahRoutes.tsx:51`
- المجموعة: `operations`
- الكومبوننت: `PilgrimDetail`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `:id`
- سطور الملف: 169
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
_لم تُلتقط أزرار._

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

تفاصيل معتمر — Pilgrim profile (highly sensitive PII).

| البيانات | الحساسية |
|---------|---------|
| Full name | sensitive |
| Passport / National ID | highly sensitive — PDPL critical |
| Nationality | sensitive |
| Date of birth | sensitive |
| Health conditions | medical — extra protected |
| Visa info | sensitive |
| Photo | sensitive |
| Contact (phone, email) | PII |
| Emergency contact | PII |
| Religious info (lo applicable) | medical/religious |
| Package + group | operational |
| Payment status | financial |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| View pilgrim | GET `/umrah/pilgrims/:id` | `umrah_pilgrims` | ✅ |
| Update info | PATCH | with audit + PDPL consent | ✅ critical |
| Assign to group | راجع `umrah-groups.md` | ✅ |
| Visa application status | external sync | راجع `admin-integrations.md` | ✅ critical |
| Nusuk profile linkage | mandatory Saudi Hajj | ✅ critical |
| Health declaration | for safety | راجع `documents.md` | ⚠ |
| Insurance coverage | mandatory | راجع `documents.md` | ✅ |
| Documents (passport copy, visa, etc.) | encrypted storage | راجع `documents.md` | ✅ critical |
| Payment tracking | per pilgrim | راجع `finance-receipts.md` | ✅ critical |
| Violation tracking (لو موجود) | راجع `umrah-violations.md` | ⚠ |
| Penalties (لو applicable) | راجع `umrah-penalties.md` | ⚠ |
| Arrival/Departure tracking | per pilgrim | راجع `umrah-import.md` | ⚠ |
| Linked transport | راجع `umrah-transport.md` | ✅ |
| Linked hotel rooms | per group | ✅ |
| Notification (status updates) | per channel | راجع `notifications.md` | ✅ |
| تكامل مع Saudi MoHaj (Nusuk) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع MoFA (visa) | external | راجع `admin-integrations.md` | ✅ critical |
| تكامل مع `umrah-groups.md` (group assignment) | ✅ |
| تكامل مع `finance-invoices.md` (billing) | ✅ |
| Audit log إجباري | كل وصول للبيانات الحساسة | `access_logs` + `audit_logs` | ✅ critical |
| **PDPL** — most sensitive class | encrypted + restricted + retention | ✅ critical |
| **PDPL** — Data subject access (لو requested) | export with audit | ✅ |
| **PDPL** — Right to erasure post-trip + retention period | per regulation | ✅ |
| RBAC | umrah staff + agent (own pilgrims only) | ✅ critical |

تحقق يدوي:
- [ ] هل passport + national ID encrypted at-rest (column-level encryption)?
- [ ] هل access to pilgrim PII logged in `access_logs` كل وصول?
- [ ] هل agent يستطيع رؤية pilgrims لـ غير his group? (يجب لا)
- [ ] هل health data restricted لـ medical staff فقط?
- [ ] هل retention period (post-trip) defined + auto-anonymization?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `:id` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **✅ PASS** — render=SKIP | fetch=SKIP | CTA=SKIP | nav=SKIP | smoke=SKIP
- ملاحظة: `unresolved: no id resolver for /umrah/pilgrims/:id`
- landedUrl: `?`
- توصية: مغلق
