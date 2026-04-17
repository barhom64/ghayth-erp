import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import {
  createJournalEntry,
  getAccountCodeFromMapping,
  emitEvent,
} from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/seasons", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_seasons WHERE "companyId"=$1 ORDER BY "startDate" DESC`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List seasons error"); }
});

router.post("/seasons", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const rows = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId",title,"startDate","endDate",notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [scope.companyId, b.title, b.startDate, b.endDate, b.notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create season error"); }
});

router.patch("/seasons/:id", requirePermission("operations:update"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const b = req.body;
    if (b.status === "closed") {
      const open = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "seasonId"=$1 AND "companyId"=$2 AND status IN ('arrived','active','overstayed')`,
        [id, scope.companyId]
      );
      if (Number(open[0]?.c) > 0) {
        res.status(400).json({ error: `لا يمكن إغلاق الموسم — يوجد ${open[0].c} معتمر نشط`, blockers: [{ type: "active_pilgrims", count: Number(open[0].c) }] }); return;
      }
      const unpaid = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_agent_invoices WHERE "seasonId"=$1 AND "companyId"=$2 AND status NOT IN ('paid','cancelled')`,
        [id, scope.companyId]
      );
      if (Number(unpaid[0]?.c) > 0) {
        res.status(400).json({ error: `لا يمكن إغلاق الموسم — يوجد ${unpaid[0].c} فاتورة غير مسددة`, blockers: [{ type: "unpaid_invoices", count: Number(unpaid[0].c) }] }); return;
      }
    }
    const params: any[] = [];
    const sets: string[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_seasons SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update season error"); }
});

router.get("/agents", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_agents WHERE "companyId"=$1 ORDER BY name`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agents error"); }
});

router.post("/agents", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const rows = await rawQuery(
      `INSERT INTO umrah_agents ("companyId",name,"contactPerson",phone,email,country,"profitMargin","contractRef",currency,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, b.name, b.contactPerson, b.phone, b.email, b.country, b.profitMargin || 0, b.contractRef, b.currency || "SAR", b.notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create agent error"); }
});

router.patch("/agents/:id", requirePermission("operations:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["name","contactPerson","phone","email","country","profitMargin","contractRef","currency","status","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_agents SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update agent error"); }
});

router.get("/packages", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT p.*, s.title as "seasonTitle" FROM umrah_packages p LEFT JOIN umrah_seasons s ON p."seasonId"=s.id WHERE p."companyId"=$1 ORDER BY p.name`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List packages error"); }
});

router.post("/packages", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const rows = await rawQuery(
      `INSERT INTO umrah_packages ("companyId",name,"seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat",duration,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.name, b.seasonId, b.costPrice, b.sellPrice, b.includesTransport || false, b.includesHotel || false, b.includesMeals || false, b.includesZiyarat || false, b.duration || 7, b.description]
    );
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create package error"); }
});

