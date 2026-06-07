# FINANCE_ACCOUNT_USAGE_POLICY.md

دليل سياسة استخدام الحسابات (accountUsage) في النظام المالي الموحّد لغيث.

## لماذا

تصنيف الحساب إلى `asset / liability / equity / revenue / expense` غير كافٍ
لقرارات التشغيل. عند صرف نقدي يجب أن نعرف أيّ الحسابات هي *صناديق نقدية*
فعلاً، وعند تحويل بنكي أيّها *بنوك*، وعند الصرف من العهدة أيّها *عُهد*.
لذلك أضفنا بُعداً ثانياً: `accountUsage`.

## التصنيف (accountUsage)

| المفتاح | العربية | النوع المحاسبي الغالب |
|---|---|---|
| `cash_box` | صندوق نقدي | asset |
| `bank` | حساب بنكي | asset |
| `custody` | عهدة | asset |
| `card` | بطاقة (مدى/ائتمان) | asset/liability |
| `cheque` | شيكات تحت التحصيل | asset |
| `receivable` | ذمم مدينة (عملاء) | asset |
| `payable` | ذمم دائنة (موردون) | liability |
| `inventory` | مخزون | asset |
| `fixed_asset` | أصل ثابت | asset |
| `accumulated_depreciation` | مجمع الإهلاك | asset (contra) |
| `vat_input` | ضريبة مدخلات | asset |
| `vat_output` | ضريبة مخرجات | liability |
| `wht_payable` | استقطاع ضريبي مستحق | liability |
| `loan` | قروض/تمويل | liability |
| `operating_expense` | مصروف تشغيلي | expense |
| `cogs` | تكلفة المبيعات | expense |
| `payroll_expense` | مصروف رواتب | expense |
| `revenue` | إيراد | revenue |
| `equity` | حقوق ملكية | equity |
| `other` | غير مصنّف | * |

## سياسة وراثة الأبناء (childrenUsagePolicy)

تُحدَّد على الحساب الأب وتحكم كيف يُصنَّف الأبناء:

| المفتاح | السلوك |
|---|---|
| `inherit_locked` | الابن يرث usage الأب إجبارياً ولا يُسمح بالتجاوز (مثال: «البنوك» كلها bank). |
| `inherit_default` | الابن يأخذ usage الأب افتراضياً مع السماح بالتجاوز اليدوي. |
| `mixed_allowed` | الابن قد يكون أي usage (مثال: حساب أب تجميعي عام). |
| `manual_required` | يجب على المُنشئ تحديد usage صراحةً، لا قيمة افتراضية. |

الافتراضي على مستوى النظام: `inherit_default`.

## ربط طريقة الدفع/القبض بالحسابات المسموحة

تُفرض في الـBackend (financePostingPolicy.ts) ولا تعتمد على `code.startsWith`:

| طريقة الدفع | الـusage المسموح للحساب المصدر/الوجهة |
|---|---|
| `cash` (نقدي) | `cash_box` |
| `bank_transfer` (تحويل بنكي) | `bank` |
| `custody` (من العهدة) | `custody` |
| `credit_card` / `card` (بطاقة) | `card` |
| `check` / `cheque` (شيك) | `bank`, `cheque` |

أي محاولة لاختيار حساب مصدر لا يطابق طريقة الدفع تُرفض في الـBackend
حتى لو تجاوز المستخدم الواجهة، عبر `assertPaymentSourceAllowed()`.

## التصنيف التلقائي للحسابات الحالية (Migration)

عند إضافة العمود نصنّف الحسابات القائمة آلياً بالاستدلال على `type` + بادئة
`code` السعودية القياسية (11xx نقد/بنوك، 12xx ذمم مدينة، 13xx مخزون،
14xx ضريبة مدخلات/سلف، 15xx–16xx أصول ثابتة، 21xx ذمم دائنة، 23xx ضريبة
مخرجات، 4xxx إيراد، 5xxx مصروف). الحسابات التي يتعذّر تصنيفها تبقى
`NULL` وتظهر في **تقرير الفجوات** (`GET /finance/accounts/usage-gaps`)
ليصنّفها المحاسب يدوياً. لا تُحذف الأعمدة القديمة.

## معايير القبول المرتبطة

- لا يوجد اختيار حساب مصدر دفع مخالف لطريقة الدفع (مفروض backend).
- كل حساب جديد/فرعي يعرض حقل التصنيف ويعمل فعلياً.
- وراثة الأب تُطبَّق حسب childrenUsagePolicy.
- تقرير فجوات للحسابات غير المصنّفة.
