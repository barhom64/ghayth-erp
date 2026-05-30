import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { createGuardedJournalEntry, getAccountCodeFromMapping, emitEvent, createAuditLog, currentYear, currentMonthPadded, roundTo2 } from "./businessHelpers.js";
import { issueNumber } from "./numberingService.js";
import { NotFoundError, ConflictError, ValidationError } from "./errorHandler.js";
import { logger } from "./logger.js";
import { getProvider as getEInvoiceProvider } from "./einvoice/index.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface Scope {
  companyId: number;
  branchId?: number | null;
  userId: number;
}

interface GenerateInvoiceInput {
  subAgentId: number;
  groupIds: number[];
  seasonId: number;
  /**
   * Optional manual price override per group, keyed by groupId. When set,
   * the engine uses this price instead of looking up `umrah_pricing`.
   * Used by the sales-invoice wizard (`POST /umrah/sales-wizard/generate`)
   * to let operators enter prices per group at invoice time, with last-used
   * suggestions surfaced by `GET /umrah/sales-wizard/uninvoiced-groups`.
   */
  manualPrices?: Record<number, number>;
}

interface RegisterPaymentInput {
  subAgentId: number;
  amount: number;
  currency?: string;
  exchangeRate?: number | null;
  sarAmount: number;
  method?: string;
  reference?: string;
  invoiceIds?: number[];
}

