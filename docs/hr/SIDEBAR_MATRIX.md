# مصفوفة القائمة الجانبية — العنصر / المسار / الحارس (#2077 PR-8a)

> توليد آلي من `navigation.registry.ts` × `routes/*`. أعد التوليد عبر `node /tmp/gen-sidebar-matrix.mjs`.

| العنصر | المسار | Route مُسجَّل؟ | module | minRoleLevel | perm | subKey |
|---|---|---|---|---|---|---|
| لوحة التحكم | `/dashboard` | ✅ | home | — | — | — |
| صندوق الأعمال | `/work-inbox` | ✅ | — | — | — | — |
| كل الخدمات | `/services` | ✅ | — | — | — | — |
| التقويم الموحد | `/calendar` | ✅ | — | 20 | — | — |
| مساحاتي | `/my-space` | ✅ | — | — | — | — |
| مساحتي | `/my-space` | ✅ | — | — | — | — |
| مساحة العمل | `/workspace` | ✅ | — | — | — | — |
| إشعاراتي | `/notifications` | ✅ | — | — | — | — |
| لوحات الإدارة | `/manager-board` | ✅ | — | 40 | — | — |
| مساحة المدير | `/manager-workspace` | ✅ | — | — | — | — |
| لوحات مؤشرات المسارات | `/module-dashboards` | ✅ | — | — | — | — |
| لوحة القيادة التنفيذية | `/exec-dashboard` | ✅ | — | 70 | — | — |
| اسأل غيث | `/assistant` | ✅ | — | 70 | — | — |
| مراكز التحكم | `/action-center` | ✅ | — | 20 | — | — |
| مركز العمليات | `/operations-center` | ✅ | — | 40 | — | — |
| مركز الالتزامات | `/obligations` | ✅ | — | 30 | — | — |
| طلباتي | `/my-requests` | ✅ | — | — | — | — |
| كتالوج خدمات HR | `/hr/services` | ✅ | — | — | — | — |
| طلب إجازة | `/hr/leaves/create` | ✅ | — | — | — | — |
| معلوماتي | `/my-attendance` | ✅ | — | — | — | — |
| كشف راتبي | `/my-payslip` | ✅ | — | — | — | — |
| سلفي | `/my-loans` | ✅ | — | — | — | — |
| ساعاتي الإضافية | `/my-overtime` | ✅ | — | — | — | — |
| تقييمي | `/my-performance` | ✅ | — | — | — | — |
| مستنداتي | `/my-documents` | ✅ | — | — | — | — |
| لوحة الموارد البشرية | `/module-dashboards?tab=hr` | ✅ | bi | — | — | — |
| الموظفون | `/employees` | ✅ | hr | — | — | employees |
| وظائف التوظيف | `/hr/recruitment` | ✅ | — | — | — | recruitment |
| المتقدمين | `/hr/recruitment/applications` | ✅ | — | — | — | recruitment |
| تفعيل الموظفين | `/hr/employee-activation` | ✅ | — | — | — | employees |
| مراجعة التعيين | `/hr/onboarding-review` | ✅ | — | — | — | employees |
| نقل الموظفين | `/hr/transfers` | ✅ | — | — | — | employees |
| الوثائق المنتهية | `/hr/expiring-documents` | ✅ | — | — | — | employees |
| الهيكل التنظيمي | `/hr/organization` | ✅ | — | — | — | organization |
| الهيكل المصوّر | `/hr/organization/structure` | ✅ | — | — | — | organization |
| التفويضات | `/hr/delegations` | ✅ | — | — | — | organization |
| وثائق الموظفين | `/hr/documents` | ✅ | — | — | — | employees |
| عقود الموظفين | `/hr/contracts` | ✅ | — | — | — | employees |
| الخطابات الرسمية | `/hr/official-letters` | ✅ | — | — | — | employees |
| نهاية الخدمة | `/hr/exit` | ✅ | — | — | — | employees |
| النشاط والحضور | `/hr/attendance` | ✅ | hr | — | — | attendance |
| تقارير الحضور | `/hr/attendance/reports` | ✅ | — | — | — | attendance |
| التتبع الميداني | `/hr/attendance/field-tracking` | ✅ | — | — | — | attendance |
| تسجيل بالرمز المصوّر | `/hr/attendance/qr-scanner` | ✅ | — | — | — | attendance |
| جدول الورديات | `/hr/shifts` | ✅ | — | — | — | shifts |
| إدارة الورديات | `/hr/shifts/management` | ✅ | — | — | — | shifts |
| الطلبات | `/hr/services` | ✅ | hr | — | — | services |
| صندوق الواردات HR | `/hr/approvals` | ✅ | — | — | — | leaves |
| طلبات الإجازة | `/hr/leaves` | ✅ | — | — | — | leaves |
| إدارة الإجازات | `/hr/leaves/management` | ✅ | — | — | — | leaves |
| الوقت الإضافي | `/hr/overtime` | ✅ | — | — | — | attendance |
| طلبات الأعذار | `/hr/excuse-requests` | ✅ | — | — | — | attendance |
| سلاسل الموافقات | `/hr/leaves/approval-chains` | ✅ | — | — | — | leaves |
| الامتثال والجزاءات | `/hr/violations` | ✅ | hr | — | — | violations |
| إدارة المخالفات | `/hr/violations/management` | ✅ | — | — | — | violations |
| المحاضر التأديبية | `/hr/violations?tab=memos` | ✅ | — | — | — | violations |
| الرصد التلقائي | `/hr/violations/auto-detection` | ✅ | — | — | — | violations |
| تصعيد العقوبات | `/hr/violations/penalty-escalation` | ✅ | — | — | — | violations |
| لائحة الانضباط | `/hr/discipline/regulation` | ✅ | — | — | — | violations |
| السعودة (نطاقات) | `/hr/saudization` | ✅ | — | — | — | employees |
| WPS / مدد / بنوك | `/hr/saudi-compliance` | ✅ | — | — | — | payroll |
| الأداء والتطوير | `/hr/performance` | ✅ | hr | — | — | performance |
| التقييم المتقدم | `/hr/performance/advanced` | ✅ | — | — | — | performance |
| التقييم 360° | `/hr/evaluation-360` | ✅ | — | — | — | performance |
| خطط التطوير الفردية | `/hr/idp` | ✅ | — | — | — | performance |
| البرامج التدريبية | `/hr/training` | ✅ | — | — | — | training |
| التدريب المتقدم | `/hr/training/advanced` | ✅ | — | — | — | training |
| الرواتب والمستحقات | `/hr/payroll` | ✅ | hr | — | — | payroll |
| مكونات الرواتب | `/hr/payroll/salary-components` | ✅ | — | — | — | payroll |
| سلف الموظفين | `/hr/loans` | ✅ | — | — | — | payroll |
| مكافأة نهاية الخدمة | `/hr/gratuity` | ✅ | — | — | — | payroll |
| الاستحقاقات الشهرية | `/hr/accruals` | ✅ | — | — | — | payroll |
| نظام حماية الأجور (WPS) | `/hr/wps` | ✅ | — | — | — | payroll |
| التقارير | `/hr/turnover-report` | ✅ | hr | — | — | performance |
| تقارير الحضور | `/hr/attendance/reports` | ✅ | — | — | — | attendance |
| إعدادات الموارد البشرية | `/hr/attendance-policy` | ✅ | hr | — | — | attendance |
| الإجازات الرسمية | `/hr/public-holidays` | ✅ | — | — | — | leaves |
| نموذج المؤسسة التشغيلي | `/admin/org-model` | ✅ | — | — | — | settings |
| الشجرة التنظيمية | `/hr/org-tree` | ✅ | — | — | — | employees |
| عضويات المؤسسة (فرق/لجان/مشاريع) | `/admin/org-memberships` | ✅ | — | — | — | settings |
| أوزان التقييم وترتيب الأداء | `/hr/scoring-weights` | ✅ | — | — | — | performance |
| الصلاحيات الفعلية للمستخدم | `/admin/effective-permissions` | ✅ | — | — | — | settings |
| فئات الموظفين وسياسات الحضور | `/hr/attendance-categories` | ✅ | — | — | — | attendance |
| اللوحات والإقفال | `/finance` | ✅ | finance | — | — | — |
| مركز سير العمل المالي | `/finance/workflows-hub` | ✅ | — | — | — | — |
| CFO Cockpit | `/finance/cfo-cockpit` | ✅ | — | — | — | — |
| فحص الإغلاق اليومي | `/finance/daily-close-checklist` | ✅ | — | — | — | — |
| حزمة الإقفال الشهري | `/finance/monthly-close-pack` | ✅ | — | — | — | — |
| الحسابات والقيود | `/finance/accounts` | ✅ | finance | — | — | — |
| فجوات تصنيف الحسابات | `/finance/usage-gaps` | ✅ | — | — | — | — |
| حسابات فرعية | `/finance/subsidiary-accounts` | ✅ | — | — | — | — |
| مراكز التكلفة | `/finance/cost-centers` | ✅ | — | — | — | — |
| شجرة مراكز التكلفة | `/finance/cost-centers/tree` | ✅ | — | — | — | — |
| ترتيب مراكز التكلفة | `/finance/cost-centers/ranking` | ✅ | — | — | — | — |
| كشف الحساب التحليلي | `/finance/entity-statements` | ✅ | — | — | — | — |
| القيود اليومية | `/finance/journal` | ✅ | — | — | — | — |
| ميزان مع تتبّع | `/finance/trial-balance-drilldown` | ✅ | — | — | — | — |
| مقارنة ميزان | `/finance/trial-balance-comparison` | ✅ | — | — | — | — |
| كاشف الشذوذ | `/finance/gl-anomaly-detector` | ✅ | — | — | — | — |
| طابور الترحيل | `/finance/gl-posting-queue` | ✅ | — | — | — | — |
| مركز التسويات | `/finance/reconciliation-hub` | ✅ | — | — | — | — |
| القيود اليدوية | `/finance/journal-manual` | ✅ | — | — | — | — |
| قوالب القيود | `/finance/journal-templates` | ✅ | — | — | — | — |
| قوالب قيود سريعة | `/finance/journal-quick-templates` | ✅ | — | — | — | — |
| معالج عكس قيد | `/finance/journal/reverse` | ✅ | — | — | — | — |
| قيود دورية | `/finance/recurring-journals` | ✅ | — | — | — | — |
| تقويم الدورية | `/finance/recurring-calendar` | ✅ | — | — | — | — |
| أرصدة افتتاحية | `/finance/opening-balances` | ✅ | — | — | — | — |
| الفواتير والسندات | `/finance/invoices` | ✅ | finance | — | — | — |
| صف الإرسال | `/finance/invoice-send-queue` | ✅ | — | — | — | — |
| السندات | `/finance/vouchers` | ✅ | — | — | — | — |
| المصروفات | `/finance/expenses` | ✅ | — | — | — | — |
| مصروفات متعددة البنود | `/finance/expenses/multi-line` | ✅ | — | — | — | — |
| اعتماد مصاريف بالجملة | `/finance/expense-bulk-approvals` | ✅ | — | — | — | — |
| موزّع التكاليف | `/finance/expenses/split` | ✅ | — | — | — | — |
| تحويل بين الحسابات | `/finance/treasury/transfer` | ✅ | — | — | — | — |
| المقبوضات | `/finance/receivables` | ✅ | — | — | — | — |
| سند قبض العميل (تطبيق تلقائي) | `/finance/receivables/receipt` | ✅ | — | — | — | — |
| المدفوعات | `/finance/payments` | ✅ | — | — | — | — |
| دفعات مقدمة من العملاء | `/finance/customer-advances` | ✅ | — | — | — | — |
| منضدة دفعات العملاء المقدمة | `/finance/customer-advances-workbench` | ✅ | — | — | — | — |
| المشتريات والموردين | `/finance/purchase-orders` | ✅ | finance | — | — | — |
| أوامر الشراء (PO) | `/finance/purchase-orders` | ✅ | — | — | — | — |
| الموردين | `/finance/vendors` | ✅ | — | — | — | — |
| منضدة التسوية | `/finance/vendor-settlement-workbench` | ✅ | — | — | — | — |
| كشف حساب مورد للطباعة | `/finance/vendor-statement-print` | ✅ | — | — | — | — |
| ملف المورد 360° | `/finance/vendor-360-sheet` | ✅ | — | — | — | — |
| إنفاق الموردين | `/finance/vendor-spend` | ✅ | — | — | — | — |
| دفعة الدفع | `/finance/payment-run` | ✅ | — | — | — | — |
| تقويم الدفعات | `/finance/ap-payment-calendar` | ✅ | — | — | — | — |
| عقود الموردين | `/finance/contracts` | ✅ | — | — | — | — |
| متابعة عقود الموردين | `/finance/vendor-contracts-tracker` | ✅ | — | — | — | — |
| النقد والذمم | `/finance/treasury` | ✅ | finance | — | — | — |
| الخزينة | `/finance/treasury` | ✅ | — | — | — | — |
| التسوية البنكية | `/finance/bank-reconciliation` | ✅ | — | — | — | — |
| ورقة عمل تسوية حساب | `/finance/account-recon-workpaper` | ✅ | — | — | — | — |
| كشف حساب عميل للطباعة | `/finance/customer-statement-print` | ✅ | — | — | — | — |
| ملف العميل 360° | `/finance/customer-360-sheet` | ✅ | — | — | — | — |
| مخاطر العملاء | `/finance/customer-risk` | ✅ | — | — | — | — |
| مخصص ديون مشكوك فيها | `/finance/bad-debt-provision` | ✅ | — | — | — | — |
| تقادم الذمم الدائنة | `/finance/ap-aging` | ✅ | — | — | — | — |
| لوحة التدفق النقدي | `/finance/cashflow` | ✅ | — | — | — | — |
| توقعات التدفق النقدي | `/finance/cash-flow-forecast` | ✅ | — | — | — | — |
| تقويم النقدية | `/finance/cash-calendar` | ✅ | — | — | — | — |
| 13-Week Cash | `/finance/cash-13week` | ✅ | — | — | — | — |
| حاسبة الوضع النقدي | `/finance/cash-position-calculator` | ✅ | — | — | — | — |
| الأصول والعهد | `/finance/fixed-assets` | ✅ | finance | — | — | — |
| سجل الأصول التحليلي | `/finance/fixed-asset-register` | ✅ | — | — | — | — |
| إهلاك دفعة واحدة | `/finance/fixed-assets/batch-depreciate` | ✅ | — | — | — | — |
| العهد | `/finance/custodies` | ✅ | — | — | — | — |
| منضدة العُهد | `/finance/custody-workbench` | ✅ | — | — | — | — |
| تقرير العهد | `/finance/custodies/report` | ✅ | — | — | — | — |
| الموازنة والفترات والالتزامات | `/finance/budget` | ✅ | finance | — | — | — |
| خريطة حرارية | `/finance/budget-heatmap` | ✅ | — | — | — | — |
| الفترات المالية | `/finance/fiscal-periods` | ✅ | — | — | — | — |
| إقفال الفترات | `/finance/fiscal-periods-v2` | ✅ | — | — | — | — |
| فحص قبل الإقفال | `/finance/period-close-preflight` | ✅ | — | — | — | — |
| إقفال السنة المالية | `/finance/year-end-close` | ✅ | — | — | — | — |
| الالتزامات | `/finance/commitments` | ✅ | — | — | — | — |
| الضمانات البنكية | `/finance/bank-guarantees` | ✅ | — | — | — | — |
| التكاليف والتسويات | `/finance/project-costing` | ✅ | finance | — | — | — |
| محفظة المركبات | `/finance/vehicle-portfolio` | ✅ | — | — | — | — |
| Cost Center P&L | `/finance/cost-center-pnl` | ✅ | — | — | — | — |
| تقييم المخزون | `/finance/inventory-costing` | ✅ | — | — | — | — |
| المعاملات البينية | `/finance/intercompany` | ✅ | — | — | — | — |
| الضرائب والتقارير | `/finance/tax` | ✅ | finance | — | — | — |
| رموز الضريبة | `/finance/tax-codes` | ✅ | — | — | — | — |
| قواعد التسعير | `/finance/pricing-rules` | ✅ | — | — | — | — |
| فئات WHT | `/finance/wht-categories` | ✅ | — | — | — | — |
| تقويم الإقرارات | `/finance/tax-filing-calendar` | ✅ | — | — | — | — |
| جاهزية ZATCA | `/finance/vat-filing-readiness` | ✅ | — | — | — | — |
| ZATCA Reports Hub | `/finance/reports/zatca` | ✅ | — | — | — | — |
| تسوية VAT | `/finance/reports/vat-reconciliation` | ✅ | — | — | — | — |
| ملخص WHT | `/finance/reports/wht-summary` | ✅ | — | — | — | — |
| إعداد إقرار WHT | `/finance/wht-filing-workbench` | ✅ | — | — | — | — |
| التقارير المالية | `/finance/reports` | ✅ | — | — | — | — |
| P&L مقابل الميزانية | `/finance/reports/is-vs-budget` | ✅ | — | — | — | — |
| اتجاه قائمة الدخل | `/finance/reports/is-trend` | ✅ | — | — | — | — |
| قائمة التدفقات النقدية | `/finance/reports/cash-flow-statement` | ✅ | — | — | — | — |
| Y/Y Comparison | `/finance/reports/yoy` | ✅ | — | — | — | — |
| معدل الحرق | `/finance/expense-burn-rate` | ✅ | — | — | — | — |
| GL Health Score | `/finance/gl-health` | ✅ | — | — | — | — |
| محفظة ربحية المشاريع | `/finance/project-portfolio` | ✅ | — | — | — | — |
| محفظة ربحية العقارات | `/finance/property-portfolio` | ✅ | — | — | — | — |
| محفظة ربحية وكلاء العمرة | `/finance/umrah-agent-portfolio` | ✅ | — | — | — | — |
| محفظة مجموعات العمرة | `/finance/umrah-group-portfolio` | ✅ | — | — | — | — |
| محفظة مواسم العمرة | `/finance/umrah-season-portfolio` | ✅ | — | — | — | — |
| محلّل مزيج الإيرادات | `/finance/revenue-mix` | ✅ | — | — | — | — |
| محلّل مزيج المصاريف | `/finance/expense-mix` | ✅ | — | — | — | — |
| اتجاه DSO للسيولة | `/finance/reports/dso-trend` | ✅ | — | — | — | — |
| ملخص التكلفة (CoGS) | `/finance/reports/cogs-summary` | ✅ | — | — | — | — |
| تقييم المخزون | `/finance/reports/inventory-valuation` | ✅ | — | — | — | — |
| دوران المخزون | `/finance/reports/inventory-turnover` | ✅ | — | — | — | — |
| تنبيهات صلاحية الدفعات | `/finance/reports/lot-expiry-alerts` | ✅ | — | — | — | — |
| مخزون سالب | `/finance/reports/negative-stock` | ✅ | — | — | — | — |
| انحرافات الميزانية | `/finance/budget-variance` | ✅ | — | — | — | — |
| اعتماد الميزانية | `/finance/budget-approvals` | ✅ | — | — | — | — |
| الصناديق والارتباطات | `/finance/intake` | ✅ | finance | — | — | — |
| Approvals Inbox | `/finance/approvals-inbox` | ✅ | — | — | — | — |
| ملف الجهة 360° | `/finance/entity-360` | ✅ | — | — | — | — |
| ترتيب الجهات | `/finance/entity-ranking` | ✅ | — | — | — | — |
| الجهات الخاملة | `/finance/dormant-entities` | ✅ | — | — | — | — |
| GL Integrity Gaps | `/finance/reports/gl-integrity-gaps` | ✅ | — | — | — | — |
| فجوات العمليات المالية | `/finance/reports/operation-gaps` | ✅ | — | — | — | — |
| Unmapped Lines | `/finance/reports/unmapped-lines` | ✅ | — | — | — | — |
| Posting Activity | `/finance/journal/activity` | ✅ | — | — | — | — |
| سلف الرواتب | `/finance/salary-advances` | ✅ | — | — | — | — |
| الطلبات المالية | `/finance/financial-requests` | ✅ | — | — | — | — |
| التحصيل والديون | `/finance/collections` | ✅ | finance | — | — | — |
| تقادم الذمم | `/finance/ar-aging` | ✅ | — | — | — | — |
| متابعة Dunning | `/finance/dunning` | ✅ | — | — | — | — |
| مراحل التصعيد | `/finance/collection` | ✅ | — | — | — | — |
| الديون المشكوك بها | `/finance/bad-debt-provision` | ✅ | — | — | — | — |
| الديون المعدومة | `/finance/bad-debt` | ✅ | — | — | — | — |
| العملات الأجنبية (FX) | `/finance/fx-rates` | ✅ | finance | — | — | — |
| إعادة التقييم | `/finance/fx-revaluation` | ✅ | — | — | — | — |
| سجل إعادة التقييم | `/finance/fx-revaluation/history` | ✅ | — | — | — | — |
| محرك التوجيه المحاسبي | `/finance/settings` | ✅ | finance | — | — | — |
| قواعد التوجيه | `/finance/allocation-rules` | ✅ | — | — | — | — |
| التوجيه البُعدي | `/finance/dimensional-routing` | ✅ | — | — | — | — |
| كتالوج المنتجات | `/finance/product-catalog` | ✅ | — | — | — | — |
| تشخيص التغطية | `/finance/allocation-coverage` | ✅ | — | — | — | — |
| سجل التوجيه | `/finance/allocation-results` | ✅ | — | — | — | — |
| التعديلات اليدوية | `/finance/overrides-report` | ✅ | — | — | — | — |
| تجاوزات الإلزام | `/finance/allocation-override-log` | ✅ | — | — | — | — |
| المشاريع والمهام | `/projects` | ✅ | operations | — | — | — |
| مخطط غانت | `/projects/gantt` | ✅ | — | — | — | — |
| المخاطر | `/projects/risks` | ✅ | — | — | — | — |
| مهام المشاريع | `/projects/tasks` | ✅ | — | — | — | — |
| المهام | `/tasks` | ✅ | — | — | — | — |
| إدارة الأسطول | `/fleet` | ✅ | fleet | — | — | — |
| لوحة التحكم | `/module-dashboards?tab=fleet` | ✅ | bi | — | — | — |
| السائقين | `/fleet/drivers` | ✅ | — | — | fleet.vehicles:list | — |
| الرحلات | `/fleet/trips` | ✅ | — | — | fleet.trips:list | — |
| الصيانة | `/fleet/maintenance` | ✅ | — | — | fleet.maintenance:list | — |
| أثر الصيانة → التذاكر | `/fleet/maintenance-impact` | ✅ | — | — | fleet.maintenance:list | — |
| استهلاك الوقود | `/fleet/fuel` | ✅ | — | — | fleet.trips:list | — |
| التأمين | `/fleet/insurance` | ✅ | — | — | fleet.vehicles:list | — |
| التنبيهات | `/fleet/alerts` | ✅ | — | — | fleet.vehicles:list | — |
| خطط الصيانة الوقائية | `/fleet/preventive-plans` | ✅ | — | — | fleet.maintenance:list | — |
| مخالفات المرور | `/fleet/traffic-violations` | ✅ | — | — | fleet.vehicles:list | — |
| التتبع المباشر | `/fleet/telematics/live-map` | ✅ | — | — | fleet.telematics.live:list | — |
| تنبيهات السلامة الذكية | `/fleet/telematics/ai-alerts` | ✅ | — | — | fleet.telematics.ai_alerts:list | — |
| بطاقة أداء السائقين | `/fleet/telematics/scorecard` | ✅ | — | — | fleet.telematics.ai_alerts:list | — |
| قراءات الحساسات | `/fleet/telematics/sensors` | ✅ | — | — | fleet.telematics.sensors:list | — |
| أرشيف الأدلة | `/fleet/telematics/evidence` | ✅ | — | — | fleet.telematics.ai_alerts:list | — |
| أدلة الفيديو | `/fleet/telematics/video-evidence` | ✅ | — | — | fleet.telematics.video:list | — |
| أجهزة MDVR | `/fleet/telematics/devices` | ✅ | — | — | fleet.telematics.devices:list | — |
| إعدادات CMSV6 | `/fleet/telematics/settings` | ✅ | — | — | fleet.telematics.configure:list | — |
| لوحة التشغيل | `/fleet/telematics/operations` | ✅ | — | — | fleet.telematics.sync:list | — |
| تكلفة الملكية (TCO) | `/fleet/tco` | ✅ | — | — | fleet.vehicles:list | — |
| التقارير | `/fleet/reports` | ✅ | — | — | fleet.vehicles:list | — |
| الشحن والبضائع | `/fleet/cargo` | ✅ | — | — | fleet.cargo:list | — |
| نظام التتبع (Telematics) | `/fleet/telematics` | ✅ | — | — | fleet.telematics.live:list | — |
| الإطارات | `/fleet/tires` | ✅ | — | — | fleet.maintenance:list | — |
| حجوزات النقل | `/fleet/transport/bookings` | ✅ | — | — | fleet.bookings:list | — |
| الإرسال (Dispatch) | `/fleet/transport/dispatch` | ✅ | — | — | fleet.dispatch:list | — |
| خطط المسارات | `/fleet/transport/itineraries` | ✅ | — | — | fleet.dispatch:list | — |
| لوحة عمليات النقل | `/fleet/transport/ops-dashboard` | ✅ | — | — | fleet.dispatch:list | — |
| قواعد تسعير النقل | `/fleet/transport/price-rules` | ✅ | — | — | fleet.bookings:list | — |
| قواعد استقبال النقل | `/fleet/transport/rules` | ✅ | — | — | fleet.bookings:list | — |
| تكامل النقل | `/fleet/transport/integration` | ✅ | — | — | fleet.bookings:list | — |
| المستودعات | `/warehouse` | ✅ | warehouse | — | — | — |
| حركات المخزون | `/warehouse/movements` | ✅ | — | — | — | — |
| الفئات | `/warehouse/categories` | ✅ | — | — | — | — |
| الموردين | `/warehouse/suppliers` | ✅ | — | — | — | — |
| جرد المخزون | `/warehouse/inventory-count` | ✅ | — | — | — | — |
| عمليات متقدّمة (دفعات/تسلسلات/ABC) | `/warehouse/advanced` | ✅ | — | — | — | — |
| المتجر | `/store` | ✅ | store | — | — | — |
| المنتجات | `/store/products` | ✅ | — | — | — | — |
| الطلبات | `/store/orders` | ✅ | — | — | — | — |
| إدارة الأملاك | `/properties/dashboard` | ✅ | property | — | — | — |
| المباني والمجمعات | `/properties/buildings` | ✅ | — | — | — | — |
| الوحدات العقارية | `/properties` | ✅ | — | — | — | — |
| المستأجرون | `/properties/tenants` | ✅ | — | — | — | — |
| الملاك | `/properties/owners` | ✅ | — | — | — | — |
| كشف حساب المالك | `/properties/owners/statement` | ✅ | — | — | — | — |
| عقود الإيجار | `/properties/contracts` | ✅ | — | — | — | — |
| المدفوعات | `/properties/payments` | ✅ | — | — | — | — |
| طلبات الصيانة | `/properties/maintenance` | ✅ | — | — | — | — |
| الفحص والتفتيش | `/properties/inspections` | ✅ | — | — | — | — |
| ودائع الضمان | `/properties/deposits` | ✅ | — | — | — | — |
| تقرير الإشغال | `/properties/occupancy-report` | ✅ | — | — | — | — |
| دليل العقارات | `/properties/guide` | ✅ | — | — | — | — |
| دليل إرشادي مصور | `/guide/properties` | ✅ | — | — | — | — |
| إدارة العمرة | `/umrah` | ✅ | operations | — | — | — |
| المعتمرين | `/umrah/pilgrims` | ✅ | — | — | — | — |
| الوكلاء الرئيسيين | `/umrah/agents` | ✅ | — | — | — | — |
| الوكلاء الفرعيين | `/umrah/sub-agents` | ✅ | — | — | — | — |
| المواسم | `/umrah/seasons` | ✅ | — | — | — | — |
| الباقات | `/umrah/packages` | ✅ | — | — | — | — |
| المجموعات | `/umrah/groups` | ✅ | — | — | — | — |
| التسعير | `/umrah/pricing` | ✅ | — | — | — | — |
| خطط العمولات | `/umrah/commission-plans` | ✅ | — | — | — | — |
| حساب العمولات | `/umrah/commission-calculations` | ✅ | — | — | — | — |
| الفواتير | `/umrah/invoices` | ✅ | — | — | — | — |
| المدفوعات | `/umrah/payments` | ✅ | — | — | — | — |
| معالج المبيعات | `/umrah/sales-wizard` | ✅ | — | — | — | — |
| الغرامات | `/umrah/penalties` | ✅ | — | — | — | — |
| المخالفات النظامية | `/umrah/violations` | ✅ | — | — | — | — |
| النقل والمواصلات | `/umrah/transport` | ✅ | — | — | — | — |
| البرنامج اليومي | `/umrah/daily-runsheet` | ✅ | — | — | — | — |
| التسوية والمطابقة | `/umrah/reconciliation` | ✅ | — | — | — | — |
| المرفقات | `/umrah/attachments` | ✅ | — | — | — | — |
| استيراد البيانات | `/umrah/import` | ✅ | — | — | — | — |
| السكن والإقامة | `/umrah/accommodations` | ✅ | — | — | — | — |
| المعتمرون المعفون | `/umrah/exempt-pilgrims` | ✅ | — | — | — | — |
| الامتثال | `/umrah/compliance` | ✅ | — | — | — | — |
| الإعدادات | `/umrah/settings` | ✅ | — | — | — | — |
| التقارير | `/umrah/reports` | ✅ | — | — | — | — |
| أرصدة الوكلاء الفرعيين | `/umrah/reports/subagent-balances` | ✅ | — | — | — | — |
| حركات المعتمرين | `/umrah/reports/pilgrim-movements` | ✅ | — | — | — | — |
| العملاء والمبيعات | `/clients` | ✅ | crm | — | — | — |
| الفرص التجارية | `/crm` | ✅ | — | — | — | — |
| قمع المبيعات | `/crm/pipeline` | ✅ | — | — | — | — |
| أنشطة علاقات العملاء | `/crm/activities` | ✅ | — | — | — | — |
| الدعم الفني | `/support` | ✅ | support | — | — | — |
| التذاكر | `/support` | ✅ | — | — | — | — |
| قاعدة المعرفة | `/support/kb` | ✅ | — | — | — | — |
| الردود الجاهزة | `/support/replies` | ✅ | — | — | — | — |
| التسويق | `/marketing` | ✅ | marketing | — | — | — |
| مركز الطلبات | `/requests` | ✅ | requests | — | — | — |
| أنواع الطلبات | `/requests/types` | ✅ | — | — | — | — |
| سير العمل | `/requests/workflows` | ✅ | — | — | — | — |
| المستندات | `/documents` | ✅ | documents | — | — | — |
| المجلدات | `/documents/folders` | ✅ | — | — | — | — |
| الأرشيف | `/documents/archive` | ✅ | — | — | — | — |
| صندوق OCR | `/documents/ocr-inbox` | ✅ | — | — | — | — |
| القوالب | `/documents/templates` | ✅ | — | — | — | — |
| رفع مستند | `/documents/upload` | ✅ | — | — | — | — |
| التواصل | `/inbox` | ✅ | comms | — | — | — |
| الصناديق المتصلة | `/mailboxes` | ✅ | — | — | — | — |
| الصادر والوارد | `/correspondence` | ✅ | — | — | — | — |
| مراقبة الاتصالات | `/communications` | ✅ | — | 40 | — | — |
| محرك الإشعارات | `/communications/notification-engine` | ✅ | — | 40 | — | — |
| الشؤون القانونية | `/legal/cases` | ✅ | legal | 40 | — | — |
| القضايا | `/legal/cases` | ✅ | — | — | — | — |
| العقود القانونية | `/legal/contracts` | ✅ | — | — | — | — |
| الوثائق القانونية | `/legal/documents` | ✅ | — | — | — | — |
| الجلسات القادمة | `/legal/sessions` | ✅ | — | — | — | — |
| الأحكام القضائية | `/legal/judgments` | ✅ | — | — | — | — |
| المراسلات | `/legal/correspondence` | ✅ | — | — | — | — |
| الحوكمة والامتثال | `/governance/policies` | ✅ | governance | 60 | — | — |
| السياسات | `/governance/policies` | ✅ | — | — | — | — |
| المخاطر | `/governance/risks` | ✅ | — | — | — | — |
| التدقيق | `/governance/audits` | ✅ | — | — | — | — |
| الامتثال | `/governance/compliance` | ✅ | — | — | — | — |
| الإجراءات التصحيحية | `/governance/capa` | ✅ | — | — | — | — |
| الإقفال اليومي | `/daily-close` | ✅ | — | 40 | — | — |
| ذكاء الأعمال | `/bi` | ✅ | bi | 40 | — | — |
| تحليل الأداء | `/bi/operations` | ✅ | — | — | — | — |
| التقارير الإدارية | `/bi/admin-reports` | ✅ | — | — | — | — |
| مؤشرات الأداء | `/bi/kpis` | ✅ | — | — | — | — |
| التقارير التحليلية | `/bi/reports` | ✅ | — | — | — | — |
| لوحات BI | `/bi/dashboards` | ✅ | — | — | — | — |
| الرؤى الذكية | `/insights` | ✅ | — | — | — | — |
| لوحة الذكاء | `/intelligence` | ✅ | — | — | — | — |
| منصة AI | `/intelligence/ai-workbench` | ✅ | — | — | — | — |
| مدير النظام | `/admin` | ✅ | admin | 90 | — | — |
| إنشاء سريع وصلاحيات | `/admin/user-onboarding` | ✅ | — | — | — | — |
| الأدوار والصلاحيات (v2) | `/admin` | ✅ | — | — | — | — |
| مصفوفة الأدوار | `/admin/rbac-matrix` | ✅ | — | — | admin.roles:view | — |
| مُركّب الأدوار | `/admin/roles-simple` | ✅ | — | — | admin.roles:update | — |
| قوالب المسميات الوظيفية | `/admin/job-titles` | ✅ | — | — | hr.employees:update | — |
| الأدوار (الكلاسيكي) | `/admin/roles` | ✅ | — | — | — | — |
| المراقبة والمتابعة | `/admin/monitoring` | ✅ | — | — | — | — |
| الوثائق الحكومية المنتهية | `/admin/expiring-docs` | ✅ | — | — | — | — |
| مرصد المراقبة الموحّد | `/admin/observability` | ✅ | — | — | — | — |
| خارطة #1139 الحيّة | `/admin/master-plan` | ✅ | — | — | — | — |
| تقرير المخالفات | `/admin/violations-report` | ✅ | — | — | — | — |
| مراقبة الأحداث | `/admin/event-monitor` | ✅ | — | — | — | — |
| صندوق الأحداث الصادرة | `/admin/outbox` | ✅ | — | — | — | — |
| تتبّع الرحلات الحيّة | `/admin/journeys` | ✅ | — | — | — | — |
| مراقبة دورة الحياة | `/admin/lifecycle-monitor` | ✅ | — | — | — | — |
| حاكم النظام | `/admin/system-governor` | ✅ | — | — | — | — |
| سجل الكيانات | `/admin/system-registry` | ✅ | — | — | — | — |
| سجل النطاقات | `/admin/domain-registry` | ✅ | — | — | — | — |
| السياسات والحوكمة | `/admin/policy-engine` | ✅ | — | — | admin:update | — |
| تجاوزات الموافقات | `/admin/approval-overrides` | ✅ | — | — | admin:update | — |
| حماية البيانات (PDPL) | `/admin/pdpl` | ✅ | — | — | — | — |
| التوقيع الرقمي | `/admin/digital-signature` | ✅ | — | — | — | — |
| تشخيص محاسبي | `/admin/gl-reconciliation` | ✅ | — | — | — | — |
| إخفاقات الترحيل | `/admin/posting-failures` | ✅ | — | — | — | — |
| التكاملات والاتصالات | `/admin/integrations` | ✅ | — | — | admin:update | — |
| مركز التحكّم بالاتصالات | `/admin/communication-control` | ✅ | — | — | — | — |
| مركز التحكّم بالـ PBX | `/admin/pbx-control` | ✅ | — | — | — | — |
| توجيه الإشعارات | `/admin/notification-routing` | ✅ | — | — | — | — |
| إعدادات المزوّدات | `/admin/vendor-settings` | ✅ | — | — | — | — |
| تشخيص التكاملات | `/admin/integrations-diagnostics` | ✅ | — | — | admin:update | — |
| مراجعات ZATCA | `/admin/zatca-audits` | ✅ | — | — | — | — |
| حوكمة الذكاء الاصطناعي | `/admin/ai-governance` | ✅ | — | — | — | — |
| مختبر الذكاء | `/admin/intelligence-playground` | ✅ | — | — | admin:update | — |
| استيراد البيانات | `/admin/data-import` | ✅ | — | — | admin:update | — |
| سجلات التدقيق | `/admin/logs` | ✅ | — | — | — | — |
| سجل الحركات | `/activity-log` | ✅ | — | — | — | — |
| الأتمتة | `/automation` | ✅ | admin | 60 | admin:update | — |
| التقارير المجدولة | `/reports/scheduled` | ✅ | bi | 50 | — | — |
| الطباعة والمطبوعات | `/reports/print-log` | ✅ | bi | 40 | print_jobs:read | — |
| موافقات إعادة الطباعة | `/manager-board/reprint-approvals` | ✅ | — | 40 | print:reprint:approve | — |
| قوالب الطباعة | `/settings/print-templates` | ✅ | settings | 70 | templates:read | — |
| قوالب الطباعة (admin) | `/admin/print-templates` | ✅ | admin | 90 | — | — |
| تشخيص الطباعة | `/admin/print-diagnostics` | ✅ | admin | 90 | — | — |
| الإعدادات | `/settings` | ✅ | settings | 70 | — | — |
| الفروع | `/settings/branches` | ✅ | — | — | settings:write | — |
| الشركات | `/settings/companies` | ✅ | — | — | settings:write | — |
| الأقسام | `/settings/departments` | ✅ | — | — | settings:write | — |
| قواعد الأعمال | `/settings/rules` | ✅ | — | — | settings:write | — |
| سجل المراجعة | `/settings/audit-log` | ✅ | — | — | — | — |

## الخلاصة

- إجمالي عناصر القائمة: **408**
- عناصر لها route مُسجَّل: **408**
- عناصر بدون route (تحتاج معالجة): **0**

## كيف تُفلتر القائمة وقت التشغيل؟

`useFilteredNavSections` يطبّق 5 بوابات على كل عنصر قبل العرض:
1. **module** — هل الوحدة ضمن `userRoles[].modules` للدور النشط؟
2. **feature flag** — هل الوحدة مفعّلة على مستوى الشركة؟
3. **minRoleLevel** — هل مستوى الدور النشط ≥ المطلوب؟
4. **subKey** — بوابة العناصر الفرعية داخل الوحدة.
5. **perm** — صلاحية صريحة (`feature:action`) عند تحديدها.

الدليل الحيّ: `scripts/verify-hr-identity-sidebar-journey.sh` — يقيس عدد الوحدات لكل شخصية: owner=27 / hr=6 / employee=5.