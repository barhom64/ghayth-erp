import { lazy } from "react";

// R.1.5 — Finance Dashboard is the new landing page for /finance. The
// chart of accounts stays at /finance/accounts (see the separate route
// entry below). This lets users hit a real overview page instead of
// being dropped into a list view, and demonstrates the unified page
// templates (PageShell, PageStatusBadge, useApiMutation) as a reference
// for the cascade to the rest of the module.
const Dashboard = lazy(() => import("@/pages/finance/dashboard"));
const Accounts = lazy(() => import("@/pages/finance/accounts"));
const AccountsCreate = lazy(() => import("@/pages/create/finance/accounts-create"));
const AccountsEdit = lazy(() => import("@/pages/create/finance/accounts-edit"));
const AccountDetail = lazy(() => import("@/pages/details/account-detail"));
const TaxCodes = lazy(() => import("@/pages/finance/tax-codes"));
const TaxCodesCreate = lazy(() => import("@/pages/create/finance/tax-codes-create"));
const WhtCategories = lazy(() => import("@/pages/finance/wht-categories"));
const WhtCategoriesCreate = lazy(() => import("@/pages/create/finance/wht-categories-create"));
const TaxCodesEdit = lazy(() => import("@/pages/create/finance/tax-codes-edit"));
const WhtCategoriesEdit = lazy(() => import("@/pages/create/finance/wht-categories-edit"));
const LotExpiryAlerts = lazy(() => import("@/pages/finance/lot-expiry-alerts"));
const CogsSummary = lazy(() => import("@/pages/finance/cogs-summary"));
const InventoryValuation = lazy(() => import("@/pages/finance/inventory-valuation"));
const NegativeStock = lazy(() => import("@/pages/finance/negative-stock"));
const InventoryTurnover = lazy(() => import("@/pages/finance/inventory-turnover"));
const GlIntegrityGaps = lazy(() => import("@/pages/finance/gl-integrity-gaps"));
const UnmappedLines = lazy(() => import("@/pages/finance/unmapped-lines"));
const WhtSummary = lazy(() => import("@/pages/finance/wht-summary"));
const ZatcaReportsHub = lazy(() => import("@/pages/finance/zatca-reports-hub"));
const Vouchers = lazy(() => import("@/pages/finance/vouchers"));
const VouchersCreate = lazy(() => import("@/pages/create/finance/vouchers-create"));
const VoucherDetail = lazy(() => import("@/pages/details/voucher-detail"));
const Journal = lazy(() => import("@/pages/finance/journal"));
const JournalCreate = lazy(() => import("@/pages/create/finance/journal-create"));
const Invoices = lazy(() => import("@/pages/finance/invoices"));
const InvoicesCreate = lazy(() => import("@/pages/create/finance/invoices-create"));
const InvoiceDetail = lazy(() => import("@/pages/finance/invoice-detail"));
const Expenses = lazy(() => import("@/pages/finance/expenses"));
const ExpenseDetail = lazy(() => import("@/pages/details/expense-detail"));
const ExpensesCreate = lazy(() => import("@/pages/create/finance/expenses-create"));
const Budget = lazy(() => import("@/pages/finance/budget"));
const BudgetCreate = lazy(() => import("@/pages/create/finance/budget-create"));
const BudgetDetail = lazy(() => import("@/pages/details/budget-detail"));
const Vendors = lazy(() => import("@/pages/finance/vendors"));
const VendorsCreate = lazy(() => import("@/pages/create/finance/vendors-create"));
const VendorsEdit = lazy(() => import("@/pages/create/finance/vendors-edit"));
const VendorDetail = lazy(() => import("@/pages/finance/vendor-detail"));
const VendorStatement = lazy(() => import("@/pages/finance/vendor-statement"));
const PurchaseOrders = lazy(() => import("@/pages/finance/purchase-orders"));
const PurchaseOrdersCreate = lazy(() => import("@/pages/create/finance/purchase-orders-create"));
const PurchaseOrderDetail = lazy(() => import("@/pages/finance/purchase-order-detail"));
const PaymentRun = lazy(() => import("@/pages/finance/payment-run"));
const FinancialReports = lazy(() => import("@/pages/finance/reports"));
const TaxSystem = lazy(() => import("@/pages/finance/tax-system"));
const Receivables = lazy(() => import("@/pages/finance/receivables"));
const ReceivableDetail = lazy(() => import("@/pages/details/receivable-detail"));
const Payments = lazy(() => import("@/pages/finance/payments-page"));
const Commitments = lazy(() => import("@/pages/finance/commitments"));
const CommitmentDetail = lazy(() => import("@/pages/details/commitment-detail"));
const FinancialRequests = lazy(() => import("@/pages/finance/financial-requests"));
const FinancialRequestDetail = lazy(() => import("@/pages/details/financial-request-detail"));
const Custodies = lazy(() => import("@/pages/finance/custodies"));
const CustodyDetail = lazy(() => import("@/pages/finance/custody-detail"));
const CustodyAgingReport = lazy(() => import("@/pages/finance/custody-aging-report"));
const FiscalPeriods = lazy(() => import("@/pages/finance/fiscal-periods"));
const FiscalPeriodsV2 = lazy(() => import("@/pages/finance/fiscal-periods-v2"));
const SalaryAdvances = lazy(() => import("@/pages/finance/salary-advances"));
const SalaryAdvanceDetail = lazy(() => import("@/pages/details/salary-advance-detail"));
const Ledger = lazy(() => import("@/pages/finance/ledger"));
const ArAging = lazy(() => import("@/pages/finance/ar-aging"));
const ApAging = lazy(() => import("@/pages/finance/ap-aging"));
const BankReconciliation = lazy(() => import("@/pages/finance/bank-reconciliation"));
const BankManualMatch = lazy(() => import("@/pages/create/finance/bank-manual-match"));
const FixedAssets = lazy(() => import("@/pages/finance/fixed-assets"));
const FixedAssetDetail = lazy(() => import("@/pages/details/fixed-asset-detail"));
const BatchDepreciate = lazy(() => import("@/pages/create/finance/batch-depreciate"));
const InventoryCosting = lazy(() => import("@/pages/finance/inventory-costing"));
const BankGuarantees = lazy(() => import("@/pages/finance/bank-guarantees"));
const JournalManual = lazy(() => import("@/pages/finance/journal-manual"));
const GLPostingQueue = lazy(() => import("@/pages/finance/gl-posting-queue"));
const JournalManualCreate = lazy(() => import("@/pages/create/finance/journal-manual-create"));
const JournalManualDetail = lazy(() => import("@/pages/finance/journal-manual-detail"));
const Intercompany = lazy(() => import("@/pages/finance/intercompany"));
const IntercompanyConsolidationCreate = lazy(() => import("@/pages/create/finance/intercompany-consolidation-create"));
const CashFlowForecast = lazy(() => import("@/pages/finance/cash-flow-forecast"));
const ProjectCosting = lazy(() => import("@/pages/finance/project-costing"));
const ProjectCostingDetail = lazy(() => import("@/pages/finance/project-costing-detail"));
const CashflowDashboard = lazy(() => import("@/pages/finance/cashflow-dashboard"));
const OpeningBalances = lazy(() => import("@/pages/finance/opening-balances"));
const OpeningBalancesCreate = lazy(() => import("@/pages/create/finance/opening-balances-create"));
const RecurringJournals = lazy(() => import("@/pages/finance/recurring-journals"));
const RecurringJournalsCreate = lazy(() => import("@/pages/create/finance/recurring-journals-create"));
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
const Dunning = lazy(() => import("@/pages/finance/dunning"));

