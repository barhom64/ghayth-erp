import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import dns from "node:dns/promises";

function isPrivateIP(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0" || ip === "::") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

const router = Router();
router.use(authMiddleware);

const GOV_ADMIN_ROLES = ["owner", "admin", "general_manager", "hr_manager", "operations"];
const GOV_READ_ROLES = [...GOV_ADMIN_ROLES, "finance_manager", "branch_manager", "supervisor"];

function requireGovAdmin(scope: any, res: any): boolean {
  if (!scope || !GOV_ADMIN_ROLES.includes(scope.role)) {
    res.status(403).json({ error: "ليس لديك صلاحية الوصول لإعدادات التكاملات الحكومية" });
    return false;
  }
  return true;
}

function requireGovRead(scope: any, res: any): boolean {
  if (!scope || !GOV_READ_ROLES.includes(scope.role)) {
    res.status(403).json({ error: "ليس لديك صلاحية عرض التكاملات الحكومية" });
    return false;
  }
  return true;
}

const GOV_SYSTEM_NAMES: Record<string, string> = {
  muqeem: "نظام مقيم — إدارة الإقامات",
  tam: "نظام تم — المركبات والاستمارات",
  absher_business: "أبشر أعمال",
};

function maskConfig(config: any): any {
  if (!config || typeof config !== "object") return {};
  const masked: any = {};
  for (const [key, val] of Object.entries(config)) {
    if ((key === "apiKey" || key === "password" || key === "secret") && typeof val === "string" && val.length > 4) {
      masked[key] = val.slice(0, 2) + "****" + val.slice(-2);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

const GOV_SAFE_COLUMNS = `id, "companyId", type, name, status, enabled, "lastCheckedAt", "lastCheckStatus", "lastCheckMessage", "createdAt", "updatedAt"`;

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovRead(scope, res)) return;
    const rows = await rawQuery<any>(
      `SELECT ${GOV_SAFE_COLUMNS}, config FROM gov_integrations WHERE "companyId" = $1 ORDER BY type ASC`,
      [scope.companyId]
    );
    if (rows.length === 0) {
      for (const type of ["muqeem", "tam", "absher_business"]) {
        await rawExecute(
          `INSERT INTO gov_integrations ("companyId", type, name, status, enabled) VALUES ($1, $2, $3, 'inactive', false) ON CONFLICT ("companyId", type) DO NOTHING`,
          [scope.companyId, type, GOV_SYSTEM_NAMES[type]]
        );
      }
      const fresh = await rawQuery<any>(
        `SELECT ${GOV_SAFE_COLUMNS}, config FROM gov_integrations WHERE "companyId" = $1 ORDER BY type ASC`,
        [scope.companyId]
      );
      res.json({ data: fresh.map((r: any) => ({ ...r, config: maskConfig(r.config) })) });
      return;
    }
    res.json({ data: rows.map((r: any) => ({ ...r, config: maskConfig(r.config) })) });
  } catch (err) { handleRouteError(err, res, "Gov integrations list error:"); }
});

