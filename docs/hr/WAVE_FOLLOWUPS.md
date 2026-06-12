# متابعات موجة HR (#2077) — قبل تقرير الإغلاق النهائي

> قاعدة: لا تُغلق الموجة وفي السجل بند مفتوح غير مُعلن.

## FU-1 — أدوار seed بلا module grants (من PR-8a)

**الاكتشاف**: رحلة PR-8a أظهرت أن دورَي `department_manager` و
`payroll_officer` موجودان في `rbac_roles` ويُسندان للمستخدمين، لكن
`rbac_role_grants` لا يحمل لهما أي صف — النتيجة 0 وحدة في القائمة
الجانبية (القياس الحيّ: dept=0, payroll=0 مقابل hr=6, employee=5).

**ليست ثغرة بوابات**: البوابات عملت كما صُمِّمت (لا grants ⇒ لا قائمة).
الخلل في الـseed: persona بلا حزمة grants قياسية.

**المطلوب**:
- `payroll_officer` → grants على `hr.payroll.*` (list/view) +
  الوحدات `home, hr, requests, documents, comms` بنطاق يخدم
  «يرى الرواتب والأثر المالي دون تفاصيل التحقيقات».
- `department_manager` → grants على `hr.employees:list` (scope=department)
  + `hr.attendance:list` (scope=department) + الوحدات الأساسية.
- يُزرَع في `db/seed-aldiyaa-company-defaults.sql` (أو ملف rbac seed
  المعتمد) + سطر تحقق في `verify-hr-identity-sidebar-journey.sh`
  يقيس أن `dept > 0` و`payroll > 0` بعد الزرع.

**الحالة**: ✅ **أُغلقت في PR-9a** (بتكليف صريح من صاحب المنتج قبل
تقرير الإغلاق). تشخيص أدق أثناء التنفيذ:

- `payroll_officer`: صف الدور موجود (هجرة 278) لكن 278 زرعت الأدوار
  بلا grants — هذا نصف الخلل فقط.
- `department_manager`: **لا يوجد صف دور أصلًا** في `rbac_roles`
  (تعليق 278 قال «موجود» لكن الموجود هو قالب `tpl_department_manager`
  من هجرة 110 بمفتاح مختلف) — لذلك ربط `rbac_user_roles` كان يُدخل
  0 صف بصمت.
- ملاحظة معمارية: محرك التصريح يطابق `feature_key` الدقيق أو
  `<module>.*` أو `*` فقط (`authzEngine.ts`) — لذا الزرع استخدم
  المفاتيح الدقيقة (`hr.payroll.runs`, `hr.payroll.wps`, …) لا
  `hr.payroll.*` التي كانت ستكون grant ميتًا.

العلاج: هجرة `306_seed_standard_role_grants_fix.sql` (idempotent بنمط
258) + إدخالا بيانات للدورين في `ROLE_DEFAULT_MODULES`/`ROLE_LEVELS`
(`roleGuard.ts` — الخريطة التي يستشيرها `requireModule`، وبدونها تضيء
القائمة ويرفض الـmount). الأدلة: القسم C الجديد في
`verify-hr-identity-sidebar-journey.sh` (دخول الدورين بوحدات > 0،
payroll يقرأ `/hr/payroll` ويُرفض على `/hr/discipline/memos` بـ403)
+ المسمار `hrStandardRoleGrantsSmoke.test.ts` يمنع رجوع الدورين إلى
0 grants. لا تغيير في منطق RBAC ولا `authMiddleware` ولا القائمة
الجانبية.

## FU-2 — module-dashboards خلف bi (من PR-2، مؤجَّلة بقرار)

`/module-dashboards/*` ما زال خلف `requireModule("bi")` — مدير HR
لا يقرأ HR Dashboard لأنه لا يحمل bi. صاحب المنتج أجّلها لمراجعة
معمارية (سُجّلت في مصفوفة PR-2). لم تُعالج في PR-5 لأن صندوق الأعمال
بُني على مصادر أخرى.

**الحالة**: مفتوحة بقرار تأجيل صريح.