export const financeRoutes = [
  // /finance → the new dashboard (R.1.5). The chart of accounts moves
  // to its own explicit path so the two pages don't share a URL.
  { path: "/finance", component: Dashboard },
  { path: "/finance/accounts", component: Accounts },
  { path: "/finance/accounts/create", component: AccountsCreate },
  { path: "/finance/accounts/:id/edit", component: AccountsEdit },
  { path: "/finance/accounts/:id", component: AccountDetail },
  // Saudi tax registries — Daftra-style tax codes + WHT categories.
  // Both pages live under finance/ and use the same PageShell pattern
  // as accounts.tsx; create pages mirror accounts-create.tsx.
  { path: "/finance/tax-codes", component: TaxCodes },
  { path: "/finance/tax-codes/create", component: TaxCodesCreate },
  { path: "/finance/tax-codes/:id/edit", component: TaxCodesEdit },
  { path: "/finance/wht-categories", component: WhtCategories },
  { path: "/finance/wht-categories/create", component: WhtCategoriesCreate },
  { path: "/finance/wht-categories/:id/edit", component: WhtCategoriesEdit },
  // GL integrity gaps — period-close pre-flight (#1043).
  { path: "/finance/reports/gl-integrity-gaps", component: GlIntegrityGaps },
  { path: "/finance/reports/unmapped-lines", component: UnmappedLines },
  { path: "/finance/reports/wht-summary", component: WhtSummary },
  // ZATCA & inventory reports hub — landing page (#1059).
  { path: "/finance/reports/zatca", component: ZatcaReportsHub },
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
  { path: "/finance/vouchers", component: Vouchers },
  { path: "/finance/vouchers/create", component: VouchersCreate },
  { path: "/finance/vouchers/:id", component: VoucherDetail },
  { path: "/finance/journal", component: Journal },
  { path: "/finance/journal/create", component: JournalCreate },
  { path: "/finance/invoices", component: Invoices },
  { path: "/finance/invoices/create", component: InvoicesCreate },
  { path: "/finance/invoices/:id", component: InvoiceDetail },
  { path: "/finance/expenses", component: Expenses },
  { path: "/finance/expenses/create", component: ExpensesCreate },
  { path: "/finance/expenses/:id", component: ExpenseDetail },
  { path: "/finance/budget", component: Budget },
  { path: "/finance/budget/create", component: BudgetCreate },
  { path: "/finance/budget/:id", component: BudgetDetail },
  { path: "/finance/vendors", component: Vendors },
  { path: "/finance/vendors/create", component: VendorsCreate },
  { path: "/finance/vendors/:id/edit", component: VendorsEdit, subKey: "vendors" },
  { path: "/finance/vendors/:id/statement", component: VendorStatement, subKey: "vendors" },
  { path: "/finance/vendors/:id", component: VendorDetail, subKey: "vendors" },
  { path: "/finance/purchase-orders", component: PurchaseOrders },
  { path: "/finance/purchase-orders/create", component: PurchaseOrdersCreate },
  { path: "/finance/payment-run", component: PaymentRun },
  { path: "/finance/purchase-orders/:id", component: PurchaseOrderDetail },
  { path: "/finance/profitability/vehicle/:id", component: ProfitabilityVehicle },
  { path: "/finance/profitability/property/:id", component: ProfitabilityProperty },
  { path: "/finance/profitability/project/:id", component: ProfitabilityProject },
  { path: "/finance/profitability/umrah-agent/:id", component: ProfitabilityUmrahAgent },
  { path: "/finance/customer-advances", component: CustomerAdvances },
  { path: "/finance/customer-advances/create", component: CustomerAdvancesCreate },
  { path: "/finance/customer-advances/:id/apply", component: CustomerAdvancesApply },
  { path: "/finance/dunning", component: Dunning },
  { path: "/finance/reports", component: FinancialReports },
  { path: "/finance/tax", component: TaxSystem },
  { path: "/finance/receivables", component: Receivables },
  { path: "/finance/receivables/:id", component: ReceivableDetail },
  { path: "/finance/payments", component: Payments },
  { path: "/finance/commitments", component: Commitments },
  { path: "/finance/commitments/:id", component: CommitmentDetail },
  { path: "/finance/financial-requests", component: FinancialRequests },
  { path: "/finance/financial-requests/:id", component: FinancialRequestDetail },
  { path: "/finance/custodies", component: Custodies },
  { path: "/finance/custodies/report", component: CustodyAgingReport },
  { path: "/finance/custodies/:id", component: CustodyDetail },
  { path: "/finance/fiscal-periods", component: FiscalPeriods },
  { path: "/finance/fiscal-periods-v2", component: FiscalPeriodsV2 },
  { path: "/finance/salary-advances", component: SalaryAdvances },
  { path: "/finance/salary-advances/:id", component: SalaryAdvanceDetail },
  { path: "/finance/ledger/:code", component: Ledger },
  { path: "/finance/ar-aging", component: ArAging },
  { path: "/finance/ap-aging", component: ApAging },
  { path: "/finance/bank-reconciliation", component: BankReconciliation },
  { path: "/finance/bank-reconciliation/manual-match/:batchId/:rowId", component: BankManualMatch },
  { path: "/finance/fixed-assets", component: FixedAssets },
  { path: "/finance/fixed-assets/batch-depreciate", component: BatchDepreciate },
  { path: "/finance/fixed-assets/:id", component: FixedAssetDetail },
  { path: "/finance/inventory-costing", component: InventoryCosting },
  { path: "/finance/bank-guarantees", component: BankGuarantees },
  { path: "/finance/journal-manual", component: JournalManual },
  { path: "/finance/journal-manual/create", component: JournalManualCreate },
  { path: "/finance/journal-manual/:id", component: JournalManualDetail },
  { path: "/finance/gl-posting-queue", component: GLPostingQueue },
  { path: "/finance/intercompany", component: Intercompany },
  { path: "/finance/intercompany/consolidation/create", component: IntercompanyConsolidationCreate },
  { path: "/finance/cash-flow-forecast", component: CashFlowForecast },
  { path: "/finance/project-costing", component: ProjectCosting },
  { path: "/finance/project-costing/:id", component: ProjectCostingDetail },
  { path: "/finance/cashflow", component: CashflowDashboard },
  { path: "/finance/opening-balances", component: OpeningBalances },
  { path: "/finance/opening-balances/create", component: OpeningBalancesCreate },
  { path: "/finance/recurring-journals", component: RecurringJournals },
  { path: "/finance/recurring-journals/create", component: RecurringJournalsCreate },
  { path: "/finance/recurring-journals/:id", component: RecurringJournalDetail },
  { path: "/finance/year-end-close", component: YearEndClose },
  { path: "/finance/treasury", component: Treasury },
];
