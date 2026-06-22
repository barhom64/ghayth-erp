# عيب جانبي: حسابات احتياطية وهمية في الطبقة المالية (دَين مُتتبَّع)

اكتُشف أثناء إصلاح إدخال المصروف (الدفعة 1، PR #2854). نفس فئة العلّة التي
حجبت المستخدم (`5000`/`1100` آباء غير قابلة للترحيل) موجودة في **20 موضعًا**
آخر — بقايا «تطوير ورا تطوير» (أكواد شجرة قديمة لا تطابق الشجرة المبذورة).

**الحماية:** `scripts/src/check-postable-account-fallbacks.mjs` (ratchet) يمنع أي
جديد. هذه القائمة دَين يُقلَّص بقرار محاسبي + assertion test لكل موضع.

| الملف:السطر | الكود | النوع | الغرض | الورقة الصحيحة المقترحة (تحقّق) |
|---|---|---|---|---|
| engines/storeEngine.ts:29 | 1100 | أب | store_cash | **1111** الصندوق الرئيسي |
| engines/storeEngine.ts:30 | 4300 | غير موجود | store_revenue | **4111** مبيعات نقدية |
| engines/storeEngine.ts:31 | 2200 | أب | vat_output | ورقة ضريبة مخرجات (تحقّق 215x) |
| engines/storeEngine.ts:32 | 5300 | أب | store_cogs | **5110** تكلفة البضاعة المباعة |
| engines/storeEngine.ts:33 | 1500 | غير موجود | store_inventory | **1151** مخزون (تحقّق) |
| finance-hardening.ts:139 | 1200 | أب | intercompany AR | **1131** عملاء محليون (أو ورقة بينية) |
| finance-hardening.ts:140 | 2100 | أب | intercompany AP | **2111** موردون محليون |
| finance-hardening.ts:141 | 4000 | أب | intercompany revenue | **4130** إيرادات الخدمات |
| finance-custodies.ts:636/843/1025 | 1400 | غير موجود | custody_account | ورقة عهدة (تحقّق 1113/114x) |
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