router.put("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovAdmin(scope, res)) return;
    const id = Number(req.params.id);
    const { config, enabled, status } = req.body;

    const [existing] = await rawQuery<any>(
      `SELECT * FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "التكامل غير موجود" }); return; }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];

    if (config !== undefined) {
      let mergedConfig = config;
      if (existing.config && typeof existing.config === "object" && typeof config === "object") {
        mergedConfig = { ...existing.config };
        for (const [key, val] of Object.entries(config)) {
          if (typeof val === "string" && /^\w{2}\*{4}\w{2}$/.test(val)) continue;
          (mergedConfig as any)[key] = val;
        }
      }
      params.push(JSON.stringify(mergedConfig)); sets.push(`config=$${params.length}`);
    }
    if (enabled !== undefined) {
      params.push(!!enabled); sets.push(`enabled=$${params.length}`);
      params.push(enabled ? "active" : "inactive"); sets.push(`status=$${params.length}`);
    }
    if (status !== undefined && enabled === undefined) { params.push(status); sets.push(`status=$${params.length}`); }

    params.push(id);
    await rawExecute(
      `UPDATE gov_integrations SET ${sets.join(",")} WHERE id=$${params.length}`,
      params
    );

    const [updated] = await rawQuery<any>(`SELECT * FROM gov_integrations WHERE id=$1`, [id]);
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Gov integration update error:"); }
});

router.post("/:id/test", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovAdmin(scope, res)) return;
    const id = Number(req.params.id);

    const [integration] = await rawQuery<any>(
      `SELECT * FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!integration) { res.status(404).json({ error: "التكامل غير موجود" }); return; }

    const config = integration.config || {};
    const hasApiKey = config.apiKey && String(config.apiKey).length > 3;
    const hasUrl = config.baseUrl || config.url;

    let checkStatus: string;
    let checkMessage: string;

    if (!hasApiKey) {
      checkStatus = "error";
      checkMessage = "لم يتم تكوين مفتاح API — أدخل بيانات الاعتماد أولاً";
    } else if (!hasUrl) {
      checkStatus = "error";
      checkMessage = "رابط الخدمة (Base URL) غير مكوّن";
    } else {
      const urlStr = String(config.baseUrl || config.url);
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch {
        checkStatus = "error";
        checkMessage = "رابط الخدمة غير صالح — يجب أن يبدأ بـ https://";
        await rawExecute(
          `UPDATE gov_integrations SET "lastCheckedAt"=NOW(), "lastCheckStatus"=$2, "lastCheckMessage"=$3, "updatedAt"=NOW() WHERE id=$1`,
          [id, checkStatus, checkMessage]
        );
        res.json({ success: false, status: checkStatus, message: checkMessage, checkedAt: new Date().toISOString() });
        return;
      }

      if (parsedUrl.protocol !== "https:") {
        checkStatus = "error";
        checkMessage = "يجب استخدام بروتوكول HTTPS فقط";
      } else if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.)/.test(parsedUrl.hostname) || parsedUrl.hostname === "::1" || parsedUrl.hostname.startsWith("[")) {
        checkStatus = "error";
        checkMessage = "لا يُسمح بالاتصال بعناوين داخلية/محلية";
      } else {
        let resolvedPrivate = false;
        try {
          const addresses = await dns.resolve4(parsedUrl.hostname).catch(() => []);
          const addresses6 = await dns.resolve6(parsedUrl.hostname).catch(() => []);
          const allAddrs = [...addresses, ...addresses6];
          if (allAddrs.some(isPrivateIP)) resolvedPrivate = true;
        } catch { /* DNS resolution failure handled by fetch below */ }
        if (resolvedPrivate) {
          checkStatus = "error";
          checkMessage = "عنوان DNS يشير إلى شبكة داخلية — غير مسموح";
        } else {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(urlStr, {
            method: "GET",
            headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
            signal: controller.signal,
            redirect: "manual",
          });
          clearTimeout(timeout);
          if (resp.ok || resp.status === 401 || resp.status === 403) {
            checkStatus = resp.ok ? "connected" : "auth_error";
            checkMessage = resp.ok
              ? "الاتصال ناجح"
              : `خطأ في المصادقة (${resp.status}) — تحقق من مفتاح API`;
          } else {
            checkStatus = "error";
            checkMessage = `خطأ من الخدمة: HTTP ${resp.status}`;
          }
        } catch (fetchErr: any) {
          checkStatus = "error";
          checkMessage = fetchErr.name === "AbortError"
            ? "انتهت مهلة الاتصال — تحقق من رابط الخدمة"
            : `فشل الاتصال: ${fetchErr.message}`;
        }
        }
      }
    }

    await rawExecute(
      `UPDATE gov_integrations SET "lastCheckedAt"=NOW(), "lastCheckStatus"=$2, "lastCheckMessage"=$3, "updatedAt"=NOW() WHERE id=$1`,
      [id, checkStatus, checkMessage]
    );

    res.json({
      success: checkStatus === "connected",
      status: checkStatus,
      message: checkMessage,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) { handleRouteError(err, res, "Gov integration test error:"); }
});

router.get("/expiring/iqama", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovRead(scope, res)) return;
    const days = Number(req.query.days) || 30;
    const rows = await rawQuery<any>(
      `SELECT e.id, e.name, e."empNumber", e."iqamaNumber", e."iqamaExpiry",
              e."borderNumber", e."visaNumber", e."visaType", e."visaExpiry",
              e."workPermitNumber", e."workPermitExpiry", e."iqamaStatus",
              (e."iqamaExpiry"::date - CURRENT_DATE) AS "iqamaDaysLeft",
              (e."visaExpiry"::date - CURRENT_DATE) AS "visaDaysLeft",
              (e."workPermitExpiry"::date - CURRENT_DATE) AS "workPermitDaysLeft",
              ea."jobTitle", ea."branchId", b.name AS "branchName"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       LEFT JOIN branches b ON b.id = ea."branchId"
       WHERE ea."companyId" = $1 AND e.status = 'active'
         AND (
           (e."iqamaExpiry" IS NOT NULL AND e."iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL)
           OR (e."visaExpiry" IS NOT NULL AND e."visaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL)
           OR (e."workPermitExpiry" IS NOT NULL AND e."workPermitExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL)
         )
       ORDER BY LEAST(e."iqamaExpiry", e."visaExpiry", e."workPermitExpiry") ASC`,
      [scope.companyId, days]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Expiring iqama error:"); }
});

