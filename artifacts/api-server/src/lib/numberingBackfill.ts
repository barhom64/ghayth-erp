// numberingBackfill — one-time inventory tool for legacy refs.
//
// Issue #1141 follow-up: when a company existed before the unified
// numbering center was introduced, every executive document already
// has a `ref` / `code` / `number` column populated by the old
// nextval/generateTimeRef paths. Those rows aren't in
// `numbering_assignments`, so the new admin UI shows an empty history
// and the counter starts from 1 — which would emit a NEW number that
// collides with the legacy one on the very next document.
//
// This module scans each scheme's entity table for legacy refs that
// have no matching assignment, inserts an `assigned` assignment row
// for each, and bumps the counter past the highest extracted sequence
// so the next issueNumber doesn't collide.
//
// The operation is idempotent — running it twice is a no-op for rows
// that already have an assignment.

import { withTransaction, rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";
import { ValidationError, NotFoundError } from "./errorHandler.js";

// ─── Identifier sanitisation ────────────────────────────────────────
//
// `defaultEntityTable` / `defaultRefColumn` come from the
// numbering_schemes row, which the admin can edit. We splice them
// into a SQL string, so they have to be sanitised. Allow only the
// shape we know pg_dump would emit for an identifier — letters,
// digits, underscore — anything else throws.
function safeIdent(name: string, what: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)) {
    throw new ValidationError(
      `اسم ${what} غير صالح: "${name}". مسموح فقط الأحرف اللاتينية والأرقام والـ underscore.`,
    );
  }
  return name;
}

/**
 * Try to extract the numeric sequence value from a legacy ref string.
 * Splits on '-' and reads the LAST segment — if and only if it is a
 * pure numeric string we count it as the sequence. Lone digit
 * fragments embedded inside an alphanumeric tail (e.g. the base-36
 * timestamp `LRGZK4J3`) are rejected so the backfill ratchet doesn't
 * jump the counter to a meaningless value.
 *
 *   "REQ-MK-2026-0042"        → 42
 *   "INV-202605-00123"        → 123
 *   "CTR-1000"                → 1000
 *   "EMP-2026-007"            → 7
 *   "OUT-JED-2026-0500"       → 500
 *   "1042"                    → 1042
 *   "PAY-PORTAL-LRGZK4J3"     → 0  (mixed alnum tail, not a real seq)
 *   "BATCH-XYZ"               → 0
 *   "SIG-1748232847123"       → 0  (timestamp, capped at 1B)
 */
export function extractSequenceFromRef(ref: string | null | undefined): number {
  if (!ref) return 0;
  const segments = ref.split(/[-_/]/);
  if (segments.length === 0) return 0;
  const last = segments[segments.length - 1].trim();
  if (!/^\d+$/.test(last)) return 0;
  const n = Number(last);
  return Number.isFinite(n) && n > 0 && n < 1_000_000_000 ? n : 0;
}

// ─── Public surface ─────────────────────────────────────────────────

export interface BackfillSummary {
  schemeId: number;
  moduleKey: string;
  entityKey: string;
  entityTable: string;
  refColumn: string;
  scanned: number;
  alreadyAssigned: number;
  imported: number;
  unparseableSequence: number;
  highestSequence: number;
  nextSequenceAfterBackfill: number;
}

/**
 * Inventory the legacy refs for a single scheme: insert an assignment
 * row for every entity-table ref that doesn't already have one, and
 * bump the counter past the highest sequence we saw.
 *
 * Runs inside one transaction; safe to retry — the unique index on
 * (companyId, moduleKey, entityKey, number) makes duplicate inserts
 * fail loudly. The catch block tolerates the per-row 23505 so a
 * concurrent re-run is a clean no-op.
 */
