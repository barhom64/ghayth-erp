// ─────────────────────────────────────────────────────────────────────────────
// OBLIGATIONS ENGINE — محرك الالتزامات الزمنية
// ─────────────────────────────────────────────────────────────────────────────
// A generic deadline tracker for ANY entity in the system:
//   • invoice due dates
//   • contract renewals
//   • fleet maintenance intervals
//   • legal hearing dates
//   • HR document expiries (residency, license)
//   • workflow approval SLA
//   • tax declaration deadlines
//
// Lifecycle:  pending → (met | breached → escalated_L1 → escalated_L2 → closed)
//
// Every obligation carries:
//   • entityType + entityId       (what we're tracking)
//   • obligationType              (renewal, payment, maintenance, hearing, etc.)
//   • dueAt                       (deadline)
//   • assignedTo (optional)       (who's responsible)
//   • escalationSteps JSONB       (who to notify at each breach level)
//   • metadata JSONB              (free-form context)
//
// Call-sites just do:
//    await registerObligation({ companyId, entityType: "invoice", entityId: 42,
//                               obligationType: "payment", dueAt: invoice.dueDate });
//
// A cron scanner (hourly) flips pending→breached and emits
// `system.obligation.breached`. Escalation policies are handled downstream
// by the notification engine.

import { rawExecute, rawQuery, withTransaction, pool } from "./rawdb.js";
import { emitEvent, createNotification } from "./businessHelpers.js";

export type ObligationType =
  | "payment"
  | "renewal"
  | "maintenance"
  | "hearing"
  | "document_expiry"
  | "approval"
  | "delivery"
  | "inspection"
  | "declaration"
  | "follow_up";

export type ObligationStatus =
  | "pending"
  | "met"
  | "breached"
  | "escalated_l1"
  | "escalated_l2"
  | "closed"
  | "cancelled";

export interface RegisterObligationInput {
  companyId: number;
  branchId?: number | null;
  entityType: string;       // e.g. "invoice", "contract", "vehicle"
  entityId: number;
  obligationType: ObligationType;
  title: string;            // human-readable summary
  dueAt: string | Date;     // ISO date or Date
  assignedTo?: number | null;  // employee_assignment id
  escalationSteps?: Array<{ hoursAfterDue: number; notifyRole: string }>;
  metadata?: Record<string, any>;
  /** Optional dedupe key — second registration with same key is no-op */
  dedupeKey?: string;
}

/**
 * Create the obligations table if missing. Called lazily on first use so that
 * we don't need a dedicated migration for hot-patching.
 */
let obligationsTableEnsured = false;
export async function ensureObligationsTable(): Promise<void> {
  if (obligationsTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS obligations (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "branchId" INTEGER,
      "entityType" VARCHAR(40) NOT NULL,
      "entityId" INTEGER NOT NULL,
      "obligationType" VARCHAR(32) NOT NULL,
      title TEXT NOT NULL,
      "dueAt" TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      "assignedTo" INTEGER,
      "escalationLevel" INTEGER NOT NULL DEFAULT 0,
      "escalationSteps" JSONB,
      metadata JSONB,
      "dedupeKey" VARCHAR(120),
      "metAt" TIMESTAMP,
      "breachedAt" TIMESTAMP,
      "lastScannedAt" TIMESTAMP,
      "closedBy" INTEGER,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_obligations_scan
      ON obligations (status, "dueAt")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_obligations_entity
      ON obligations ("companyId", "entityType", "entityId")
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_obligations_dedupe
      ON obligations ("companyId", "dedupeKey") WHERE "dedupeKey" IS NOT NULL
  `);
  obligationsTableEnsured = true;
}

/**
 * Register a new obligation. Idempotent when dedupeKey is provided.
 * Returns the obligation id (or existing one if deduped).
 */
export async function registerObligation(input: RegisterObligationInput): Promise<number> {
  await ensureObligationsTable();
  const dueAt = input.dueAt instanceof Date ? input.dueAt.toISOString() : input.dueAt;

  if (input.dedupeKey) {
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM obligations WHERE "companyId"=$1 AND "dedupeKey"=$2 LIMIT 1`,
      [input.companyId, input.dedupeKey]
    );
    if (existing) return existing.id;
  }

  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO obligations
     ("companyId","branchId","entityType","entityId","obligationType",title,"dueAt",
      "assignedTo","escalationSteps",metadata,"dedupeKey")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.companyId,
      input.branchId ?? null,
      input.entityType,
      input.entityId,
      input.obligationType,
      input.title,
      dueAt,
      input.assignedTo ?? null,
      input.escalationSteps ? JSON.stringify(input.escalationSteps) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.dedupeKey ?? null,
    ]
  );
  return row.id;
}

/**
 * Mark an obligation as fulfilled. Called when the underlying event happens
 * (e.g. invoice paid, contract renewed, maintenance performed).
 */
