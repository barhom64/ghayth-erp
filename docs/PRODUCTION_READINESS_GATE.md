# بوابة فحص التشغيل الكامل — Production Readiness Gate

هذه الوثيقة تضبط طريق الوصول إلى نظام غيث قابل للتشغيل من المستودع دون أخطاء بيئة أو نقص جداول أو مسارات غير مترابطة.

> هذه الوثيقة لا تغيّر منطق النظام. هي بوابة فحص وتشغيل فقط.

---

## 1. الهدف

لا يعتبر النظام جاهزًا بمجرد نجاح `typecheck` أو `build`. الجاهزية تعني أن:

- متطلبات البيئة موحدة وواضحة.
- قاعدة البيانات قابلة للإقلاع من الصفر.
- المهاجرات مطبقة بدون drift.
- API يعمل بدون 500 عشوائية في smoke tests.
- الواجهة تبني وتستدعي API الصحيح.
- المسارات الأساسية لها جداول وصلاحيات وتدقيق وأحداث.
- التكامل بين المسارات مضبوط بعقود خدمة لا تكسر استقلالها.

---

## 2. عقد التشغيل Runtime Contract

يوجد تعارض يجب حسمه قبل اعتماد الإنتاج:

- `README.md` يذكر Node.js 24.x.
- `docs/DEPLOYMENT.md` يذكر Node 22 LTS و pnpm 10.33.0.
- `package.json` الحالي لا يثبت `engines` ولا `packageManager`.

### قرار مطلوب قبل التثبيت

يجب اعتماد نسخة واحدة رسميًا ثم توحيدها في:

- `package.json#engines`
- `package.json#packageManager`
- `README.md`
- `docs/DEPLOYMENT.md`
- CI/workflows إن وجدت

إلى أن يتم الحسم، تعتبر بيئة التشغيل غير مقفلة بالكامل.

---

## 3. أوامر الفحص المتاحة حاليًا

| الأمر | النوع | يحتاج DB؟ | الغرض |
|---|---|---:|---|
| `pnpm run typecheck` | static | لا | فحص TypeScript لكل workspace |
| `pnpm run build` | static | لا غالبًا | typecheck + lint patterns + build |
| `pnpm run guard` | mixed | اختياري | guard شامل، يتجاوز live DB checks إن لم توجد `DATABASE_URL` |
| `pnpm run audit:schema` | static | لا | مقارنة SQL مع dump schema |
| `pnpm run check:schema-drift` | live | نعم | مقارنة الكود مع schema قاعدة حقيقية |
| `pnpm run check:ghost-rows` | live | نعم | كشف قراءات soft-deleted بدون فلترة |
| `pnpm run check:duplicate-migrations` | static | لا | كشف تضارب أسماء migrations |
| `pnpm run audit:routes` | static | لا | كشف الصفحات/المسارات غير المربوطة |
| `node audit/api-smoke.mjs` | live | نعم + API شغال | فحص GET endpoints بعد login |

---

## 4. تسلسل الفحص المقترح

### أ. فحص بدون قاعدة بيانات

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm run audit:schema
pnpm run audit:routes
pnpm run check:duplicate-migrations
```

### ب. فحص بقاعدة بيانات حقيقية

يتطلب:

```bash
export DATABASE_URL="postgres://..."
```

ثم:

```bash
pnpm run check:schema-drift
pnpm run check:ghost-rows
pnpm run guard
```

### ج. فحص API حي

يتطلب API شغال وحساب إداري:

```bash
export API_BASE="http://localhost:5000"
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="..."
node audit/api-smoke.mjs
```

المخرجات:

```text
audit/api-smoke-results.json
```

أي 500 في هذا التقرير يمنع الجاهزية.

---

## 5. فحص البيئة Environment Contract

يجب أن يوجد فحص آلي لاحقًا يقارن:

- كل استخدام لـ `process.env.X` في الكود.
- كل متغير موثق في `.env.example`.
- كل متغير مذكور في `README.md` و `docs/DEPLOYMENT.md`.

ويصنف المتغيرات إلى:

- required to boot
- required in production
- optional integration
- dev-only
- legacy alias

أي متغير مستخدم وغير موثق يعتبر خلل readiness.

---

## 6. فحص قاعدة البيانات

الحد الأدنى المطلوب:

- bootstrap على DB فارغة.
- تطبيق كل migrations.
- وجود `schema_migrations` منضبط.
- نجاح `check:schema-drift` ضد live DB.
- نجاح `check:ghost-rows` ضد live DB.
- عدم وجود جدول أو عمود مستخدم في routes/services وغير موجود في live DB.

لا يكفي `/api/health` وحده؛ لأنه يثبت الاتصال فقط ولا يثبت اكتمال الجداول.

---

## 7. فحص API

الحد الأدنى:

- `/api/health` يرجع 200.
- login يعمل.
- `audit/api-smoke.mjs` لا ينتج أي 5xx.
- 401/403 مقبولة إذا كانت بسبب صلاحيات.
- 404 تحتاج تصنيف: route غير موجود أو endpoint parameter smoke غير مناسب.
- كل 500 يجب أن يتحول إلى Issue مستقل بسبب واضح.

---

## 8. فحص المسارات Path Readiness Matrix

| المسار | DB | API | UI | RBAC | Audit | Events | Reports | الحالة |
|---|---|---|---|---|---|---|---|---|
| HR | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Finance | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Warehouse | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Umrah | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Fleet | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Properties | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Legal | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Documents | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |
| Notifications | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | مطلوب | غير محسوم |

لا تنتقل الحالة إلى "جاهز" إلا بدليل من فحص أو smoke test أو تقرير CI.

---

## 9. Service Boundary Lock

أي تكامل بين المسارات يجب أن يلتزم بالآتي:

- المسار القائد يملك القرار.
- المسار الخادم يقدم خدمة محددة فقط.
- لا يجوز نقل سياسة أو قرار من مسار إلى آخر.
- أي كتابة عابرة للمسارات يجب أن تكون بعقد خدمة واضح.
- أي عملية إنشاء/تعديل/حذف/اعتماد/إحالة يجب أن تترك Audit/Event أثرًا.

أمثلة:

- HR يقرر سياسة الراتب، Finance يرحل القيد فقط.
- Umrah ينشئ منطق الرحلة/الوكيل، Finance يصدر فواتير/قيود فقط.
- Documents يخزن ويربط الملفات، لا يقرر حالة المسار.
- Notifications يرسل فقط، لا يقرر.

---

## 10. معايير الفشل

يفشل readiness إذا ظهر أي مما يلي:

- تعارض runtime غير محسوم.
- متغير بيئة مستخدم وغير موثق.
- migration مفقود أو drift في live DB.
- أي 5xx في smoke test.
- route رئيسي غير مربوط.
- جدول أو عمود مستخدم وغير موجود.
- مسار يعتمد اعتمادًا قاتلًا على مسار آخر.
- تعديل مالي أو صلاحياتي أو lifecycle بدون PR مستقل.

---

## 11. مبدأ التنفيذ

أي PR متعلق بهذه البوابة يجب أن يكون:

- صغيرًا.
- قابلًا للمراجعة.
- لا يغير business behavior.
- لا يلمس migrations أو RBAC أو Finance أو Payroll أو Scheduler إلا بتصريح مستقل.
- يضيف كشفًا أو توثيقًا أو أمر فحص فقط.
