# قائمة جاهزية المراجعة (SOC 2 / ISO 27001 / PDPL)

هذا الملف يلخّص الضوابط الموجودة في نظام `RBAC v2` ويحدد ما يحتاج لإثبات/مراجعة خارجية قبل الحصول على الشهادات. ليس بديلاً عن المراجع القانوني/المُدقّق المعتمد، لكنه يوفّر للمدقّق نقطة بدء واضحة مع الأدلة التقنية.

---

## 1. SOC 2 Type 1 — الضوابط المطبّقة تقنياً

### CC6.1 — التحكّم المنطقي بالوصول (Logical Access Controls)
| الضابط | الدليل في الكود | ✓ |
|---|---|---|
| كل الوصول يتم عبر هوية موثَّقة | `routes/index.ts:204` — `router.use(authMiddleware)` يلف كل المسارات | ✅ |
| الصلاحيات على مستوى المستخدم لا الدور فقط | `rbac_user_grants` + `applyUserGrants()` في `authzEngine.ts` | ✅ |
| فصل المهام (SoD) مُنفَّذ تقنياً | `rbac_sod_rules` + `sodEnforcement.ts` (يحجب في وقت التشغيل، ليس فقط تقريراً) | ✅ |
| التحكم على مستوى الحقل (Field-level masking) | `applyFieldPolicy()` في `authzEngine.ts:608` + `rbac_field_policies` | ✅ |
| سياسة كلمة المرور القوية | `auth.ts` — bcrypt + lockout + refresh tokens مع TTL | ✅ |
| رفع الصلاحية المؤقت بموافقة (JIT) | جدول `rbac_jit_requests` + FSM (`pending→approved→expired`) | ✅ |

### CC6.6 — منع الوصول غير المصرح به
- IP allow-list عبر شرط `ipPrefixIn` في `abacConditions.ts:153`
- ساعات عمل عبر `businessHours` في `abacConditions.ts:119`
- وضع الطوارئ (kill-switch) عبر `RBAC_EMERGENCY_MODE` env var

### CC7.2 — سجل المراجعة (Audit Trail)
| الضابط | الدليل |
|---|---|
| كل رفض يُسجَّل | `authorize.ts:123` — INSERT في `security_log` | ✅ |
| كل تغيير دور يُسجَّل | `rbac_role_history` (PR #109) | ✅ |
| التحويل لـ SIEM خارجي | `siemForwarder.ts` — webhook (RBAC_SIEM_WEBHOOK_URL) | ✅ |
| التوقيتات بـ UTC | `TIMESTAMPTZ DEFAULT NOW()` في كل الجداول | ✅ |
| السجل غير قابل للتعديل من داخل التطبيق | لا توجد `UPDATE` أو `DELETE` على `security_log` في الكود | ✅ |

### CC8.1 — إدارة التغييرات
- كل تغيير صلاحية يتطلّب `admin.roles:update` (في `rbacV2.ts`)
- migration 109 + 140 + 141 إصدارية ومُختبَرة
- اختبارات `endpointCoverage.test.ts` تكشف التغيّرات قبل الإنتاج

### **المطلوب من المدقّق خارجياً (SOC 2):**
- [ ] Penetration testing report (طرف ثالث معتمد — 4-6 أسابيع)
- [ ] Vulnerability scan على البنية التحتية (Nessus / Qualys — مستمر)
- [ ] Backup & DR procedures موثّقة (RTO/RPO)
- [ ] Incident response playbook (طرف ثالث — أسبوع)
- [ ] Vendor risk assessment لمزوّدي السحابة (Azure/AWS)
- [ ] Employee security training records (سنوي)
- [ ] فترة مراقبة 6-12 شهر لـ Type 2 (Type 1 لقطة في لحظة)

---

## 2. ISO 27001:2022 — المنطبق على RBAC

### A.5.15 — Access Control Policy
- موثّق في `docs/RBAC_V2.md` و `docs/RBAC_USAGE_GUIDE.md` ✅

### A.5.16 — Identity Management
- لكل مستخدم `employee_id` فريد مرتبط بـ `users` ✅
- نهاية الخدمة تُلغي الجلسات (refresh_tokens DELETE) ✅

### A.5.18 — Access Rights
- Provisioning عبر `/rbac/v2/users/:id/roles` (`rbacV2.ts:827`) ✅
- De-provisioning عبر expires_at (cron يدير `expired_grants`) ✅
- مراجعة دورية: SQL query جاهز في `docs/RBAC_USAGE_GUIDE.md` ✅

### A.8.2 — Privileged Access Rights
- JIT elevation pattern مُطبّق ✅
- كل امتياز محدّد المدة (TTL ≤ 24 ساعة) ✅
- موافقة المدير قبل التفعيل ✅

### A.8.3 — Information Access Restriction
- Field-level masking ✅
- Scope filtering (self/team/department/branch/company) ✅

### A.8.16 — Monitoring Activities
- SIEM forwarding ✅
- security_log محلي ✅

### **المطلوب خارجياً (ISO 27001):**
- [ ] ISMS scope statement
- [ ] Risk treatment plan (Statement of Applicability)
- [ ] Internal audit (سنوي)
- [ ] Management review meetings (ربع سنوي)
- [ ] External auditor Stage 1 + Stage 2 (2-3 أشهر)

---

## 3. نظام حماية البيانات الشخصية السعودي (PDPL)

### المادة 19 — الموافقة على المعالجة
- لا تنطبق على نظام داخلي للموظفين (المادة 6/3 — تنفيذ عقد)

### المادة 23 — حقوق صاحب البيانات
| الحق | كيف يُلبّى | ✓ |
|---|---|---|
| الإطلاع | `/me` endpoint + ملف الموظف الشخصي (hr.employees.self) | ✅ |
| التصحيح | `PATCH /employees/:id` للحقول الشخصية | ✅ |
| الحذف (في حدود القانون) | حذف ناعم عبر `deletedAt` + احتفاظ السجلات المالية لـ 10 سنوات (نظام الزكاة) | ✅ |
| نقل البيانات | `/me/export` متاح (تصدير JSON) | ⚠️ يحتاج تأكيد UI |

### المادة 30 — الإخطار بالخروقات
- security_log + SIEM يوفّران رصد آني
- إجراء الإخطار خلال 72 ساعة → يحتاج playbook إداري (خارج الكود)

### المادة 24 — تقييم الأثر (DPIA)
- يحتاج وثيقة منفصلة موقّعة من المسؤول عن البيانات

### **المطلوب خارجياً (PDPL):**
- [ ] تعيين Data Protection Officer رسمياً (إن لزم)
- [ ] تسجيل لدى الهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA)
- [ ] Data Processing Agreements مع مزوّدي السحابة
- [ ] خصوصية الإشعار للموظفين (Privacy Notice)
- [ ] تقييم نقل البيانات خارج المملكة (Cross-Border Transfer)

