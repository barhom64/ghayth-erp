import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { createGuardedJournalEntry, getAccountCodeFromMapping, emitEvent, createAuditLog, currentYear, currentMonthPadded, roundTo2 } from "./businessHelpers.js";
import { issueNumber } from "./numberingService.js";
import { NotFoundError, ConflictError, ValidationError } from "./errorHandler.js";
import { logger } from "./logger.js";
import { getProvider as getEInvoiceProvider } from "./einvoice/index.js";
import { resolveRevenueAccount } from "./revenueAccountResolver.js";
import { resolveSettings } from "./settings.js";
// FIN-P4-SLICE-C — façade migration path. The legacy
// `generateSalesInvoice` keeps the direct createGuardedJournalEntry
// route (production behavior unchanged). The new
// `generateSalesInvoiceViaFacade` exercises the
// `financialEngine.postSalesInvoice` chain so callers can opt in
// route-by-route. SLICE-D will retire the legacy path once every
// caller has migrated.
import { financialEngine, type InsertSalesInvoiceFn } from "./engines/financialEngine.js";

// U-11 — Client-linkage policy. The values mirror the catalog field
// `umrah.auto_link.clientLinkagePolicy`. The default kicks in whenever
// the company has not explicitly chosen — see
// docs/governance/umrah-inventory-organization-repair/findings/
// U-11_agent_client_linkage_audit.md for the policy rationale.
const KNOWN_CLIENT_LINKAGE_POLICIES = [
  "operational_until_linked",
  "sub_agent_client_required",
  "main_agent_client",
  "operator_confirmed_on_import",
] as const;
type ClientLinkagePolicy = (typeof KNOWN_CLIENT_LINKAGE_POLICIES)[number];

