# /finance/journal/create — `artifacts/ghayth-erp/src/pages/create/finance/journal-create.tsx`

## 1. الميتاداتا
- المسار: `/finance/journal/create`
- ملف الصفحة: `artifacts/ghayth-erp/src/pages/create/finance/journal-create.tsx`
- مسجّلة في: `artifacts/ghayth-erp/src/routes/financeRoutes.tsx:89`
- المجموعة: `finance`
- الكومبوننت: `JournalCreate`
- subKey: — | minRoleLevel: —
- الكيان المستنبط: `create`
- سطور الملف: 193
- مصدر موجود: ✅

## 2. الأزرار والإجراءات
| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |
|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|
| _(write)_ | `/finance/journal` | POST | ✅ | ✅ | — | — | ✅ | ✅ | ✅ |

### تفاصيل الأزرار المرئية
- L107: "مسح المسودة" → `clearDraft`
- L120: "إضافة بند" → `addLine`
- L139: "(بلا تسمية)" → `() => removeLine(idx)` 🔒
- L185: "(بلا تسمية)" → `() => setLocation("/finance/journal")` 🔒
- L186: "(بلا تسمية)" → `handleSubmit` 🔒

### القراءات (GET)
_لا قراءات._



## 3. الحركات ذات الصلة (Cross-Module Transactions)
قيد يدوي. المرجع: `docs/blueprints/finance-invoices.md` §"Manual journal".

| الحركة | الوحدة الهدف | مدخل API | مدخل DB | الحالة |
|--------|--------------|----------|---------|--------|
| إنشاء قيد متوازن | finance/GL | `finance-journal.ts` POST `/journal` | `gl_entries`, `gl_lines` (sum debit = sum credit) | ✅ |
| التحقق من توازن القيد (atomicity) | finance | داخل `withTransaction()` | rollback عند `sum(debit) ≠ sum(credit)` | ✅ موجود `hasTransaction=✅` |
| التحقق من فترة محاسبية مفتوحة | finance | `fiscal_periods.status === 'open'` قبل القيد | `fiscal_periods` | ⚠ تحقق من الـ guard |
| تأثير الأرصدة في chart of accounts | finance | تحديث `accounts.balance` (إن وُجد) أو من خلال aggregation | `gl_lines` فقط، الرصيد محسوب | ✅ |
| سير موافقة (إن > threshold) | governance/workflows | `business_rules.journal_approval` | `approval_chains` | ⚠ يعتمد على القواعد |
| Audit log + emit event | core | `auditMiddleware` + `emitEvent('journal.posted')` | `audit_logs`, `event_logs` | ✅ |

تحقق يدوي:
- [ ] هل القيد يُرفض تلقائياً إن لم يكن متوازناً؟
- [ ] في حالة قيد على فترة مغلقة، هل يُولّد `posting_failure` أم يُرفض مباشرة؟
- [ ] هل التراجع يتم عبر "عكس القيد" (`reverse`) أم عبر حذف؟ (الـ blueprint يفرض reverse فقط لمنع كسر الـ trail)

## 4. النمذجة
_لم يتم العثور على جدول Drizzle بالاسم المستنبط `create` — قد يكون معرّفًا في migrations فقط (راجع `artifacts/api-server/src/migrations`)._

## 5. البيانات الوهمية الثابتة
✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.

## 6. النتيجة (Verdict)
- Runtime audit: **⚠ PARTIAL** — render=PASS | fetch=SKIP | CTA=PASS | nav=FAIL | smoke=PASS
- ملاحظة: `landed=/dashboard expected=/finance/journal/create; write POST /api/intelligence/activity → 200`
- لقطة: `audit/screenshots/finance_journal_create.png`
- landedUrl: `http://localhost/dashboard`
- توصية: **يحتاج إصلاح**
