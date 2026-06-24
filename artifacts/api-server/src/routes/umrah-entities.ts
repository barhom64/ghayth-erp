// ─────────────────────────────────────────────────────────────────────────────
// umrah-entities.ts — UMRAH COMMERCIAL/FINANCE AGGREGATOR
//
// Pure aggregator: this file owns NO routes of its own. It mounts the umrah
// commercial/finance sub-routers so they all resolve under /umrah alongside the
// CORE-domain routes in the sister file umrah.ts. Every former responsibility
// was carved into a dedicated sub-router across U-07 Phases 1–24 (the original
// 5,443-line monolith). Listed below by phase for traceability:
//   employee-assignments      → umrah-employee-assignments.ts   (Phase 24)
//   group service-contract     → umrah-group-transport.ts        (Phase 23)
//   groups CRUD + split/merge   → umrah-groups.ts                 (Phase 22)
//   sales-invoices              → umrah-invoices.ts               (Phase 21)
//   payments + reclassify       → umrah-payments.ts               (Phase 20)
//   nusk-invoices (+ AP JE)     → umrah-nusk-invoices.ts          (Phase 19)
//   settings policies           → umrah-settings.ts               (Phase 18)
//   operational calendar        → umrah-calendar.ts               (Phase 15)
//   refund requests             → umrah-refunds.ts                (Phase 14)
//   letters PDF + dispatch      → umrah-letters.ts                (Phase 12)
//   operational reports         → umrah-reports.ts                (Phase 11)
//   attachments                 → umrah-attachments.ts            (Phase 10)
//   sub-agent statements        → umrah-statements.ts             (Phase 9)
//   import-batches              → umrah-import-batches.ts         (Phase 8)
//   pricing CRUD                → umrah-pricing.ts                (Phase 7)
//   sub-agents CRUD + linking   → umrah-sub-agents.ts             (Phase 6)
//   commission plans/calcs      → umrah-commission.ts             (Phase 5)
//   accommodation               → umrah-accommodation.ts          (Phase 4)
//   families CRUD               → umrah-families.ts               (Phase 2)
//   journey + recovery reports  → umrah-journey-reports.ts        (Phase 1)
//
// Sister file: umrah.ts — CORE DOMAIN (lifecycle + operational)
//   Owns: seasons, agents, packages, pilgrims, transport, import,
//         daily-status, penalties, violations, agent-invoices, bulk-assign.
//
// Both mounted at /umrah with requireModule("operations") + requireGuards("financial").
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
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
// U-07 Phase 24 — employee-assignments (the final carve) moved to a dedicated
// sub-router. Path still resolves at /umrah/employees/:employeeId/assignments.
import employeeAssignmentsRouter from "./umrah-employee-assignments.js";

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
router.use(employeeAssignmentsRouter);

export default router;
