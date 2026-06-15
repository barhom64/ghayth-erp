import { useApiQuery } from "@/lib/api";

/**
 * Financial memory hooks (FIN-FINANCIAL-MEMORY-FOUNDATION).
 *
 * Data-only recall of codified manual-entry memories: per-supplier finance
 * defaults and per-category expense defaults. Each returns an `accountPurpose`
 * (text) — the financial engine resolves it to a real account on the server.
 * These hooks NEVER expose or decide a GL accountCode; forms apply the defaults
 * as suggestions, the central preflight/engine stays authoritative.
 */
export interface SupplierFinanceDefaults {
  supplierId: number;
  defaultPaymentMethod: string | null;
  defaultCurrency: string;
  defaultAccountPurpose: string | null;
  defaultCostCenterId: number | null;
}

export interface ExpenseCategoryMemory {
  categoryKey: string;
  accountPurpose: string | null;
  defaultTaxCodeId: number | null;
  defaultCostCenterId: number | null;
}

/** Recall a supplier's saved finance defaults (payment/currency/purpose/cc). */
export function useSupplierFinanceDefaults(supplierId: string | number | null | undefined) {
  const enabled = !!supplierId;
  return useApiQuery<{ data: SupplierFinanceDefaults | null }>(
    ["supplier-finance-defaults", String(supplierId ?? "")],
    `/finance/suppliers/${supplierId}/finance-defaults`,
    { enabled },
  );
}

/** Recall the saved expense default for a category (purpose/tax/cost-center). */
export function useExpenseCategoryMemory(category: string | null | undefined) {
  const enabled = !!category;
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return useApiQuery<{ data: ExpenseCategoryMemory[] }>(
    ["expense-memory", category ?? ""],
    `/finance/expense-memory${qs}`,
    { enabled },
  );
}