interface InvoiceLineItem {
  itemType: "group" | "penalty";
  groupId: number | null;
  violationId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Per-line financial-routing fields — applied to umrah following the
  // finance `invoice_items` pattern (PR #1466 / migration 240). Phase 1:
  // persist them on the row so the data is captured. Phase 2: the GL
  // posting will split revenue + VAT credits by accountCode + vatRate
  // buckets instead of one lump JE line.
  //
  //   productId   — links the line to its product (carries
  //                 defaultTaxCode + defaultRevenueAccountId)
  //   vatRate     — 0 for visa pass-through, 15 for standard services
  //   vatAmount   — persisted so SUM(line vatAmount) reconciles to
  //                 the invoice header's vatAmount when all lines use
  //                 line-level VAT
  //   accountCode — optional GL revenue-account override (null → use
  //                 the umrah_invoice_revenue resolver fallback)
  productId?: number | null;
  vatRate?: number;
  vatAmount?: number;
  accountCode?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Invoice Generation
// ────────────────────────────────────────────────────────────────────────────

export async function generateSalesInvoice(scope: Scope, input: GenerateInvoiceInput) {
  const { subAgentId, groupIds, seasonId, manualPrices } = input;

  if (!groupIds?.length) throw new ValidationError("يجب تحديد مجموعة واحدة على الأقل");

  const [subAgent] = await rawQuery<Record<string, unknown>>(
    `SELECT sa.*, c.name AS "clientName"
     FROM umrah_sub_agents sa
     LEFT JOIN clients c ON c.id = sa."clientId" AND c."deletedAt" IS NULL
     WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
    [subAgentId, scope.companyId]
  );
  if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");
  if (!subAgent.clientId) throw new ConflictError("الوكيل الفرعي غير مربوط بعميل — يرجى ربطه أولاً", { field: "clientId" });

  const groups = await rawQuery<Record<string, unknown>>(
    `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
            g."subAgentId", g."agentId",
            (SELECT MIN(p."arrivalDate") FROM umrah_pilgrims p
             WHERE p."groupId" = g.id AND p."deletedAt" IS NULL) AS "entryDate"
     FROM umrah_groups g
     WHERE g.id = ANY($1) AND g."companyId" = $2 AND g."deletedAt" IS NULL`,
    [groupIds, scope.companyId]
  );
  if (groups.length !== groupIds.length) {
    throw new NotFoundError("بعض المجموعات غير موجودة");
  }

  const alreadyInvoiced = await rawQuery<Record<string, unknown>>(
    `SELECT DISTINCT si."groupId", inv.ref
     FROM umrah_sales_invoice_items si
     JOIN umrah_sales_invoices inv ON inv.id = si."invoiceId"
     WHERE si."groupId" = ANY($1) AND inv."companyId" = $2 AND inv.status != 'cancelled'`,
    [groupIds, scope.companyId]
  );
  if (alreadyInvoiced.length > 0) {
    const refs = alreadyInvoiced.map((r: Record<string, unknown>) => r.ref).join(", ");
    throw new ConflictError(`بعض المجموعات مفوترة مسبقاً في: ${refs}`);
  }

  // Phase 3c — resolve the service-products mapping the operator
  // configured at /umrah/settings (migration 241 + PR #1469/1470).
  // For this PR we surface ALL 3 (visa / services / transport) so
  // Phase 3d's NUSK-driven split can populate them; the IMMEDIATE
  // effect today is just that every 'group' line gets routed to
  // the SERVICES product + its account when configured. When the
  // operator hasn't configured services (or any mapping is unset),
  // the line's accountCode falls back to null and Phase 2's
  // bucketing routes it to the default umrah_invoice_revenue —
  // current behaviour unchanged.
  //
  // One JOIN-heavy query rather than 6 round-trips. Each LEFT JOIN
  // gates on `companyId = c.id` so a stale FK can't lift another
  // tenant's product into the mapping (defence in depth, matches
  // the pattern PR #1425 introduced).
  const [productMap] = await rawQuery<{
    visaProductId: number | null;
    visaTaxCode: string | null;
    visaAccountCode: string | null;
    servicesProductId: number | null;
    servicesTaxCode: string | null;
    servicesAccountCode: string | null;
    transportProductId: number | null;
    transportTaxCode: string | null;
    transportAccountCode: string | null;
  }>(
    `SELECT c."umrahVisaProductId"      AS "visaProductId",
            pv."defaultTaxCode"          AS "visaTaxCode",
            av.code                      AS "visaAccountCode",
            c."umrahServicesProductId"   AS "servicesProductId",
            ps."defaultTaxCode"          AS "servicesTaxCode",
            asv.code                     AS "servicesAccountCode",
            c."umrahTransportProductId"  AS "transportProductId",
            pt."defaultTaxCode"          AS "transportTaxCode",
            at.code                      AS "transportAccountCode"
       FROM companies c
       LEFT JOIN products pv
              ON pv.id = c."umrahVisaProductId"
             AND pv."companyId" = c.id
       LEFT JOIN chart_of_accounts av
              ON av.id = pv."defaultRevenueAccountId"
             AND av."companyId" = c.id
       LEFT JOIN products ps
              ON ps.id = c."umrahServicesProductId"
             AND ps."companyId" = c.id
       LEFT JOIN chart_of_accounts asv
              ON asv.id = ps."defaultRevenueAccountId"
             AND asv."companyId" = c.id
       LEFT JOIN products pt
              ON pt.id = c."umrahTransportProductId"
             AND pt."companyId" = c.id
       LEFT JOIN chart_of_accounts at
              ON at.id = pt."defaultRevenueAccountId"
             AND at."companyId" = c.id
      WHERE c.id = $1`,
    [scope.companyId],
  );

  const lineItems: InvoiceLineItem[] = [];
  let subtotal = 0;
  let totalPilgrims = 0;
  const nuskInvoiceRefs: string[] = [];
  const groupRefs: string[] = [];

  for (const grp of groups) {
    const mutamerCount = Number(grp.mutamerCount || 0);
    const entryDate = grp.entryDate as string | undefined;
    const groupId = grp.id as number;

    // Price resolution — manual override beats pricing rules. When neither
    // is available, ask the user to set a price instead of silently failing.
    let price: number | null = null;
    if (manualPrices && manualPrices[groupId] != null && Number(manualPrices[groupId]) > 0) {
      price = Number(manualPrices[groupId]);
    } else {
      if (!entryDate) {
        throw new ValidationError(`المجموعة ${grp.nuskGroupNumber} لا تحتوي على تاريخ دخول — لا يمكن تحديد السعر تلقائياً، يرجى إدخال السعر يدوياً`);
      }
      const [pricing] = await rawQuery<Record<string, unknown>>(
        `SELECT "pricePerMutamer" FROM umrah_pricing
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND ("subAgentId" = $2 OR ("subAgentId" IS NULL AND "agentId" = $3))
           AND ("seasonId" = $4 OR "seasonId" IS NULL)
           AND "validFrom" <= $5 AND "validTo" >= $5
         ORDER BY "subAgentId" DESC NULLS LAST, "validFrom" DESC
         LIMIT 1`,
        [scope.companyId, subAgentId, subAgent.agentId, seasonId, entryDate]
      );
      if (!pricing) {
        throw new NotFoundError(`لا يوجد سعر ساري للفترة للمجموعة ${grp.nuskGroupNumber} — يرجى إدخال السعر يدوياً أو إضافة قاعدة تسعير`);
      }
      price = Number(pricing.pricePerMutamer);
    }

    const lineTotal = mutamerCount * price;
    subtotal += lineTotal;
    totalPilgrims += mutamerCount;
    groupRefs.push(grp.nuskGroupNumber as string);

    // Phase 3c — when the operator configured a services product at
    // /umrah/settings, each 'group' line gets routed to its account +
    // taxCode. Visa + transport mappings are NOT consumed yet — those
    // require Phase 3d's per-NUSK split. Pulling the productId etc.
    // from the resolved map (productMap) keeps the lookup cost at
    // one query for the whole invoice instead of one per group.
    const servicesProductId = productMap?.servicesProductId ?? null;
    const servicesAccountCode = productMap?.servicesAccountCode ?? null;
    // defaultTaxCode 'zero' / 'exempt' resolve to 0 VAT on the line;
    // 'standard' (or anything else, or null) falls back to the
    // invoice-level vatRate. Pin this in the smoke so a future map
    // refactor can't silently change the contract.
    const servicesVatRate =
      productMap?.servicesTaxCode === "zero" || productMap?.servicesTaxCode === "exempt"
        ? 0
        : undefined;
    lineItems.push({
      itemType: "group",
      groupId: grp.id as number,
      violationId: null,
      description: `مجموعة ${grp.nuskGroupNumber} — ${grp.name || ""}`.trim(),
      quantity: mutamerCount,
      unitPrice: price,
      lineTotal,
      // Optional fields — fall back to null/undefined when no
      // services product is configured (the engine then uses the
      // invoice-header defaults established in PR #1467).
      productId: servicesProductId,
      accountCode: servicesAccountCode,
      vatRate: servicesVatRate,
    });

    const nuskInvs = await rawQuery<Record<string, unknown>>(
      `SELECT "nuskInvoiceNumber" FROM umrah_nusk_invoices
       WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [grp.id, scope.companyId]
    );
    for (const ni of nuskInvs) {
      const niRef = ni.nuskInvoiceNumber as string | null;
      if (niRef && !nuskInvoiceRefs.includes(niRef)) {
        nuskInvoiceRefs.push(niRef);
      }
    }
  }

  const violations = await rawQuery<Record<string, unknown>>(
    `SELECT v.id, v.type, v.description, v."penaltyAmount", v."groupId"
     FROM umrah_violations v
     WHERE v."subAgentId" = $1 AND v."companyId" = $2
       AND v."groupId" = ANY($3)
       AND v.status IN ('open','detected')
       AND v."deletedAt" IS NULL`,
    [subAgentId, scope.companyId, groupIds]
  );

  let penaltiesTotal = 0;
  for (const v of violations) {
    const amount = Number(v.penaltyAmount) || 0;
    if (amount <= 0) continue;
    penaltiesTotal += amount;
    lineItems.push({
      itemType: "penalty",
      groupId: v.groupId as number | null,
      violationId: v.id as number,
      description: v.type === "overstay" ? `غرامة تجاوز — ${v.description || ""}`.trim()
                 : v.type === "absconded" ? `غرامة متغيّب — ${v.description || ""}`.trim()
                 : `غرامة — ${v.description || ""}`.trim(),
      quantity: 1,
      unitPrice: amount,
      lineTotal: amount,
    });
  }

