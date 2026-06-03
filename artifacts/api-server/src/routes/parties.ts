import { Router } from "express";
import { handleRouteError, ValidationError, parseId } from "../lib/errorHandler.js";
import { authorize } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";
import { getParty360, backfillCompany, PARTY_SOURCES } from "../lib/partyService.js";
import { rawQuery } from "../lib/rawdb.js";

const router = Router();

// GET /parties/:id/360 — the "one person across all tables" view.
router.get("/:id/360", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const view = await getParty360(scope.companyId, id);
    if (!view) throw new ValidationError("الطرف غير موجود");
    res.json(view);
  } catch (err) { handleRouteError(err, res, "party 360"); }
});

// GET /parties/resolve?entityTable=employees&entityId=12 — which party is this row?
router.get("/resolve", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const entityTable = String(req.query.entityTable || "");
    const entityId = Number(req.query.entityId);
    if (!PARTY_SOURCES.some((s) => s.table === entityTable)) throw new ValidationError("جدول غير مدعوم");
    if (!Number.isInteger(entityId)) throw new ValidationError("entityId مطلوب");
    const [row] = await rawQuery<{ partyId: number }>(
      `SELECT "partyId" FROM party_links WHERE "companyId"=$1 AND "entityTable"=$2 AND "entityId"=$3 LIMIT 1`,
      [scope.companyId, entityTable, entityId],
    );
    res.json({ partyId: row?.partyId ?? null });
  } catch (err) { handleRouteError(err, res, "party resolve"); }
});

// POST /parties/backfill — operator-triggered population for the active company.
// Admin/owner only; idempotent (only fills gaps).
router.post("/backfill", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const results = await backfillCompany(scope.companyId);
    const totals = results.reduce((a, r) => ({ scanned: a.scanned + r.scanned, linked: a.linked + r.linked }), { scanned: 0, linked: 0 });
    logger.info({ companyId: scope.companyId, totals }, "[parties] backfill complete");
    res.json({ companyId: scope.companyId, totals, perTable: results });
  } catch (err) { handleRouteError(err, res, "party backfill"); }
});

export default router;