export async function markObligationMet(
  companyId: number,
  entityType: string,
  entityId: number,
  obligationType?: ObligationType
): Promise<number> {
  await ensureObligationsTable();
  const params: any[] = [companyId, entityType, entityId];
  let where = `"companyId"=$1 AND "entityType"=$2 AND "entityId"=$3
               AND status IN ('pending','breached','escalated_l1','escalated_l2')`;
  if (obligationType) {
    params.push(obligationType);
    where += ` AND "obligationType"=$${params.length}`;
  }
  const rows = await rawQuery<{ id: number }>(
    `UPDATE obligations
       SET status='met', "metAt"=NOW(), "updatedAt"=NOW()
     WHERE ${where}
     RETURNING id`,
    params
  );
  return rows.length;
}

/**
 * Cancel an obligation (e.g. contract was terminated early, PO cancelled).
 */
export async function cancelObligation(
  companyId: number,
  entityType: string,
  entityId: number,
  obligationType?: ObligationType
): Promise<number> {
  await ensureObligationsTable();
  const params: any[] = [companyId, entityType, entityId];
  let where = `"companyId"=$1 AND "entityType"=$2 AND "entityId"=$3
               AND status NOT IN ('met','cancelled','closed')`;
  if (obligationType) {
    params.push(obligationType);
    where += ` AND "obligationType"=$${params.length}`;
  }
  const rows = await rawQuery<{ id: number }>(
    `UPDATE obligations
       SET status='cancelled', "updatedAt"=NOW()
     WHERE ${where}
     RETURNING id`,
    params
  );
  return rows.length;
}

/**
 * Scanner — flips pending obligations whose dueAt has passed into 'breached',
 * and advances already-breached ones through escalation levels based on
 * escalationSteps.hoursAfterDue.
 *
 * Returns counts for observability.
 */
export async function scanObligations(companyId?: number): Promise<{
  breachedCount: number;
  escalatedL1: number;
  escalatedL2: number;
}> {
  await ensureObligationsTable();
  let breachedCount = 0;
  let escalatedL1 = 0;
  let escalatedL2 = 0;
  const companyFilter = companyId ? ` AND "companyId" = ${Number(companyId)}` : '';

  await withTransaction(async (client: any) => {
    // 1) pending → breached
    const newlyBreached = await client.query(
      `UPDATE obligations
         SET status='breached',
             "breachedAt"=NOW(),
             "escalationLevel"=1,
             "lastScannedAt"=NOW(),
             "updatedAt"=NOW()
       WHERE status='pending' AND "dueAt" < NOW()${companyFilter}
       RETURNING id, "companyId", "entityType", "entityId", "obligationType",
                 title, "assignedTo", "escalationSteps", "dueAt"`
    );
    breachedCount = newlyBreached.rowCount ?? 0;

    for (const o of newlyBreached.rows) {
      await emitEvent({
        companyId: o.companyId,
        userId: 0,
        action: "system.obligation.breached",
        entity: o.entityType,
        entityId: o.entityId,
        details: `التزام متأخر: ${o.title}`,
      });
      if (o.assignedTo) {
        await createNotification({
          companyId: o.companyId,
          assignmentId: o.assignedTo,
          type: "obligation_breached",
          title: "التزام متأخر",
          body: o.title,
          priority: "high",
        });
      }
    }

    // 2) breached → escalated_l1 after escalationSteps[0].hoursAfterDue
    const l1 = await client.query(
      `UPDATE obligations o
         SET status='escalated_l1',
             "escalationLevel"=2,
             "lastScannedAt"=NOW(),
             "updatedAt"=NOW()
       WHERE status='breached'
         AND "escalationSteps" IS NOT NULL
         AND jsonb_array_length("escalationSteps") >= 1
         AND "dueAt" + (("escalationSteps"->0->>'hoursAfterDue')::int || ' hours')::interval <= NOW()${companyFilter}
       RETURNING id, "companyId", "entityType", "entityId", title`
    );
    escalatedL1 = l1.rowCount ?? 0;

    for (const o of l1.rows) {
      await emitEvent({
        companyId: o.companyId,
        userId: 0,
        action: "system.obligation.escalated",
        entity: o.entityType,
        entityId: o.entityId,
        details: `تصعيد L1: ${o.title}`,
      });
    }

    // 3) escalated_l1 → escalated_l2 after escalationSteps[1].hoursAfterDue
    const l2 = await client.query(
      `UPDATE obligations o
         SET status='escalated_l2',
             "escalationLevel"=3,
             "lastScannedAt"=NOW(),
             "updatedAt"=NOW()
       WHERE status='escalated_l1'
         AND "escalationSteps" IS NOT NULL
         AND jsonb_array_length("escalationSteps") >= 2
         AND "dueAt" + (("escalationSteps"->1->>'hoursAfterDue')::int || ' hours')::interval <= NOW()${companyFilter}
       RETURNING id, "companyId", "entityType", "entityId", title`
    );
    escalatedL2 = l2.rowCount ?? 0;

    for (const o of l2.rows) {
      await emitEvent({
        companyId: o.companyId,
        userId: 0,
        action: "system.obligation.escalated",
        entity: o.entityType,
        entityId: o.entityId,
        details: `تصعيد L2: ${o.title}`,
      });
    }

    // 4) pending & due within 24h & not yet reminded → emit reminder
    const reminders = await client.query(
      `UPDATE obligations
         SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"reminder24hSent": true}'::jsonb,
             "lastScannedAt"=NOW(),
             "updatedAt"=NOW()
       WHERE status='pending'
         AND "dueAt" > NOW()
         AND "dueAt" <= NOW() + INTERVAL '24 hours'
         AND COALESCE((metadata->>'reminder24hSent')::boolean, false) = false${companyFilter}
       RETURNING id, "companyId", "entityType", "entityId", title, "assignedTo", "dueAt"`
    );

    for (const o of reminders.rows) {
      await emitEvent({
        companyId: o.companyId,
        userId: 0,
        action: "system.obligation.reminder",
        entity: o.entityType,
        entityId: o.entityId,
        details: `تذكير قبل 24 ساعة: ${o.title}`,
      });
      if (o.assignedTo) {
        await createNotification({
          companyId: o.companyId,
          assignmentId: o.assignedTo,
          type: "obligation_reminder",
          title: "تذكير: التزام يستحق خلال 24 ساعة",
          body: o.title,
          priority: "medium",
        });
      }
    }
  });

  return { breachedCount, escalatedL1, escalatedL2 };
}