export async function backfillScheme(params: {
  companyId: number;
  schemeId: number;
  actorId: number | null;
  /** Hard cap on the number of rows to scan in one pass. */
  limit?: number;
}): Promise<BackfillSummary> {
  // Step 1 — read the scheme + its entity-table metadata.
  const [scheme] = await rawQuery<{
    id: number;
    moduleKey: string;
    entityKey: string;
    defaultEntityTable: string | null;
    defaultRefColumn: string | null;
  }>(
    `SELECT id, "moduleKey", "entityKey", "defaultEntityTable", "defaultRefColumn"
       FROM numbering_schemes
      WHERE id = $1 AND "companyId" = $2`,
    [params.schemeId, params.companyId],
  );
  if (!scheme) {
    throw new NotFoundError(`سياسة الترقيم #${params.schemeId} غير موجودة`);
  }
  if (!scheme.defaultEntityTable) {
    throw new ValidationError(
      `سياسة ${scheme.moduleKey}.${scheme.entityKey} لا يوجد لها جدول معاملات معروف — الجرد متعذّر`,
    );
  }

  const table = safeIdent(scheme.defaultEntityTable, "الجدول");
  const refCol = safeIdent(scheme.defaultRefColumn ?? "ref", "العمود");
  const limit = Math.min(params.limit ?? 50_000, 100_000);

  // Step 2 — read every (id, ref) tuple from the entity table that
  // has a non-empty ref and isn't already mirrored in
  // numbering_assignments. The LEFT JOIN + IS NULL is the canonical
  // anti-join shape; it avoids the NOT EXISTS sub-query rewrite cost
  // on big tables.
  const legacyRows = await rawQuery<{ id: number; ref: string }>(
    `SELECT t.id, t."${refCol}"::text AS ref
       FROM "${table}" t
       LEFT JOIN numbering_assignments a
              ON a."companyId"   = $1
             AND a."moduleKey"   = $2
             AND a."entityKey"   = $3
             AND a."entityTable" = $4
             AND a."entityId"    = t.id
      WHERE t."companyId" = $1
        AND t."${refCol}" IS NOT NULL
        AND length(trim(t."${refCol}"::text)) > 0
        AND a.id IS NULL
      ORDER BY t.id ASC
      LIMIT $5`,
    [params.companyId, scheme.moduleKey, scheme.entityKey, table, limit],
  );

  // Step 3 — count how many rows in the table ARE already mirrored
  // so the UI can report a true "scanned" number.
  const [{ already }] = await rawQuery<{ already: string }>(
    `SELECT COUNT(*)::text AS already
       FROM numbering_assignments
      WHERE "companyId"   = $1
        AND "moduleKey"   = $2
        AND "entityKey"   = $3
        AND "entityTable" = $4`,
    [params.companyId, scheme.moduleKey, scheme.entityKey, table],
  );

  let imported = 0;
  let unparseable = 0;
  let highestSeq = 0;

  // Step 4 — import each legacy row as a "backfilled" assignment.
  // We DO NOT touch the counter row inside this transaction; the
  // counter bump happens once at the end, against the maximum seq
  // we actually parsed.
  await withTransaction(async (client) => {
    // Resolve the counter row to update. The numbering scheme's
    // current resetPolicy / scopePolicy determines which counter row
    // we're targeting; we ask for the most-recent one (highest id)
    // and create it if absent. For backfill purposes we don't try to
    // split per-branch / per-year — the import goes into a single
    // "legacy" counter scoped exactly like a fresh scheme would
    // create at the current moment (NULL branchId + current fiscal
    // year). Future issues will produce per-branch counters as the
    // route call sites do their own per-row issuance.
    await client.query(
      `INSERT INTO numbering_counters (
         "schemeId","companyId","branchId","moduleKey","entityKey",
         "fiscalYear",period,"seasonId","lastNumber","nextNumber"
       ) VALUES ($1,$2,NULL,$3,$4,NULL,NULL,NULL,0,1)
       ON CONFLICT (
         "schemeId",
         COALESCE("branchId", 0),
         COALESCE("fiscalYear", 0),
         COALESCE(period, ''),
         COALESCE("seasonId", 0)
       ) DO UPDATE SET "updatedAt" = numbering_counters."updatedAt"`,
      [scheme.id, params.companyId, scheme.moduleKey, scheme.entityKey],
    );
    const { rows: cRows } = await client.query(
      `SELECT id, "lastNumber" FROM numbering_counters
        WHERE "schemeId" = $1
          AND "branchId" IS NULL
          AND "fiscalYear" IS NULL
          AND period IS NULL
          AND "seasonId" IS NULL
        FOR UPDATE`,
      [scheme.id],
    );
    const counterId = cRows[0]?.id as number;
    if (!counterId) {
      throw new Error("backfill: counter row vanished after upsert");
    }

    for (const row of legacyRows) {
      const refValue = row.ref.trim();
      const seq = extractSequenceFromRef(refValue);
      if (seq === 0) {
        unparseable += 1;
      } else if (seq > highestSeq) {
        highestSeq = seq;
      }
      try {
        await client.query(
          `INSERT INTO numbering_assignments (
             "schemeId","counterId","companyId","branchId",
             "moduleKey","entityKey","entityTable","entityId",
             number,"sequenceValue",status,"issuedBy","issuedAt","assignedAt",metadata
           ) VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,'assigned',$10,NOW(),NOW(),$11)`,
          [
            scheme.id, counterId, params.companyId,
            scheme.moduleKey, scheme.entityKey, table, row.id,
            refValue, seq || row.id, params.actorId,
            JSON.stringify({ backfill: true, parsedSequence: seq, raw: refValue }),
          ],
        );
        imported += 1;
      } catch (err) {
        const pg = err as { code?: string };
        if (pg?.code === "23505") {
          // Concurrent backfill or a previous attempt already
          // inserted this ref — skip silently.
          continue;
        }
        throw err;
      }
    }

    // Step 5 — bump the counter so future issueNumber calls don't
    // collide with the legacy max. We only ratchet UP — never down.
    if (highestSeq > 0) {
      await client.query(
        `UPDATE numbering_counters
            SET "lastNumber" = GREATEST("lastNumber", $1),
                "nextNumber" = GREATEST("nextNumber", $1 + 1),
                "updatedAt"  = NOW()
          WHERE id = $2`,
        [highestSeq, counterId],
      );
    }

    // Step 6 — stamp the scheme so the UI can show "last backfilled X ago".
    await client.query(
      `UPDATE numbering_schemes
          SET "lastBackfillAt"    = NOW(),
              "lastBackfillCount" = COALESCE("lastBackfillCount", 0) + $1,
              "updatedAt"         = NOW()
        WHERE id = $2`,
      [imported, scheme.id],
    );

    // Step 7 — audit row.
    await client.query(
      `INSERT INTO numbering_audit_logs (
         "companyId","actorId",action,"schemeId","after",reason
       ) VALUES ($1,$2,'backfill',$3,$4,$5)`,
      [
        params.companyId, params.actorId, scheme.id,
        JSON.stringify({
          entityTable: table, refColumn: refCol,
          imported, unparseable, highestSequence: highestSeq,
        }),
        `جرد ${imported} معاملة قديمة من ${table}`,
      ],
    );
  });

  logger.info({
    schemeId: scheme.id,
    table,
    refCol,
    scanned: legacyRows.length,
    imported,
    unparseable,
    highestSeq,
  }, "[numbering] backfill complete");

  return {
    schemeId: scheme.id,
    moduleKey: scheme.moduleKey,
    entityKey: scheme.entityKey,
    entityTable: table,
    refColumn: refCol,
    scanned: legacyRows.length,
    alreadyAssigned: Number(already),
    imported,
    unparseableSequence: unparseable,
    highestSequence: highestSeq,
    nextSequenceAfterBackfill: highestSeq + 1,
  };
}