async function resolveClientLinkagePolicy(
  companyId: number,
): Promise<ClientLinkagePolicy> {
  const raw = await resolveSettings(
    "umrah.auto_link.clientLinkagePolicy",
    companyId,
  );
  if (
    typeof raw === "string" &&
    (KNOWN_CLIENT_LINKAGE_POLICIES as readonly string[]).includes(raw)
  ) {
    return raw as ClientLinkagePolicy;
  }
  return "operational_until_linked";
}

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
  // U-11 — policy-aware block. The gate itself is unchanged: a sub-
  // agent without `clientId` is NEVER invoiced. Only the error message
  // varies per policy so the operator gets a hint that matches the
  // company's declared stance. `main_agent_client` is deliberately
  // routed to the same hard block today — the agent-side fallback
  // needs a migration on `umrah_agents.clientId` (U-11 audit §4) which
  // is out of scope for this PR.
  if (!subAgent.clientId) {
    const policy = await resolveClientLinkagePolicy(scope.companyId);
    let message: string;
    switch (policy) {
      case "main_agent_client":
        message =
          "السياسة الحالية (main_agent_client) تتطلب ربط الوكيل الرئيسي بعميل، وهذه القناة لم تُفعَّل بعد (تحتاج migration مستقلة). الحلّ الفوري: اربط الوكيل الفرعي بعميل صريح عبر PUT /umrah/sub-agents/:id/link.";
        break;
      case "sub_agent_client_required":
        message =
          "السياسة تتطلب ربط الوكيل الفرعي بعميل صريح قبل إصدار الفاتورة. استخدم PUT /umrah/sub-agents/:id/link.";
        break;
      case "operator_confirmed_on_import":
      case "operational_until_linked":
      default:
        message =
          "الوكيل الفرعي تشغيلي ولم يُربط بعميل بعد. اربطه عبر PUT /umrah/sub-agents/:id/link قبل إصدار الفاتورة.";
        break;
    }
    throw new ConflictError(message, { field: "clientId" });
  }

  // Was N+1: correlated MIN("arrivalDate") per group over umrah_pilgrims.
  // For batch invoicing 20-50 groups that's 20-50 lookups against the
  // large pilgrims table per call. Single GROUP BY CTE collapses to one
  // scan — scoped to the requested groups via the same ANY($1) gate.
  const groups = await rawQuery<Record<string, unknown>>(
    `WITH first_arrival AS (
       SELECT "groupId", MIN("arrivalDate") AS "entryDate"
         FROM umrah_pilgrims
        WHERE "groupId" = ANY($1) AND "deletedAt" IS NULL
        GROUP BY "groupId"
     )
     SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
            g."subAgentId", g."agentId",
            fa."entryDate"
       FROM umrah_groups g
       LEFT JOIN first_arrival fa ON fa."groupId" = g.id
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

  // Hierarchical revenue-account override — driven by
  // subsidiary_accounts (migration 250). Resolves the most-specific
  // override for this invoice context: sub-agent → agent → season.
  // When set, this code REPLACES whatever product-default the
  // /umrah/settings mapping produced. Why most-specific-wins:
  // the operator's question was «ربط الوكيل بحساب مبيعات مخصص ...
  // مع عدم تعارض ربطها بحساب الوكيل» — a custom-account binding on
  // the sub-agent should dominate the season-wide override, which
  // should dominate the company-wide product default.
  // Null result ⇒ no override configured ⇒ existing behaviour
  // (per-product accountCode) is preserved byte-identical.
  const dimensionalOverride = await resolveRevenueAccount(
    scope.companyId,
    {
      subAgentId,
      agentId: (subAgent.agentId as number | null) ?? null,
      seasonId,
    },
    "revenue",
  );
  const overrideAccountCode = dimensionalOverride?.accountCode ?? null;

  // Phase 3d — when all 3 service products are configured, the
  // engine splits each group's lineTotal into 3 distinct lines
  // sourced from the matching NUSK invoice's per-category columns.
  // The fallback (bundled single line) still works when ANY of the
  // 3 mappings is unset or when no NUSK invoice matches the group
  // — current behaviour preserved as a regression-safe default.
  const canSplit =
    productMap?.servicesProductId != null
    && productMap?.visaProductId != null
    && productMap?.transportProductId != null;

  // One round-trip per invoice instead of per group. Sums per group
  // across multiple NUSK invoices if a group was billed in chunks.
  // Maps groupId → { visa, transport } cost basis for the split.
  const nuskCostByGroup = new Map<number, { visa: number; transport: number }>();
  if (canSplit) {
    const nuskRows = await rawQuery<{ groupId: number; visa: string; transport: string }>(
      `SELECT "groupId",
              COALESCE(SUM("visaFees"), 0)        AS visa,
              COALESCE(SUM("transportTotal"), 0)  AS transport
         FROM umrah_nusk_invoices
        WHERE "groupId" = ANY($1)
          AND "companyId" = $2
          AND "deletedAt" IS NULL
          AND "nuskStatus" NOT IN ('cancelled')
        GROUP BY "groupId"`,
      [groupIds, scope.companyId],
    );
    for (const r of nuskRows) {
      nuskCostByGroup.set(r.groupId, {
        visa: Number(r.visa) || 0,
        transport: Number(r.transport) || 0,
      });
    }
  }

  // Tax-code helper — 'zero' / 'exempt' map to 0% VAT; else fall
  // back to the invoice-header vatRate (undefined here ⇒ default).
  const taxCodeToVat = (code: string | null | undefined): number | undefined =>
    (code === "zero" || code === "exempt" ? 0 : undefined);

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

    // §6 of #1870 — TWO-LINE umrah invoice per operator directive:
    //   1) "رسوم تأشيرة" (visa fees) — exempt + pass-through at NUSK cost.
    //   2) "خدمة أرضية" (ground service) — everything else (transport +
    //      hotel + electronic + services + insurance + margin). Standard
    //      rate; VAT on margin only via the header marginBase / vatAmount
    //      math below.
    //
    // The legacy 3-line split (visa + transport + services) is dropped:
    // ZATCA only needs the two pass-through-vs-margin buckets, and the
    // operator's invoice template renders cleaner with the consolidated
    // ground-service line.
    //
    // Falls back to a single bundled line when the product mapping is
    // incomplete OR no NUSK invoice exists for the group — same as
    // before, since visa pass-through can't be split without it.
    const groupCost = canSplit ? nuskCostByGroup.get(grp.id as number) : undefined;
    if (canSplit && groupCost && groupCost.visa > 0) {
      // Visa portion clamped at the sale total so a NUSK that exceeds
      // the agent price doesn't produce a negative ground-service line.
      // Ground-service absorbs the entire remainder (sale − visa).
      const visaPortion = Math.min(groupCost.visa, lineTotal);
      const groundServicePortion = Math.max(0, lineTotal - visaPortion);

      // Line 1: Visa — pass-through, zero-rated.
      // Quantity = mutamerCount so the per-pilgrim unit price matches NUSK.
      lineItems.push({
        itemType: "group",
        groupId: grp.id as number,
        violationId: null,
        description: `رسوم تأشيرة عمرة — مجموعة ${grp.nuskGroupNumber}`.trim(),
        quantity: mutamerCount,
        unitPrice: mutamerCount > 0 ? visaPortion / mutamerCount : visaPortion,
        lineTotal: visaPortion,
        productId: productMap!.visaProductId,
        accountCode: overrideAccountCode ?? productMap!.visaAccountCode,
        vatRate: taxCodeToVat(productMap!.visaTaxCode),
      });

      // Line 2: Ground service — covers transport + hotel + electronic +
      // services + insurance + the operator's margin. VAT on the margin
      // only (computed at header level via marginBase below).
      lineItems.push({
        itemType: "group",
        groupId: grp.id as number,
        violationId: null,
        description: `خدمة أرضية — مجموعة ${grp.nuskGroupNumber}`.trim(),
        quantity: 1,
        unitPrice: groundServicePortion,
        lineTotal: groundServicePortion,
        productId: productMap!.servicesProductId,
        accountCode: overrideAccountCode ?? productMap!.servicesAccountCode,
        vatRate: taxCodeToVat(productMap!.servicesTaxCode),
      });
    } else {
      // Fallback path — bundled single line. Either the operator
      // hasn't finished the product mapping or this group has no
      // matching NUSK invoice. Phase 3c's services routing still
      // applies when the services product is configured.
      const servicesProductId = productMap?.servicesProductId ?? null;
      const servicesAccountCode = productMap?.servicesAccountCode ?? null;
      const servicesVatRate = taxCodeToVat(productMap?.servicesTaxCode);
      lineItems.push({
        itemType: "group",
        groupId: grp.id as number,
        violationId: null,
        description: `مجموعة ${grp.nuskGroupNumber} — ${grp.name || ""}`.trim(),
        quantity: mutamerCount,
        unitPrice: price,
        lineTotal,
        productId: servicesProductId,
        accountCode: overrideAccountCode ?? servicesAccountCode,
        vatRate: servicesVatRate,
      });
    }

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
  // §6 of #1870 — VAT mode is operator-configurable:
  //   'inclusive' (default) — KSA margin scheme: the ground-service price
  //     ALREADY contains VAT; we extract it (× rate/(100+rate)) so the
  //     customer pays the same total whether the rate changes or not.
  //   'exclusive' — VAT added on top of the margin (legacy non-margin path).
  // Both rate AND mode come from system_settings so operations can toggle
  // them without code changes.
  const [vatModeSetting] = await rawQuery<Record<string, unknown>>(
    `SELECT value FROM system_settings WHERE "companyId" = $1 AND key = 'umrah_vat_mode' LIMIT 1`,
    [scope.companyId]
  );
  const vatRate = vatSetting ? Number(vatSetting.value) : 0;
  const vatMode = (vatModeSetting?.value as string | undefined) ?? "inclusive";
  const vatInclusive = vatMode === "inclusive";
  const vatAmount = vatInclusive
    ? roundTo2(marginBase * vatRate / (100 + vatRate))
    : roundTo2(marginBase * (vatRate / 100));
  // Inclusive mode: VAT is already inside the ground-service line, so the
  // invoice total equals the subtotal (+ any penalties). Exclusive mode
  // keeps the legacy "add on top" behavior.
  const total = vatInclusive
    ? subtotal + penaltiesTotal
    : subtotal + penaltiesTotal + vatAmount;

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
        // Per-line VAT respects the same inclusive/exclusive mode as the
        // header. Informational only — GL posting is driven by the
        // header vatAmount (margin scheme). Sum-of-lines may exceed the
        // header when costBasis > 0 (line uses gross, header uses margin).
        const lineVatAmount = li.vatAmount ?? (vatInclusive
          ? roundTo2(li.lineTotal * lineVatRate / (100 + lineVatRate))
          : roundTo2(li.lineTotal * lineVatRate / 100));
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
    getAccountCodeFromMapping(scope.companyId, "umrah_invoice_ar", "debit", "1131"),
    getAccountCodeFromMapping(scope.companyId, "umrah_invoice_revenue", "credit", "4130"),
    getAccountCodeFromMapping(scope.companyId, "umrah_penalty_revenue", "credit", "4930"),
  ]);
  // Every GL line on an Umrah sales invoice carries the agent + season +
  // CLIENT dimensions so revenue/AR drill by agent-season-client is
  // preserved end-to-end (financial-integrity audit gap #5, operator
  // directive §6: "أبعاد البيع — الوكيل العميل + الموسم"). The
  // sub-agent's linked client (subAgent.clientId) IS the "client-agent"
  // for sales-side drill: every line carries that customer FK so the
  // ledger can be sliced by who owes us.
  const umrahDims = {
    umrahAgentId: (subAgent.agentId as number | null) ?? undefined,
    umrahSeasonId: (seasonId as number | null) ?? undefined,
    clientId: (subAgent.clientId as number | null) ?? undefined,
  };
  const glLines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    description: string;
    umrahAgentId?: number;
    umrahSeasonId?: number;
    clientId?: number;
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
  let standardRatedCode: string | null = null;
  for (const li of lineItems) {
    if (li.itemType !== "group") continue;
    const code = li.accountCode ?? revCode;
    revenueByAccount.set(code, (revenueByAccount.get(code) ?? 0) + li.lineTotal);
    // First standard-rated bucket (effective rate > 0) absorbs the
    // inclusive-mode VAT extraction below. A line with vatRate=undefined
    // inherits the header rate (i.e. the operator's default 15%) — visa
    // is the only line that explicitly sets vatRate=0 (taxCodeToVat
    // returns 0 for 'zero'/'exempt'; everything else is undefined ⇒
    // inherits the header rate ⇒ standard-rated).
    const effectiveRate = li.vatRate ?? vatRate;
    if (effectiveRate > 0 && !standardRatedCode) {
      standardRatedCode = code;
    }
  }
  // Inclusive mode: the vatAmount lives INSIDE the standard-rated revenue
  // bucket (the ground-service line). Extract it so revenue = sale ex-VAT
  // and the JE balances against DR AR = subtotal (no addition).
  if (vatInclusive && vatAmount > 0 && standardRatedCode) {
    revenueByAccount.set(
      standardRatedCode,
      roundTo2((revenueByAccount.get(standardRatedCode) ?? 0) - vatAmount)
    );
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
    const vatPayableCode = await getAccountCodeFromMapping(scope.companyId, "vat_output", "credit", "2131");
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
  // §10 of #1870 — canonical event. Alongside the legacy
  // `umrah.invoice.generated`; the catalog documents this as the
  // spec-mandated name (disambiguates from finance.invoice.created).
  emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.sales_invoice.created", entity: "umrah_sales_invoices", entityId: invoiceId, after: { ref, total, subAgentId, groupCount: groups.length, pilgrimCount: totalPilgrims } }).catch((e) => logger.error(e, "[umrahInvoicingEngine] background task failed"));

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
// 1b. Invoice Generation via the FIN-P4 Financial Engine façade
//
// FIN-P4-SLICE-C — opt-in migration path. Routes that want to flow
// through the central `financialEngine.postSalesInvoice` (numbering +
// tax + accounts + period + JE + AR landing) call this function
// instead of `generateSalesInvoice` directly.
//
// The two paths share the SAME source row (umrah_sales_invoices) and
// the SAME JE schema — the difference is who orchestrates: the
// central engine or the umrah-local code. While both paths are wired,
// no behavior change ships unless a caller explicitly opts in.
//
// SLICE-D (separate PR) will retire the legacy path once every
// route has migrated.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate an umrah sales invoice via the central
 * financialEngine.postSalesInvoice façade.
 *
 * This is the SLICE-C opt-in alternative to `generateSalesInvoice`.
 * It accepts a minimal input that maps to the SalesInvoiceRequest
 * envelope, builds the operational line items, and lets the engine
 * handle numbering/tax/accounts/GL. The caller's INSERT callback
 * writes the umrah_sales_invoices row inside the same transaction
 * the engine opens.
 *
 * Returns the SalesInvoiceResponse shape exactly as the engine
 * computes it — no umrah-local adjustment.
 */
export async function generateSalesInvoiceViaFacade(
  scope: Scope,
  input: {
    subAgentId: number;
    clientId: number;
    seasonId: number;
    groupId?: number;
    lines: Array<{
      description: string;
      quantity: number;
      unitPriceExclTax: number;
      taxCode: string;
      isTaxable: boolean;
    }>;
    invoiceDate?: string;
    dueDate?: string;
    notes?: string;
  },
) {
  if (!input.lines?.length) {
    throw new ValidationError("الفاتورة تحتاج بنداً واحداً على الأقل");
  }

  // The insertInvoice callback owns the umrah-specific INSERT. The
  // engine has prepared invoiceNumber + accounts + totals; the callback
  // turns that into the umrah_sales_invoices row and returns the new
  // id so the engine can anchor the guarded JE.
  const insertInvoice: InsertSalesInvoiceFn = async (prepared, client) => {
    const dueDate = prepared.dueDate ?? null;
    const result = await client.query(
      `INSERT INTO umrah_sales_invoices
        ("companyId","branchId","subAgentId","clientId","seasonId",
         ref,"invoiceDate",subtotal,"penaltiesTotal","vatRate","vatAmount",
         "costBasis","marginBase",total,"paidAmount",status,"dueDate",
         "pilgrimCount","createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,15,$9,0,$10,$11,0,'draft',$12,0,$13,NOW(),NOW())
       RETURNING id`,
      [
        scope.companyId,
        scope.branchId || null,
        input.subAgentId,
        input.clientId,
        input.seasonId,
        prepared.invoiceNumber,
        prepared.invoiceDate,
        prepared.subtotalExclTax,
        prepared.taxTotal,
        prepared.subtotalExclTax,
        prepared.grandTotal,
        dueDate,
        scope.userId,
      ],
    );
    return { invoiceId: result.rows[0].id };
  };

  // The sourceKey carries a stable identifier the engine uses for
  // idempotency on the guarded JE. We seed it from sub-agent + season
  // + first-line description so a retry with the same request stays
  // idempotent — caller can override by passing their own keying.
  const sourceKey =
    `umrah:salesinv:${input.subAgentId}:${input.seasonId}:${input.lines[0].description.slice(0, 32)}`;

  const response = await financialEngine.postSalesInvoice(
    {
      companyId: scope.companyId,
      branchId: scope.branchId || 0,
      createdBy: scope.userId,
      moduleKey: "umrah",
      entityKey: "umrah_sales_invoice",
      clientId: input.clientId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      currency: "SAR",
      dimensions: {
        subAgentId: input.subAgentId,
        seasonId: input.seasonId,
        groupId: input.groupId,
      },
      sourceRefs: {
        sourceType: "umrah_sales_invoices",
        sourceId: 0, // anchored by the callback's RETURNING id
        sourceKey,
      },
      lines: input.lines,
      notes: input.notes,
    },
    insertInvoice,
  );

  // Mirror the legacy event so existing listeners stay subscribed.
  if (response.postingStatus === "posted" && response.invoiceId > 0) {
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "umrah.sales_invoice.created",
      entity: "umrah_sales_invoices",
      entityId: response.invoiceId,
      after: {
        ref: response.invoiceNumber,
        total: response.totals.grandTotal,
        subAgentId: input.subAgentId,
        viaFacade: true,
      },
    }).catch((e) => logger.error(e, "[umrahInvoicingEngine.viaFacade] event emit failed"));
    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "umrah_sales_invoices",
      entityId: response.invoiceId,
      after: { ref: response.invoiceNumber, total: response.totals.grandTotal, viaFacade: true },
    }).catch((e) => logger.error(e, "[umrahInvoicingEngine.viaFacade] audit emit failed"));
  }

  return response;
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
    getAccountCodeFromMapping(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1111" : "1124"),
    getAccountCodeFromMapping(scope.companyId, "invoice_payment_ar", "credit", "1131"),
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
  // Same N+1 shape as the targeted-groups loader above — correlated
  // MIN("arrivalDate") per unbilled group over umrah_pilgrims. A
  // sub-agent with 100 unbilled groups would hit pilgrims 100 times
  // per invoice-suggestion call. Single GROUP BY CTE collapses to one
  // scan; scoped to the same sub-agent/company gate as the outer
  // query so the planner can still prune effectively.
  const groups = await rawQuery<Record<string, unknown>>(
    `WITH first_arrival AS (
       SELECT p."groupId", MIN(p."arrivalDate") AS "entryDate"
         FROM umrah_pilgrims p
         JOIN umrah_groups g2 ON g2.id = p."groupId"
        WHERE g2."subAgentId" = $1
          AND g2."companyId" = $2
          AND g2."deletedAt" IS NULL
          AND p."deletedAt" IS NULL
        GROUP BY p."groupId"
     )
     SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
            fa."entryDate"
       FROM umrah_groups g
       LEFT JOIN first_arrival fa ON fa."groupId" = g.id
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

