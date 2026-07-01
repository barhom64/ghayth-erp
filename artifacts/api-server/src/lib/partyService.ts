// ─────────────────────────────────────────────────────────────────────────────
// PARTY SERVICE — master-data identity layer (slice 1)
// ─────────────────────────────────────────────────────────────────────────────
// Resolves the 10 siloed person-like tables to a single `parties` registry.
// Everything here is tenant-scoped by companyId and additive: it never mutates
// the source entity tables. See migration 249 and
// docs/audit/ENTERPRISE_ARCHITECTURE_ASSESSMENT.md §"Party Model".

import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";

export type PartyRole =
  | "employee" | "customer" | "supplier" | "agent" | "sub_agent"
  | "pilgrim" | "owner" | "driver" | "tenant";

export interface PartyInput {
  displayName: string;
  nationalId?: string | null;
  phone?: string | null;
  email?: string | null;
  kind?: "person" | "organization";
}

// Source-table → (party fields, role) mapping. Column names verified against
// db/schema_pre.sql. `natId` is the best available national identifier.
interface SourceMap {
  table: string;
  role: PartyRole;
  nameCol: string;
  natIdCol?: string;
  phoneCol?: string;
  emailCol?: string;
}
export const PARTY_SOURCES: SourceMap[] = [
  { table: "employees",       role: "employee", nameCol: "name",     natIdCol: '"nationalId"', phoneCol: "phone", emailCol: "email" },
  { table: "clients",         role: "customer", nameCol: "name",                               phoneCol: "phone", emailCol: "email" },
  { table: "suppliers",       role: "supplier", nameCol: "name",                               phoneCol: "phone", emailCol: "email" },
  { table: "umrah_agents",    role: "agent",    nameCol: "name",                               phoneCol: "phone", emailCol: "email" },
  { table: "umrah_sub_agents",role: "sub_agent",nameCol: "name",                               phoneCol: "phone", emailCol: "email" },
  { table: "umrah_pilgrims",  role: "pilgrim",  nameCol: '"fullName"', natIdCol: '"passportNumber"', phoneCol: "phone" },
  { table: "property_owners", role: "owner",    nameCol: "name",     natIdCol: '"nationalId"', phoneCol: "phone", emailCol: "email" },
  { table: "fleet_drivers",   role: "driver",   nameCol: "name",                               phoneCol: "phone" },
  { table: "tenants",         role: "tenant",   nameCol: "name",     natIdCol: '"nationalId"', phoneCol: "phone", emailCol: "email" },
];

const norm = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
};

/**
 * Resolve (or create) the party for a person within a company. De-dup order:
 *   1. by nationalId  (the unique index guarantees one party per id)
 *   2. else by exact phone match
 *   3. else create a new party
 * Returns the party id. Idempotent for the same identifying inputs.
 */