router.get("/pilgrims", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, agentId, search, page = "1", limit = "20" } = req.query as any;
    let where = `p."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND p."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
    if (agentId) { params.push(agentId); where += ` AND p."agentId"=$${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (p."fullName" ILIKE $${params.length} OR p."passportNumber" ILIKE $${params.length} OR p."visaNumber" ILIKE $${params.length})`; }
    const offset = (Number(page) - 1) * Number(limit);
    const countQ = await rawQuery(`SELECT COUNT(*) as c FROM umrah_pilgrims p WHERE ${where}`, params);
    params.push(Number(limit)); params.push(offset);
    const rows = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE ${where}
       ORDER BY p."createdAt" DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total: Number(countQ[0]?.c || 0), page: Number(page), pageSize: Number(limit) });
  } catch (err) { handleRouteError(err, res, "List pilgrims error"); }
});

router.post("/pilgrims", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const rows = await rawQuery(
      `INSERT INTO umrah_pilgrims ("companyId","seasonId","agentId","packageId","fullName","passportNumber","visaNumber",nationality,gender,"dateOfBirth",phone,"arrivalDate","departureDate",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [scope.companyId, b.seasonId, b.agentId, b.packageId, b.fullName, b.passportNumber, b.visaNumber, b.nationality, b.gender, b.dateOfBirth, b.phone, b.arrivalDate, b.departureDate, b.notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create pilgrim error"); }
});

router.patch("/pilgrims/:id", requirePermission("operations:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["agentId","packageId","fullName","passportNumber","visaNumber","nationality","gender","dateOfBirth","phone","arrivalDate","departureDate","actualArrival","actualDeparture","status","hotelName","roomNumber","transportAssigned","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update pilgrim error"); }
});

router.get("/pilgrims/:id", requirePermission("operations:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName", s.title as "seasonTitle"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       LEFT JOIN umrah_seasons s ON p."seasonId"=s.id
       WHERE p.id=$1 AND p."companyId"=$2`, [req.params.id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "المعتمر غير موجود" }); return; }
    const penalties = await rawQuery(`SELECT * FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 ORDER BY "createdAt" DESC`, [req.params.id, scope.companyId]);
    res.json({ ...row, penalties });
  } catch (err) { handleRouteError(err, res, "Get pilgrim error"); }
});

router.post("/import", requirePermission("operations:create"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileType, fileName } = req.body;
    if (!seasonId || !Array.isArray(importRows) || importRows.length === 0) {
      res.status(400).json({ error: "بيانات الاستيراد غير مكتملة" }); return;
    }

    const { insertId: logId } = await rawExecute(
      `INSERT INTO umrah_import_logs ("companyId","seasonId","userId","fileName","fileType","totalRows","newRecords","updatedRecords","duplicateRecords","errorRecords",errors,status)
       VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0,'[]','processing') RETURNING id`,
      [scope.companyId, seasonId, scope.userId, fileName || "import", fileType || "excel", importRows.length]
    );

    const BATCH_SIZE = 100;
    let newCount = 0, updateCount = 0, dupCount = 0, errCount = 0;
    const errors: any[] = [];

    for (let batchStart = 0; batchStart < importRows.length; batchStart += BATCH_SIZE) {
      const batch = importRows.slice(batchStart, batchStart + BATCH_SIZE);

      const passportNumbers = batch
        .filter((r: any) => r.passportNumber)
        .map((r: any) => r.passportNumber as string);

      const existingRows = passportNumbers.length > 0
        ? await rawQuery<any>(
            `SELECT id, "passportNumber" FROM umrah_pilgrims WHERE "companyId"=$1 AND "seasonId"=$2 AND "passportNumber" = ANY($3)`,
            [scope.companyId, seasonId, passportNumbers]
          )
        : [];
      const existingMap = new Map<string, number>(existingRows.map((r: any) => [r.passportNumber, r.id]));

      for (let i = 0; i < batch.length; i++) {
        const globalRow = batchStart + i;
        const r = batch[i];
        if (!r.passportNumber || !r.fullName) {
          errCount++;
          errors.push({ row: globalRow + 1, error: "بيانات ناقصة" });
          continue;
        }

        if (existingMap.has(r.passportNumber)) {
          const existingId = existingMap.get(r.passportNumber)!;
          const sets: string[] = [];
          const params: any[] = [];
          for (const key of ["fullName","visaNumber","nationality","gender","phone","arrivalDate","departureDate","agentId","hotelName","roomNumber"]) {
            if (r[key] !== undefined && r[key] !== null && r[key] !== "") {
              params.push(r[key]);
              sets.push(`"${key}"=$${params.length}`);
            }
          }
          if (sets.length > 0) {
            sets.push(`"updatedAt"=NOW()`);
            params.push(existingId);
            await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length}`, params);
            updateCount++;
          } else {
            dupCount++;
          }
        } else {
          try {
            await rawExecute(
              `INSERT INTO umrah_pilgrims ("companyId","seasonId","agentId","fullName","passportNumber","visaNumber",nationality,gender,phone,"arrivalDate","departureDate","hotelName","roomNumber")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [scope.companyId, seasonId, r.agentId || null, r.fullName, r.passportNumber, r.visaNumber || null, r.nationality || null, r.gender || null, r.phone || null, r.arrivalDate || null, r.departureDate || null, r.hotelName || null, r.roomNumber || null]
            );
            newCount++;
          } catch (insertErr: any) {
            errCount++;
            errors.push({ row: globalRow + 1, error: insertErr?.message ?? "خطأ في الإدراج" });
          }
        }
      }

      const processed = Math.min(batchStart + BATCH_SIZE, importRows.length);
      await rawExecute(
        `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6 WHERE id=$7`,
        [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), processed, logId]
      ).catch(() => {});
    }

    await rawExecute(
      `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6,status='completed' WHERE id=$7`,
      [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), importRows.length, logId]
    );

    res.json({ importLogId: logId, total: importRows.length, new: newCount, updated: updateCount, duplicates: dupCount, errors: errCount, errorDetails: errors });
  } catch (err) { handleRouteError(err, res, "Import error"); }
});

router.get("/dashboard", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let seasonFilter = "";
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); seasonFilter = ` AND "seasonId"=$${params.length}`; }
    const stats = await rawQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='arrived') as arrived,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='overstayed') as overstayed,
        COUNT(*) FILTER (WHERE status='departed') as departed,
        COUNT(*) FILTER (WHERE status='violated') as violated,
        COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
        COUNT(*) FILTER (WHERE "agentId" IS NULL) as unassigned
      FROM umrah_pilgrims WHERE "companyId"=$1${seasonFilter}
    `, params);
    const penaltyStats = await rawQuery(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(amount),0) as "totalAmount",
        COUNT(*) FILTER (WHERE status='pending') as pending
      FROM umrah_penalties WHERE "companyId"=$1${seasonFilter}
    `, params);
    const agentStats = await rawQuery(`
      SELECT a.id, a.name, COUNT(p.id) as "pilgrimCount",
        COUNT(p.id) FILTER (WHERE p.status='overstayed') as "overstayedCount"
      FROM umrah_agents a
      LEFT JOIN umrah_pilgrims p ON p."agentId"=a.id AND p."companyId"=$1${seasonFilter}
      WHERE a."companyId"=$1 AND a.status='active'
      GROUP BY a.id, a.name ORDER BY "pilgrimCount" DESC LIMIT 10
    `, params);
    const recentArrivals = await rawQuery(`
      SELECT id,"fullName","passportNumber",nationality,"actualArrival",status
      FROM umrah_pilgrims WHERE "companyId"=$1${seasonFilter} AND "actualArrival" IS NOT NULL
      ORDER BY "actualArrival" DESC LIMIT 10
    `, params);
    res.json({
      pilgrims: stats[0],
      penalties: penaltyStats[0],
      topAgents: agentStats,
      recentArrivals
    });
  } catch (err) { handleRouteError(err, res, "Dashboard error"); }
});

router.post("/run-daily-status", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const today = new Date().toISOString().split("T")[0];
    const arrived = await rawExecute(
      `UPDATE umrah_pilgrims SET status='arrived', "actualArrival"=$1, "updatedAt"=NOW()
       WHERE "companyId"=$2 AND status='pending' AND "arrivalDate" <= $1 AND ("departureDate" IS NULL OR "departureDate" >= $1)`,
      [today, scope.companyId]
    );
    const overstayed = await rawExecute(
      `UPDATE umrah_pilgrims SET status='overstayed', "updatedAt"=NOW()
       WHERE "companyId"=$1 AND status IN ('arrived','active') AND "departureDate" < $2 AND "actualDeparture" IS NULL`,
      [scope.companyId, today]
    );
    const departed = await rawExecute(
      `UPDATE umrah_pilgrims SET status='departed', "updatedAt"=NOW()
       WHERE "companyId"=$1 AND status IN ('arrived','active') AND "actualDeparture" IS NOT NULL AND "actualDeparture" <= $2`,
      [scope.companyId, today]
    );
    res.json({ date: today, arrivedUpdated: arrived, overstayedUpdated: overstayed, departedUpdated: departed });
  } catch (err) { handleRouteError(err, res, "Daily status error"); }
});

router.post("/run-penalty-engine", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { overstayDays = 3, dailyRate = 500 } = req.body;
    const today = new Date().toISOString().split("T")[0];
    const overstayed = await rawQuery(
      `SELECT p.id, p."passportNumber", p."fullName", p."agentId", p."seasonId", p."departureDate",
        ($1::date - p."departureDate"::date) as "daysOver"
       FROM umrah_pilgrims p
       WHERE p."companyId"=$2 AND p.status='overstayed' AND p."departureDate" < $1
         AND NOT EXISTS (SELECT 1 FROM umrah_penalties pen WHERE pen."pilgrimId"=p.id AND pen.type='overstay' AND pen.status IN ('pending','invoiced'))`,
      [today, scope.companyId]
    );
    let created = 0;
    for (const p of overstayed) {
      if (Number(p.daysOver) >= overstayDays) {
        const amount = Number(p.daysOver) * dailyRate;
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,"daysOverstayed",amount,notes)
             VALUES ($1,$2,$3,$4,'overstay',$5,$6,$7)`,
            [scope.companyId, p.id, p.agentId, p.seasonId, p.daysOver, amount, `غرامة تأخر ${p.daysOver} يوم — ${p.fullName}`]
          );
          await client.query(
            `UPDATE umrah_pilgrims SET status='overstay_penalized' WHERE id=$1 AND "companyId"=$2 AND status='overstayed'`,
            [p.id, scope.companyId]
          );
        });
        created++;
      }
    }
    res.json({ checked: overstayed.length, penaltiesCreated: created });
  } catch (err) { handleRouteError(err, res, "Penalty engine error"); }
});

