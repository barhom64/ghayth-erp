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
| eventListeners.ts:1803 | 5200 | أب (رواتب!) | commission_expense | ورقة عمولات (لا 5200 الرواتب) |
| eventListeners.ts:1934 · umrahCommissionEngine.ts:204 | 6200 | غير موجود | عمولة عمرة | ورقة مصروف عمولة حقيقية |
| finance-algorithms.ts:40/46 | 1120 | أب | bank | **1124** بنوك (أو ورقة بنك رئيسي) |
| finance-algorithms.ts:1290 | 1290 | غير موجود | accumulated depreciation | ورقة مجمّع إهلاك حقيقية |
| finance-algorithms.ts:1500/1530/1590 · cron:1590 | 15xx | غير موجود | prepaid/other assets | أوراق 117x المدفوعات المقدمة |
| finance-algorithms.ts:6100 · cron:6100 | 6100 | غير موجود | COGS/depreciation expense | **5110/5710** |

| finance/datafixInventory.ts | 1130/1140/2110 | آباء | AR/سلف/AP datafix | 1131 / 1141 / 2111 |

**قاعدة الإصلاح:** كل موضع → حلّ لورقة قابلة للترحيل عبر `accounting_mappings`
أولًا، والافتراضي ورقة حقيقية؛ وإن غاب → رسالة إرشاد لا قيد ميت. assertion test
لكل قيد يُمسّ. ثم احذف السطر من ALLOWLIST في scripts/src/check-postable-fallbacks.mjs.
