// GCC nationality lookup — used by visa-expiring alerts to silence
// false positives.
//
// Background: KSA grants visa-free entry to citizens of the other five
// GCC states (Bahrain, Kuwait, Oman, Qatar, UAE). They enter on their
// national ID, not a visa, so a `visaExpiry IS NULL` row for them is
// a feature, not a missing field. Without this guard the compliance
// dashboard's "visa expiring in 7 days" KPI either:
//
//   - Surfaces them as a high-priority alert when they're actually fine
//     (false positive — operator chases for nothing), OR
//   - Forces the operator to enter a fake visa expiry to silence the
//     alert (data integrity loss).
//
// The match is text-tolerant because `umrah_pilgrims.nationality` is a
// free-text VARCHAR(100) — operators type "البحرين" or "Bahrain" or
// "BH" depending on the source spreadsheet. Same with all 5 countries.
// Case-insensitive on the English side, exact on Arabic.

/**
 * Set of normalised tokens (lower-case English + Arabic) that
 * represent the five other GCC nationalities. Saudi itself is NOT
 * listed — Saudis don't do umrah administratively (they're locals,
 * use the citizen track), and the system should still alert if a
 * Saudi pilgrim somehow has a visa entry.
 */
export const GCC_NATIONALITY_TOKENS: ReadonlySet<string> = new Set([
  // Bahrain
  "bahrain", "bh", "bhr", "البحرين", "بحرين", "بحريني", "بحرينية",
  // Kuwait
  "kuwait", "kw", "kwt", "الكويت", "كويت", "كويتي", "كويتية",
  // Oman
  "oman", "om", "omn", "عمان", "عُمان", "عماني", "عمانية", "عُماني", "عُمانية",
  "sultanate of oman",
  // Qatar
  "qatar", "qa", "qat", "قطر", "قطري", "قطرية",
  // UAE
  "uae", "ae", "are", "u.a.e", "united arab emirates",
  "الإمارات", "الامارات", "إماراتي", "اماراتي", "إماراتية", "اماراتية",
  "emirati", "emirates",
]);

/**
 * Returns true when the free-text nationality value belongs to a GCC
 * state (excluding KSA). Tolerant of whitespace + case + Arabic/English
 * variants. Returns false for nullish input.
 */
export function isGccNationality(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalised = value.trim().toLowerCase();
  if (!normalised) return false;
  return GCC_NATIONALITY_TOKENS.has(normalised);
}

/**
 * SQL fragment for excluding GCC nationals from a query. Use as:
 *
 *     WHERE ${gccExclusionSqlFragment("p.nationality")}
 *
 * The fragment is parameter-free (a literal IN list) so it composes
 * with any param-numbered query without offsetting other placeholders.
 * Arabic + English variants are pre-lowercased on both sides via
 * `LOWER(TRIM(...))` so the operator's typing variance can't bypass
 * the exclusion.
 *
 * Returns `(NOT EXCLUDED_BY_GCC)` — the column reference is interpolated
 * directly, so the caller MUST trust the source (no user-supplied
 * column expression).
 */
export function gccExclusionSqlFragment(columnExpr: string): string {
  const sortedTokens = [...GCC_NATIONALITY_TOKENS]
    .sort()
    .map((t) => `'${t.replace(/'/g, "''")}'`)
    .join(", ");
  return `(${columnExpr} IS NULL OR LOWER(TRIM(${columnExpr})) NOT IN (${sortedTokens}))`;
}
