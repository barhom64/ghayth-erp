import { lazy } from "react";
import { redirectTo } from "@/components/shared/redirect-to";

// R.1.5 — Finance Dashboard is the new landing page for /finance. The
// chart of accounts stays at /finance/accounts (see the separate route
// entry below). This lets users hit a real overview page instead of
// being dropped into a list view, and demonstrates the unified page
// templates (PageShell, PageStatusBadge, useApiMutation) as a reference
// for the cascade to the rest of the module.
const Dashboard = lazy(() => import("@/pages/finance/dashboard"));
const CfoCockpit = lazy(() => import("@/pages/finance/cfo-cockpit"));
const FinanceWorkflowsHub = lazy(() => import("@/pages/finance/finance-workflows-hub"));
const MonthlyClosePack = lazy(() => import("@/pages/finance/monthly-close-pack"));
const Amortization = lazy(() => import("@/pages/finance/amortization"));
const DeferredRevenue = lazy(() => import("@/pages/finance/deferred-revenue"));
const SubsidiaryAccountFailures = lazy(() => import("@/pages/finance/subsidiary-account-failures"));
const MisparentedSubsidiaries = lazy(() => import("@/pages/finance/misparented-subsidiaries"));
const Cip = lazy(() => import("@/pages/finance/cip"));
const ClassificationCenter = lazy(() => import("@/pages/finance/classification-center"));
const InsurancePremium = lazy(() => import("@/pages/finance/insurance-premium"));
const DailyCloseChecklist = lazy(() => import("@/pages/finance/daily-close-checklist"));
const GlHealthScore = lazy(() => import("@/pages/finance/gl-health-score"));
const ApprovalsInbox = lazy(() => import("@/pages/finance/approvals-inbox"));
const FinanceIntakeCenter = lazy(() => import("@/pages/finance/finance-intake-center"));
const Accounts = lazy(() => import("@/pages/finance/accounts"));
const AccountsUsageGaps = lazy(() => import("@/pages/finance/accounts-usage-gaps"));
const AccountsCreate = lazy(() => import("@/pages/create/finance/accounts-create"));
const AccountsEdit = lazy(() => import("@/pages/create/finance/accounts-edit"));
const AccountDetail = lazy(() => import("@/pages/details/account-detail"));
const CostCenters = lazy(() => import("@/pages/finance/cost-centers"));
const CostCentersTree = lazy(() => import("@/pages/finance/cost-centers-tree"));
const CostCenterPnl = lazy(() => import("@/pages/finance/cost-center-pnl"));
const CostCenterDrillPnl = lazy(() => import("@/pages/finance/cost-center-drill-pnl"));
const CostCenterRanking = lazy(() => import("@/pages/finance/cost-center-ranking"));
const DimensionalRouting = lazy(() => import("@/pages/finance/dimensional-routing"));
const DormantEntities = lazy(() => import("@/pages/finance/dormant-entities"));
const EntityPnl = lazy(() => import("@/pages/finance/entity-pnl"));
const EntityRanking = lazy(() => import("@/pages/finance/entity-ranking"));
const TaxCodes = lazy(() => import("@/pages/finance/tax-codes"));
const PricingRules = lazy(() => import("@/pages/finance/pricing-rules"));
const TaxCodesCreate = lazy(() => import("@/pages/create/finance/tax-codes-create"));
const WhtCategories = lazy(() => import("@/pages/finance/wht-categories"));
const WhtCategoriesCreate = lazy(() => import("@/pages/create/finance/wht-categories-create"));
const TaxCodesEdit = lazy(() => import("@/pages/create/finance/tax-codes-edit"));
const WhtCategoriesEdit = lazy(() => import("@/pages/create/finance/wht-categories-edit"));
const LotExpiryAlerts = lazy(() => import("@/pages/finance/lot-expiry-alerts"));
const CogsSummary = lazy(() => import("@/pages/finance/cogs-summary"));
const LedgerTruth = lazy(() => import("@/pages/finance/ledger-truth"));
const InventoryValuation = lazy(() => import("@/pages/finance/inventory-valuation"));
const NegativeStock = lazy(() => import("@/pages/finance/negative-stock"));
const InventoryTurnover = lazy(() => import("@/pages/finance/inventory-turnover"));
const GlIntegrityGaps = lazy(() => import("@/pages/finance/gl-integrity-gaps"));
const OperationGaps = lazy(() => import("@/pages/finance/operation-gaps"));
const GlAnomalyDetector = lazy(() => import("@/pages/finance/gl-anomaly-detector"));
const UnmappedLines = lazy(() => import("@/pages/finance/unmapped-lines"));
const WhtSummary = lazy(() => import("@/pages/finance/wht-summary"));
const WhtFilingWorkbench = lazy(() => import("@/pages/finance/wht-filing-workbench"));
const ZatcaReportsHub = lazy(() => import("@/pages/finance/zatca-reports-hub"));
const VatReconciliation = lazy(() => import("@/pages/finance/vat-reconciliation"));
const VatFilingReadiness = lazy(() => import("@/pages/finance/vat-filing-readiness"));
const Vouchers = lazy(() => import("@/pages/finance/vouchers"));
// الصفحة الموحّدة لتسجيل الواقعة المالية (تبويبات: قبض/صرف · مبيعات · مشتريات — تبدّل
// النوع في المكان). تضمّ نماذج الأنواع الثلاثة، وكلٌّ يبقى على منفذه القائم (doc 25
// §١١.٢: روحان لنفس السجل — لا نقل منطق، لا هجرة، لا مساس بالدفتر).
const FinanceCreatePage = lazy(() => import("@/pages/create/finance/finance-create-page"));
const FinancialImportGateway = lazy(() => import("@/pages/create/finance/financial-import-gateway"));
const CustomerCollection = lazy(() => import("@/pages/create/finance/customer-collection"));
const VoucherDetail = lazy(() => import("@/pages/details/voucher-detail"));
const Journal = lazy(() => import("@/pages/finance/journal"));
const JournalDetail = lazy(() => import("@/pages/finance/journal-detail"));
const PostingActivity = lazy(() => import("@/pages/finance/posting-activity"));
const JournalCreate = lazy(() => import("@/pages/create/finance/journal-create"));
const Invoices = lazy(() => import("@/pages/finance/invoices"));
const InvoiceSendQueue = lazy(() => import("@/pages/finance/invoice-send-queue"));
const InvoicesCreate = lazy(() => import("@/pages/create/finance/invoices-create"));
const InvoiceDetail = lazy(() => import("@/pages/finance/invoice-detail"));
const Expenses = lazy(() => import("@/pages/finance/expenses"));
const ExpenseBurnRate = lazy(() => import("@/pages/finance/expense-burn-rate"));
const ExpenseBulkApprovals = lazy(() => import("@/pages/finance/expense-bulk-approvals"));
const ExpenseDetail = lazy(() => import("@/pages/details/expense-detail"));
// م٨ — expenses-create محوّلة بـ redirect إلى المستند الموحّد (الملف مُبقًى، doc 25 §٨).
const VendorInvoiceCreate = lazy(() => import("@/pages/create/finance/vendor-invoice-create"));
// Duplicate multi-line form removed — the unified expenses-create
// page now handles multi-line via "حفظ وإضافة آخر" button.
// The /finance/expenses/multi-line route below redirects there.

