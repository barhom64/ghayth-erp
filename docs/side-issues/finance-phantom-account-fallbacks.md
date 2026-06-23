# عيب جانبي: حسابات احتياطية وهمية في الطبقة المالية (دَين مُتتبَّع)

اكتُشف أثناء إصلاح إدخال المصروف (الدفعة 1، PR #2854). نفس فئة العلّة التي
حجبت المستخدم (`5000`/`1100` آباء غير قابلة للترحيل) موجودة في **20 موضعًا**
آخر — بقايا «تطوير ورا تطوير» (أكواد شجرة قديمة لا تطابق الشجرة المبذورة).

**الحماية:** `scripts/src/check-postable-account-fallbacks.mjs` (ratchet) يمنع أي
جديد. هذه القائمة دَين يُقلَّص بقرار محاسبي + assertion test لكل موضع.

| الملف:السطر | الكود | النوع | الغرض | الورقة الصحيحة المقترحة (تحقّق) |
|---|---|---|---|---|
| ~~storeEngine (5 مواضع)~~ | — | — | — | **✅ أُصلح (#store-postable): 1111/4111/2131/5110/1151**
| ~~finance-hardening (3: بينية)~~ | — | — | — | **✅ أُصلح: 1131/2111/4130** |
| ~~finance-custodies~~ | 1400 | — | custody | **✅ أُصلح: 1113 العهد النقدية** |
| ~~eventListeners.ts:1803~~ | 5200 | أب (رواتب!) | commission_expense | **✅ أُصلح: 5430 «العمولات والوساطة»** |
| ~~eventListeners.ts:1934 · umrahCommissionEngine.ts:204~~ | 6200 | غير موجود | عمولة عمرة | **✅ أُصلح: 5430 «العمولات والوساطة»** |
| ~~finance-algorithms (إهلاك+بنك)~~ | — | — | — | **✅ أُصلح: بنك 1124 · إهلاك 5790/1290** |
| ~~finance-algorithms.ts (CIP)~~ | 1530 | غير موجود | CIP account | **✅ أُصلح: 1270 «أعمال تحت التنفيذ»** |
| ~~finance-algorithms.ts (CIP)~~ | 1500 | غير موجود | capitalized asset | **✅ أُصلح: 1280 «أصول ثابتة أخرى» (ورقة جديدة + backfill 414)** |
| finance/datafixInventory.ts | 1130/1140/2110 | **آباء تحكّم (تصميم)** | AR/سلف/AP datafix | **❎ ليست عيبًا — أكواد آباء تحكّم؛ تبقى allowlisted دائمًا** |

> **تصحيح:** المواضع الثلاثة في `datafixInventory.ts` (1130/1140/2110) **ليست
> fallbacks وهمية**. هي أكواد **حساب تحكّم أب** يُنشأ تحته دفتر مساعد (العملاء/سلف
> الموظفين/الموردون) — الفروع المساعدة هي الأوراق القابلة للترحيل، والأب
> `allowPosting:false` بقصد. تُطابق المزوِّد الحيّ `createSubsidiaryAccountsForEntity`
> في `routes/accounting-engine.ts` (يتحقّق منه `datafixInventory.test.ts`).
> توجيهها لأوراق يكسر إنشاء الدفتر المساعد. تبقى في `ALLOWLIST` دائمًا.

**الحالة: مُغلق ✅** — كل الـ fallbacks الوهمية الحقيقية أُصلحت؛ يتبقّى في
`ALLOWLIST` 3 مواضع آباء-تحكّم بقصد (datafix)، والحارس يمنع أي ارتداد جديد.
assertion tests: `tests/integration/commissionCipPostableLeaves.dynamic.test.ts`
(عمولة 5430 + رسملة CIP 1270→1280) و`depreciationPostableLeaves.dynamic.test.ts`.

**قاعدة الإصلاح المعتمدة:** كل موضع → حلّ لورقة قابلة للترحيل عبر
`accounting_mappings` أولًا، والافتراضي ورقة حقيقية؛ assertion test لكل قيد يُمسّ،
ثم حذف السطر من ALLOWLIST.
