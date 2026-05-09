import { Request, Response, NextFunction } from "express";
import { rawExecute, rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

const SKIP_PATHS = new Set([
  "/health", "/api/health", "/favicon.ico",
]);

const SKIP_PREFIXES = [
  "/intelligence/activity",
  "/api/intelligence/activity",
];

export function activityTrackerMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const path = req.path;
    if (SKIP_PATHS.has(path)) return next();
    if (SKIP_PREFIXES.some(p => path.startsWith(p))) return next();

    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const scope = req.scope;
      if (!scope?.companyId) return;
      setImmediate(async () => {
        try {
          await rawExecute(
            `INSERT INTO user_activity_log ("companyId","userId","assignmentId","sessionId",action,entity,method,path,"durationMs","ipAddress","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
            [
              scope.companyId,
              scope.userId ?? null,
              scope.activeAssignmentId ?? null,
              (req.headers["x-session-id"] as string) ?? null,
              req.method.toLowerCase(),
              extractEntity(req.path),
              req.method,
              req.path.substring(0, 499),
              duration,
              req.ip ?? null,
            ]
          );
        } catch (e) { logger.error(e, "activity tracker insert error"); }
      });
    });
    next();
  };
}

function extractEntity(path: string): string {
  let cleaned = path;
  if (cleaned.startsWith("/api/")) cleaned = cleaned.substring(4);
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length === 0) return "root";
  return parts[0];
}

export async function logPageView(params: {
  companyId: number;
  userId: number;
  assignmentId: number;
  page: string;
  sessionId?: string;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO user_activity_log ("companyId","userId","assignmentId","sessionId",page,action,method,path,"createdAt")
       VALUES ($1,$2,$3,$4,$5,'page_view','GET',$5,NOW())`,
      [params.companyId, params.userId, params.assignmentId,
       params.sessionId ?? null, params.page]
    );
  } catch (e) { logger.error(e, "page view log error"); }
}

export async function getUsageStats(companyId: number, days: number = 30): Promise<{
  topPages: { page: string; visits: number }[];
  peakHours: { hour: number; count: number }[];
  topUsers: { userId: number; name: string; count: number }[];
  moduleUsage: { module: string; count: number }[];
  dailyActivity: { date: string; count: number }[];
  repeatedActions: { userId: number; name: string; entity: string; method: string; count: number }[];
}> {
  const since = `NOW() - INTERVAL '1 day' * $2`;

  const topPages = await rawQuery<any>(
    `SELECT COALESCE(page, path, entity) AS page, COUNT(*)::int AS visits
     FROM user_activity_log
     WHERE "companyId"=$1 AND "createdAt" >= ${since}
     GROUP BY COALESCE(page, path, entity)
     ORDER BY visits DESC
     LIMIT 10`,
    [companyId, days]
  ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

  const peakHours = await rawQuery<any>(
    `SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*)::int AS count
     FROM user_activity_log
     WHERE "companyId"=$1 AND "createdAt" >= ${since}
     GROUP BY hour
     ORDER BY hour`,
    [companyId, days]
  ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

  const topUsers = await rawQuery<any>(
      `SELECT ual."userId", COALESCE(e.name, u.email, 'مستخدم ' || ual."userId") AS name, COUNT(*)::int AS count
       FROM user_activity_log ual
       LEFT JOIN users u ON u.id = ual."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ual."companyId"=$1 AND ual."createdAt" >= ${since} AND ual."userId" IS NOT NULL
       GROUP BY ual."userId", e.name, u.email
       ORDER BY count DESC
       LIMIT 10`,
      [companyId, days]
    ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

  const moduleUsage = await rawQuery<any>(
    `SELECT COALESCE(entity, 'other') AS module, COUNT(*)::int AS count
     FROM user_activity_log
     WHERE "companyId"=$1 AND "createdAt" >= ${since}
     GROUP BY module
     ORDER BY count DESC
     LIMIT 15`,
    [companyId, days]
  ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

  const dailyActivity = await rawQuery<any>(
    `SELECT "createdAt"::date::text AS date, COUNT(*)::int AS count
     FROM user_activity_log
     WHERE "companyId"=$1 AND "createdAt" >= ${since}
     GROUP BY date
     ORDER BY date`,
    [companyId, days]
  ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

  const repeatedActions = await rawQuery<any>(
      `SELECT ual."userId", COALESCE(e.name, u.email, 'مستخدم ' || ual."userId") AS name,
              entity, method, COUNT(*)::int AS count
       FROM user_activity_log ual
       LEFT JOIN users u ON u.id = ual."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ual."companyId"=$1 AND ual."createdAt" >= ${since} AND ual."userId" IS NOT NULL
       GROUP BY ual."userId", e.name, u.email, entity, method
       HAVING COUNT(*) > 5
       ORDER BY count DESC
       LIMIT 20`,
      [companyId, days]
    ).catch((e) => { logger.error(e, "activity tracker query failed"); return []; });

    return { topPages, peakHours, topUsers, moduleUsage, dailyActivity, repeatedActions };
}
