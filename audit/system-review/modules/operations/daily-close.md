# /daily-close — `artifacts/ghayth-erp/src/pages/daily-close.tsx`

## 1. الميتاداتا
- المسار: `/daily-close`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/daily-close.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/miscRoutes.tsx:79`
- المجموعة: `operations`
- الكومبوننت: `DailyClose`
- subKey: — | minRoleLevel: 40
- الكيان المستنبط: `daily-close`
- سطور الملف: 218
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
_لا توجد طلبات كتابة من هذه الصفحة._

### تفاصيل الأزرار المرئية
- L71: "مركز العمليات"

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
Daily Close — إقفال يومي. كل نهاية يوم. يجمع كل العمليات + ينشئ snapshot.

| الخطوة | الإجراء |
|--------|---------|
| 1. تأكيد كل الـ check-outs | راجع `hr-attendance.md` — `checkOut IS NULL` للموظفين النشطين |
| 2. تسوية الكاش (مع cash register) | finance — actual vs system |
| 3. ترحيل posting queue المتأخرة | راجع `finance-gl-posting-queue.md` |
| 4. تشغيل recurring journals اليومية | راجع `finance-recurring-journals.md` |
| 5. تحديث inventory snapshots | warehouse — `inventory_layers` snapshot |
| 6. تحقّق من posting-failures = 0 | راجع `admin-posting-failures.md` |
| 7. إغلاق sales orders المسلَّمة | store + invoices |
| 8. تحديث AR/AP aging | راجع `finance-ar-aging.md` |
| 9. إنشاء daily report | snapshot per branch |
| 10. إشعار للـ COO + Finance Manager | event=`daily_close_completed` |

| الحركة | API | DB | الحالة |
|--------|-----|-----|--------|
| Trigger يدوي | POST `/daily-close/run` | لشخص COO/finance | ✅ |
| Auto-trigger (cron) | 23:30 يومياً | scheduled | ✅ |
| Block إذا check-outs مفتوحة | guard | بإشعار للمدير | ⚠ تحقق |
| Block إذا posting failures > 0 | guard | يطلب حلها أولاً | ✅ critical |
| Snapshot كامل | `daily_snapshots` (per branch per day) | للـ historical analysis | ✅ |
| Audit log إجباري | كل خطوة | `audit_logs` | ✅ |
| تكامل مع `daily-close-summary` تقرير | bi | تقرير يومي للـ exec | ✅ |
| Variance vs forecast | finance | الفعلي vs المُتوقَّع | راجع `cash-flow-forecast.md` |

تحقق يدوي:
- [ ] هل فشل أي خطوة يوقف العملية كلها أم يكتفي بـ warning؟
- [ ] هل تعديل اليوم السابق (back-dating) ممكن بعد daily close؟
- [ ] هل الـ daily close متعدد الفروع (per branch) أم unified؟

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `daily-close` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=PASS | CTA=SKIP | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/daily-close`
- لقطة: `audit/screenshots/daily_close.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
