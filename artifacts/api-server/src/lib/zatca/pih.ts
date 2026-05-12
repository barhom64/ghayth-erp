/**
 * Previous Invoice Hash (PIH) chain — required by ZATCA Phase 2.
 *
 * Every invoice's UBL XML must reference the SHA-256 hash of the PREVIOUS
 * invoice issued by the same company. The first invoice references the
 * spec-mandated default hash (Base64 of SHA-256("0")). If the chain
 * breaks (a hash doesn't match what ZATCA has on record from the prior
 * cleared invoice), ZATCA rejects the new invoice.
 *
 * Storage: `zatca_icv_counters.lastInvoiceHash` (created in migration
 * 139, default seeded to the spec value).
 *
 * This module pairs with `lib/zatca/icv.ts` — both reads happen inside
 * the same transaction, both writes commit together. Splitting them
 * into separate calls is fine **as long as** they share the same tx.
 */
import { rawQuery, rawExecute } from "../rawdb.js";

/** ZATCA-spec placeholder for the chain head (Base64 of SHA-256("0")). */
export const PIH_CHAIN_HEAD =
  "NWZkOWEwMmIwODBhMzE3NWQwMDFiYjJhMjBhMDU2NDgyZjVlMmIwYWY3ZWI3ZmU0YjY1NDk2NWY0YjkwYTk1OQ==";

/**
 * Read the PIH the next invoice should reference. Must run inside the
 * same transaction as `reserveNextIcv` so a concurrent invoice can't
 * read the same PIH and produce two invoices that both claim to be
 * the next link in the chain.
 */
export async function readNextPih(companyId: number): Promise<string> {
  const rows = await rawQuery<{ lastInvoiceHash: string }>(
    `SELECT "lastInvoiceHash" FROM zatca_icv_counters WHERE "companyId" = $1 FOR UPDATE`,
    [companyId],
  );
  if (rows.length === 0) return PIH_CHAIN_HEAD;
  return rows[0].lastInvoiceHash;
}

/**
 * Advance the chain head after an invoice has been signed (or after
 * ZATCA returns clearance). Pass the new invoice's Base64-encoded
 * SHA-256 hash; the next invoice will reference this value as its PIH.
 *
 * The caller decides exactly when to bump — the spec lets you bump
 * after signing locally (faster) but a strict implementation bumps
 * only after ZATCA confirms clearance (safer if a clearance fails).
 */
export async function advancePih(
  companyId: number,
  newInvoiceHashBase64: string,
): Promise<void> {
  await rawExecute(
    `UPDATE zatca_icv_counters
       SET "lastInvoiceHash" = $1, "updatedAt" = NOW()
     WHERE "companyId" = $2`,
    [newInvoiceHashBase64, companyId],
  );
}
