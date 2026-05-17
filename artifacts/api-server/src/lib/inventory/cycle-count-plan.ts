/**
 * ABC-driven cycle-count plan generator.
 *
 * Best-practice cadence — A items quarterly, B items semi-annually,
 * C items annually — translated into "how many distinct counts must
 * I schedule per warehouse this period?" The generator picks
 * candidate products from `product_abc_classification` for the
 * current period and creates one `warehouse_cycle_counts` row per
 * (warehouse, product), all bound to a parent `warehouse_cycle_count_plans`
 * header row so the operator can review the batch.
 *
 * Idempotency: the unique key on `warehouse_cycle_count_plans`
 * (`companyId`, `warehouseId`, `period`, `planType`) means re-running
 * the generator for the same month returns the existing plan id and
 * does not create duplicate counts.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import { scheduleCycleCount } from "./cycle-count.js";
import { todayISO } from "../businessHelpers.js";

export interface GeneratePlanInput {
  companyId: number;
  warehouseId: number;
  /** YYYY-MM */
  period: string;
  /** UTC date the counts should be physically performed; defaults to today. */
  scheduledDate?: string;
  createdBy?: number;
  /**
   * Per-bucket caps so a giant catalog doesn't generate hundreds of
   * counts at once. Defaults: A=20, B=10, C=5.
   */
  caps?: { a?: number; b?: number; c?: number };
}

export interface GeneratePlanOutcome {
  planId: number;
  reused: boolean;
  scheduledCount: number;
  byCategory: { A: number; B: number; C: number };
}

const DEFAULT_CAPS = { a: 20, b: 10, c: 5 };

export async function generateCycleCountPlan(
  input: GeneratePlanInput,
): Promise<GeneratePlanOutcome> {
  const caps = { ...DEFAULT_CAPS, ...(input.caps ?? {}) };
  const scheduledDate = input.scheduledDate ?? todayISO();

  return withTransaction(async () => {
    // Reuse-or-insert plan header.
    const existing = await rawQuery<{ id: number; scheduledCount: number }>(
      `SELECT id, "scheduledCount" FROM warehouse_cycle_count_plans
       WHERE "companyId" = $1 AND "warehouseId" = $2 AND period = $3 AND "planType" = 'abc'`,
      [input.companyId, input.warehouseId, input.period],
    );
    if (existing.length) {
      return {
        planId: existing[0].id,
        reused: true,
        scheduledCount: Number(existing[0].scheduledCount),
        byCategory: { A: 0, B: 0, C: 0 },
      };
    }

    const headerRows = await rawQuery<{ id: number }>(
      `INSERT INTO warehouse_cycle_count_plans
         ("companyId", "warehouseId", period, "planType", "createdBy")
       VALUES ($1, $2, $3, 'abc', $4)
       RETURNING id`,
      [input.companyId, input.warehouseId, input.period, input.createdBy ?? null],
    );
    const planId = headerRows[0].id;

    // Pick candidate products from the latest ABC classification.
    // We look at the LATEST period in the table (not the requested
    // `input.period`) so a freshly-onboarded warehouse without an ABC
    // run for the requested month still gets a sensible plan.
    const candidates = await rawQuery<{ productId: number; category: "A" | "B" | "C" }>(
      `SELECT "productId", category
       FROM product_abc_classification pac
       WHERE pac."companyId" = $1
         AND pac.period = (
           SELECT MAX(period) FROM product_abc_classification
           WHERE "companyId" = $1
         )
       ORDER BY (CASE category WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END),
                "paretoValue" DESC NULLS LAST`,
      [input.companyId],
    );

    const buckets = { A: [] as number[], B: [] as number[], C: [] as number[] };
    for (const c of candidates) buckets[c.category].push(c.productId);

    const picked: Array<{ productId: number; category: "A" | "B" | "C" }> = [];
    for (const id of buckets.A.slice(0, caps.a)) picked.push({ productId: id, category: "A" });
    for (const id of buckets.B.slice(0, caps.b)) picked.push({ productId: id, category: "B" });
    for (const id of buckets.C.slice(0, caps.c)) picked.push({ productId: id, category: "C" });

    const byCategory = { A: 0, B: 0, C: 0 };

    for (const p of picked) {
      const { cycleCountId } = await scheduleCycleCount({
        companyId: input.companyId,
        warehouseId: input.warehouseId,
        scheduledDate,
        notes: `ABC plan #${planId} (${input.period}) — category ${p.category} — product ${p.productId}`,
      });
      await rawExecute(
        `UPDATE warehouse_cycle_counts SET "planId" = $1 WHERE id = $2`,
        [planId, cycleCountId],
      );
      byCategory[p.category] += 1;
    }

    const total = picked.length;
    await rawExecute(
      `UPDATE warehouse_cycle_count_plans SET "scheduledCount" = $1 WHERE id = $2`,
      [total, planId],
    );

    logger.info(
      { planId, warehouseId: input.warehouseId, period: input.period, ...byCategory },
      "[cycle-count-plan] generated",
    );

    return { planId, reused: false, scheduledCount: total, byCategory };
  });
}
