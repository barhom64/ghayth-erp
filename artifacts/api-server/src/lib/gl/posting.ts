/**
 * DB driver: hand a `JournalEntryPayload` (from
 * `lib/gl/journal-poster.ts`) and an `EntryContext` here, and a
 * balanced row is inserted into `journal_entries` + `journal_lines`
 * inside a transaction. Returns the new `journalEntryId`.
 *
 * This is the integration helper the four down-stream posters (FX
 * revaluation, realised FX, cycle-count variance, inventory write-
 * off) call. It deliberately does NOT decide WHICH accounts to use
 * (that's `account-purposes.ts`) or HOW to compute the amount
 * (that's the domain layer). The poster's only job is to translate
 * the validated payload into SQL — and double-check the balance
 * invariant one last time before the INSERT so a future caller
 * that builds the payload by hand (instead of through the builder)
 * still can't post an unbalanced row.
 *
 * Status of the inserted entry is `posted` by default. Callers
 * that want a draft (the operator reviews before posting) pass
 * `status: "draft"`.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import { checkFinancialPeriodOpen, todayISO } from "../businessHelpers.js";
import type { JournalEntryPayload } from "./journal-poster.js";

export type JournalEntryStatus = "draft" | "posted";

export interface EntryContext {
  companyId: number;
  branchId?: number;
  /** Operator who triggered the posting (audit log). */
  createdBy?: number;
  /** Stable identifier the operator types or the engine generates
   *  ("FX-REV-2026-05", "REAL-FX-INV-1234"). */
  ref?: string;
  /** YYYY-MM-DD — journal entry effective date. */
  date?: string;
  /** Classifier used by reporting: 'manual', 'fx_revaluation',
   *  'fx_realised', 'cycle_count_variance', etc. */
  type?: string;
  /** Cross-reference back to the originating audit row, e.g.
   *  ('fx_revaluation_log', 42). The journal-lines table stores
   *  these too on each line if the payload set them. */
  sourceType?: string;
  sourceId?: number;
  /** Stable idempotency key for the economic event being posted (PD-6).
   *  When provided, a retried post with the same (companyId, sourceKey)
   *  returns the existing entry instead of double-posting. Backed by the
   *  partial UNIQUE index on journal_entries (companyId, sourceKey) WHERE
   *  sourceKey IS NOT NULL — so even a racy missed pre-check is rejected
   *  by the database. */
  sourceKey?: string;
  /** Whether to mark the entry posted immediately (default) or
   *  leave it as a draft for operator review. */
  status?: JournalEntryStatus;
}

export interface PostedEntry {
  journalEntryId: number;
  status: JournalEntryStatus;
  /** True when an idempotent retry hit an existing entry (sourceKey
   *  matched) and no new row was inserted. */
  alreadyExists?: boolean;
}

/**
 * Insert a balanced journal entry + lines inside one transaction.
 *
 * Throws if:
 *   - The payload is unbalanced (defence in depth — `buildEntry`
 *     should have caught this already)
 *   - Any line references a non-postable / soft-deleted account
 *
 * Returns the new `journalEntryId` so the caller can stamp it on
 * the originating audit row (e.g.
 * `fx_revaluation_log.journalEntryId`).
 */