  // VAT on the MARGIN (sale − cost), not on the full sale.
  // Umrah services in KSA fall under the travel-agent margin scheme: the
  // VAT base is the gross profit (sale price minus the NUSK purchase
  // invoice total for the same groups), not the full sale price. Charging
  // VAT on the full subtotal overcharges the buyer and overstates the
  // company's VAT liability.
  //
  // Cost basis = sum of umrah_nusk_invoices.totalAmount for every NUSK
  // invoice linked to the groups being billed (joined via group_id).
  // Penalties are pure revenue (no offsetting cost), so they stay in the
  // VAT base when the company opts in.
  // Cost basis — net of refunds, excluding cancelled NUSK invoices.
  //
  // Pre-PR this query ran `SUM(totalAmount)` blindly, which:
  //   1. Counted refunded amounts as cost (a partially-refunded NUSK
  //      invoice inflated cost → shrank margin → undercharged VAT, a
  //      ZATCA compliance violation: the operator must remit the FULL
  //      output VAT on the actual margin, not a refund-inflated one).
  //   2. Counted cancelled NUSK invoices as cost (same problem; the
  //      NUSK row exists for audit but no payable was actually owed).
  //
  // Fix: subtract refundAmount and exclude cancelled rows. The match
  // logic is identical to the vendor-statement integration (PR #1453)
  // so both reports converge on the same cost figure.
  const costRows = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM("totalAmount" - COALESCE("refundAmount", 0)), 0) AS cost_basis
       FROM umrah_nusk_invoices
      WHERE "companyId" = $1
        AND "groupId" = ANY($2)
        AND "deletedAt" IS NULL
        AND "nuskStatus" NOT IN ('cancelled')`,
    [scope.companyId, groupIds]
  );
  const costBasis = roundTo2(Number(costRows[0]?.cost_basis ?? 0));
  // Selling-below-cost detection — `subtotal < costBasis` means the
  // operator is taking a loss. `Math.max(0, ...)` still clamps so we
  // don't accidentally compute negative VAT, but we EXPOSE the
  // condition on the returned object so the UI can warn the operator
  // (was silently buried before: invoice generated fine, no signal
  // the sale was below cost).
  const sellingBelowCost = subtotal < costBasis;
  const marginBase = roundTo2(Math.max(0, subtotal - costBasis));

  const [vatSetting] = await rawQuery<Record<string, unknown>>(
    `SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'umrah_vat_rate' LIMIT 1`,
    [scope.companyId]
  );
  const vatRate = vatSetting ? Number(vatSetting.value) : 0;
  const vatAmount = roundTo2(marginBase * (vatRate / 100));
  const total = subtotal + penaltiesTotal + vatAmount;

  // #1141 closure — umrah sales invoice ref now routes through the
  // numbering center (scheme umrah.umrah_sales_invoice, seeded by
  // migration 232). The previous code used a global per-DB sequence
  // (cross-tenant leak) that bypassed numbering_assignments entirely.
  // issueNumber's inner withTransaction joins ours via SAVEPOINT so
  // issue + INSERT + linkback are atomic.
  let invoiceId!: number;
  let ref!: string;
  await withTransaction(async (client) => {
    const issued = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId || null,
      moduleKey: "umrah",
      entityKey: "umrah_sales_invoice",
      entityTable: "umrah_sales_invoices",
      actorId: scope.userId,
      metadata: { subAgentId, seasonId },
      expectedTiming: "on_draft",
    });
    ref = issued.number;
    const invRes = await client.query(
      `INSERT INTO umrah_sales_invoices
       ("companyId","branchId","subAgentId","clientId","seasonId",ref,"invoiceDate",
        subtotal,"penaltiesTotal","vatRate","vatAmount","costBasis","marginBase",total,
        "paidAmount",status,"dueDate","nuskInvoiceRefs","groupRefs","pilgrimCount",
        "createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$9,$10,$11,$12,$13,0,'draft',
               CURRENT_DATE + INTERVAL '30 days',$14,$15,$16,$17,NOW(),NOW())
       RETURNING id`,
      [
        scope.companyId, scope.branchId || null, subAgentId, subAgent.clientId, seasonId,
        ref, subtotal, penaltiesTotal, vatRate, vatAmount, costBasis, marginBase, total,
        nuskInvoiceRefs.join(","), groupRefs.join(","), totalPilgrims, scope.userId,
      ]
    );
    invoiceId = invRes.rows[0].id;
    await client.query(
      `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
      [invoiceId, issued.assignmentId]
    );

    if (lineItems.length > 0) {
      // Migration 240 added 4 per-line columns — productId / vatRate /
      // vatAmount / accountCode — for the finance-style per-line
      // routing (visa zero-rated, services standard 15%, etc.).
      // Phase 1 persists them as defaults; Phase 2 will source from
      // a per-itemType resolver. Until then:
      //   - vatRate defaults to invoice.vatRate (typically 15)
      //   - vatAmount = lineTotal × vatRate / 100 (tax-exclusive)
      //   - productId / accountCode left null until a resolver lookup
      //     is wired up
      // The aggregate vatAmount on the invoice header still drives
      // the GL posting today; the per-line values are an additive
      // richer source ready for the Phase 2 GL split.
      const cols = 12;
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      for (const li of lineItems) {
        const lineVatRate = li.vatRate ?? vatRate;
        const lineVatAmount = li.vatAmount ?? roundTo2(li.lineTotal * lineVatRate / 100);
        const base = params.length;
        valuesSql.push(`(${Array.from({ length: cols }, (_, i) => `$${base + i + 1}`).join(",")})`);
        params.push(
          invoiceId, li.itemType, li.groupId, li.violationId,
          li.description, li.quantity, li.unitPrice, li.lineTotal,
          li.productId ?? null, lineVatRate, lineVatAmount, li.accountCode ?? null,
        );
      }
      await client.query(
        `INSERT INTO umrah_sales_invoice_items
         ("invoiceId","itemType","groupId","violationId",description,quantity,"unitPrice","lineTotal",
          "productId","vatRate","vatAmount","accountCode")
         VALUES ${valuesSql.join(",")}`,
        params
      );
    }

    for (const v of violations) {
      await client.query(
        `UPDATE umrah_violations SET status = 'invoiced', "linkedInvoiceId" = $1, "updatedBy" = $2, "updatedAt" = NOW()
         WHERE id = $3 AND "companyId" = $4`,
        [invoiceId, scope.userId, v.id, scope.companyId]
      );
    }

    for (const grp of groups) {
      await client.query(
        `UPDATE umrah_groups SET "salesInvoiceId" = $1, "updatedBy" = $2, "updatedAt" = NOW()
         WHERE id = $3 AND "companyId" = $4`,
        [invoiceId, scope.userId, grp.id, scope.companyId]
      );
    }
  });

  // GL: Debit Accounts Receivable, Credit Umrah Revenue + Penalty Revenue + VAT — BLOCKING
  const [arCode, revCode, penaltyRevCode] = await Promise.all([
    getAccountCodeFromMapping(scope.companyId, "umrah_invoice_ar", "debit", "1200"),
    getAccountCodeFromMapping(scope.companyId, "umrah_invoice_revenue", "credit", "4200"),
    getAccountCodeFromMapping(scope.companyId, "umrah_penalty_revenue", "credit", "4210"),
  ]);
  // Every GL line on an Umrah sales invoice carries the agent + season
  // dimensions so revenue/AR drill by agent-season is preserved end-to-
  // end in the books (financial-integrity audit gap #5). `subAgent.agentId`
  // and `seasonId` are guaranteed available here — we read them before
  // any insert so they're never silently dropped.
  const umrahDims = {
    umrahAgentId: (subAgent.agentId as number | null) ?? undefined,
    umrahSeasonId: (seasonId as number | null) ?? undefined,
  };
  const glLines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    description: string;
    umrahAgentId?: number;
    umrahSeasonId?: number;
  }> = [
    { accountCode: arCode, debit: total, credit: 0, description: `ذمم مدينة — ${subAgent.clientName || "وكيل فرعي"}`, ...umrahDims },
  ];

  // Phase 2 — bucket revenue by accountCode. Currently every 'group'
  // line uses null accountCode (no Phase 3 resolver yet), so this
  // produces ONE entry with the default revCode and the output JE is
  // byte-identical to Phase 1. When the operator-facing product
  // mapping lands (visa→revenue-visa, services→revenue-services,
  // transport→revenue-transport), the same code will emit a separate
  // CR Revenue per account without further changes.
  //
  // Penalties stay on their own line via penaltiesTotal — same as
  // before, since penalty rows already use a distinct revenue
  // account (umrah_penalty_revenue / 4210).
  const revenueByAccount = new Map<string, number>();
  for (const li of lineItems) {
    if (li.itemType !== "group") continue;
    const code = li.accountCode ?? revCode;
    revenueByAccount.set(code, (revenueByAccount.get(code) ?? 0) + li.lineTotal);
  }
  for (const [code, amount] of revenueByAccount) {
    glLines.push({
      accountCode: code,
      debit: 0,
      credit: amount,
      description: code === revCode
        ? `إيراد خدمات عمرة — ${ref}`
        : `إيراد عمرة (${code}) — ${ref}`,
      ...umrahDims,
    });
  }
  if (penaltiesTotal > 0) {
    glLines.push({ accountCode: penaltyRevCode, debit: 0, credit: penaltiesTotal, description: `إيراد غرامات — ${ref}`, ...umrahDims });
  }
  if (vatAmount > 0) {
    // Use the standard vat_output fallback (2300) so umrah VAT lines join
    // the same payable account every other sales path posts to. The
    // previous "2160" fallback (unearned revenue) created an isolated
    // sub-ledger that the VAT reconciliation report — which sums by
    // accountCode = vat_output — never saw, understating reported VAT
    // payable by the entire umrah sales volume.
    const vatPayableCode = await getAccountCodeFromMapping(scope.companyId, "vat_output", "credit", "2300");
    glLines.push({ accountCode: vatPayableCode, debit: 0, credit: vatAmount, description: `ضريبة قيمة مضافة — ${ref}`, ...umrahDims });
  }
  await createGuardedJournalEntry({
    companyId: scope.companyId,
    branchId: scope.branchId || 0,
    createdBy: scope.userId,
    ref: `JE-${ref}`,
    description: `فاتورة مبيعات عمرة — ${ref}`,
    type: "sales",
    sourceType: "umrah_sales_invoices",
    sourceId: invoiceId,
    lines: glLines,
  }, { table: "umrah_sales_invoices", id: invoiceId });

  emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: invoiceId, details: JSON.stringify({ ref, total, subAgentId, groupCount: groups.length, pilgrimCount: totalPilgrims }) }).catch((e) => logger.error(e, "[umrahInvoicingEngine] background task failed"));

  // E-invoice clearance (ZATCA + future jurisdictions). Goes through
  // the vendor-neutral provider registry. The default `mock` provider
  // returns cleared without touching any network — safe for dev/CI
  // and for companies that haven't onboarded yet. Failures are
  // non-blocking: the sales invoice + GL post stand even if the
  // provider rejects (reconciliation handles the resubmit later).
  (async () => {
    try {
      const provider = await getEInvoiceProvider(scope.companyId);
      const result = await provider.submit({
        id: invoiceId,
        sourceType: "umrah_sales_invoices",
        ref,
        companyId: scope.companyId,
        subtotal,
        vatAmount,
        total,
        currency: "SAR",
        issueDate: new Date().toISOString(),
        buyer: { name: (subAgent.clientName as string | null) || "وكيل فرعي" },
        lines: lineItems.map((li) => ({
          description: li.description ?? "",
          quantity: Number(li.quantity ?? 1),
          unitPrice: Number(li.unitPrice ?? 0),
          lineTotal: Number(li.lineTotal ?? 0),
          vatAmount: 0,
        })),
      });
      logger.info({ invoiceId, ref, provider: provider.name, status: result.status, uuid: result.uuid }, "[einvoice] umrah sales invoice cleared");
    } catch (err) {
      logger.error(err, `[einvoice] clearance failed for umrah sales invoice ${invoiceId} — non-blocking`);
    }
  })();

  createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sales_invoices", entityId: invoiceId, after: { ref, total } }).catch((e) => logger.error(e, "[umrahInvoicingEngine] background task failed"));

  return {
    invoiceId, ref, subtotal, penaltiesTotal, vatRate, vatAmount, total,
    pilgrimCount: totalPilgrims, lineItems: lineItems.length,
    nuskInvoiceRefs, groupRefs,
    // Margin-scheme telemetry — surfaces what was previously buried in
    // the column values, so callers (UI, audit, alerting) can react.
    costBasis, marginBase, sellingBelowCost,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Payment Registration with FIFO
// ────────────────────────────────────────────────────────────────────────────

export async function registerPayment(scope: Scope, input: RegisterPaymentInput) {
  const { subAgentId, amount, currency = "SAR", exchangeRate, sarAmount, method = "bank_transfer", reference, invoiceIds } = input;

  if (!sarAmount || sarAmount <= 0) throw new ValidationError("المبلغ بالريال مطلوب");

  const [subAgent] = await rawQuery<Record<string, unknown>>(
    `SELECT id, "clientId", "agentId" FROM umrah_sub_agents WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [subAgentId, scope.companyId]
  );
  if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");

  // #1141 closure — umrah payment ref now routes through the numbering
  // center (scheme umrah.umrah_payment, seeded by migration 232).
  // Same fix shape as the sales-invoice path above.
  let paymentId!: number;
  let payRef!: string;
  const allocations: { invoiceId: number; invoiceRef: string; allocated: number }[] = [];
  let remaining = sarAmount;

  await withTransaction(async (client) => {
    const issued = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId || null,
      moduleKey: "umrah",
      entityKey: "umrah_payment",
      entityTable: "umrah_payments",
      actorId: scope.userId,
      metadata: { subAgentId },
      expectedTiming: "on_draft",
    });
    payRef = issued.number;
    const payRes = await client.query(
      `INSERT INTO umrah_payments
       ("companyId","branchId","subAgentId",ref,amount,currency,"exchangeRate","sarAmount",
        method,"externalReference","paymentDate","createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE,$11,NOW(),NOW())
       RETURNING id`,
      [
        scope.companyId, scope.branchId || null, subAgentId, payRef,
        amount, currency, exchangeRate || null, sarAmount,
        method, reference || null, scope.userId,
      ]
    );
    paymentId = payRes.rows[0].id;
    await client.query(
      `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
      [paymentId, issued.assignmentId]
    );

    let invoicesToPay: any[];
    if (invoiceIds && invoiceIds.length > 0) {
      const invRes = await client.query(
        `SELECT id, ref, total, "paidAmount", status FROM umrah_sales_invoices
         WHERE id = ANY($1) AND "companyId" = $2 AND "subAgentId" = $3 AND "deletedAt" IS NULL
           AND status NOT IN ('paid','cancelled')
         ORDER BY "invoiceDate" ASC, id ASC
         FOR UPDATE`,
        [invoiceIds, scope.companyId, subAgentId]
      );
      invoicesToPay = invRes.rows;
    } else {
      const invRes = await client.query(
        `SELECT id, ref, total, "paidAmount", status FROM umrah_sales_invoices
         WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
           AND status NOT IN ('paid','cancelled')
         ORDER BY "invoiceDate" ASC, id ASC
         FOR UPDATE`,
        [scope.companyId, subAgentId]
      );
      invoicesToPay = invRes.rows;
    }

    for (const inv of invoicesToPay) {
      if (remaining <= 0) break;
      const invRemaining = Number(inv.total) - Number(inv.paidAmount);
      if (invRemaining <= 0) continue;

      const allocAmount = Math.min(remaining, invRemaining);
      remaining = roundTo2(remaining - allocAmount);

      await client.query(
        `INSERT INTO umrah_payment_allocations ("paymentId","invoiceId",amount)
         VALUES ($1,$2,$3)`,
        [paymentId, inv.id, allocAmount]
      );

      const newPaid = roundTo2(Number(inv.paidAmount) + allocAmount);
      const newStatus = newPaid >= Number(inv.total) - 0.01 ? "paid" : "partially_paid";

      if (newStatus === "paid") {
        await client.query(
          `UPDATE umrah_sales_invoices SET "paidAmount" = $1, status = $2, "updatedAt" = NOW() WHERE id = $3 AND "companyId" = $4`,
          [newPaid, newStatus, inv.id, scope.companyId]
        );
      } else {
        await client.query(
          `UPDATE umrah_sales_invoices SET "paidAmount" = $1, status = $2, "updatedAt" = NOW() WHERE id = $3 AND "companyId" = $4`,
          [newPaid, newStatus, inv.id, scope.companyId]
        );
      }

      allocations.push({ invoiceId: inv.id, invoiceRef: inv.ref, allocated: allocAmount });
    }
  });

  // GL: payment journal — BLOCKING (financial integrity)
  const [cashCode, arPayCode] = await Promise.all([
    getAccountCodeFromMapping(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1110"),
    getAccountCodeFromMapping(scope.companyId, "invoice_payment_ar", "credit", "1200"),
  ]);
  // Carry umrahAgentId on both legs so AR aging by agent stays drillable
  // from the GL (financial-integrity audit gap #5). umrahSeasonId is not
  // included here because a single payment may settle invoices from
  // multiple seasons; reliable per-season attribution lives on the
  // payment-to-invoice allocations table, not on the cash JE itself.
  const umrahAgentId = (subAgent.agentId as number | null) ?? undefined;
  await createGuardedJournalEntry({
    companyId: scope.companyId,
    branchId: scope.branchId || 0,
    createdBy: scope.userId,
    ref: `JE-${payRef}`,
    description: `سداد وكيل فرعي — ${payRef}`,
    type: "payment",
    sourceType: "umrah_payments",
    sourceId: paymentId,
    lines: [
      { accountCode: cashCode, debit: sarAmount, credit: 0, umrahAgentId },
      { accountCode: arPayCode, debit: 0, credit: sarAmount, umrahAgentId },
    ],
  }, { table: "umrah_payments", id: paymentId });

  emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.payment.received", entity: "umrah_payments", entityId: paymentId, details: JSON.stringify({ ref: payRef, sarAmount, method, allocations }) }).catch((e) => logger.error(e, "[umrahInvoicingEngine] background task failed"));
  createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_payments", entityId: paymentId, after: { ref: payRef, sarAmount } }).catch((e) => logger.error(e, "[umrahInvoicingEngine] background task failed"));

  return { paymentId, ref: payRef, sarAmount, currency, method, allocations, unallocated: remaining };
}

// ────────────────────────────────────────────────────────────────────────────
// 2.5 Sales-invoice wizard — uninvoiced groups + smart price suggestions
// ────────────────────────────────────────────────────────────────────────────

export interface UninvoicedGroup {
  id: number;
  nuskGroupNumber: string;
  name: string | null;
  mutamerCount: number;
  entryDate: string | null;
  suggestedPrice: number | null;
  /** Where the suggestion came from. UI can hint the operator. */
  suggestedSource: "last_invoice" | "pricing_rule" | "default_per_mutamer" | "none";
}

export interface UninvoicedGroupsResult {
  subAgent: { id: number; name: string; agentId: number | null; clientId: number | null; clientName: string | null; defaultPricePerMutamer: number | null };
  groups: UninvoicedGroup[];
}

/**
 * Lists groups that belong to a sub-agent and haven't been billed yet, with
 * a smart price suggestion per group. The suggestion is sourced in priority:
 *
 *   1. Last invoice line for this sub-agent — captures the price the operator
 *      actually charged last time, even if it disagreed with the pricing rule.
 *   2. Matching `umrah_pricing` rule for (sub-agent OR agent, season, entry date).
 *   3. `umrah_sub_agents.defaultPricePerMutamer` — the per-sub-agent fallback.
 *   4. null — operator must enter a price.
 *
 * The wizard UI surfaces the suggested value pre-filled but editable, so
 * routine cases (price unchanged) need zero typing while exceptional cases
 * (one-off discount, currency move) stay one input away.
 */
export async function listUninvoicedGroups(scope: Scope, subAgentId: number, seasonId?: number | null): Promise<UninvoicedGroupsResult> {
  const [subAgent] = await rawQuery<Record<string, unknown>>(
    `SELECT sa.id, sa.name, sa."agentId", sa."clientId", sa."defaultPricePerMutamer",
            c.name AS "clientName"
       FROM umrah_sub_agents sa
       LEFT JOIN clients c ON c.id = sa."clientId" AND c."deletedAt" IS NULL
      WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
    [subAgentId, scope.companyId]
  );
  if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");

  // Groups belonging to this sub-agent that haven't been billed yet
  // (no row in umrah_sales_invoice_items for a non-cancelled invoice).
  const seasonClause = seasonId ? "AND g.\"seasonId\" = $3" : "";
  const seasonParams = seasonId ? [subAgentId, scope.companyId, seasonId] : [subAgentId, scope.companyId];
  const groups = await rawQuery<Record<string, unknown>>(
    `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
            (SELECT MIN(p."arrivalDate") FROM umrah_pilgrims p
              WHERE p."groupId" = g.id AND p."deletedAt" IS NULL) AS "entryDate"
       FROM umrah_groups g
      WHERE g."subAgentId" = $1
        AND g."companyId" = $2
        AND g."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM umrah_sales_invoice_items si
                   JOIN umrah_sales_invoices inv ON inv.id = si."invoiceId"
                  WHERE si."groupId" = g.id
                    AND inv.status != 'cancelled'
                    AND inv."deletedAt" IS NULL
        )
        ${seasonClause}
      ORDER BY g."createdAt" DESC, g.id DESC`,
    seasonParams
  );

  // Last invoice line for this sub-agent — single round-trip, picks the
  // most recent non-cancelled invoice's average unit price.
  const [lastPriced] = await rawQuery<Record<string, unknown>>(
    `SELECT si."unitPrice"
       FROM umrah_sales_invoice_items si
       JOIN umrah_sales_invoices inv ON inv.id = si."invoiceId"
      WHERE inv."subAgentId" = $1
        AND inv."companyId" = $2
        AND inv.status != 'cancelled'
        AND inv."deletedAt" IS NULL
        AND si."itemType" = 'group'
      ORDER BY inv."invoiceDate" DESC, inv.id DESC, si.id DESC
      LIMIT 1`,
    [subAgentId, scope.companyId]
  );
  const lastInvoicePrice = lastPriced ? Number(lastPriced.unitPrice) : null;

  const suggested: UninvoicedGroup[] = [];
  for (const g of groups) {
    const groupId = g.id as number;
    const entryDate = g.entryDate as string | null;

    let price: number | null = null;
    let source: UninvoicedGroup["suggestedSource"] = "none";

    if (lastInvoicePrice && lastInvoicePrice > 0) {
      price = lastInvoicePrice;
      source = "last_invoice";
    } else if (entryDate) {
      const [rule] = await rawQuery<Record<string, unknown>>(
        `SELECT "pricePerMutamer" FROM umrah_pricing
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
            AND ("subAgentId" = $2 OR ("subAgentId" IS NULL AND "agentId" = $3))
            AND "validFrom" <= $4 AND "validTo" >= $4
          ORDER BY "subAgentId" DESC NULLS LAST, "validFrom" DESC
          LIMIT 1`,
        [scope.companyId, subAgentId, subAgent.agentId, entryDate]
      );
      if (rule) {
        price = Number(rule.pricePerMutamer);
        source = "pricing_rule";
      }
    }
    if (price == null && subAgent.defaultPricePerMutamer != null) {
      price = Number(subAgent.defaultPricePerMutamer);
      source = "default_per_mutamer";
    }

    suggested.push({
      id: groupId,
      nuskGroupNumber: g.nuskGroupNumber as string,
      name: (g.name as string | null) ?? null,
      mutamerCount: Number(g.mutamerCount ?? 0),
      entryDate,
      suggestedPrice: price,
      suggestedSource: source,
    });
  }

  return {
    subAgent: {
      id: subAgent.id as number,
      name: subAgent.name as string,
      agentId: (subAgent.agentId as number | null) ?? null,
      clientId: (subAgent.clientId as number | null) ?? null,
      clientName: (subAgent.clientName as string | null) ?? null,
      defaultPricePerMutamer: subAgent.defaultPricePerMutamer != null ? Number(subAgent.defaultPricePerMutamer) : null,
    },
    groups: suggested,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Statement Generation
// ────────────────────────────────────────────────────────────────────────────

export async function generateStatement(scope: Scope, subAgentId: number, type: "detailed" | "summary", from?: string, to?: string) {
  const dateFilter = from && to
    ? { fromDate: from, toDate: to }
    : { fromDate: "1970-01-01", toDate: "2099-12-31" };

  const invoices = await rawQuery<Record<string, unknown>>(
    `SELECT id, ref, "invoiceDate" AS date, total, "penaltiesTotal", "groupRefs", "nuskInvoiceRefs", "pilgrimCount"
     FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "invoiceDate" >= $3 AND "invoiceDate" <= $4
     ORDER BY "invoiceDate" ASC, id ASC`,
    [scope.companyId, subAgentId, dateFilter.fromDate, dateFilter.toDate]
  );

  const payments = await rawQuery<Record<string, unknown>>(
    `SELECT p.id, p.ref, p."paymentDate" AS date, p."sarAmount", p.method
     FROM umrah_payments p
     WHERE p."companyId" = $1 AND p."subAgentId" = $2 AND p."deletedAt" IS NULL
       AND p."paymentDate" >= $3 AND p."paymentDate" <= $4
     ORDER BY p."paymentDate" ASC, p.id ASC`,
    [scope.companyId, subAgentId, dateFilter.fromDate, dateFilter.toDate]
  );

  const violations = await rawQuery<Record<string, unknown>>(
    `SELECT v.id, v.type, v."penaltyAmount", v."createdAt"::date AS date, v."groupId"
     FROM umrah_violations v
     WHERE v."subAgentId" = $1 AND v."companyId" = $2 AND v."deletedAt" IS NULL
       AND v.status NOT IN ('closed')
       AND v."linkedInvoiceId" IS NULL
       AND v."createdAt"::date >= $3 AND v."createdAt"::date <= $4
     ORDER BY v."createdAt" ASC`,
    [subAgentId, scope.companyId, dateFilter.fromDate, dateFilter.toDate]
  );

  const openingInvoices = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM(total), 0) AS total FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "invoiceDate" < $3`,
    [scope.companyId, subAgentId, dateFilter.fromDate]
  );
  const openingPayments = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM("sarAmount"), 0) AS total FROM umrah_payments
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "paymentDate" < $3`,
    [scope.companyId, subAgentId, dateFilter.fromDate]
  );
  const openingViolations = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM("penaltyAmount"), 0) AS total FROM umrah_violations
     WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
       AND "linkedInvoiceId" IS NULL AND "createdAt"::date < $3`,
    [subAgentId, scope.companyId, dateFilter.fromDate]
  );

  let openingBalance = Number(openingInvoices[0]?.total || 0) + Number(openingViolations[0]?.total || 0) - Number(openingPayments[0]?.total || 0);

  if (type === "detailed") {
    return buildDetailedStatement(invoices, payments, violations, openingBalance);
  }
  return buildSummaryStatement(invoices, payments, violations, openingBalance);
}