/**
 * Query obligations for a company with flexible filters.
 */
export interface QueryObligationsInput {
  companyId: number;
  entityType?: string | string[];
  entityId?: number;
  status?: ObligationStatus | ObligationStatus[];
  assignedTo?: number;
  dueBefore?: string;
  dueAfter?: string;
  limit?: number;
}

export async function queryObligations(input: QueryObligationsInput): Promise<any[]> {
  await ensureObligationsTable();
  const params: any[] = [input.companyId];
  let where = `"companyId" = $1`;
  if (input.entityType) {
    const types = Array.isArray(input.entityType)
      ? input.entityType
      : String(input.entityType).split(",").map((s) => s.trim()).filter(Boolean);
    if (types.length === 1) {
      params.push(types[0]);
      where += ` AND "entityType"=$${params.length}`;
    } else if (types.length > 1) {
      params.push(types);
      where += ` AND "entityType" = ANY($${params.length}::text[])`;
    }
  }
  if (input.entityId) { params.push(input.entityId); where += ` AND "entityId"=$${params.length}`; }
  if (input.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    params.push(statuses);
    where += ` AND status = ANY($${params.length}::text[])`;
  }
  if (input.assignedTo) { params.push(input.assignedTo); where += ` AND "assignedTo"=$${params.length}`; }
  if (input.dueBefore) { params.push(input.dueBefore); where += ` AND "dueAt" < $${params.length}::timestamp`; }
  if (input.dueAfter) { params.push(input.dueAfter); where += ` AND "dueAt" > $${params.length}::timestamp`; }

  const limit = Math.min(500, Math.max(1, input.limit ?? 100));
  return rawQuery<any>(
    `SELECT * FROM obligations WHERE ${where} ORDER BY "dueAt" ASC LIMIT ${limit}`,
    params
  );
}

/**
 * Aggregate counts for exec dashboard.
 */
export async function obligationSummary(companyId: number): Promise<{
  pending: number;
  breached: number;
  escalatedL1: number;
  escalatedL2: number;
  dueIn24h: number;
  dueIn7d: number;
  byType: Record<string, number>;
}> {
  await ensureObligationsTable();
  const [counts] = await rawQuery<any>(
    `SELECT
      COUNT(*) FILTER (WHERE status='pending')::int AS pending,
      COUNT(*) FILTER (WHERE status='breached')::int AS breached,
      COUNT(*) FILTER (WHERE status='escalated_l1')::int AS "escalatedL1",
      COUNT(*) FILTER (WHERE status='escalated_l2')::int AS "escalatedL2",
      COUNT(*) FILTER (WHERE status='pending' AND "dueAt" <= NOW() + INTERVAL '24 hours')::int AS "dueIn24h",
      COUNT(*) FILTER (WHERE status='pending' AND "dueAt" <= NOW() + INTERVAL '7 days')::int AS "dueIn7d"
     FROM obligations WHERE "companyId"=$1`,
    [companyId]
  );
  const byTypeRows = await rawQuery<any>(
    `SELECT "obligationType", COUNT(*)::int AS count
       FROM obligations
       WHERE "companyId"=$1 AND status IN ('pending','breached','escalated_l1','escalated_l2')
       GROUP BY "obligationType"`,
    [companyId]
  );
  const byType: Record<string, number> = {};
  for (const r of byTypeRows) byType[r.obligationType] = r.count;
  return {
    pending: counts?.pending ?? 0,
    breached: counts?.breached ?? 0,
    escalatedL1: counts?.escalatedL1 ?? 0,
    escalatedL2: counts?.escalatedL2 ?? 0,
    dueIn24h: counts?.dueIn24h ?? 0,
    dueIn7d: counts?.dueIn7d ?? 0,
    byType,
  };
}
