/**
 * مسار الطابور المؤجَّل لإعادة تقييم الفترة (حيّ — أُحيي 2026-06-23).
 *
 * تدفّقان متوازيان لإعادة تقييم FX، يتقاسمان حاجز ازدواج صلبًا على مستوى DB:
 *
 *   1. **المسار المباشر** `POST /finance/fx/revaluation/post`
 *      (routes/finance-algorithms.ts → lib/fx/build-period-reval-lines.ts):
 *      يحسب ويرحّل في طلب واحد، ويكتب صفًا في `fx_revaluations`.
 *
 *   2. **مسار الطابور (هذا الملف + revaluation.ts):** خطوتان —
 *      (أ) `POST /finance/fx/revaluation/compute` يستدعي
 *          `runPeriodEndRevaluation` فيملأ `fx_revaluation_log` + `_lines`
 *          (يظهر البند في طابور الترحيل بلا قيد بعد)،
 *      (ب) `POST /finance/gl-helpers/fx-revaluation/:revaluationLogId` يستدعي
 *          `postFxRevaluationJournal` (هنا) فيرحّل القيد ويختم journalEntryId.
 *
 * **حارس الازدواج (صلب — مفروض من قاعدة البيانات):** كِلا المسارين يكتبان صفًا
 * في `fx_revaluations` على المفتاح (companyId, period) المحمي بقيد
 * UNIQUE(companyId, period) (db/schema_post.sql). الترحيل عبر هذا المسار يُدرج
 * صف `fx_revaluations` للفترة داخل نفس معاملة القيد — فإن كانت الفترة مُرحَّلة
 * مباشرةً من قبل، يرمي القيد UNIQUE خطأ 23505 وتُلغى المعاملة بكاملها (لا قيد
 * ثانٍ). أيّ المسارين سبق يحجب الآخر لنفس الفترة. مطابقة الفترة: period =
 * `to_char(fx_revaluation_log."asOfDate", 'YYYY-MM')` — نفس صيغة المسار المباشر.
 *
 * Wire the FX revaluation log into a balanced journal entry via
 * the GL helpers shipped in #224 (account purposes + journal
 * builder) and #252 (postJournalEntry DB driver).
 *
 * Pure layer (`buildRevaluationEntryInput`):
 *   takes a list of revaluation lines (with side: asset|liability,
 *   gainLoss: positive=gain, negative=loss) plus the four resolved
 *   accounts and returns the BuildEntryInput shape ready for
 *   `gl/buildEntry`. No DB. Easy to unit-test all four
 *   asset/liability × gain/loss combinations.
 *
 * DB driver (`postFxRevaluationJournal`):
 *   reads the existing fx_revaluation_log row + its lines, resolves
 *   the per-entity dimension (clientId for AR invoices, vendorId for
 *   AP purchase orders) so the AR/AP lines satisfy the dimension
 *   contract (1131 → clientId, 2111 → vendorId — مفروض في
 *   gl/posting.postJournalEntry)، يبني القيد، يرحّله، يكتب صف
 *   `fx_revaluations` (حاجز الازدواج) ويختم journalEntryId على صف
 *   السجل. Idempotent: صف يحمل journalEntryId مسبقًا يُتخطّى.
 *
 * **لا يغيّر هذا المسار المبالغ** — gainLoss لكل كيان مقروء كما هو من
 * `fx_revaluation_lines`؛ الإضافة الوحيدة هي توزيع طرف AR/AP على بُعد
 * الكيان (مثلما فعل المسار المباشر في #2873) كي يجتاز عقد البُعد.
 */
import { withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import { ConflictError } from "../errorHandler.js";
import {
  buildEntry,
  postJournalEntry,
  getAccountForPurpose,
  type AccountResolution,
  type BuildEntryInput,
  type EntryContext,
} from "../gl/index.js";

export interface RevaluationLineForJournal {
  entityType: string;
  entityId: number;
  gainLoss: number;
  /** "asset" for invoices/AR/cash, "liability" for purchase orders/AP. */
  side: "asset" | "liability";
}

export interface ResolvedAccountSet {
  arAsset: AccountResolution;
  apLiability: AccountResolution;
  fxGain: AccountResolution;
  fxLoss: AccountResolution;
}

/**
 * Aggregate the per-line gains/losses by (side × sign). Used by the
 * pure builder to know how many of the four account-pair branches
 * actually need a journal line.
 */
export interface RevaluationTotals {
  assetGain: number;
  assetLoss: number;
  liabilityGain: number;
  liabilityLoss: number;
}

/**
 * Pure: walk the lines and aggregate by (side × sign).
 */
export function aggregateRevaluation(lines: RevaluationLineForJournal[]): RevaluationTotals {
  let assetGain = 0;
  let assetLoss = 0;
  let liabilityGain = 0;
  let liabilityLoss = 0;
  for (const l of lines) {
    if (l.gainLoss === 0) continue;
    if (l.side === "asset") {
      if (l.gainLoss > 0) assetGain += l.gainLoss;
      else assetLoss += -l.gainLoss;
    } else {
      if (l.gainLoss > 0) liabilityGain += l.gainLoss;
      else liabilityLoss += -l.gainLoss;
    }
  }
  return {
    assetGain: round2dp(assetGain),
    assetLoss: round2dp(assetLoss),
    liabilityGain: round2dp(liabilityGain),
    liabilityLoss: round2dp(liabilityLoss),
  };
}

/**
 * Pure: build the BuildEntryInput payload for a revaluation. The
 * resulting entry is balanced because every gain on an asset is
 * accompanied by a credit to the FX gain account (and vice versa
 * for losses + the FX loss account), and same for liabilities.
 *
 * Asset gain   → DR AR_asset        / CR FX_gain
 * Asset loss   → DR FX_loss         / CR AR_asset
 * Liab gain    → DR AP_liability    / CR FX_gain  (AP balance went down → gain)
 * Liab loss    → DR FX_loss         / CR AP_liability  (AP balance went up → loss)
 *
 * Lines with zero amounts are skipped so the resulting entry has
 * only the lines that actually carry value — `gl/buildEntry` then
 * does its own zero-skipping as a safety net.
 */
export function buildRevaluationEntryInput(opts: {
  description: string;
  totals: RevaluationTotals;
  accounts: ResolvedAccountSet;
  sourceType?: string;
  sourceId?: number;
}): BuildEntryInput {
  const { totals, accounts } = opts;
  const lines: BuildEntryInput["lines"] = [];

  // Asset gain: DR AR / CR Gain
  if (totals.assetGain > 0) {
    lines.push({
      accountId: accounts.arAsset.accountId,
      amount: totals.assetGain,
      description: `FX gain on AR (${accounts.arAsset.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.fxGain.accountId,
      amount: -totals.assetGain,
      description: `FX gain (${accounts.fxGain.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Asset loss: DR Loss / CR AR
  if (totals.assetLoss > 0) {
    lines.push({
      accountId: accounts.fxLoss.accountId,
      amount: totals.assetLoss,
      description: `FX loss (${accounts.fxLoss.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.arAsset.accountId,
      amount: -totals.assetLoss,
      description: `FX loss on AR (${accounts.arAsset.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Liability gain: DR AP / CR Gain
  if (totals.liabilityGain > 0) {
    lines.push({
      accountId: accounts.apLiability.accountId,
      amount: totals.liabilityGain,
      description: `FX gain on AP (${accounts.apLiability.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.fxGain.accountId,
      amount: -totals.liabilityGain,
      description: `FX gain (${accounts.fxGain.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Liability loss: DR Loss / CR AP
  if (totals.liabilityLoss > 0) {
    lines.push({
      accountId: accounts.fxLoss.accountId,
      amount: totals.liabilityLoss,
      description: `FX loss (${accounts.fxLoss.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.apLiability.accountId,
      amount: -totals.liabilityLoss,
      description: `FX loss on AP (${accounts.apLiability.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// Pure: per-entity dimensioned lines (الخيار أ — يطابق نمط المسار المباشر
// في lib/fx/build-period-reval-lines.ts). كل كيان AR يحمل clientId على
// حساب AR، وكل كيان AP يحمل vendorId على حساب AP، + سطرَي مكسب/خسارة
// إجماليين بلا بُعد. التفصيل لا يغيّر الإجمالي ولا التوازن.
// ─────────────────────────────────────────────────────────────────────

/** سطر إعادة تقييم مع بُعد الكيان المحلول (clientId/vendorId). */
export interface RevaluationLineWithDimension {
  side: "asset" | "liability";
  gainLoss: number;
  /** بُعد العميل (سطور الأصول/AR). */
  clientId?: number | null;
  /** بُعد المورد (سطور الالتزامات/AP). */
  vendorId?: number | null;
}

/**
 * Pure: يبني BuildEntryInput مفصّلًا لكل كيان من سطور تحمل بُعدها المحلول.
 *
 *   AR (asset) لكل عميل: مكسب (gainLoss>0) → DR arAsset(clientId) ؛
 *                        خسارة (gainLoss<0) → CR arAsset(clientId).
 *   AP (liability) لكل مورد: مكسب → DR apLiability(vendorId) ؛
 *                            خسارة → CR apLiability(vendorId).
 *   + سطر مكسب إجمالي CR fxGain، وسطر خسارة إجمالي DR fxLoss (بلا بُعد).
 *
 * يجمع الصافي لكل (side, dimension) فيبقى القيد متوازنًا، ويطابق المكسب/الخسارة
 * الإجماليين مجموع أطراف AR/AP تمامًا — مطابقٌ لمنطق build-period-reval-lines.
 */
export function buildPerEntityRevaluationEntryInput(opts: {
  description: string;
  lines: RevaluationLineWithDimension[];
  accounts: ResolvedAccountSet;
  sourceType?: string;
  sourceId?: number;
}): BuildEntryInput {
  const { accounts } = opts;
  const byClient = new Map<number, number>();
  const byVendor = new Map<number, number>();

  for (const l of opts.lines) {
    if (!Number.isFinite(l.gainLoss) || l.gainLoss === 0) continue;
    if (l.side === "asset") {
      const c = l.clientId == null ? null : Number(l.clientId);
      if (c == null || !Number.isFinite(c) || c <= 0) continue; // بلا بُعد → يُتخطّى (يُرفض لاحقًا إن لم يبقَ شيء)
      byClient.set(c, round2dp((byClient.get(c) ?? 0) + l.gainLoss));
    } else {
      const v = l.vendorId == null ? null : Number(l.vendorId);
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      byVendor.set(v, round2dp((byVendor.get(v) ?? 0) + l.gainLoss));
    }
  }

  const lines: BuildEntryInput["lines"] = [];
  let totalGain = 0;
  let totalLoss = 0;

  // AR لكل عميل — أصل: gainLoss موجب = DR (مكسب) ؛ سالب = CR (خسارة).
  for (const [clientId, net] of byClient) {
    if (Math.abs(net) < 0.01) continue;
    lines.push({
      accountId: accounts.arAsset.accountId,
      amount: net, // موجب = DR، سالب = CR (buildEntry يقسّم)
      description: `إعادة تقييم ذمم مدينة — عميل ${clientId} (${accounts.arAsset.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
      clientId,
    });
    if (net > 0) totalGain = round2dp(totalGain + net);
    else totalLoss = round2dp(totalLoss + -net);
  }

  // AP لكل مورد — التزام: gainLoss موجب (الالتزام انخفض) = DR (مكسب) ؛ سالب = CR (خسارة).
  for (const [vendorId, net] of byVendor) {
    if (Math.abs(net) < 0.01) continue;
    lines.push({
      accountId: accounts.apLiability.accountId,
      amount: net,
      description: `إعادة تقييم ذمم دائنة — مورد ${vendorId} (${accounts.apLiability.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
      vendorId,
    });
    if (net > 0) totalGain = round2dp(totalGain + net);
    else totalLoss = round2dp(totalLoss + -net);
  }

  totalGain = round2dp(totalGain);
  totalLoss = round2dp(totalLoss);

  // المكسب الإجمالي CR fxGain ؛ الخسارة الإجمالية DR fxLoss — بلا بُعد.
  if (totalGain > 0) {
    lines.push({
      accountId: accounts.fxGain.accountId,
      amount: -totalGain,
      description: `ربح صرف غير محقق (${accounts.fxGain.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }
  if (totalLoss > 0) {
    lines.push({
      accountId: accounts.fxLoss.accountId,
      amount: totalLoss,
      description: `خسارة صرف غير محققة (${accounts.fxLoss.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export interface PostRevaluationOpts {
  revaluationLogId: number;
  companyId: number;
  /** Operator who triggered the posting (audit trail). */
  postedBy?: number;
  /** Override the description on the journal-entries row. */
  description?: string;
  /** Pass the journal entry as `draft` so the operator reviews
   *  before it goes live. Defaults to `posted`. */
  asDraft?: boolean;
}

export interface PostRevaluationOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  reason?: string;
}

/**
 * Read the revaluation log + lines, post the journal entry, stamp
 * the new journalEntryId on the log row.
 *
 * Idempotency: returns `skipped` (with the existing journalEntryId)
 * if the log row already has one. The operator who wants to repost
 * after correcting a rate has to reverse the existing entry first
 * (or call this helper with a fresh revaluation run).
 */
export async function postFxRevaluationJournal(opts: PostRevaluationOpts): Promise<PostRevaluationOutcome> {
  return withTransaction(async (client) => {
    const { rows: logRows } = await client.query(
      `SELECT id,
              "asOfDate"::text AS "asOfDate",
              to_char("asOfDate", 'YYYY-MM') AS period,
              "functionalCurrency",
              "totalGain"::text AS "totalGain",
              "totalLoss"::text AS "totalLoss",
              "journalEntryId"
       FROM fx_revaluation_log
       WHERE id = $1 AND "companyId" = $2
       FOR UPDATE`,
      [opts.revaluationLogId, opts.companyId],
    );
    const log = logRows[0] as
      | { id: number; asOfDate: string; period: string; functionalCurrency: string; totalGain: string; totalLoss: string; journalEntryId: number | null }
      | undefined;
    if (!log) {
      throw new Error(`postFxRevaluationJournal: log row ${opts.revaluationLogId} not found`);
    }
    if (log.journalEntryId !== null) {
      return {
        status: "skipped",
        journalEntryId: log.journalEntryId,
        reason: "log row already has journalEntryId; reverse before reposting",
      };
    }

    const period = log.period; // YYYY-MM — مفتاح حاجز الازدواج، نفس صيغة المسار المباشر

    // حارس الازدواج — فحص مبكر ودود: إن كانت الفترة مُرحَّلة مباشرةً (صف
    // fx_revaluations موجود) فلا ترحّلها مرة أخرى عبر الطابور. هذا فحص ودود؛
    // الحاجز الصلب هو قيد UNIQUE(companyId, period) على الإدراج أدناه (يصمد
    // حتى أمام السباق daat-race).
    const { rows: dupRows } = await client.query(
      `SELECT id FROM fx_revaluations WHERE "companyId" = $1 AND period = $2 LIMIT 1`,
      [opts.companyId, period],
    );
    if (dupRows.length > 0) {
      throw new ConflictError(
        `تم تسجيل إعادة تقييم العملات لفترة ${period} مسبقاً عبر الترحيل المباشر — لا يمكن ترحيلها مجددًا من الطابور`,
      );
    }

    const { rows: lineRows } = await client.query(
      `SELECT "entityType",
              "entityId",
              "gainLoss"::text AS "gainLoss"
       FROM fx_revaluation_lines
       WHERE "revaluationLogId" = $1`,
      [opts.revaluationLogId],
    );
    const lines = lineRows as Array<{ entityType: string; entityId: number; gainLoss: string }>;

    if (lines.length === 0) {
      return { status: "noop", journalEntryId: null, reason: "no revaluation lines to post" };
    }

    // حلّ بُعد كل كيان: invoice → clientId ؛ purchase_order → supplierId(=vendorId).
    // المبالغ (gainLoss) تُقرأ كما هي — لا تُعاد حسبتها.
    const invoiceIds = lines.filter((l) => l.entityType === "invoice").map((l) => l.entityId);
    const poIds = lines.filter((l) => l.entityType === "purchase_order").map((l) => l.entityId);

    const clientByInvoice = new Map<number, number | null>();
    if (invoiceIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id, "clientId" FROM invoices WHERE id = ANY($1::int[]) AND "companyId" = $2`,
        [invoiceIds, opts.companyId],
      );
      for (const r of rows) clientByInvoice.set(r.id as number, r.clientId == null ? null : Number(r.clientId));
    }
    const vendorByPo = new Map<number, number | null>();
    if (poIds.length > 0) {
      const { rows } = await client.query(
        `SELECT id, "supplierId" FROM purchase_orders WHERE id = ANY($1::int[]) AND "companyId" = $2`,
        [poIds, opts.companyId],
      );
      for (const r of rows) vendorByPo.set(r.id as number, r.supplierId == null ? null : Number(r.supplierId));
    }

    const dimensioned: RevaluationLineWithDimension[] = [];
    const skipped: Array<{ entityType: string; entityId: number; reason: string }> = [];
    for (const l of lines) {
      const gainLoss = Number(l.gainLoss);
      if (!Number.isFinite(gainLoss) || gainLoss === 0) continue;
      if (isAssetEntity(l.entityType)) {
        const clientId = l.entityType === "invoice" ? clientByInvoice.get(l.entityId) ?? null : null;
        if (clientId == null || clientId <= 0) {
          skipped.push({ entityType: l.entityType, entityId: l.entityId, reason: "سطر أصل بلا عميل (clientId) — لا يجتاز عقد البُعد على حساب الذمم المدينة" });
          continue;
        }
        dimensioned.push({ side: "asset", gainLoss, clientId });
      } else {
        const vendorId = l.entityType === "purchase_order" ? vendorByPo.get(l.entityId) ?? null : null;
        if (vendorId == null || vendorId <= 0) {
          skipped.push({ entityType: l.entityType, entityId: l.entityId, reason: "سطر التزام بلا مورد (vendorId) — لا يجتاز عقد البُعد على حساب الذمم الدائنة" });
          continue;
        }
        dimensioned.push({ side: "liability", gainLoss, vendorId });
      }
    }

    if (dimensioned.length === 0) {
      if (skipped.length > 0) {
        throw new Error(
          "postFxRevaluationJournal: كل البنود ذات الفروق بلا بُعد مطلوب (عميل/مورد) — اربط الكيانات أولاً",
        );
      }
      return { status: "noop", journalEntryId: null, reason: "all lines net to zero" };
    }

    // Resolve the four accounts.
    const [arAsset, apLiability, fxGain, fxLoss] = await Promise.all([
      getAccountForPurpose(opts.companyId, "fx_revaluation_ar", "debit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_ap", "credit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_gain", "credit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_loss", "debit"),
    ]);
    if (!arAsset || !apLiability || !fxGain || !fxLoss) {
      throw new Error(
        "postFxRevaluationJournal: one or more FX accounts could not be resolved " +
          "(check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const description = opts.description ?? `إعادة تقييم العملات الأجنبية — ${period}`;
    const buildInput = buildPerEntityRevaluationEntryInput({
      description,
      lines: dimensioned,
      accounts: { arAsset, apLiability, fxGain, fxLoss },
      sourceType: "fx_revaluation_log",
      sourceId: opts.revaluationLogId,
    });

    if (buildInput.lines.length === 0) {
      return { status: "noop", journalEntryId: null, reason: "build produced no lines" };
    }

    const payload = buildEntry(buildInput);

    // PD-6 — sourceKey is tied to the log row (not just the date) so a re-fire
    // for the same revaluation run idempotently hits the existing journal
    // entry. The log-row-level guard above (`log.journalEntryId !== null`)
    // already prevents repost through this path; this is defence-in-depth for
    // a future caller that builds the ctx by hand.
    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref: `FX-REVAL-${period}`,
      sourceKey: `finance:fx_reval:${opts.companyId}:${period}`,
      type: "fx_revaluation",
      sourceType: "fx_revaluation_log",
      sourceId: opts.revaluationLogId,
      date: log.asOfDate,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    // حارس الازدواج الصلب — إدراج صف fx_revaluations للفترة داخل نفس المعاملة.
    // قيد UNIQUE(companyId, period) يجعل هذا حاجزًا على مستوى DB: إن سبق المسار
    // المباشر بترحيل نفس الفترة → 23505 ⇒ تُلغى المعاملة بكاملها (القيد + الصف).
    // درافت لا يُدرج صف الحاجز (لم يُرحَّل فعليًا بعد) كي لا يحجب إعادة محاولة.
    if (!opts.asDraft) {
      const totalGain = round2dp(
        dimensioned.reduce((s, l) => (l.gainLoss > 0 ? s + l.gainLoss : s), 0),
      );
      const totalLoss = round2dp(
        dimensioned.reduce((s, l) => (l.gainLoss < 0 ? s + -l.gainLoss : s), 0),
      );
      await client.query(
        `INSERT INTO fx_revaluations ("companyId","period","journalEntryId","totalGain","totalLoss",details,"postedBy","postedAt")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())`,
        [
          opts.companyId,
          period,
          posted.journalEntryId,
          totalGain,
          totalLoss,
          JSON.stringify({ source: "queue", revaluationLogId: opts.revaluationLogId, asOfDate: log.asOfDate, skipped }),
          opts.postedBy ?? null,
        ],
      );
    }

    await client.query(
      `UPDATE fx_revaluation_log SET "journalEntryId" = $1 WHERE id = $2`,
      [posted.journalEntryId, opts.revaluationLogId],
    );

    logger.info(
      {
        revaluationLogId: opts.revaluationLogId,
        period,
        journalEntryId: posted.journalEntryId,
        status: posted.status,
        lineCount: buildInput.lines.length,
        skipped: skipped.length,
      },
      "[fx-revaluation] journal entry posted (queue path)",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
    };
  });
}

/** Asset side of the balance sheet — exposed for testability. */
export function isAssetEntity(entityType: string): boolean {
  return (
    entityType === "invoice" ||
    entityType === "bank_account" ||
    entityType === "cash"
  );
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
