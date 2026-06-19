/** A chart-of-accounts top-level type key. */
export type AccountTypeKey = "asset" | "liability" | "equity" | "revenue" | "expense";
/** Arabic labels for each chart-of-accounts type. */
export declare const ACCOUNT_TYPE_LABELS: Record<AccountTypeKey, string>;
/**
 * Which chart-of-accounts TYPES the voucher's counter account may be, keyed by
 * the voucher operationType. The cash leg sits opposite; this constrains the
 * other leg so قبض never lands on a مصروف and صرف never lands on an إيراد.
 */
export declare const VOUCHER_COUNTER_ACCOUNT_TYPES: Record<string, AccountTypeKey[]>;
//# sourceMappingURL=financeDirectionMaps.d.ts.map