// Per-class fixed-asset account routing (applied at booking time).
// The COA keeps a SEPARATE asset-cost, depreciation-expense and accumulated-
// depreciation account per fixed-asset class:
//     vehicles   → 1210 / 5710 / 1211      furniture → 1220 / 5720 / 1221
//     computers  → 1230 / 5730 / 1231      buildings → 1240 / 5740 / 1241
//     other      → 1280 / 5790 / 1290      (generic "أخرى" — the schema defaults)
// The fleet and properties engines already book into the per-class accounts;
// manual assets carry a free-text `category`, so when an asset is first BOOKED
// (create / CIP capitalise) we map it to a class and store the per-class codes
// instead of lumping everything into the generic "other" accounts. Subsequent
// depreciation / disposal / revaluation keep using the asset's STORED codes —
// they reverse what is actually on the books, so they must not re-route.
// The generic defaults (1280/5790/1290 and the older 1500/6100/1590) mean "no
// explicit per-asset account chosen" → routed by class; any other explicit
// per-asset code stored on the asset always wins.

export type AssetClassAccounts = { asset: string; dep: string; accDep: string };

export const ASSET_CLASS_ACCOUNTS: Record<
  "vehicles" | "furniture" | "computers" | "buildings" | "other",
  AssetClassAccounts
> = {
  vehicles:  { asset: "1210", dep: "5710", accDep: "1211" },
  furniture: { asset: "1220", dep: "5720", accDep: "1221" },
  computers: { asset: "1230", dep: "5730", accDep: "1231" },
  buildings: { asset: "1240", dep: "5740", accDep: "1241" },
  other:     { asset: "1280", dep: "5790", accDep: "1290" },
};

export function assetClassOf(category?: string | null): keyof typeof ASSET_CLASS_ACCOUNTS {
  const c = (category ?? "").toLowerCase();
  if (/veh|car|fleet|truck|bus|سيار|مركب|نقل|شاحن|باص|حافل/.test(c)) return "vehicles";
  if (/furn|fixture|أثاث|مفروش|ديكور|تجهيز/.test(c)) return "furniture";
  if (/comp|laptop|server|حاسب|كمبيو|جهاز|أجهز|معدّ|معد|حواسب/.test(c)) return "computers";
  if (/build|propert|estate|land|عقار|مبن|مبا|أرض|عمار/.test(c)) return "buildings";
  return "other"; // unmatched → generic "other assets" class (postable defaults)
}

// main's generic schema defaults (and the older absent ones) mean "no explicit
// per-asset account chosen" — they are treated as unset and routed by class.
const GENERIC_ASSET_DEFAULTS = new Set(["", "1500", "6100", "1590", "1280", "5790", "1290"]);

// Resolve an asset's (cost, depreciation-expense, accumulated-depreciation)
// codes for booking: an explicit per-asset code wins, otherwise route by class.
export function resolveAssetAccounts(asset: {
  category?: unknown;
  assetAccountCode?: unknown;
  depreciationAccountCode?: unknown;
  accDepreciationAccountCode?: unknown;
}): AssetClassAccounts {
  const cls = ASSET_CLASS_ACCOUNTS[assetClassOf(asset.category as string | null)];
  const pick = (stored: unknown, fallback: string): string => {
    const s = ((stored as string | null) ?? "").trim();
    return s && !GENERIC_ASSET_DEFAULTS.has(s) ? s : fallback;
  };
  return {
    asset:  pick(asset.assetAccountCode, cls.asset),
    dep:    pick(asset.depreciationAccountCode, cls.dep),
    accDep: pick(asset.accDepreciationAccountCode, cls.accDep),
  };
}