/**
 * Inventory all schemes for the company in one pass. Returns one
 * summary per scheme. Used by the "جرد كل الترقيم" button on the
 * admin tab — runs the per-scheme backfill in sequence so a failure
 * in one scheme doesn't poison the others.
 */
export async function backfillAllSchemes(params: {
  companyId: number;
  actorId: number | null;
}): Promise<BackfillSummary[]> {
  const schemes = await rawQuery<{ id: number; defaultEntityTable: string | null }>(
    `SELECT id, "defaultEntityTable"
       FROM numbering_schemes
      WHERE "companyId" = $1 AND "isActive" = true
      ORDER BY "moduleKey", "entityKey"`,
    [params.companyId],
  );
  const results: BackfillSummary[] = [];
  for (const s of schemes) {
    if (!s.defaultEntityTable) continue;
    try {
      const summary = await backfillScheme({
        companyId: params.companyId,
        schemeId: s.id,
        actorId: params.actorId,
      });
      results.push(summary);
    } catch (err) {
      logger.error(err, `[numbering] backfill failed for scheme ${s.id}`);
    }
  }
  return results;
}

/**
 * Preview how many legacy rows would be picked up by a backfill,
 * without actually inserting anything. Lets the admin see the
 * impact before pressing the button.
 */
export async function previewBackfill(params: {
  companyId: number;
  schemeId: number;
}): Promise<{
  schemeId: number;
  entityTable: string | null;
  refColumn: string | null;
  pending: number;
  alreadyAssigned: number;
}> {
  const [scheme] = await rawQuery<{
    id: number;
    moduleKey: string;
    entityKey: string;
    defaultEntityTable: string | null;
    defaultRefColumn: string | null;
  }>(
    `SELECT id, "moduleKey", "entityKey", "defaultEntityTable", "defaultRefColumn"
       FROM numbering_schemes
      WHERE id = $1 AND "companyId" = $2`,
    [params.schemeId, params.companyId],
  );
  if (!scheme) throw new NotFoundError(`سياسة الترقيم #${params.schemeId} غير موجودة`);
  if (!scheme.defaultEntityTable) {
    return {
      schemeId: scheme.id,
      entityTable: null,
      refColumn: null,
      pending: 0,
      alreadyAssigned: 0,
    };
  }
  const table = safeIdent(scheme.defaultEntityTable, "الجدول");
  const refCol = safeIdent(scheme.defaultRefColumn ?? "ref", "العمود");
  const [{ pending }] = await rawQuery<{ pending: string }>(
    `SELECT COUNT(*)::text AS pending
       FROM "${table}" t
       LEFT JOIN numbering_assignments a
              ON a."companyId"   = $1
             AND a."moduleKey"   = $2
             AND a."entityKey"   = $3
             AND a."entityTable" = $4
             AND a."entityId"    = t.id
      WHERE t."companyId" = $1
        AND t."${refCol}" IS NOT NULL
        AND length(trim(t."${refCol}"::text)) > 0
        AND a.id IS NULL`,
    [params.companyId, scheme.moduleKey, scheme.entityKey, table],
  );
  const [{ already }] = await rawQuery<{ already: string }>(
    `SELECT COUNT(*)::text AS already
       FROM numbering_assignments
      WHERE "companyId"   = $1
        AND "moduleKey"   = $2
        AND "entityKey"   = $3
        AND "entityTable" = $4`,
    [params.companyId, scheme.moduleKey, scheme.entityKey, table],
  );
  return {
    schemeId: scheme.id,
    entityTable: table,
    refColumn: refCol,
    pending: Number(pending),
    alreadyAssigned: Number(already),
  };
}