function buildDetailedStatement(
  invoices: any[], payments: any[], violations: any[], openingBalance: number
) {
  const entries: any[] = [];
  let balance = openingBalance;

  if (openingBalance !== 0) {
    entries.push({
      date: null, description: "رصيد افتتاحي", reference: "", debit: openingBalance > 0 ? openingBalance : 0, credit: openingBalance < 0 ? Math.abs(openingBalance) : 0, balance: openingBalance,
    });
  }

  const all: { date: string; sort: number; entry: any }[] = [];

  for (const inv of invoices) {
    all.push({
      date: inv.date, sort: 1,
      entry: { date: inv.date, description: `فاتورة — ${inv.groupRefs || ""}`, reference: inv.ref, debit: Number(inv.total), credit: 0 },
    });
  }
  for (const v of violations) {
    all.push({
      date: v.date, sort: 2,
      entry: { date: v.date, description: v.type === "absconded" ? "غرامة متغيّب" : "غرامة تجاوز", reference: `VIO-${v.id}`, debit: Number(v.penaltyAmount), credit: 0 },
    });
  }
  for (const p of payments) {
    const methodLabel = p.method === "cash" ? "نقدي" : p.method === "bank_transfer" ? "تحويل بنكي" : p.method === "cheque" ? "شيك" : p.method;
    all.push({
      date: p.date, sort: 3,
      entry: { date: p.date, description: `دفعة — ${methodLabel}`, reference: p.ref, debit: 0, credit: Number(p.sarAmount) },
    });
  }

  all.sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    return d !== 0 ? d : a.sort - b.sort;
  });

  for (const item of all) {
    balance = roundTo2(balance + item.entry.debit - item.entry.credit);
    entries.push({ ...item.entry, balance });
  }

  return { openingBalance, entries, closingBalance: balance };
}