router.get("/penalties", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status } = req.query as any;
    let where = `pen."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND pen."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND pen.status=$${params.length}`; }
    const rows = await rawQuery(
      `SELECT pen.*, p."fullName" as "pilgrimName", p."passportNumber", a.name as "agentName"
       FROM umrah_penalties pen
       LEFT JOIN umrah_pilgrims p ON pen."pilgrimId"=p.id
       LEFT JOIN umrah_agents a ON pen."agentId"=a.id
       WHERE ${where} ORDER BY pen."createdAt" DESC`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List penalties error"); }
});

router.post("/agent-invoices/generate", requirePermission("operations:create"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = req.body;
    if (!agentId || !seasonId) { res.status(400).json({ error: "الوكيل والموسم مطلوبان" }); return; }
    const pilgrims = await rawQuery(
      `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3`,
      [agentId, seasonId, scope.companyId]
    );
    const pilgrimCount = Number(pilgrims[0]?.c || 0);
    if (pilgrimCount === 0) { res.status(400).json({ error: "لا يوجد معتمرين لهذا الوكيل في هذا الموسم" }); return; }
    const [agent] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2`, [agentId, scope.companyId]);
    if (!agent) { res.status(404).json({ error: "الوكيل غير موجود" }); return; }
    const penalties = await rawQuery(
      `SELECT COALESCE(SUM(amount),0) as total FROM umrah_penalties WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND status='pending'`,
      [agentId, seasonId, scope.companyId]
    );
    const penaltiesTotal = Number(penalties[0]?.total || 0);
    const pkgCosts = await rawQuery(
      `SELECT COALESCE(SUM(pkg."sellPrice"),0) as "servicesTotal"
       FROM umrah_pilgrims p
       JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE p."agentId"=$1 AND p."seasonId"=$2 AND p."companyId"=$3`,
      [agentId, seasonId, scope.companyId]
    );
    const servicesTotal = Number(pkgCosts[0]?.servicesTotal || 0);
    const subtotal = servicesTotal + penaltiesTotal;
    const commission = subtotal * (Number(agent?.profitMargin || 0) / 100);
    const total = subtotal - commission;
    const ref = `UMRAH-INV-${Date.now().toString(36).toUpperCase()}`;
    const rows = await rawQuery(
      `INSERT INTO umrah_agent_invoices ("companyId","agentId","seasonId",ref,type,"pilgrimCount","penaltiesTotal","servicesTotal",subtotal,commission,total,status)
       VALUES ($1,$2,$3,$4,'sales',$5,$6,$7,$8,$9,$10,'draft') RETURNING *`,
      [scope.companyId, agentId, seasonId, ref, pilgrimCount, penaltiesTotal, servicesTotal, subtotal, commission, total]
    );
    if (penaltiesTotal > 0) {
      await rawExecute(
        `UPDATE umrah_penalties SET status='invoiced', "invoiceId"=$1 WHERE "agentId"=$2 AND "seasonId"=$3 AND "companyId"=$4 AND status='pending'`,
        [rows[0].id, agentId, seasonId, scope.companyId]
      );
    }

    try {
      const arCode = await getAccountCodeFromMapping(scope.companyId, "umrah_agent_receivable", "debit", "1210");
      const revenueCode = await getAccountCodeFromMapping(scope.companyId, "umrah_revenue", "credit", "4200");
      const penaltyCode = await getAccountCodeFromMapping(scope.companyId, "umrah_penalty_revenue", "credit", "4210");
      const commissionCode = await getAccountCodeFromMapping(scope.companyId, "umrah_commission", "debit", "5200");

      const glLines: any[] = [
        { accountCode: arCode, debit: total, credit: 0, description: `ذمم وكيل عمرة — ${agent.name}`, vendorId: agentId },
      ];
      if (servicesTotal > 0) {
        glLines.push({ accountCode: revenueCode, debit: 0, credit: servicesTotal, description: `إيراد خدمات عمرة — ${agent.name}` });
      }
      if (penaltiesTotal > 0) {
        glLines.push({ accountCode: penaltyCode, debit: 0, credit: penaltiesTotal, description: `إيراد غرامات تأخر — ${agent.name}` });
      }
      if (commission > 0) {
        glLines.push({ accountCode: commissionCode, debit: commission, credit: 0, description: `عمولة وكيل — ${agent.name}` });
      }

      const journalId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        createdBy: scope.userId,
        ref: `UMRAH-GL-${ref}`,
        description: `قيد فاتورة وكيل عمرة — ${agent.name}`,
        sourceType: "umrah_agent_invoice",
        sourceId: rows[0].id,
        lines: glLines,
      });

      await rawExecute(
        `UPDATE umrah_agent_invoices SET "journalEntryId"=$1 WHERE id=$2`,
        [journalId, rows[0].id]
      ).catch(() => {});

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.invoice.gl_posted",
        entity: "umrah_agent_invoices",
        entityId: rows[0].id,
        details: JSON.stringify({ journalId, total, servicesTotal, penaltiesTotal, commission }),
      }).catch(console.error);
    } catch (glErr) {
      console.error("[umrah] GL posting failed for agent invoice", rows[0].id, glErr);
    }

    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Generate invoice error"); }
});

router.get("/agent-invoices", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = req.query as any;
    let where = `i."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (agentId) { params.push(agentId); where += ` AND i."agentId"=$${params.length}`; }
    if (seasonId) { params.push(seasonId); where += ` AND i."seasonId"=$${params.length}`; }
    const rows = await rawQuery(
      `SELECT i.*, a.name as "agentName", s.title as "seasonTitle"
       FROM umrah_agent_invoices i
       LEFT JOIN umrah_agents a ON i."agentId"=a.id
       LEFT JOIN umrah_seasons s ON i."seasonId"=s.id
       WHERE ${where} ORDER BY i."createdAt" DESC`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agent invoices error"); }
});

router.get("/transport", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_transport WHERE "companyId"=$1 ORDER BY "tripDate" DESC`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List transport error"); }
});

router.post("/transport", requirePermission("operations:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const rows = await rawQuery(
      `INSERT INTO umrah_transport ("companyId","seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId",capacity,"pilgrimCount",cost,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.seasonId, b.tripDate, b.fromLocation, b.toLocation, b.vehicleId, b.driverId, b.capacity || 45, b.pilgrimCount || 0, b.cost || 0, b.notes]
    );

    const tripCost = Number(b.cost || 0);
    if (tripCost > 0) {
      try {
        const transportExpenseCode = await getAccountCodeFromMapping(scope.companyId, "umrah_transport_expense", "debit", "5300");
        const cashCode = await getAccountCodeFromMapping(scope.companyId, "umrah_transport_payable", "credit", "2100");
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId || 0,
          createdBy: scope.userId,
          ref: `UMRAH-TRN-${rows[0].id}`,
          description: `مصروف نقل عمرة — ${b.fromLocation} → ${b.toLocation}`,
          sourceType: "umrah_transport",
          sourceId: rows[0].id,
          lines: [
            { accountCode: transportExpenseCode, debit: tripCost, credit: 0, description: `مصروف نقل — ${b.fromLocation} → ${b.toLocation}`, vehicleId: b.vehicleId || undefined, driverId: b.driverId || undefined },
            { accountCode: cashCode, debit: 0, credit: tripCost, description: `مستحقات نقل عمرة` },
          ],
        });
      } catch (glErr) {
        console.error("[umrah] GL posting failed for transport", rows[0].id, glErr);
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create transport error"); }
});

router.get("/import-logs", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_import_logs WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 50`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import logs error"); }
});

router.get("/unassigned", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `"companyId"=$1 AND "agentId" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND "seasonId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE ${where} ORDER BY "createdAt" DESC`, params);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List unassigned error"); }
});

router.post("/assign-bulk", requirePermission("operations:create"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { pilgrimIds, agentId } = req.body;
    if (!agentId || !Array.isArray(pilgrimIds) || pilgrimIds.length === 0) {
      res.status(400).json({ error: "بيانات التوزيع غير مكتملة" }); return;
    }
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 3}`).join(",");
    await rawExecute(
      `UPDATE umrah_pilgrims SET "agentId"=$1, "updatedAt"=NOW() WHERE "companyId"=$2 AND id IN (${placeholders})`,
      [agentId, scope.companyId, ...pilgrimIds]
    );
    res.json({ assigned: pilgrimIds.length, agentId });
  } catch (err) { handleRouteError(err, res, "Bulk assign error"); }
});

export default router;