router.get("/expiring/registration", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovRead(scope, res)) return;
    const days = Number(req.query.days) || 30;
    const rows = await rawQuery<any>(
      `SELECT fv.id, fv."plateNumber", fv.make, fv.model, fv.year,
              fv."registrationNumber", fv."registrationExpiry",
              fv."inspectionDate", fv."nextInspectionDate", fv."plateType",
              (fv."registrationExpiry"::date - CURRENT_DATE) AS "registrationDaysLeft",
              (fv."nextInspectionDate"::date - CURRENT_DATE) AS "inspectionDaysLeft"
       FROM fleet_vehicles fv
       WHERE fv."companyId" = $1 AND fv.status != 'decommissioned'
         AND (
           (fv."registrationExpiry" IS NOT NULL AND fv."registrationExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL)
           OR (fv."nextInspectionDate" IS NOT NULL AND fv."nextInspectionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL)
         )
       ORDER BY LEAST(fv."registrationExpiry", fv."nextInspectionDate") ASC`,
      [scope.companyId, days]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Expiring registration error:"); }
});

router.get("/links", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovRead(scope, res)) return;
    const { entityType, entityId } = req.query as any;
    const conditions = [`gl."companyId" = $1`];
    const params: any[] = [scope.companyId];

    if (entityType) { params.push(entityType); conditions.push(`gl."entityType" = $${params.length}`); }
    if (entityId) { params.push(Number(entityId)); conditions.push(`gl."entityId" = $${params.length}`); }

    const rows = await rawQuery<any>(
      `SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName"
       FROM gov_integration_links gl
       JOIN gov_integrations gi ON gi.id = gl."integrationId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY gl."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Gov links list error:"); }
});

router.post("/links", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovAdmin(scope, res)) return;
    const { integrationId, entityType, entityId, externalRef, enabled, notes } = req.body;

    if (!integrationId || !entityType || !entityId) {
      res.status(400).json({ error: "integrationId و entityType و entityId مطلوبة" });
      return;
    }

    const [integration] = await rawQuery<any>(
      `SELECT id FROM gov_integrations WHERE id = $1 AND "companyId" = $2`,
      [integrationId, scope.companyId]
    );
    if (!integration) { res.status(404).json({ error: "التكامل غير موجود" }); return; }

    const { insertId } = await rawExecute(
      `INSERT INTO gov_integration_links ("integrationId","companyId","entityType","entityId","externalRef",enabled,notes,"syncStatus")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       ON CONFLICT ("companyId", "integrationId", "entityType", "entityId") DO NOTHING`,
      [integrationId, scope.companyId, entityType, Number(entityId), externalRef || null, enabled !== false, notes || null]
    );

    if (insertId) {
      const [row] = await rawQuery<any>(`SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" WHERE gl.id=$1`, [insertId]);
      res.status(201).json(row);
    } else {
      const [existing] = await rawQuery<any>(
        `SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" WHERE gl."companyId" = $1 AND gl."integrationId" = $2 AND gl."entityType" = $3 AND gl."entityId" = $4`,
        [scope.companyId, integrationId, entityType, Number(entityId)]
      );
      res.status(200).json(existing);
    }
  } catch (err) { handleRouteError(err, res, "Gov link create error:"); }
});

router.patch("/links/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovAdmin(scope, res)) return;
    const id = Number(req.params.id);
    const { enabled, externalRef, syncStatus, notes } = req.body;

    const [existing] = await rawQuery<any>(
      `SELECT gl.id FROM gov_integration_links gl WHERE gl.id = $1 AND gl."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "الربط غير موجود" }); return; }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (enabled !== undefined) { params.push(!!enabled); sets.push(`enabled=$${params.length}`); }
    if (externalRef !== undefined) { params.push(externalRef); sets.push(`"externalRef"=$${params.length}`); }
    if (syncStatus !== undefined) { params.push(syncStatus); sets.push(`"syncStatus"=$${params.length}`); }
    if (notes !== undefined) { params.push(notes); sets.push(`notes=$${params.length}`); }

    params.push(id);
    await rawExecute(`UPDATE gov_integration_links SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    const [row] = await rawQuery<any>(`SELECT gl.*, gi.type AS "integrationType", gi.name AS "integrationName" FROM gov_integration_links gl JOIN gov_integrations gi ON gi.id = gl."integrationId" WHERE gl.id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Gov link update error:"); }
});

router.delete("/links/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireGovAdmin(scope, res)) return;
    const id = Number(req.params.id);
    await rawExecute(
      `DELETE FROM gov_integration_links WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Gov link delete error:"); }
});

export const govIntegrationsRouter = router;
