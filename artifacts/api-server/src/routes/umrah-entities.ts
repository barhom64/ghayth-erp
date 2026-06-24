// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — COMMERCIAL/FINANCE entities for the umrah module
//
// Owns: employee-assignments.
//   (groups CRUD — list/get/create/update/delete — AND group ops (split/merge)
//    live in umrah-groups.ts — U-07 Phase 22)
//   (group service-contract — transport-requests + cost-breakdown —
//    live in umrah-group-transport.ts — U-07 Phase 23)
//   (nusk-invoices — list/get/create/update/delete + AP journal posting —
//    live in umrah-nusk-invoices.ts — U-07 Phase 19)
//   (payments + revenue reclassification — register payment / reclassify —
//    live in umrah-payments.ts — U-07 Phase 20)
//   (sales-invoices — list/generate/sales-wizard/patch —
//    live in umrah-invoices.ts — U-07 Phase 21)
//   (letters PDF + dispatch live in umrah-letters.ts — U-07 Phase 12)
//   (operational reports — daily-runsheet, reconciliation, exempt-pilgrims,
//    group/season portfolio — live in umrah-reports.ts — U-07 Phase 11)
//   (attachments — polymorphic document storage — live in
//    umrah-attachments.ts — U-07 Phase 10)
//   (sub-agent statements JSON + PDF live in umrah-statements.ts — U-07 Phase 9)
//   (import-batches listing + unlinked-rows recovery live in
//    umrah-import-batches.ts — U-07 Phase 8)
//   (pricing CRUD lives in umrah-pricing.ts — U-07 Phase 7)
//   (sub-agents CRUD + linking live in umrah-sub-agents.ts — U-07 Phase 6)
//   (commission plans/calculations live in umrah-commission.ts — U-07 Phase 5)
//
// Sister file: umrah.ts — CORE DOMAIN (lifecycle + operational)
//   Owns: seasons, agents, packages, pilgrims, transport, import,
//         daily-status, penalties, violations, agent-invoices, bulk-assign.
//
// Both mounted at /umrah with requireModule("operations") + requireGuards("financial").
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, parseId } from "../lib/errorHandler.js";
// U-07 Phase 1 — journey + recovery reports moved to a dedicated
// sub-router so the parent file shrinks. The API surface is
// unchanged: the sub-router mounts on `/` here so its paths still
// resolve at /umrah/sub-agents/:id/journey, /umrah/groups/:id/journey,
// /umrah/reports/packages-vs-allocations-pricing-drift, and
// /umrah/reports/recovery-hub.
import journeyReportsRouter from "./umrah-journey-reports.js";
// U-07 Phase 2 — families CRUD moved to a dedicated sub-router so the
// parent file shrinks further. Paths still resolve at /umrah/families/...
import familiesRouter from "./umrah-families.js";
// U-07 Phase 4 — accommodation (hotels / room-blocks / allocations) moved to
// a dedicated sub-router. Paths still resolve at /umrah/hotels, /room-blocks…
import accommodationRouter from "./umrah-accommodation.js";
// U-07 Phase 5 — employee commission plans/calculations moved to a dedicated
// sub-router. Paths still resolve at /umrah/commission-plans, /umrah/commission-calculations…
import commissionRouter from "./umrah-commission.js";
// U-07 Phase 6 — sub-agents (CRUD + linking) moved to a dedicated sub-router.
// Paths still resolve at /umrah/sub-agents/...
import subAgentsRouter from "./umrah-sub-agents.js";
// U-07 Phase 7 — pricing (CRUD) moved to a dedicated sub-router.
// Paths still resolve at /umrah/pricing...
import pricingRouter from "./umrah-pricing.js";
// U-07 Phase 8 — import-batches (listing + unlinked-rows recovery) moved to a
// dedicated sub-router. Paths still resolve at /umrah/import/batches...
import importBatchesRouter from "./umrah-import-batches.js";
// U-07 Phase 9 — sub-agent statements (JSON + PDF) moved to a dedicated
// sub-router. Paths still resolve at /umrah/statements/...
import statementsRouter from "./umrah-statements.js";
// U-07 Phase 10 — attachments (polymorphic document storage) moved to a
// dedicated sub-router. Paths still resolve at /umrah/attachments...
import attachmentsRouter from "./umrah-attachments.js";
// U-07 Phase 11 — operational reports (daily-runsheet, reconciliation,
// exempt-pilgrims, group/season portfolio) moved to a dedicated sub-router.
// Paths still resolve at /umrah/reports/...
import reportsRouter from "./umrah-reports.js";
// U-07 Phase 12 — letters (PDF + dispatch) moved to a dedicated sub-router.
// Paths still resolve at /umrah/letters/...
import lettersRouter from "./umrah-letters.js";
// U-07 Phase 14 — refund requests (lifecycle: request → approve/reject → pay →
// close) moved to a dedicated sub-router. Paths still resolve at
// /umrah/refund-requests...
import refundsRouter from "./umrah-refunds.js";
// U-07 Phase 15 — operational calendar (layer-aware event aggregator) moved to
// a dedicated sub-router. Path still resolves at /umrah/calendar/events.
import calendarRouter from "./umrah-calendar.js";
// U-07 Phase 18 — settings policies (GET catalog + PUT per-category save) moved
// to a dedicated sub-router. Paths still resolve at /umrah/settings/policies...
import settingsRouter from "./umrah-settings.js";
// U-07 Phase 19 — nusk invoices (list/get/create/update/delete + AP journal
// posting via the postNuskJournalEntries engine) moved to a dedicated
// sub-router. Paths still resolve at /umrah/nusk-invoices...
import nuskInvoicesRouter from "./umrah-nusk-invoices.js";
// U-07 Phase 20 — payments (list + register via the registerPayment engine) and
// revenue reclassification (via the reclassifyRevenueForInvoices engine) moved
// to a dedicated sub-router. Paths still resolve at /umrah/payments and
// /umrah/reclassify-revenue.
import paymentsRouter from "./umrah-payments.js";
// U-07 Phase 21 — sales-invoices (list, generate via the generateSalesInvoice
// engine, sales-wizard via listUninvoicedGroups, metadata patch) moved to a
// dedicated sub-router. Paths still resolve at /umrah/invoices, /umrah/invoices/
// generate, /umrah/sales-wizard/uninvoiced-groups and /umrah/invoices/:id.
import invoicesRouter from "./umrah-invoices.js";
// U-07 Phase 22 — groups CRUD (list/get/create/update/delete) AND group ops
// (split/merge) moved to a dedicated sub-router. split/merge ship here too
// because POST /groups/:id/split INSERTs umrah_groups — keeping every
// umrah_groups INSERT beside the issueNumber call preserves the numbering-
// coverage relationship. Paths still resolve at /umrah/groups, /umrah/groups/:id,
// /umrah/groups/:id/split and /umrah/groups/merge.
import groupsRouter from "./umrah-groups.js";
// U-07 Phase 23 — group service-contract (transport-requests + cost-breakdown)
// moved to a dedicated sub-router. Paths still resolve at
// /umrah/groups/:id/transport-requests and /umrah/groups/:id/cost-breakdown.
import groupTransportRouter from "./umrah-group-transport.js";

const router = Router();
router.use(journeyReportsRouter);
router.use(familiesRouter);
router.use(accommodationRouter);
router.use(commissionRouter);
router.use(subAgentsRouter);
router.use(pricingRouter);
router.use(importBatchesRouter);
router.use(statementsRouter);
router.use(attachmentsRouter);
router.use(reportsRouter);
router.use(lettersRouter);
router.use(refundsRouter);
router.use(calendarRouter);
router.use(settingsRouter);
router.use(nuskInvoicesRouter);
router.use(paymentsRouter);
router.use(invoicesRouter);
router.use(groupsRouter);
router.use(groupTransportRouter);

// ============================================================================
// EMPLOYEE ASSIGNMENTS (umrah-specific roles / positions)
// ============================================================================

router.get("/employees/:employeeId/assignments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const rows = await rawQuery(
      `SELECT ea.id, ea."jobTitle" AS title, ea.role, ea."branchId", ea.status
       FROM employee_assignments ea
       WHERE ea."employeeId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'
       ORDER BY ea.id DESC LIMIT 50`,
      [employeeId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Employee assignments error"); }
});

export default router;