function buildSummaryStatement(
  invoices: any[], payments: any[], violations: any[], openingBalance: number
) {
  const entries: any[] = [];
  let balance = openingBalance;

  if (openingBalance !== 0) {
    entries.push({ period: null, description: "رصيد افتتاحي", amount: openingBalance, balance: openingBalance });
  }

  const monthlyInv: Record<string, { count: number; total: number }> = {};
  for (const inv of invoices) {
    const m = String(inv.date).slice(0, 7);
    if (!monthlyInv[m]) monthlyInv[m] = { count: 0, total: 0 };
    monthlyInv[m].count++;
    monthlyInv[m].total += Number(inv.total);
  }

  const monthlyVio: Record<string, { count: number; total: number }> = {};
  for (const v of violations) {
    const m = String(v.date).slice(0, 7);
    if (!monthlyVio[m]) monthlyVio[m] = { count: 0, total: 0 };
    monthlyVio[m].count++;
    monthlyVio[m].total += Number(v.penaltyAmount);
  }

  const allMonths = [...new Set([...Object.keys(monthlyInv), ...Object.keys(monthlyVio)])].sort();

  const allEntries: { date: string; sort: number; entry: any }[] = [];
  for (const m of allMonths) {
    if (monthlyInv[m]) {
      allEntries.push({
        date: m + "-01", sort: 1,
        entry: { period: m, description: `إجمالي فواتير (${monthlyInv[m].count} فاتورة)`, amount: monthlyInv[m].total },
      });
    }
    if (monthlyVio[m]) {
      allEntries.push({
        date: m + "-01", sort: 2,
        entry: { period: m, description: `إجمالي غرامات (${monthlyVio[m].count})`, amount: monthlyVio[m].total },
      });
    }
  }

  for (const p of payments) {
    const methodLabel = p.method === "cash" ? "نقدي" : p.method === "bank_transfer" ? "تحويل بنكي" : p.method === "cheque" ? "شيك" : p.method;
    allEntries.push({
      date: p.date, sort: 3,
      entry: { period: p.date, description: `دفعة — ${methodLabel}`, amount: -Number(p.sarAmount) },
    });
  }

  allEntries.sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    return d !== 0 ? d : a.sort - b.sort;
  });

  for (const item of allEntries) {
    balance = roundTo2(balance + item.entry.amount);
    entries.push({ ...item.entry, balance });
  }

  return { openingBalance, entries, closingBalance: balance };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Enhanced Dashboard
