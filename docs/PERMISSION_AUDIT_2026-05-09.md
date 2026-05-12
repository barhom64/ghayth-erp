# Permission Coverage Audit — 2026-05-09

تقرير الفحص اليدوي للـ 31 endpoint المُعَلَّمة في تقرير 2026-05-06 كـ "بدون permission guard". التحقق تمّ من كود `origin/main` يدويًا.

> Manual audit of the 31 endpoints flagged in the 2026-05-06 review as
> "unguarded". Each was verified against the actual code on origin/main.
> **Result: zero genuine security gaps. All 31 are correctly designed —
> moved to the audit-script allow-list with cited justification.**

---

## ملخص — Summary

| البند | القيمة |
|------|-------|
| إجمالي endpoints في النظام | 960 |
| محمية inline (`authorize` / `requirePermission` / `requireMinLevel` / `requireRole`) | **897 (93%)** |
| غير محمية intentionally (مع توثيق) | 63 |
| HARD review needed | **0** |

**أداة الفحص الآلي:** `artifacts/api-server/scripts/auditPermissionCoverage.mjs`
شغّل `node scripts/auditPermissionCoverage.mjs` بأي وقت لإعادة الفحص.

---

## القائمة الكاملة للـ31 endpoint مع تبرير كل واحد

### 1. `dashboard.ts` (7 endpoints) ✅ company-scoped via `buildFilter(scope)`
- `GET /` — بطاقة الـ KPIs الرئيسية
- `GET /summary` — ملخص company-scoped
- `GET /role-data` — بيانات حسب دور المستخدم
- `GET /charts/revenue`
- `GET /charts/attendance`
- `GET /charts/departments`
- `GET /charts/recent-events`

**التحقق:** كل route يستخدم `req.scope!` ثم `buildFilter(scope, req)` الذي يولّد WHERE clause فيه `companyId = scope.companyId`. الـ authMiddleware مفروض على router-level (index.ts:204). الداشبورد يلخّص بيانات يستطيع المستخدم رؤيتها أصلاً في الموديولات، فلا يحتاج permission إضافي.

### 2. `moduleDashboards.ts` (6 endpoints) ✅ نفس النموذج
- `GET /projects` `/crm` `/store` `/support` `/tasks` `/warehouse`

**التحقق:** كل واحد company-scoped. لا data leak.

### 3. `rbacV2.ts` (5 endpoints) ✅ catalog + self-service
- `GET /features` — قائمة الميزات (catalog metadata)
- `GET /templates` — role templates للـ UI
- `POST /jit/request` — طلب JIT elevation **لنفس المستخدم**
- `GET /jit/my` — طلباتي أنا فقط
- `POST /jit/:id/cancel` — إلغاء طلب خاص بي

**التحقق:** الكود نفسه موثّق صراحة:
```typescript
// ─── Catalog (read-only, anyone authenticated) ───
// Anyone authenticated can submit a JIT request for themselves.
// User can cancel their own pending request.
```
العمليات الخطيرة (grant/revoke/approve) في نفس الملف **محمية** بـ `authorize()`.

### 4. `communications.ts` (6 endpoints) ✅ provider-side auth
- `GET /whatsapp/webhook` — verify_token shared secret (Meta)
- `POST /whatsapp/webhook` — signed webhook من Meta
- `POST /pbx/incoming` — على شبكة داخلية من PBX gateway
- `POST /pbx/completed` — نفسه
- `POST /pbx/status` — نفسه
- `GET /push/vapid-key` — يُرجع المفتاح **العام** (designed to be public per RFC 8292)

**التحقق:** الـ webhooks تُحمى بـ shared secret أو signature من المزوّد. `/push/vapid-key` بطبيعته عام.

### 5. `pdpl.ts` (3 endpoints) ✅ متطلبات تنظيمية
- `GET /privacy-notice` — anon by design + rate limit (يجب قراءته قبل تسجيل الدخول)
- `GET /retention-policies` — `authMiddleware + pdplUserLimiter`
- `GET /employee-data-export/:employeeId` — `authMiddleware + pdplUserLimiter` + inline `isOwnData OR userHasPermission("hr:read")`

