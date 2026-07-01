# البند ٤ — «الكيان يقود التجربة» (ملحق أ): محضر الاكتمال

- **التاريخ:** 2026-06-29
- **الحالة:** ✅ **مكتمل بالكامل** — المبدآن مبنيّان ومُفعَّلان عبر كل المسارات، الشرائح
  ١…٧+ كلها تُرحَّل عبر مسار الترحيل المعتمد حاملةً بُعد كيانها، والاكتمال مقفول بعقد
  ثابت (`tests/unit/bund4EntityFlowsCompleteness.test.ts`).
- **التحكيم:** «نعم» إبراهيم الدائمة للبند ٤ معطاة؛ هذا المحضر إبلاغٌ بالنتيجة لا استئذان.

## المبدآن — مبنيّان ومُفعَّلان

| المبدأ | التنفيذ | الحماية (اختبار) |
|--------|---------|------------------|
| **(١) التوجيه يقرّر الحساب** (costBearer) | `financeDocumentService.resolveCostBearerAccounts` (مصروف→ذمة الطرف) + `registerCostBearerObligations`/`resolveObligationParty` (ج-١) + `cashAccountDims` (ج-٤، ذمة المورّد) | `costBearerPartyLinkAssertion` · `creditFuelVendorApAssertion` · م٥ |
| **(٢) حساب خاص لكل كيان** | `journalLineDimensionalEnricher.substituteSubsidiaryAccountCodes` يستبدل الحساب الأب بالفرعي للكيان حسب البُعد — **مُفعَّل افتراضًا** (#3062) لكل الأبعاد الستة (موظف/عميل/مورّد/سائق/مركبة/عقار) | `subsidiarySubstitutionDefaultOn` · `subsidiaryCodeSubstitutionSmoke` · `journalLineDimensionalEnricherSmoke` |

## مصفوفة الشرائح (ملحق أ) — كلها مُرحَّلة ببُعد الكيان

| # | الكيان · الواقعة | المحرّك (مسار معتمد) | البُعد | مَن يتحمّل (المبدأ ١) |
|---|---|---|---|---|
| ١ | مركبة · وقود | `fleetEngine` ← `postFinancialDocument` (نقطة `fuel-event`) | vehicleId | شركة→مصروف · سائق→ذمته · آجل→ذمة المورّد (ج-٤) |
| ٢ | مركبة · صيانة | `fleetEngine.postMaintenanceGL` | vehicleId | company/driver · مستردّ: insurance/**warranty**(ج-٦)/customer/tenant/third_party |
| ٣ | مركبة · تأمين 🔁 | `fleetEngine.postInsuranceGL` → `openPrepaidSchedule` (ج-٧) | vehicleId | شركة (إطفاء شهري) |
| ٣′ | مركبة · حادث/مخالفة/رحلة/شحن | `postAccidentGL`/`postTrafficViolationGL`/`postTripGL`/`postCargoDeliveryGL` | vehicleId/driverId | حسب التوجيه |
| ٤ | عقار · إيجار/تحصيل | `propertiesEngine.postRentRevenueGL` (+ FIFO) | propertyId/unitId | — |
| ٥ | عقار · صيانة | `postMaintenanceExpenseGL` (مملوك) · `postMaintenanceOwnerBillingGL` (مُدار) | propertyId/unitId/clientId | مملوك→مصروف · مُدار→ذمة المالك |
| ٥′ | عقار · تأمين/إيداع/إنهاء/بيع/قسط/توزيع مالك | `postSecurityDepositGL`/`postEarlyTerminationGL`/`postSaleGL`/`postInstallmentPaymentGL`/`postOwnerPayoutGL` | propertyId/clientId | حسب التوجيه |
| ٦ | موظف · سلفة/عهدة/راتب | `hrEngine.postLoanDisbursementGL`/`postPayrollGL`/`postExitSettlementGL`/`postMonthlyAccrualsGL` | employeeId/departmentId | سلفة = ذمة على الموظف؛ خصم بالأقساط |
| ٧+ | عمرة · وكيل/موسم/نقل/غرامة | `umrahEngine.postAgentInvoiceGL`/`postTransportExpenseGL`/`postPenaltyGL` | umrahAgentId/umrahSeasonId/vehicleId/driverId | حسب التوجيه؛ الموسم/الوكيل مركز ربح |
| ٧+ | قضية قانونية · استرداد | `legalEngine` (postJournalEntry) | — | استرداد عبر `legal_receivable` ثم إغلاقها بالتحصيل |
| ٧+ | مخزون · تكلفة المبيعات | `inventory/cogsPosting` (مدمج في اعتماد الفاتورة) | productId | — |

> **النتيجة:** كل واقعة كيان في النظام تُرحَّل عبر مسار الترحيل المعتمد (`postJournalEntry`/
> `postFinancialDocument`) حاملةً بُعد كيانها، فيمنحها الـenricher حسابها الفرعي الخاص
> تلقائيًّا (المبدأ ٢)، ويُفرّع التوجيه المتحمِّل حيث ينطبق (المبدأ ١).

## ما أُنجِز هذه الجلسة (سدّ الفجوات الحقيقية)

شرائح الأسطول كانت تحمل الفجوات الفعلية (صيانة بلا costBearer، تأمين بلا إطفاء)
فبُنيت؛ بقية المسارات (عقار/موظف/عمرة/قضية) كانت مبنيّة سلفًا ومطابقة للمبدأين:

- **شرائح ١-٣** (وقود costBearer + آجل · صيانة costBearer+حساب · تأمين إطفاء) — #3034/#3057/#3067 وما تلاها.
- **التوحيد:** «حساب خاص لكل كيان» مُفعَّل افتراضًا لكل المسارات — #3062.
- **القضايا الجانبية التسع** (ج-١…ج-٩) — مدموجة (انظر `bund4-side-issues.md`).
- **عقد الاكتمال:** `bund4EntityFlowsCompleteness.test.ts` (٧) — يقفل مصفوفة الشرائح
  عبر المسارات حارسًا ضد ارتداد يفصل واقعةَ كيانٍ عن بُعدها.

## بند اختياري ينتظر قرار إبراهيم (لا يُبنى بلا توجيه)

- **تحليلات ربحية موسم العمرة المجمّعة عبر واجهة مخصّصة:** الأساس مبنيّ (الموسم/الوكيل
  مركز ربح + تقرير `/reports/profitability/umrah-agent` + أبعاد على القيد). لوحة ربحية
  موسمية إضافية تحسينٌ واجهيّ اختياري — تُبنى عند توجيه صريح فقط (تفاديًا لبناء تخميني).

## الحوكمة
- لا هجرة في عقد الاكتمال (اختبار + وثيقة فقط).
- بوابة الدستور + المجلس على diff العقد قبل الدمج.