---

## 4. الأدلة الجاهزة للمدقّق

### استخراج الأدلة من قاعدة البيانات

```sql
-- كل تغييرات الأدوار خلال آخر 90 يوم
SELECT * FROM rbac_role_history
WHERE "createdAt" > NOW() - INTERVAL '90 days'
ORDER BY "createdAt" DESC;

-- كل محاولات الرفض خلال آخر 30 يوم
SELECT path, method, reason, COUNT(*) as attempts
  FROM security_log
 WHERE "createdAt" > NOW() - INTERVAL '30 days'
 GROUP BY path, method, reason
 ORDER BY attempts DESC LIMIT 100;

-- كل طلبات JIT المعتمدة
SELECT u.name, j.feature_key, j.action, j.status,
       j."approvedAt", j.expires_at, j.justification
  FROM rbac_jit_requests j
  LEFT JOIN users u ON u.id = j."userId"
 WHERE j.status IN ('approved', 'expired');

-- كل خروقات SoD المكتشفة
-- (يُولَّد من /rbac/v2/sod في الواجهة)

-- كل الصلاحيات لمستخدم محدد
-- (يُولَّد من /rbac/v2/users/:id/effective)
```

### نقاط تحقق فنية للمدقّق

1. **مراجعة `featureCatalog.ts`** — قائمة كل ميزة + الإجراءات المسموحة
2. **مراجعة `migrations/109_layered_rbac_v2.sql`** — مخطّط الجداول
3. **تشغيل `pnpm vitest run tests/unit/rbac/`** — 88 اختبار يجب أن ينجح
4. **زيارة `/admin` تبويب «الصلاحيات الطبقية»** — معاينة بصرية
5. **تشغيل query على `security_log` لرؤية سجل الرفض**
6. **التحقق من تكوين `RBAC_SIEM_WEBHOOK_URL` (اختياري لكن موصى به)**

---

## 5. الخلاصة

**جاهز تقنياً (الكود + قاعدة البيانات):** ~85% من ضوابط SOC 2/ISO 27001 المتعلقة بالتحكّم بالوصول.

**يحتاج عمل خارجي:**
- توثيق إداري (Policies/Procedures/DPIA)
- تدقيق خارجي معتمد
- اختبار اختراق
- فترة مراقبة (لـ Type 2)

**زمن متوقّع للوصول للشهادة الكاملة:**
- SOC 2 Type 1: 3-4 أشهر
- SOC 2 Type 2: 9-12 شهر
- ISO 27001: 4-6 أشهر
- PDPL Compliance: 4-6 أسابيع (مع DPO)
