# /warehouse/create — `artifacts/ghayth-erp/src/pages/create/warehouse-create.tsx`

## 1. الميتاداتا
- المسار: `/warehouse/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/warehouse-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:96`
- المجموعة: `warehouse`
- الكومبوننت: `WarehouseCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 114
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/warehouse/products` | POST | ✅ | ✅ | — | — | ✅ | ✅ | — |

### تفاصيل الأزرار المرئية
- L68: "مسح المسودة" → `clearDraft`
- L107: "(بلا تسمية)" → `() => setLocation("/warehouse")` 🔒
- L108: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)

إنشاء مستودع جديد — Add new warehouse.

| الحقل | المتطلب |
|------|--------|
| Name (ar/en) | إجباري — unique per tenant |
| Code | إجباري — unique |
| Branch | FK | إجباري |
| Address | location | إجباري |
| GPS coordinates | optional | for geofencing |
| Type | central/regional/transit/quarantine | enum |
| Capacity | sqm or m³ | optional |
| Manager | FK to employees | إجباري |
| Linked GL accounts | inventory account default | راجع `finance-accounts.md` |
| Is default for branch | flag | per branch one default |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Create warehouse | POST `/warehouse` | `warehouses` | ✅ |
| Validate unique code | server-side | ✅ critical |
| Validate branch exists | FK | ✅ |
| Assign manager | راجع `employees.md` | ✅ |
| Link GL accounts | for inventory class | ✅ critical |
| Initialize as empty | no stock | ✅ |
| Set default for branch (if first) | auto | ✅ |
| Notification | event=`warehouse_created` | راجع `notifications.md` | ✅ |
| Audit log إجباري | `audit_logs` | ✅ critical |
| RBAC | admin + warehouse-manager (per branch scope) | ✅ |

تحقق يدوي:
- [ ] هل code uniqueness enforced at DB level?
- [ ] هل default per branch logic correct (only one)?
- [ ] هل GL account linkage validates per inventory class?

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/warehouse/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/warehouse_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
