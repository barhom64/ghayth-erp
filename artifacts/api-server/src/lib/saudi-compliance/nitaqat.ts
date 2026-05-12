/**
 * Saudization (Nitaqat) classifier.
 *
 * Given a company's Saudi vs total headcount + sector, returns the
 * Nitaqat category (platinum / green / yellow / red) per the
 * Ministry of Human Resources thresholds.
 *
 * **Important caveat**: the actual ministry thresholds are
 *   1. published as a sector-by-size matrix (~30 sectors × 5 size
 *      buckets)
 *   2. revised from time to time (the operator's responsibility to
 *      track)
 * The classifier ships with a defensible default table covering the
 * most common cases (default + 4 sectors). Operators with tenants
 * outside these sectors should override via a per-company config
 * row that the route handler reads — same pattern as the FX rate
 * sources.
 *
 * Pure: no DB, no time. Inputs in, classification out.
 */
import type {
  NitaqatCategory,
  SaudizationInput,
  SaudizationResult,
} from "./types.js";

/**
 * Per-sector thresholds — minimum Saudization percent to land in
 * each band. Below the lowest threshold ("yellow") the company is
 * red. Numbers are illustrative ministry defaults; operators with
 * a different official threshold for their (sector × size) bucket
 * configure them per-tenant once that wiring lands.
 */
const SECTOR_THRESHOLDS: Record<
  NonNullable<SaudizationInput["sector"]>,
  { yellow: number; green: number; platinum: number }
> = {
  default:        { yellow: 10, green: 20, platinum: 40 },
  construction:   { yellow:  6, green: 14, platinum: 28 },
  retail:         { yellow: 12, green: 22, platinum: 42 },
  manufacturing:  { yellow:  9, green: 18, platinum: 36 },
  services:       { yellow: 14, green: 25, platinum: 45 },
};

/** Companies with fewer than this many staff are exempt from Nitaqat. */
const NITAQAT_EXEMPTION_HEADCOUNT = 5;

/**
 * Classify a company's Saudization status. Throws on negative or
 * non-finite headcount inputs (catches the "passed -1 by accident"
 * bug class at the leaf).
 */
export function classifyNitaqat(input: SaudizationInput): SaudizationResult {
  if (!Number.isFinite(input.totalEmployees) || input.totalEmployees < 0) {
    throw new Error(`Nitaqat: totalEmployees must be a non-negative integer, got ${input.totalEmployees}`);
  }
  if (!Number.isFinite(input.saudiEmployees) || input.saudiEmployees < 0) {
    throw new Error(`Nitaqat: saudiEmployees must be a non-negative integer, got ${input.saudiEmployees}`);
  }
  if (input.saudiEmployees > input.totalEmployees) {
    throw new Error(
      `Nitaqat: saudiEmployees (${input.saudiEmployees}) cannot exceed totalEmployees (${input.totalEmployees})`,
    );
  }

  if (input.totalEmployees === 0) {
    // No staff = no liability + no eligibility. Treat as exempt
    // green so the dashboard doesn't render a red flag on a fresh
    // company that hasn't onboarded any employees yet.
    return { saudizationPercent: 0, category: "green", exempt: true };
  }

  const percent = round2dp((input.saudiEmployees / input.totalEmployees) * 100);

  if (input.totalEmployees < NITAQAT_EXEMPTION_HEADCOUNT) {
    return { saudizationPercent: percent, category: "green", exempt: true };
  }

  const sector = input.sector ?? "default";
  const t = SECTOR_THRESHOLDS[sector] ?? SECTOR_THRESHOLDS.default;

  let category: NitaqatCategory;
  if (percent >= t.platinum) category = "platinum";
  else if (percent >= t.green) category = "green";
  else if (percent >= t.yellow) category = "yellow";
  else category = "red";

  return { saudizationPercent: percent, category, exempt: false };
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 100 + Number.EPSILON) / 100;
}