const CostSplitter = lazy(() => import("@/pages/create/finance/cost-splitter"));
const AccountTransfer = lazy(() => import("@/pages/create/finance/account-transfer"));
// Phase D — pages from the enterprise-hardening branch that don't
// collide with main's parallel feature work.
const Collections = lazy(() => import("@/pages/finance/collections"));
const EntityStatements = lazy(() => import("@/pages/finance/entity-statements"));
const JournalTemplates = lazy(() => import("@/pages/finance/journal-templates"));
const SubsidiaryAccounts = lazy(() => import("@/pages/finance/subsidiary-accounts"));
const Budget = lazy(() => import("@/pages/finance/budget"));
const BudgetCreate = lazy(() => import("@/pages/create/finance/budget-create"));
const BudgetDetail = lazy(() => import("@/pages/details/budget-detail"));
const BudgetVariance = lazy(() => import("@/pages/finance/budget-variance"));
const BudgetHeatmap = lazy(() => import("@/pages/finance/budget-heatmap"));
const BudgetApprovals = lazy(() => import("@/pages/finance/budget-approvals"));
const Vendors = lazy(() => import("@/pages/finance/vendors"));
const VendorsCreate = lazy(() => import("@/pages/create/finance/vendors-create"));
const VendorsEdit = lazy(() => import("@/pages/create/finance/vendors-edit"));
const VendorDetail = lazy(() => import("@/pages/finance/vendor-detail"));
const VendorStatement = lazy(() => import("@/pages/finance/vendor-statement"));
const VendorStatementPrint = lazy(() => import("@/pages/finance/vendor-statement-print"));
const Vendor360Sheet = lazy(() => import("@/pages/finance/vendor-360-sheet"));
const VendorContracts = lazy(() => import("@/pages/finance/vendor-contracts"));
const VendorContractsTracker = lazy(() => import("@/pages/finance/vendor-contracts-tracker"));
const VendorDocuments = lazy(() => import("@/pages/finance/vendor-documents"));
const VendorSpend = lazy(() => import("@/pages/finance/vendor-spend"));
const VendorSettlementWorkbench = lazy(() => import("@/pages/finance/vendor-settlement-workbench"));
const PurchaseRequests = lazy(() => import("@/pages/finance/purchase-requests"));
const PurchaseOrders = lazy(() => import("@/pages/finance/purchase-orders"));
const PurchaseOrdersCreate = lazy(() => import("@/pages/create/finance/purchase-orders-create"));
const PurchaseOrderDetail = lazy(() => import("@/pages/finance/purchase-order-detail"));
const PaymentRun = lazy(() => import("@/pages/finance/payment-run"));
const ApPaymentCalendar = lazy(() => import("@/pages/finance/ap-payment-calendar"));
const CashPositionCalculator = lazy(() => import("@/pages/finance/cash-position-calculator"));
const FinancialReports = lazy(() => import("@/pages/finance/reports"));
const IncomeStatementTrend = lazy(() => import("@/pages/finance/income-statement-trend"));
const IncomeStatementVsBudget = lazy(() => import("@/pages/finance/income-statement-vs-budget"));
const YoyComparison = lazy(() => import("@/pages/finance/yoy-comparison"));
const TaxSystem = lazy(() => import("@/pages/finance/tax-system"));
const TaxFilingCalendar = lazy(() => import("@/pages/finance/tax-filing-calendar"));
const Receivables = lazy(() => import("@/pages/finance/receivables"));
const CustomerAdvancesWorkbench = lazy(() => import("@/pages/finance/customer-advances-workbench"));
const CustomerStatementPrint = lazy(() => import("@/pages/finance/customer-statement-print"));
const Customer360Sheet = lazy(() => import("@/pages/finance/customer-360-sheet"));
const CustomerRisk = lazy(() => import("@/pages/finance/customer-risk"));
const BadDebtProvision = lazy(() => import("@/pages/finance/bad-debt-provision"));
const ReceivableDetail = lazy(() => import("@/pages/details/receivable-detail"));
const Payments = lazy(() => import("@/pages/finance/payments-page"));
const Commitments = lazy(() => import("@/pages/finance/commitments"));
const CommitmentDetail = lazy(() => import("@/pages/details/commitment-detail"));
const FinancialRequests = lazy(() => import("@/pages/finance/financial-requests"));
const FinancialRequestDetail = lazy(() => import("@/pages/details/financial-request-detail"));
const Custodies = lazy(() => import("@/pages/finance/custodies"));
const CustodyDetail = lazy(() => import("@/pages/finance/custody-detail"));
const CustodyAgingReport = lazy(() => import("@/pages/finance/custody-aging-report"));
const CustodyWorkbench = lazy(() => import("@/pages/finance/custody-workbench"));
// (FiscalPeriods v1 أُزيل — كان عرض إحصاءات مشتقّة بلا إنشاء فترة، وكل قدراته
// (الإقفال/إعادة الفتح) تستدعي endpoints v2 أصلًا؛ v2 هي superset كامل (إنشاء +
// إقفال + قفل نهائي + السجل). /finance/fiscal-periods يبقى redirect إلى v2.)
const FiscalPeriodsV2 = lazy(() => import("@/pages/finance/fiscal-periods-v2"));
const PeriodClosePreflight = lazy(() => import("@/pages/finance/period-close-preflight"));
const SalaryAdvances = lazy(() => import("@/pages/finance/salary-advances"));
const SalaryAdvanceDetail = lazy(() => import("@/pages/details/salary-advance-detail"));
const Ledger = lazy(() => import("@/pages/finance/ledger"));
const Entity360 = lazy(() => import("@/pages/finance/entity-360"));
const ReconciliationHub = lazy(() => import("@/pages/finance/reconciliation-hub"));
const AccountReconWorkpaper = lazy(() => import("@/pages/finance/account-reconciliation-workpaper"));
const TbComparison = lazy(() => import("@/pages/finance/trial-balance-comparison"));
const TbDrilldown = lazy(() => import("@/pages/finance/trial-balance-drilldown"));
const ArAging = lazy(() => import("@/pages/finance/ar-aging"));
const ArCollectionWorkbench = lazy(() => import("@/pages/finance/ar-collection-workbench"));
const ApAging = lazy(() => import("@/pages/finance/ap-aging"));
const BankReconciliation = lazy(() => import("@/pages/finance/bank-reconciliation"));
const BankAccountsWatch = lazy(() => import("@/pages/finance/bank-accounts-watch"));
const BankManualMatch = lazy(() => import("@/pages/create/finance/bank-manual-match"));
const FixedAssets = lazy(() => import("@/pages/finance/fixed-assets"));
const FixedAssetRegister = lazy(() => import("@/pages/finance/fixed-asset-register"));
const FixedAssetDetail = lazy(() => import("@/pages/details/fixed-asset-detail"));
const BatchDepreciate = lazy(() => import("@/pages/create/finance/batch-depreciate"));
const InventoryCosting = lazy(() => import("@/pages/finance/inventory-costing"));
const BankGuarantees = lazy(() => import("@/pages/finance/bank-guarantees"));
const JournalManual = lazy(() => import("@/pages/finance/journal-manual"));
const GLPostingQueue = lazy(() => import("@/pages/finance/gl-posting-queue"));
const JournalManualCreate = lazy(() => import("@/pages/create/finance/journal-manual-create"));
const JournalReversal = lazy(() => import("@/pages/create/finance/journal-reversal"));
const JournalManualDetail = lazy(() => import("@/pages/finance/journal-manual-detail"));
const Intercompany = lazy(() => import("@/pages/finance/intercompany"));
const IntercompanyConsolidation = lazy(() => import("@/pages/finance/intercompany-consolidation"));
const CashFlowForecast = lazy(() => import("@/pages/finance/cash-flow-forecast"));
const CashCalendar = lazy(() => import("@/pages/finance/cash-calendar"));
const Cash13Week = lazy(() => import("@/pages/finance/cash-13week"));
const CashFlowStatement = lazy(() => import("@/pages/finance/cash-flow-statement"));
const ProjectCosting = lazy(() => import("@/pages/finance/project-costing"));
const ProjectCostingDetail = lazy(() => import("@/pages/finance/project-costing-detail"));
const VehiclePortfolioDashboard = lazy(() => import("@/pages/finance/vehicle-portfolio-dashboard"));
const UmrahGroupPortfolio = lazy(() => import("@/pages/finance/umrah-group-portfolio"));
const UmrahSeasonPortfolio = lazy(() => import("@/pages/finance/umrah-season-portfolio"));
const CashflowDashboard = lazy(() => import("@/pages/finance/cashflow-dashboard"));
const OpeningBalances = lazy(() => import("@/pages/finance/opening-balances"));
const OpeningBalancesCreate = lazy(() => import("@/pages/create/finance/opening-balances-create"));
const RecurringJournals = lazy(() => import("@/pages/finance/recurring-journals"));
const RecurringInvoices = lazy(() => import("@/pages/finance/recurring-invoices"));
const CashInTransit = lazy(() => import("@/pages/finance/cash-in-transit"));
const RecurringJournalsCreate = lazy(() => import("@/pages/create/finance/recurring-journals-create"));
const RecurringCalendar = lazy(() => import("@/pages/finance/recurring-calendar"));
const RecurringJournalDetail = lazy(() => import("@/pages/finance/recurring-journal-detail"));
const YearEndClose = lazy(() => import("@/pages/finance/year-end-close"));
const Treasury = lazy(() => import("@/pages/finance/treasury"));
const ProfitabilityVehicle = lazy(() => import("@/pages/finance/profitability-vehicle"));
const ProfitabilityProperty = lazy(() => import("@/pages/finance/profitability-property"));
const ProfitabilityProject = lazy(() => import("@/pages/finance/profitability-project"));
const ProfitabilityUmrahAgent = lazy(() => import("@/pages/finance/profitability-umrah-agent"));
const CustomerAdvances = lazy(() => import("@/pages/finance/customer-advances"));
const CustomerAdvancesCreate = lazy(() => import("@/pages/create/finance/customer-advances-create"));
const CustomerAdvancesApply = lazy(() => import("@/pages/create/finance/customer-advances-apply"));
// م٨ (إكمال التبديل) — customer-receipt محوّلة بـ redirect إلى «تحصيل من عميل» الموحّد
// (/finance/collect, م٣) بعد ثبوت بوابة §٧.٥ (٦/٦). الملف مُبقًى (doc 25 §٨).
const Dunning = lazy(() => import("@/pages/finance/dunning"));
const CollectionStages = lazy(() => import("@/pages/finance/collection-stages"));
const BadDebt = lazy(() => import("@/pages/finance/bad-debt"));
const AllocationRules = lazy(() => import("@/pages/finance/allocation-rules"));
const OverridesReport = lazy(() => import("@/pages/finance/overrides-report"));
const AllocationResults = lazy(() => import("@/pages/finance/allocation-results"));
const AllocationCoverage = lazy(() => import("@/pages/finance/allocation-coverage"));
const AllocationOverrideLog = lazy(() => import("@/pages/finance/allocation-override-log"));
const AllocationRuleCreate = lazy(() => import("@/pages/create/finance/allocation-rule-create"));
const AllocationRuleEdit = lazy(() => import("@/pages/create/finance/allocation-rule-edit"));
const ProductCatalog = lazy(() => import("@/pages/finance/product-catalog"));
const FxRates = lazy(() => import("@/pages/finance/fx-rates"));
const FxRevaluationHistory = lazy(() => import("@/pages/finance/fx-revaluation-history"));
const SettingsHub = lazy(() => import("@/pages/finance/settings-hub"));
const FxRevaluation = lazy(() => import("@/pages/finance/fx-revaluation"));
// Consolidated finance dashboards (originally PRs #1216/#1218/#1222/#1211/#1210/#1182).
const ProjectPortfolioDashboard = lazy(() => import("@/pages/finance/project-portfolio-dashboard"));
const PropertyPortfolioDashboard = lazy(() => import("@/pages/finance/property-portfolio-dashboard"));
const UmrahAgentPortfolio = lazy(() => import("@/pages/finance/umrah-agent-portfolio"));
const ExpenseMixAnalyzer = lazy(() => import("@/pages/finance/expense-mix-analyzer"));
const RevenueMixAnalyzer = lazy(() => import("@/pages/finance/revenue-mix-analyzer"));
const DsoTrend = lazy(() => import("@/pages/finance/dso-trend"));
// Phase 2 wiring — orphan pages with existing backends.
const CustomerAdvanceQuickCreate = lazy(() => import("@/pages/create/finance/customer-advance-create"));
const PricingRulesCreate = lazy(() => import("@/pages/create/finance/pricing-rules-create"));
const ZatcaMisrouted = lazy(() => import("@/pages/finance/zatca-misrouted"));
const ZatcaMissingTax = lazy(() => import("@/pages/finance/zatca-missing-tax"));

