# HR-REV-8 — بوابة قبول HR النهائية

> **Issue:** [#2227](https://github.com/barhom64/ghayth-erp/issues/2227)
> **يبني على:** كل HR-REV-0..7
> **الفرع:** `claude/wizardly-babbage-mgsv2i` · **التاريخ:** 2026-06-14 · **الحالة:** تعريف بوابة (read-only).

**القاعدة:** لا يُعلن HR جاهزًا حتى تمرّ رحلات end-to-end. لا يُقبل «الصفحة تفتح» ولا «API 200» وحده ولا رحلة بلا audit/event/report impact.

**جاهزية الرحلة:** 🟢 قابلة للتنفيذ الآن · 🟡 تحتاج إكمال HR-REV-3/4 · 🔴 تحتاج تحقّق فجوة.

---

## رحلات القبول الإلزامية (16)

لكل رحلة: persona · preconditions · steps · UI · API · DB/effects · audit · event · report.

| # | الرحلة | persona | API محوري | الأثر المتوقّع (DB+audit+event) | جاهزية |
|---|--------|---------|-----------|-------------------------------|:------:|
| 1 | إنشاء سريع موظف إداري | hr_manager | `POST /employees/quick-activate` | employee(pending_activation)+assignment+plan؛ audit؛ event activation.created | 🟡 |
| 2 | إنشاء سريع سائق | hr_manager | quick-activate (profile=driver) | + مهام مركبة/عهدة/GPS مُولّدة (HR-REV-4) | 🟡 |
| 3 | إنشاء موظف مالي | hr_manager | quick-activate (profile=accountant) | + صلاحية مالية مقيّدة، لا مركبة | 🟡 |
| 4 | الموظف يكمل بياناته | employee(self) | `PATCH /activation-plan/:taskId` | pending_employee→مكتمل؛ audit بالموظف | 🟡 |
| 5 | مدير القسم يكمل العمل | department_manager | activation-plan | pending_department→مكتمل | 🟡 |
| 6 | الرواتب تكمل الراتب | payroll_officer | `PATCH /employees/:id` (salary) | بنية راتب؛ audit؛ scope=company | 🟢 |
| 7 | الوثائق تتحقق | hr_manager/documents | `/employees/documents` verify | تحقق + audit | 🟢 |
| 8 | عهدة: طلب→صرف→استلام | hr→warehouse | طلب خدمة مستودع | عهدة بوثيقة صرف/استلام؛ event | 🔴 (خدمة) |
| 9 | مركبة: طلب→تخصيص | hr→fleet | طلب تخصيص أسطول | تخصيص (لا إنشاء من HR)؛ event | 🔴 (خدمة) |
| 10 | منح صلاحية حسب المسمى | admin/hr-link | `POST /admin/onboard` أو grant | rbac_user_roles+scope؛ audit بالـactiveRole | 🟢 |
| 11 | طلب صلاحية إضافية واعتمادها | employee→admin | grant request→approve | rbac_user_grants temporary؛ audit | 🟡 |
| 12 | نقل موظف + تغيير النطاق | hr_manager | `/hr/transfers` | assignment جديد + **إعادة منح نطاق** 🚩 | 🔴 (فجوة ربط) |
| 13 | إيقاف + سحب الصلاحيات | hr_manager | `PATCH /employees/:id` suspended | status=suspended + **تعطيل الحساب/سحب الأدوار؟** 🚩 | 🔴 (تحقّق أمني) |
| 14 | إنهاء + إغلاق العهد/السلف/الإجازات/الصلاحيات | hr_manager | `DELETE /employees/:id` terminate | terminated + clearance + **إغلاق كل التبعات** 🚩 | 🔴 |
| 15 | مسير راتب يتأثر بالحضور/الإجازات/الجزاءات | payroll_officer | `POST /hr/payroll` | خصومات محسوبة؛ GL؛ audit | 🟢 |
| 16 | تقرير HR يعكس الآثار | hr_manager | تقارير | يعكس 1–15؛ لا ادعاء نظري | 🟡 |

---

## الفجوات الحرجة المكشوفة (تمنع القبول حاليًا)

1. 🔴 **رحلات 1–5**: تعتمد `quick-activate` + activation plan (HR-REV-3) — غير موجودة بعد.
2. 🔴 **رحلة 13/14 (أمني)**: غير مؤكد أن الإيقاف/الفصل يسحب الأدوار ويعطّل الحساب ويغلق العهد/السلف — **أعلى خطر** (HR-REV-1 §7).
3. 🔴 **رحلة 12**: النقل لا يُعيد منح النطاق تلقائيًا.
4. 🔴 **رحلات 8/9**: عقود الخدمة (مستودع/أسطول) تحتاج تأكيد وثيقة صرف/استلام/تخصيص.

---

## مخرجات القبول

- `scripts/verify-hr-acceptance-gate.sh` (هيكل أُنشئ — يحوّل كل رحلة إلى فحص؛ يُملأ بعد إكمال HR-REV-3/4).
- جدول أدلة (Evidence) لكل رحلة: UI screenshot + API status + DB row + audit row + event + report delta.
- أي فشل → issue فرعي محدد.

## الممنوعات (تأكيد #2227)
- ❌ «الصفحة تفتح» كدليل · ❌ «API 200» وحده · ❌ رحلة بلا audit/event/report · ❌ موجة بيع قبل إغلاق البوابة.

— نهاية HR-REV-8 —
