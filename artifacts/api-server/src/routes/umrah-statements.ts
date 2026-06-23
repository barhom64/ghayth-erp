// ─────────────────────────────────────────────────────────────────────────────
// umrah-statements.ts — UMRAH SUB-AGENT STATEMENTS (U-07 Phase 9)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(statementsRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/statements/...).
//
// Pure code move — handlers, RBAC are carried over VERBATIM (no behaviour
// change). Both routes are READ-ONLY: they call generateStatement (read) and
// renderPrint (the shared Print Engine service). No writes, no ledger posting,
// no direct cross-domain table writes — so no audit/event helpers are needed
// here (renderPrint owns its own print-audit row).
//
// Routes owned here:
//   GET /statements/:subAgentId
//   GET /statements/:subAgentId/pdf
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, parseId } from "../lib/errorHandler.js";
import { generateStatement } from "../lib/umrahInvoicingEngine.js";
import { renderPrint } from "../lib/print/printService.js";

const router = Router();

// ============================================================================
// STATEMENTS
// ============================================================================

router.get("/statements/:subAgentId", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { type, from, to } = req.query as Record<string, string | undefined>;
    const stmtType = type === "summary" ? "summary" : "detailed";
    const result = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      parseId(req.params.subAgentId, "subAgentId"),
      stmtType,
      from, to
    );
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "Generate statement"); }
});

// Printable Arabic statement of the sub-agent ledger. Reuses the same data
// `generateStatement(detailed)` returns to the JSON peer; renderPrint owns
// the cliché, audit row, and reprint detection from there on.
router.get("/statements/:subAgentId/pdf", authorize({ feature: "umrah", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { from, to } = req.query as Record<string, string | undefined>;
    const subAgentId = parseId(req.params.subAgentId, "subAgentId");
    const data = await generateStatement(
      { companyId: scope.companyId, userId: scope.userId },
      subAgentId,
      "detailed",
      from, to
    );
    // Sub-agent header info the template renders next to the totals.
    const [subAgentRow] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, "nuskCode", "paymentTerms"
         FROM umrah_sub_agents
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [subAgentId, scope.companyId],
    );
    const sub = subAgentRow as { name?: string; nuskCode?: string | null; paymentTerms?: string | null } | undefined;
    const closing = Number((data as { closingBalance: number }).closingBalance ?? 0);
    const totalDebit  = (data as { entries: Array<{ debit: number }> }).entries.reduce((s, e) => s + Number(e.debit  || 0), 0);
    const totalCredit = (data as { entries: Array<{ credit: number }> }).entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    const rangeText = from && to ? `${from} → ${to}` : "كل الفترات";
    const payTermsLabel = sub?.paymentTerms === "prepaid" ? "مقدم" : sub?.paymentTerms === "postpaid" ? "آجل" : (sub?.paymentTerms ?? "-");
    const closingLabel = closing > 0 ? "الرصيد الختامي (مستحق على الوكيل)" : closing < 0 ? "الرصيد الختامي (دفعة مقدمة من الوكيل)" : "الرصيد الختامي";

    const result = await renderPrint(
      {
        companyId: scope.companyId, branchId: scope.branchId ?? null,
        userId: scope.userId, role: scope.role, isOwner: scope.isOwner,
      },
      {
        entityType: "umrah_statement",
        entityId: `${subAgentId}:${from ?? ""}..${to ?? ""}`,
        format: "a4",
        previewPayload: {
          entity: {
            id: subAgentId,
            subAgentName: sub?.name ?? "",
            nuskCode: sub?.nuskCode ?? "",
            paymentTermsLabel: payTermsLabel,
            rangeText,
            openingBalance: Number((data as { openingBalance: number }).openingBalance ?? 0).toFixed(2),
            closingBalance: Math.abs(closing).toFixed(2),
            closingBalanceLabel: closingLabel,
            totalDebit: totalDebit.toFixed(2),
            totalCredit: totalCredit.toFixed(2),
          },
          lines: (data as { entries: Array<Record<string, unknown>> }).entries.map((e) => ({
            "التاريخ": e.date ? String(e.date).slice(0, 10) : "-",
            "الوصف": e.description,
            "المرجع": e.reference || "-",
            "مدين": Number(e.debit  || 0),
            "دائن": Number(e.credit || 0),
            "الرصيد": Number(e.balance || 0),
          })),
        },
      },
      { ipAddress: req.ip, userAgent: req.get("user-agent") ?? undefined },
    );
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `inline; filename="umrah-statement-${subAgentId}.${result.mime.includes("html") ? "html" : "pdf"}"`);
    if (result.jobId) res.setHeader("X-Print-Job-Id", result.jobId);
    res.send(result.bytes);
  } catch (err) { handleRouteError(err, res, "Statement PDF"); }
});

export default router;
