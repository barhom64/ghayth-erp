/**
 * Wire a lot lifecycle write-off (recalled / expired / disposed) into
 * a balanced journal entry, via the GL helpers from #224 + #252.
 *
 * Fourth of the deferred GL-integration helpers — same pattern as
 * #253 (FX revaluation), #256 (realised FX), and #258 (cycle-count
 * variance). Pure builder + DB driver, no behaviour change to the
 * lot FSM transitions themselves (`recallLot`, `expireDueLots`, etc.).
 *
 * A lot that leaves the active pool because it was recalled, expired,
 * or physically disposed of has to come off the inventory asset and
 * land in the write-off expense:
 *
 *   DR inventory_writeoff_loss (5610)
 *   CR inventory_asset          (1400)
 *
 * Write-off value = remaining quantity × unitCost at the moment of
 * transition. Zero-quantity lots (e.g. fully consumed before being
 * marked expired) post no entry — caller gets a `noop` outcome.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import type { LotStatus } from "./types.js";
import {
  buildEntry,
  postJournalEntry,
  getAccountForPurpose,
  type AccountResolution,
  type BuildEntryInput,
  type EntryContext,
} from "../gl/index.js";
import { todayISO } from "../businessHelpers.js";

/** Statuses that legitimately trigger a write-off entry. `rejected`
 *  lots transition straight to `disposed` via the QC FSM, so the
 *  `disposed` branch already covers them. */
export type LotWriteoffStatus = "recalled" | "expired" | "disposed";

export interface LotWriteoffAccounts {
  inventory: AccountResolution;
  loss: AccountResolution;
}

/**
 * Pure: build the BuildEntryInput payload for a single lot write-off.
 * Returns empty `lines` when `writeoffValue` rounds to zero so the
 * caller can short-circuit to `noop`.
 */
export function buildLotWriteoffEntryInput(opts: {
  description: string;
  writeoffValue: number;
  status: LotWriteoffStatus;
  accounts: LotWriteoffAccounts;
  lotId: number;
}): BuildEntryInput {
  const lines: BuildEntryInput["lines"] = [];
  const value = round2dp(opts.writeoffValue);
  if (value <= 0) return { description: opts.description, lines };

  const reason = labelFor(opts.status);

  lines.push({
    accountId: opts.accounts.loss.accountId,
    amount: value,
    description: `Lot ${reason} loss (${opts.accounts.loss.accountCode})`,
    referenceType: "warehouse_stock_lots",
    referenceId: opts.lotId,
  });
  lines.push({
    accountId: opts.accounts.inventory.accountId,
    amount: -value,
    description: `Lot ${reason} inventory release (${opts.accounts.inventory.accountCode})`,
    referenceType: "warehouse_stock_lots",
    referenceId: opts.lotId,
  });

  return { description: opts.description, lines };
}

function labelFor(status: LotWriteoffStatus): string {
  switch (status) {
    case "recalled": return "recall";
    case "expired":  return "expiry";
    case "disposed": return "disposal";
  }
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export interface PostLotWriteoffOpts {
  lotId: number;
  companyId: number;
  postedBy?: number;
  description?: string;
  asDraft?: boolean;
}

export interface PostLotWriteoffOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  writeoffValue: number;
  reason?: string;
}

/**
 * Read the lot row, post the inventory write-off journal entry, and
 * stamp `writeoffJournalEntryId` back on the lot. Idempotency: if the
 * lot already carries a `writeoffJournalEntryId`, return `skipped` so
 * the caller doesn't double-post when a cron / operator retries.
 *
 * Refuses to post on lots in `active` or `quarantine` — those haven't
 * been written off yet. The FSM transition itself stays in
 * `recallLot` / `expireDueLots` / `qcReject` — this helper only runs
 * AFTER one of those has landed.
 */
export async function postLotWriteoffJournal(
  opts: PostLotWriteoffOpts,
): Promise<PostLotWriteoffOutcome> {
  return withTransaction(async () => {
    const [lot] = await rawQuery<{
      status: LotStatus;
      quantity: string;
      unitCost: string;
      productId: number;
      warehouseId: number;
      lotNumber: string;
      writeoffJournalEntryId: number | null;
    }>(
      `SELECT status,
              quantity::text       AS quantity,
              "unitCost"::text     AS "unitCost",
              "productId",
              "warehouseId",
              "lotNumber",
              "writeoffJournalEntryId"
       FROM warehouse_stock_lots
       WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
       FOR UPDATE`,
      [opts.lotId, opts.companyId],
    );
    if (!lot) {
      throw new Error(`postLotWriteoffJournal: lot ${opts.lotId} not found`);
    }

    if (lot.status !== "recalled" && lot.status !== "expired" && lot.status !== "disposed") {
      throw new Error(
        `postLotWriteoffJournal: lot ${opts.lotId} is ${lot.status}; ` +
          `posting requires 'recalled' / 'expired' / 'disposed'`,
      );
    }

    if (lot.writeoffJournalEntryId !== null) {
      return {
        status: "skipped",
        journalEntryId: lot.writeoffJournalEntryId,
        writeoffValue: 0,
        reason: "lot already carries writeoffJournalEntryId; reverse before reposting",
      };
    }

    const qty = Number(lot.quantity);
    const unitCost = Number(lot.unitCost);
    const writeoffValue = round2dp(qty * unitCost);

    if (!(writeoffValue > 0)) {
      return {
        status: "noop",
        journalEntryId: null,
        writeoffValue: 0,
        reason: "remaining quantity × unit cost rounds to zero",
      };
    }

    const [inventory, loss] = await Promise.all([
      getAccountForPurpose(opts.companyId, "inventory_asset", "credit"),
      getAccountForPurpose(opts.companyId, "inventory_writeoff_loss", "debit"),
    ]);
    if (!inventory || !loss) {
      throw new Error(
        "postLotWriteoffJournal: inventory_asset or inventory_writeoff_loss could not " +
          "be resolved (check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const status = lot.status as LotWriteoffStatus;
    const description =
      opts.description ?? `Lot ${status} write-off — lot ${lot.lotNumber} (#${opts.lotId})`;

    const buildInput = buildLotWriteoffEntryInput({
      description,
      writeoffValue,
      status,
      accounts: { inventory, loss },
      lotId: opts.lotId,
    });
    if (buildInput.lines.length === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        writeoffValue,
        reason: "build produced no lines",
      };
    }

    const payload = buildEntry(buildInput);
    const today = todayISO();

    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref: `LOT-${status.toUpperCase()}-${opts.lotId}`,
      type: "inventory_writeoff",
      sourceType: "warehouse_stock_lots",
      sourceId: opts.lotId,
      date: today,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    await rawExecute(
      `UPDATE warehouse_stock_lots
         SET "writeoffJournalEntryId" = $1, "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [posted.journalEntryId, opts.lotId, opts.companyId],
    );

    logger.info(
      {
        lotId: opts.lotId,
        journalEntryId: posted.journalEntryId,
        status: posted.status,
        lotStatus: status,
        writeoffValue,
      },
      "[lot-writeoff] journal entry posted",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
      writeoffValue,
    };
  });
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