// ────────────────────────────────────────────────────────────────────────────

export async function getDashboard(scope: Scope, seasonId: number) {
  const pilgrimStats = await rawQuery<Record<string, unknown>>(
    `SELECT
       COUNT(*)::int AS "totalMutamers",
       COUNT(*) FILTER (WHERE "isInsideKingdom" = TRUE)::int AS "insideKingdom",
       COUNT(*) FILTER (WHERE status = 'overstayed')::int AS "overstayCount",
       COUNT(*) FILTER (WHERE status = 'violated')::int AS "abscondedCount"
     FROM umrah_pilgrims
     WHERE "companyId" = $1 AND "seasonId" = $2 AND "deletedAt" IS NULL`,
    [scope.companyId, seasonId]
  );

  const revenueStats = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM(total), 0) AS "totalRevenue",
            COALESCE(SUM("paidAmount"), 0) AS "totalPaid"
     FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "seasonId" = $2 AND "deletedAt" IS NULL
       AND status != 'cancelled'`,
    [scope.companyId, seasonId]
  );

  const costStats = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM("netCost"), 0) AS "totalCost"
     FROM umrah_nusk_invoices ni
     JOIN umrah_groups g ON g.id = ni."groupId"
     WHERE ni."companyId" = $1 AND g."seasonId" = $2 AND ni."deletedAt" IS NULL`,
    [scope.companyId, seasonId]
  );

  const penaltyStats = await rawQuery<Record<string, unknown>>(
    `SELECT COALESCE(SUM("penaltyAmount"), 0) AS "unpaidPenalties"
     FROM umrah_violations
     WHERE "companyId" = $1 AND status IN ('open','detected') AND "deletedAt" IS NULL
       AND "groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $2 AND "companyId" = $1)`,
    [scope.companyId, seasonId]
  );

  const agentPerformance = await rawQuery<Record<string, unknown>>(
    `SELECT
       sa.id AS "subAgentId", sa.name AS "subAgentName",
       (SELECT COUNT(*)::int FROM umrah_groups g2
        WHERE g2."subAgentId" = sa.id AND g2."seasonId" = $2 AND g2."deletedAt" IS NULL) AS groups,
       (SELECT COUNT(*)::int FROM umrah_pilgrims p2
        WHERE p2."subAgentId" = sa.id AND p2."seasonId" = $2 AND p2."deletedAt" IS NULL) AS mutamers,
       COALESCE((SELECT SUM(si.total) FROM umrah_sales_invoices si
        WHERE si."subAgentId" = sa.id AND si."seasonId" = $2 AND si."deletedAt" IS NULL AND si.status != 'cancelled'), 0) AS invoiced,
       COALESCE((SELECT SUM(si."paidAmount") FROM umrah_sales_invoices si
        WHERE si."subAgentId" = sa.id AND si."seasonId" = $2 AND si."deletedAt" IS NULL AND si.status != 'cancelled'), 0) AS paid,
       COALESCE((SELECT SUM(v2."penaltyAmount") FROM umrah_violations v2
        WHERE v2."subAgentId" = sa.id AND v2."companyId" = $1 AND v2.status IN ('open','detected') AND v2."deletedAt" IS NULL
          AND v2."groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $2)), 0) AS penalties
     FROM umrah_sub_agents sa
     WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."isActive" = TRUE
     ORDER BY mutamers DESC`,
    [scope.companyId, seasonId]
  );

  for (const a of agentPerformance) {
    a.balance = Number(a.invoiced) - Number(a.paid);
  }

  const stats = pilgrimStats[0] || {};
  const revenue = revenueStats[0] || {};
  const cost = costStats[0] || {};
  const penalties = penaltyStats[0] || {};

  return {
    totalMutamers: stats.totalMutamers || 0,
    insideKingdom: stats.insideKingdom || 0,
    overstayCount: stats.overstayCount || 0,
    abscondedCount: stats.abscondedCount || 0,
    totalRevenue: Number(revenue.totalRevenue || 0),
    totalCost: Number(cost.totalCost || 0),
    profit: Number(revenue.totalRevenue || 0) - Number(cost.totalCost || 0),
    unpaidPenalties: Number(penalties.unpaidPenalties || 0),
    agentPerformance,
  };
}
