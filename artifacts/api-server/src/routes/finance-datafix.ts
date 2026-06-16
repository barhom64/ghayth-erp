// ─────────────────────────────────────────────────────────────────────────────
// finance-datafix.ts  (#2090 / FIN-DATAFIX / FIN-SUB-02 — READ ONLY)
// ─────────────────────────────────────────────────────────────────────────────
// A STRICTLY READ-ONLY review surface for the pre-#2070 subsidiary-account
// misparenting. It exposes a single GET that returns the inventory of legacy
// per-entity subsidiary sheets opened under the WRONG control parent, plus
// summary counts, so finance can REVIEW and PLAN a correction.
//
// SCOPE (owner-approved, #2090): report ONLY. There is intentionally NO
// mutation endpoint here — no reparent, no migration, no balance change, no
// transfer JE. Any future correction ships in a separate, finance-reviewed PR.
//
// SECURITY: company-scoped on scope.companyId, mounted behind the finance
// module + financial guard (routes/index.ts), gated at requireMinLevel(70)
// (controller floor) and finance.accounts view. No write SQL in this file.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { handleRouteError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireMinLevel } from "../middlewares/roleGuard.js";
import { authorize } from "../lib/rbac/authorize.js";
import { buildMisparentedSubsidiaryInventory } from "../lib/finance/datafixInventory.js";

export const financeDatafixRouter = Router();
financeDatafixRouter.use(authMiddleware);

// GET /finance/datafix/misparented-subsidiaries
// READ-ONLY inventory of legacy subsidiary sheets under the wrong control
// parent + summary (total, autoFixable, needsReview, totalBalanceAtRisk).
financeDatafixRouter.get(
  "/datafix/misparented-subsidiaries",
  requireMinLevel(70),
  authorize({ feature: "finance.accounts", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const inventory = await buildMisparentedSubsidiaryInventory(scope.companyId);
      res.json({
        data: inventory.rows,
        total: inventory.summary.total,
        summary: inventory.summary,
      });
    } catch (err) {
      handleRouteError(err, res, "Misparented subsidiary inventory error:");
    }
  },
);