export async function postJournalEntry(
  payload: JournalEntryPayload,
  ctx: EntryContext,
): Promise<PostedEntry> {
  // Defence in depth: re-validate the balance even though
  // `buildEntry` already did. A future caller might pass a hand-
  // crafted payload that skipped the builder.
  if (Math.abs(payload.totalDebit - payload.totalCredit) > 0.01) {
    throw new Error(
      `postJournalEntry: payload unbalanced ` +
        `(debit=${payload.totalDebit}, credit=${payload.totalCredit})`,
    );
  }
  if (payload.lines.length === 0) {
    throw new Error("postJournalEntry: payload has no lines");
  }

  const status: JournalEntryStatus = ctx.status ?? "posted";

  // PD-6 — sourceKey idempotency. A retried post (scheduler re-fire, network
  // blip, manual retry) with the same (companyId, sourceKey) returns the
  // existing entry instead of double-posting. The check here is best-effort
  // — the partial UNIQUE index on journal_entries (companyId, sourceKey)
  // WHERE sourceKey IS NOT NULL is the authoritative backstop, so even a
  // racy missed pre-check is rejected by the database with a unique
  // violation rather than silently double-counting.
  if (ctx.sourceKey) {
    const existing = await rawQuery<{ id: number; status: JournalEntryStatus }>(
      `SELECT id, status FROM journal_entries
       WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
       LIMIT 1`,
      [ctx.companyId, ctx.sourceKey],
    );
    if (existing.length > 0) {
      return {
        journalEntryId: existing[0].id,
        status: existing[0].status,
        alreadyExists: true,
      };
    }
  }

  // Financial-period-close gate. A *posted* entry must never land in a
  // closed financial period. Drafts are exempt — the gate is enforced
  // when the draft is later posted. This is the single chokepoint for the
  // FX, inventory and Mudad-payroll posters that call this primitive
  // directly; `financialEngine.postJournalEntry` carries its own check.
  // The sanctioned way to post into a closed period is to reopen it via
  // the audited fiscal-period reopen flow.
  if (status === "posted") {
    const effectiveDate = ctx.date ?? todayISO();
    const period = await checkFinancialPeriodOpen(ctx.companyId, effectiveDate);
    if (!period.open) {
      throw new Error(
        `الفترة المالية "${period.periodName ?? effectiveDate}" مغلقة — لا يمكن ترحيل قيد محاسبي`,
      );
    }
  }

  return withTransaction(async () => {
    // Validate every account exists + allows posting BEFORE we
    // insert the header — a single bad accountId would otherwise
    // leave us with a half-written entry that withTransaction
    // would have to roll back.
    const accountIds = Array.from(new Set(payload.lines.map((l) => l.accountId)));
    const accounts = await rawQuery<{ id: number; code: string }>(
      `SELECT id, code FROM chart_of_accounts
       WHERE id = ANY($1::int[])
         AND "companyId" = $2
         AND "deletedAt" IS NULL
         AND "isActive" = true
         AND "allowPosting" = true`,
      [accountIds, ctx.companyId],
    );
    const valid = new Set(accounts.map((a) => a.id));
    const missing = accountIds.filter((id) => !valid.has(id));
    if (missing.length > 0) {
      throw new Error(
        `postJournalEntry: account IDs not postable (deleted, inactive, not a posting account, or wrong company): ${missing.join(", ")}`,
      );
    }

    // Build a {id → code} map for the journal_lines insert
    // (journal_lines.accountCode is NOT NULL even though
    // journal_lines.accountId is the canonical FK).
    const codeById = new Map(accounts.map((a) => [a.id, a.code]));

    const [header] = await rawQuery<{ id: number }>(
      // C2 — createdAt is stamped with the effective accounting date (the
      // same value as `date`), not NOW(). Financial reports range-filter on
      // createdAt; createJournalEntry already treats createdAt as the
      // accounting date (applyHeaderOverrides sets it from postingDate), so
      // a back-dated FX / inventory entry posted here lands in the correct
      // reporting period instead of the period it was physically inserted.
      `INSERT INTO journal_entries (
         "companyId", "branchId", ref, description, "createdBy",
         date, type, status, "sourceType", "sourceId", "postedBy", "postedAt", "createdAt",
         "sourceKey"
       ) VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE),
                 COALESCE($7, 'manual'), $8, $9, $10,
                 CASE WHEN $8 = 'posted' THEN $5 ELSE NULL END,
                 CASE WHEN $8 = 'posted' THEN NOW() ELSE NULL END,
                 COALESCE($6::date, CURRENT_DATE),
                 $11)
       RETURNING id`,
      [
        ctx.companyId,
        ctx.branchId ?? null,
        ctx.ref ?? null,
        payload.description,
        ctx.createdBy ?? null,
        ctx.date ?? null,
        ctx.type ?? null,
        status,
        ctx.sourceType ?? null,
        ctx.sourceId ?? null,
        ctx.sourceKey ?? null,
      ],
    );
    const journalEntryId = header.id;

    const balanceDeltas = new Map<string, number>();
    for (const line of payload.lines) {
      const accountCode = codeById.get(line.accountId);
      if (!accountCode) {
        // Shouldn't happen — we validated above. Belt + braces.
        throw new Error(`postJournalEntry: account ${line.accountId} disappeared mid-transaction`);
      }
      await rawExecute(
        `INSERT INTO journal_lines (
           "journalId", "accountId", "accountCode",
           debit, credit, description
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          journalEntryId, line.accountId, accountCode,
          line.debit, line.credit, line.description,
        ],
      );
      balanceDeltas.set(
        accountCode,
        (balanceDeltas.get(accountCode) ?? 0) + (line.debit - line.credit),
      );
    }

    // Keep chart_of_accounts.currentBalance in step with the ledger. The
    // sibling poster (createJournalEntry) maintains it; without the same
    // here, every FX / inventory / payroll entry posted through this
    // primitive leaves the trial balance read from currentBalance silently
    // diverged from the journal_lines sum. `draft` entries are skipped —
    // their ledger effect is applied when the draft is later posted.
    if (status === "posted") {
      for (const [accountCode, delta] of balanceDeltas) {
        if (Math.abs(delta) < 0.001) continue;
        await rawExecute(
          `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1
           WHERE "companyId" = $2 AND code = $3`,
          [delta, ctx.companyId, accountCode],
        );
      }
    }

    logger.info(
      {
        journalEntryId,
        companyId: ctx.companyId,
        type: ctx.type,
        sourceType: ctx.sourceType,
        sourceId: ctx.sourceId,
        totalDebit: payload.totalDebit,
        totalCredit: payload.totalCredit,
        status,
      },
      "[gl] journal entry posted",
    );

    return { journalEntryId, status };
  });
}