export const financeRoutes = [
  { path: "/finance/project-portfolio", component: ProjectPortfolioDashboard },
  { path: "/finance/property-portfolio", component: PropertyPortfolioDashboard },
  { path: "/finance/umrah-agent-portfolio", component: UmrahAgentPortfolio },
  { path: "/finance/expense-mix", component: ExpenseMixAnalyzer },
  { path: "/finance/revenue-mix", component: RevenueMixAnalyzer },
  { path: "/finance/reports/dso-trend", component: DsoTrend },
  // /finance → the new dashboard (R.1.5). The chart of accounts moves
  // to its own explicit path so the two pages don't share a URL.
  { path: "/finance", component: Dashboard },
  { path: "/finance/cfo-cockpit", component: CfoCockpit },
  { path: "/finance/workflows-hub", component: FinanceWorkflowsHub },
  { path: "/finance/monthly-close-pack", component: MonthlyClosePack },
  { path: "/finance/daily-close-checklist", component: DailyCloseChecklist },
  { path: "/finance/gl-health", component: GlHealthScore },
  { path: "/finance/approvals-inbox", component: ApprovalsInbox },
  { path: "/finance/intake", component: FinanceIntakeCenter },
  { path: "/finance/usage-gaps", component: AccountsUsageGaps },
  { path: "/finance/accounts", component: Accounts },
  { path: "/finance/accounts/create", component: AccountsCreate },
  { path: "/finance/accounts/:id/edit", component: AccountsEdit },
  { path: "/finance/accounts/:id", component: AccountDetail },
  // Saudi tax registries — Daftra-style tax codes + WHT categories.
  // Both pages live under finance/ and use the same PageShell pattern
  // as accounts.tsx; create pages mirror accounts-create.tsx.
  { path: "/finance/tax-codes", component: TaxCodes },
  { path: "/finance/pricing-rules", component: PricingRules },
  { path: "/finance/pricing-rules/create", component: PricingRulesCreate },
  { path: "/finance/tax-codes/create", component: TaxCodesCreate },
  { path: "/finance/tax-codes/:id/edit", component: TaxCodesEdit },
  { path: "/finance/wht-categories", component: WhtCategories },
  { path: "/finance/wht-categories/create", component: WhtCategoriesCreate },
  { path: "/finance/wht-categories/:id/edit", component: WhtCategoriesEdit },
  // GL integrity gaps — period-close pre-flight (#1043).
  { path: "/finance/reports/gl-integrity-gaps", component: GlIntegrityGaps },
  { path: "/finance/reports/operation-gaps", component: OperationGaps },
  { path: "/finance/gl-anomaly-detector", component: GlAnomalyDetector },
  { path: "/finance/reports/unmapped-lines", component: UnmappedLines },
  { path: "/finance/reports/wht-summary", component: WhtSummary },
  { path: "/finance/wht-filing-workbench", component: WhtFilingWorkbench },
  // ZATCA & inventory reports hub — landing page (#1059).
  { path: "/finance/reports/zatca", component: ZatcaReportsHub },
  { path: "/finance/zatca/misrouted", component: ZatcaMisrouted },
  { path: "/finance/zatca/missing-tax", component: ZatcaMissingTax },
  { path: "/finance/vat-filing-readiness", component: VatFilingReadiness },
  // Lot expiry alerts — consumes /reports/lot-expiry-alerts (#1042).
  { path: "/finance/reports/lot-expiry-alerts", component: LotExpiryAlerts },
  // Inventory valuation report — consumes /reports/inventory-valuation (#1033).
  { path: "/finance/reports/inventory-valuation", component: InventoryValuation },
  // Negative-stock outliers — consumes /reports/negative-stock (#1035).
  { path: "/finance/reports/negative-stock", component: NegativeStock },
  // Inventory turnover ratio — consumes /reports/inventory-turnover (#1036).
  { path: "/finance/reports/inventory-turnover", component: InventoryTurnover },
  // COGS / margin summary — consumes /reports/cogs-summary (#1034).
  { path: "/finance/reports/cogs-summary", component: CogsSummary },
  // Ledger-truth measurement — consumes /reports/ledger-truth (#2246, read-only).
  { path: "/finance/reports/ledger-truth", component: LedgerTruth },
  // VAT reconciliation report — pre-filing sanity check (#1037 backend).
  { path: "/finance/reports/vat-reconciliation", component: VatReconciliation },
  { path: "/finance/vouchers", component: Vouchers },
  // م٨ — التبديل: سند القبض/الصرف القديم يُحوَّل إلى «تسجيل واقعة» الموحّد (يشمله
  // كحالة قبض/صرف بجدول بنود + توزيع + مرفقات). doc 25 §٨ (تحويل لا حذف).
  { path: "/finance/vouchers/create", component: redirectTo("/finance/documents/create") },
  // الصفحة الموحّدة (تبويبات قبض/صرف · مبيعات · مشتريات تبدّل النموذج في المكان —
  // صفحة واحدة بدل ثلاث، «ادمجها كلها»). المساران القديمان للفاتورتين يعرضان **نفس
  // الصفحة** بالنوع المناسب مُسبَقًا (يُشتَقّ من المسار) — لا إعادة توجيه، لا وميض.
  { path: "/finance/documents/create", component: FinanceCreatePage },
  // مسار ودود للقائمة (نظير /fleet/record-event) — يعرض نفس الصفحة الموحّدة. يبقى
  // /documents/create المسار الكنسي للإنشاء؛ هذا للظهور في القائمة بلا /create.
  { path: "/finance/record-event", component: FinanceCreatePage },
  { path: "/finance/documents/import", component: FinancialImportGateway },
  { path: "/finance/collect", component: CustomerCollection },
  { path: "/finance/documents/invoice", component: FinanceCreatePage },
  { path: "/finance/documents/vendor-invoice", component: FinanceCreatePage },
  { path: "/finance/vouchers/:id", component: VoucherDetail },
  { path: "/finance/journal", component: Journal },
  { path: "/finance/journal/activity", component: PostingActivity },
  { path: "/finance/journal/create", component: JournalCreate },
  { path: "/finance/journal/:id", component: JournalDetail },
  { path: "/finance/invoices", component: Invoices },
  { path: "/finance/invoice-send-queue", component: InvoiceSendQueue },
  { path: "/finance/invoices/create", component: InvoicesCreate },
  { path: "/finance/invoices/:id", component: InvoiceDetail },
  { path: "/finance/expenses", component: Expenses },
  { path: "/finance/expense-bulk-approvals", component: ExpenseBulkApprovals },
  { path: "/finance/expense-burn-rate", component: ExpenseBurnRate },
  // م٨ — التبديل: المصروف القديم يُحوَّل إلى «تسجيل واقعة» الموحّد (صرف بجدول بنود).
  { path: "/finance/expenses/create", component: redirectTo("/finance/documents/create") },
  // FIN-P11 (#2241) — vendor invoice (supplier bill): a SEPARATE multi-line
  // entry path from the expense/fuel path; credit leg = supplier payable (آجل)
  // or money source (paid).
  { path: "/finance/vendor-invoices/create", component: VendorInvoiceCreate },
  // Legacy multi-line route now redirects to the unified expenses-create
  // form, which supports multi-line via the "حفظ وإضافة آخر" button.
  { path: "/finance/expenses/multi-line", component: redirectTo("/finance/documents/create") },
  { path: "/finance/expenses/split", component: CostSplitter },
  { path: "/finance/expenses/:id", component: ExpenseDetail },
  { path: "/finance/budget", component: Budget },
  { path: "/finance/budget/create", component: BudgetCreate },
  { path: "/finance/budget/:id", component: BudgetDetail },
  { path: "/finance/budget-variance", component: BudgetVariance },
  { path: "/finance/budget-heatmap", component: BudgetHeatmap },
  { path: "/finance/budget-approvals", component: BudgetApprovals },
  { path: "/finance/vendors", component: Vendors },
  { path: "/finance/vendors/create", component: VendorsCreate },
  { path: "/finance/vendors/:id/edit", component: VendorsEdit, subKey: "vendors" },
  { path: "/finance/vendors/:id/statement", component: VendorStatement, subKey: "vendors" },
  { path: "/finance/vendor-statement-print", component: VendorStatementPrint },
  { path: "/finance/vendor-360-sheet", component: Vendor360Sheet },
  { path: "/finance/contracts", component: VendorContracts },
  { path: "/finance/vendor-contracts-tracker", component: VendorContractsTracker },
  { path: "/finance/vendor-documents", component: VendorDocuments },
  { path: "/finance/vendor-spend", component: VendorSpend },
  { path: "/finance/vendor-settlement-workbench", component: VendorSettlementWorkbench },
  { path: "/finance/vendors/:id", component: VendorDetail, subKey: "vendors" },
  { path: "/finance/purchase-requests", component: PurchaseRequests },
  { path: "/finance/purchase-orders", component: PurchaseOrders },
  { path: "/finance/purchase-orders/create", component: PurchaseOrdersCreate },
  { path: "/finance/payment-run", component: PaymentRun },
  { path: "/finance/ap-payment-calendar", component: ApPaymentCalendar },
  { path: "/finance/cash-position-calculator", component: CashPositionCalculator },
  { path: "/finance/purchase-orders/:id", component: PurchaseOrderDetail },
  { path: "/finance/profitability/vehicle/:id", component: ProfitabilityVehicle },
  { path: "/finance/profitability/property/:id", component: ProfitabilityProperty },
  { path: "/finance/profitability/project/:id", component: ProfitabilityProject },
  { path: "/finance/profitability/umrah-agent/:id", component: ProfitabilityUmrahAgent },
  { path: "/finance/customer-advances", component: CustomerAdvances },
  { path: "/finance/customer-advances-workbench", component: CustomerAdvancesWorkbench },
  { path: "/finance/customer-advances/create", component: CustomerAdvancesCreate },
  // Lightweight single-line advance intake (distinct from the full
  // create form above which carries allocation + branch context). The
  // canonical /create path stays bound to CustomerAdvancesCreate; this
  // quick form gets its own path to avoid a route collision.
  { path: "/finance/customer-advances/quick-create", component: CustomerAdvanceQuickCreate },
  { path: "/finance/customer-advances/:id/apply", component: CustomerAdvancesApply },
  { path: "/finance/dunning", component: Dunning },
  { path: "/finance/collection", component: CollectionStages },
  { path: "/finance/bad-debt", component: BadDebt },
  { path: "/finance/allocation-rules", component: AllocationRules },
  { path: "/finance/allocation-rules/create", component: AllocationRuleCreate },
  { path: "/finance/allocation-rules/:id/edit", component: AllocationRuleEdit },
  { path: "/finance/overrides-report", component: OverridesReport },
  { path: "/finance/allocation-results", component: AllocationResults },
  { path: "/finance/allocation-coverage", component: AllocationCoverage },
  { path: "/finance/allocation-override-log", component: AllocationOverrideLog },
  { path: "/finance/cost-centers", component: CostCenters },
  { path: "/finance/cost-centers/tree", component: CostCentersTree },
  { path: "/finance/cost-center-pnl", component: CostCenterPnl },
  { path: "/finance/cost-centers/:id/pnl", component: CostCenterDrillPnl },
  { path: "/finance/cost-centers/ranking", component: CostCenterRanking },
  { path: "/finance/dimensional-routing", component: DimensionalRouting },
  { path: "/finance/dormant-entities", component: DormantEntities },
  { path: "/finance/entity-pnl/:entityType/:entityId", component: EntityPnl },
  { path: "/finance/entity-ranking", component: EntityRanking },
  { path: "/finance/product-catalog", component: ProductCatalog },
  { path: "/finance/fx-rates", component: FxRates },
  { path: "/finance/fx-revaluation/history", component: FxRevaluationHistory },
  { path: "/finance/settings", component: SettingsHub },
  { path: "/finance/fx-revaluation", component: FxRevaluation },
  { path: "/finance/reports", component: FinancialReports },
  { path: "/finance/reports/is-trend", component: IncomeStatementTrend },
  { path: "/finance/reports/is-vs-budget", component: IncomeStatementVsBudget },
  { path: "/finance/reports/yoy", component: YoyComparison },
  { path: "/finance/tax", component: TaxSystem },
  { path: "/finance/tax-filing-calendar", component: TaxFilingCalendar },
  { path: "/finance/receivables", component: Receivables },
  { path: "/finance/receivables/receipt", component: redirectTo("/finance/collect") },
  { path: "/finance/customer-statement-print", component: CustomerStatementPrint },
  { path: "/finance/customer-360-sheet", component: Customer360Sheet },
  { path: "/finance/customer-risk", component: CustomerRisk },
  { path: "/finance/bad-debt-provision", component: BadDebtProvision },
  { path: "/finance/receivables/:id", component: ReceivableDetail },
  { path: "/finance/payments", component: Payments },
  { path: "/finance/commitments", component: Commitments },
  { path: "/finance/commitments/:id", component: CommitmentDetail },
  { path: "/finance/financial-requests", component: FinancialRequests },
  { path: "/finance/financial-requests/:id", component: FinancialRequestDetail },
  { path: "/finance/custodies", component: Custodies },
  { path: "/finance/custody-workbench", component: CustodyWorkbench },
  { path: "/finance/custodies/report", component: CustodyAgingReport },
  { path: "/finance/custodies/:id", component: CustodyDetail },
  // GAP_MATRIX P1 — v1 is a duplicate of v2; redirect so only one URL is canonical.
  { path: "/finance/fiscal-periods", component: redirectTo("/finance/fiscal-periods-v2") },
  // GAP_MATRIX P0 — fiscal period management changes financial reporting boundaries; gate at 70.
  { path: "/finance/fiscal-periods-v2", component: FiscalPeriodsV2, minRoleLevel: 70 },
  { path: "/finance/period-close-preflight", component: PeriodClosePreflight },
  { path: "/finance/salary-advances", component: SalaryAdvances },
  { path: "/finance/salary-advances/:id", component: SalaryAdvanceDetail },
  { path: "/finance/ledger/:code", component: Ledger },
  { path: "/finance/entity-360", component: Entity360 },
  { path: "/finance/reconciliation-hub", component: ReconciliationHub },
  { path: "/finance/account-recon-workpaper", component: AccountReconWorkpaper },
  { path: "/finance/trial-balance-comparison", component: TbComparison },
  { path: "/finance/trial-balance-drilldown", component: TbDrilldown },
  { path: "/finance/ar-aging", component: ArAging },
  { path: "/finance/ar-collection-workbench", component: ArCollectionWorkbench },
  { path: "/finance/ap-aging", component: ApAging },
  { path: "/finance/bank-reconciliation", component: BankReconciliation },
  { path: "/finance/bank-accounts-watch", component: BankAccountsWatch },
  { path: "/finance/bank-reconciliation/manual-match/:batchId/:rowId", component: BankManualMatch },
  { path: "/finance/fixed-assets", component: FixedAssets },
  { path: "/finance/fixed-asset-register", component: FixedAssetRegister },
  { path: "/finance/fixed-assets/batch-depreciate", component: BatchDepreciate },
  { path: "/finance/fixed-assets/:id", component: FixedAssetDetail },
  { path: "/finance/inventory-costing", component: InventoryCosting },
  { path: "/finance/bank-guarantees", component: BankGuarantees },
  // GAP_MATRIX P0 — manual journals touch the GL directly; gate at 70 (managers).
  { path: "/finance/journal-manual", component: JournalManual, minRoleLevel: 70 },
  { path: "/finance/journal-manual/create", component: JournalManualCreate, minRoleLevel: 70 },
  // البند ٢/م٦ — «قوالب قيود سريعة» دُمجت في «قيد يومية» كمنتقي قوالب → redirect (§٨).
  { path: "/finance/journal-quick-templates", component: redirectTo("/finance/journal/create") },
  { path: "/finance/journal/reverse", component: JournalReversal, minRoleLevel: 70 },
  { path: "/finance/journal-manual/:id", component: JournalManualDetail, minRoleLevel: 70 },
  { path: "/finance/gl-posting-queue", component: GLPostingQueue },
  { path: "/finance/intercompany", component: Intercompany },
  { path: "/finance/intercompany/consolidation", component: IntercompanyConsolidation },
  // عرض «القوائم الموحدة» للقراءة فقط (GET فقط في الخلفية — لا إنشاء/ترحيل).
  // المسار القديم بلاحقة /create مُضلِّل لعرضٍ لا يُنشئ شيئًا؛ يُعاد توجيهه (لا 404 للروابط القديمة).
  { path: "/finance/intercompany/consolidation/create", component: redirectTo("/finance/intercompany/consolidation") },
  { path: "/finance/cash-flow-forecast", component: CashFlowForecast },
  { path: "/finance/cash-calendar", component: CashCalendar },
  { path: "/finance/cash-13week", component: Cash13Week },
  { path: "/finance/reports/cash-flow-statement", component: CashFlowStatement },
  { path: "/finance/project-costing", component: ProjectCosting },
  { path: "/finance/vehicle-portfolio", component: VehiclePortfolioDashboard },
  { path: "/finance/umrah-group-portfolio", component: UmrahGroupPortfolio },
  { path: "/finance/umrah-season-portfolio", component: UmrahSeasonPortfolio },
  { path: "/finance/project-costing/:id", component: ProjectCostingDetail },
  { path: "/finance/cashflow", component: CashflowDashboard },
  // GAP_MATRIX P0 — opening balances are a one-time GL adjustment; gate at 70.
  { path: "/finance/opening-balances", component: OpeningBalances, minRoleLevel: 70 },
  { path: "/finance/opening-balances/create", component: OpeningBalancesCreate, minRoleLevel: 70 },
  { path: "/finance/recurring-journals", component: RecurringJournals },
  { path: "/finance/recurring-invoices", component: RecurringInvoices },
  { path: "/finance/cash-in-transit", component: CashInTransit },
  { path: "/finance/amortization", component: Amortization },
  { path: "/finance/deferred-revenue", component: DeferredRevenue },
  { path: "/finance/subsidiary-account-failures", component: SubsidiaryAccountFailures },
  { path: "/finance/datafix/misparented-subsidiaries", component: MisparentedSubsidiaries },
  { path: "/finance/cip", component: Cip },
  { path: "/finance/classification-center", component: ClassificationCenter },
  { path: "/finance/insurance", component: InsurancePremium },
  { path: "/finance/recurring-calendar", component: RecurringCalendar },
  { path: "/finance/recurring-journals/create", component: RecurringJournalsCreate },
  { path: "/finance/recurring-journals/:id", component: RecurringJournalDetail },
  // GAP_MATRIX P0 — year-end close is irreversible; gate at 70.
  { path: "/finance/year-end-close", component: YearEndClose, minRoleLevel: 70 },
  { path: "/finance/treasury", component: Treasury },
  { path: "/finance/treasury/transfer", component: AccountTransfer },
  // Phase D — non-colliding routes from the enterprise-hardening branch
  { path: "/finance/collections", component: Collections },
  { path: "/finance/entity-statements", component: EntityStatements },
  { path: "/finance/journal-templates", component: JournalTemplates },
  { path: "/finance/subsidiary-accounts", component: SubsidiaryAccounts },
];