**التحقق:** الـ PDPL يتطلب أن تكون privacy-notice متاحة للزوار. باقي الـ routes تستخدم authMiddleware + rate limit + in-handler permission check (هذا هو التصميم الصحيح للـ "OWN data OR has-permission").

### 6. `approvalActions.ts` (2 endpoints) ✅ role-gated + entity-scoped
- `GET /overrides/report` — inline `allowedRoles.includes(scope.role)` check (يطرح ForbiddenError)
- `GET /:entityType/:entityId` — company-scoped read of approval history

**التحقق:** /overrides/report يحوي:
```typescript
if (!allowedRoles.includes(scope.role)) {
  throw new ForbiddenError("غير مصرح لك بالاطلاع على تقرير المخالفات");
}
```
/:entityType/:entityId يقرأ approval history لـ entity يستطيع المستخدم رؤيته أصلاً (companyId scoped).

### 7. `index.ts` (2 endpoints) ✅ pre-auth defaults + dev-only
- `GET /settings/display` — يُرجع defaults عامة (SAR, Asia/Riyadh) قبل تسجيل الدخول. مُركّب **قبل** `router.use(authMiddleware)` (سطر 145 vs سطر 204).
- `GET /_routes` — يُرجع 404 في production (`if (process.env.NODE_ENV === "production") return 404`)، dev-only debug.

### 8. `actionCenter.ts` (1 endpoint) ✅ role-gated inline
- `GET /` — `if (!ACTION_CENTER_ROLES.includes(scope.role)) throw ForbiddenError`

### 9. `permissions.ts` (1 endpoint) ✅ own data
- `GET /my` — يُرجع صلاحيات المستخدم نفسه فقط (`WHERE userId = scope.userId`)

### 10. `storage.ts` (1 endpoint) ✅ public namespace by design
- `GET /storage/public-objects/*filePath` — يخدم من الـ public bucket فقط. الرفع وملفات الـ private namespace محمية في endpoints أخرى.

---

## ما تم تغييره فعليًا

**صفر inline guards مضافة** — بعد المراجعة اليدوية، كل الـ31 endpoint ثبت إنها correctly designed.

**التحديث الوحيد:** توسيع `INTENTIONALLY_UNGUARDED` في `auditPermissionCoverage.mjs` لتغطي الـ10 ملفات الإضافية، مع تعليق يشرح **لماذا** كل ملف intentional. هذا التوثيق يخدم كـ self-audit ضد تغييرات مستقبلية تخرق التصميم بطريق الخطأ.

---

## كيف تحافظ على الانضباط — How to keep this honest

1. **عند إضافة endpoint جديد لأي ملف من الـ allowlist** (e.g. `dashboard.ts`):
   - إن كان يتبع نفس النمط (company-scoped via buildFilter) → لا حاجة لـ inline guard
   - إن كان يكشف بيانات خارج الـ scope → **يجب إضافة `authorize({...})` inline**

2. **شغّل الـ audit بعد كل PR كبير:**
   ```bash
   cd artifacts/api-server && node scripts/auditPermissionCoverage.mjs
   ```
   إن ظهر "HARD review needed > 0" → إما إضافة guard أو تحديث الـ allowlist مع تبرير.

3. **CI integration (مستقبلًا):** ممكن إضافة الفحص لخط CI كـ warn-only step (`exit 0` دائمًا حاليًا) ثم تحويله لـ enforcing بعد ضبطه.

---

## مرجع الكود

| الملف | الوظيفة |
|------|--------|
| `artifacts/api-server/scripts/auditPermissionCoverage.mjs` | أداة الفحص + الـ allowlist |
| `artifacts/api-server/src/lib/rbac/authorize.ts` | RBAC v2 middleware |
| `artifacts/api-server/src/middlewares/permissionMiddleware.ts` | requirePermission + userHasPermission |
| `artifacts/api-server/src/middlewares/roleGuard.ts` | requireMinLevel + requireRole + requireModule |