export async function upsertParty(companyId: number, input: PartyInput): Promise<number> {
  const displayName = norm(input.displayName) ?? "—";
  const nationalId = norm(input.nationalId);
  const phone = norm(input.phone);
  const email = norm(input.email);
  const kind = input.kind ?? "person";

  if (nationalId) {
    const [hit] = await rawQuery<{ id: number }>(
      `SELECT id FROM parties WHERE "companyId"=$1 AND "nationalId"=$2 LIMIT 1`,
      [companyId, nationalId],
    );
    if (hit) {
      await rawExecute(
        `UPDATE parties SET phone=COALESCE(phone,$2), email=COALESCE(email,$3), "updatedAt"=NOW() WHERE id=$1`,
        [hit.id, phone, email],
      );
      return hit.id;
    }
  } else if (phone) {
    const [hit] = await rawQuery<{ id: number }>(
      `SELECT id FROM parties WHERE "companyId"=$1 AND "nationalId" IS NULL AND phone=$2 LIMIT 1`,
      [companyId, phone],
    );
    if (hit) return hit.id;
  }

  // Insert; tolerate a race on the nationalId unique index by re-selecting.
  try {
    const [row] = await rawQuery<{ id: number }>(
      `INSERT INTO parties ("companyId", kind, "displayName", "nationalId", phone, email)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [companyId, kind, displayName, nationalId, phone, email],
    );
    return row.id;
  } catch (err) {
    if (nationalId) {
      const [hit] = await rawQuery<{ id: number }>(
        `SELECT id FROM parties WHERE "companyId"=$1 AND "nationalId"=$2 LIMIT 1`,
        [companyId, nationalId],
      );
      if (hit) return hit.id;
    }
    throw err;
  }
}

/** Link a concrete entity row to a party (idempotent). */
export async function linkEntity(
  companyId: number, partyId: number, entityTable: string, entityId: number, role: PartyRole,
): Promise<void> {
  await rawExecute(
    `INSERT INTO party_links ("partyId","companyId","entityTable","entityId",role)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT ("companyId","entityTable","entityId") DO NOTHING`,
    [partyId, companyId, entityTable, entityId, role],
  );
}

/** Convenience: resolve-or-create a party AND link the entity in one call. */
export async function registerEntityParty(
  companyId: number, entityTable: string, entityId: number, role: PartyRole, input: PartyInput,
): Promise<number> {
  const partyId = await upsertParty(companyId, input);
  await linkEntity(companyId, partyId, entityTable, entityId, role);
  return partyId;
}

export interface PartyLinkRow { entityTable: string; entityId: number; role: string; displayName?: string | null }
export interface Party360 {
  party: { id: number; companyId: number; kind: string; displayName: string; nationalId: string | null; phone: string | null; email: string | null };
  links: PartyLinkRow[];
}

/** The "one person across all tables" view. */
export async function getParty360(companyId: number, partyId: number): Promise<Party360 | null> {
  const [party] = await rawQuery<Party360["party"]>(
    `SELECT id, "companyId", kind, "displayName", "nationalId", phone, email
       FROM parties WHERE id=$1 AND "companyId"=$2`,
    [partyId, companyId],
  );
  if (!party) return null;
  const links = await rawQuery<PartyLinkRow>(
    `SELECT "entityTable", "entityId", role FROM party_links WHERE "partyId"=$1 AND "companyId"=$2 ORDER BY "entityTable"`,
    [partyId, companyId],
  );
  // Enrich each link with the entity's own display name so the 360° screen
  // shows "محمد سالم (موظف)" not "موظف #12". Table + name column come from the
  // fixed PARTY_SOURCES allowlist (never user input), and every lookup carries
  // the companyId predicate. Best-effort: a missing name never fails the view.
  const enriched: PartyLinkRow[] = [];
  for (const link of links) {
    const src = PARTY_SOURCES.find((s) => s.table === link.entityTable);
    let displayName: string | null = null;
    if (src) {
      try {
        const [row] = await rawQuery<{ name: string | null }>(
          `SELECT ${src.nameCol} AS name FROM ${src.table} WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
          [link.entityId, companyId],
        );
        displayName = row?.name ?? null;
      } catch (e) {
        logger.warn(e, `[partyService] name lookup failed for ${link.entityTable}#${link.entityId}`);
      }
    }
    enriched.push({ ...link, displayName });
  }
  return { party, links: enriched };
}

export interface BackfillResult { table: string; scanned: number; linked: number; }

/**
 * Populate the registry from existing rows for one company. Operator-triggered
 * (NOT run on boot). Idempotent: rows already linked are skipped, so re-running
 * only fills gaps. Returns per-table counts.
 */
export async function backfillCompany(companyId: number): Promise<BackfillResult[]> {
  const results: BackfillResult[] = [];
  for (const src of PARTY_SOURCES) {
    let scanned = 0, linked = 0;
    try {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT s.id AS "_id",
                ${src.nameCol} AS "_name",
                ${src.natIdCol ?? "NULL"} AS "_natId",
                ${src.phoneCol ?? "NULL"} AS "_phone",
                ${src.emailCol ?? "NULL"} AS "_email"
           FROM ${src.table} s
          WHERE s."companyId"=$1
            AND NOT EXISTS (
              SELECT 1 FROM party_links pl
               WHERE pl."companyId"=s."companyId"
                 AND pl."entityTable"=$2 AND pl."entityId"=s.id)`,
        [companyId, src.table],
      );
      for (const r of rows) {
        scanned++;
        await registerEntityParty(companyId, src.table, Number(r._id), src.role, {
          displayName: norm(r._name) ?? "—",
          nationalId: norm(r._natId),
          phone: norm(r._phone),
          email: norm(r._email),
        });
        linked++;
      }
    } catch (err) {
      logger.error(err, `[partyService] backfill failed for ${src.table}`);
    }
    results.push({ table: src.table, scanned, linked });
  }
  return results;
}
