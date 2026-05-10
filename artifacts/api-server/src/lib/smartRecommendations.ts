import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { MGR_ROLES, OPS_CLOSE_ROLES } from "./rbacCatalog.js";

export interface SmartRecommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  action: string;
  actionLink?: string;
  priority: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, any>;
}

export async function getPersonalizedRecommendations(
  companyId: number,
  userId: number,
  assignmentId: number,
  role: string
): Promise<SmartRecommendation[]> {
  const recs: SmartRecommendation[] = [];

  // 1. Detect repeated actions and suggest shortcuts
  try {
    const repeatedActions = await rawQuery<any>(
      `SELECT page, action, COUNT(*)::int AS cnt, EXTRACT(DOW FROM "createdAt") AS dow
       FROM user_activity_log
       WHERE "companyId"=$1 AND "userId"=$2
         AND "createdAt" >= NOW() - INTERVAL '30 days'
       GROUP BY page, action, dow
       HAVING COUNT(*) >= 5
       ORDER BY cnt DESC
       LIMIT 5`,
      [companyId, userId]
    );
    for (const row of repeatedActions) {
      const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      const dayName = days[Number(row.dow)] ?? "";
      if (row.page && row.cnt >= 5) {
        recs.push({
          id: `shortcut-${row.page}-${row.action}`,
          type: "shortcut_suggestion",
          title: `اختصار مقترح: ${row.page}`,
          description: `أنت تقوم بـ "${row.action}" على "${row.page}" ${row.cnt} مرة${dayName ? ` خاصة يوم ${dayName}` : ""} — يمكن إضافة هذا لقائمتك المفضلة`,
          action: "إضافة لأدوات سريعة",
          actionLink: `/${row.page}`,
          priority: "low",
          metadata: { page: row.page, count: row.cnt, dayOfWeek: row.dow },
        });
      }
    }
  } catch (err) { logger.error(err, "Shortcut recommendations error:"); }

  // 2. Clients that stopped ordering (churn risk alerts)
  if (["branch_manager", "general_manager", "owner", "finance_manager", "sales"].includes(role)) {
    try {
      const churnClients = await rawQuery<any>(
        `SELECT c.id, c.name, rs."recencyDays", rs."churnScore"
         FROM client_rfm_scores rs
         JOIN clients c ON c.id = rs."clientId"
         WHERE rs."companyId"=$1 AND rs."churnRisk"='high'
           AND rs."recencyDays" > 60
         ORDER BY rs."churnScore" DESC
         LIMIT 5`,
        [companyId]
      );
      for (const cl of churnClients) {
        recs.push({
          id: `churn-${cl.id}`,
          type: "churn_alert",
          title: `عميل معرض للفقدان: ${cl.name}`,
          description: `لم يتعامل العميل ${cl.name} منذ ${cl.recencyDays} يوماً — خطر الفقدان ${Math.round(cl.churnScore)}%`,
          action: "التواصل مع العميل",
          actionLink: `/clients/${cl.id}`,
          priority: "high",
          metadata: { clientId: cl.id, recencyDays: cl.recencyDays },
        });
      }
    } catch (err) { logger.error(err, "Churn alert recs error:"); }
  }

  // 3. Best time to contact clients with pending tasks
  if (["branch_manager", "general_manager", "owner", "sales"].includes(role)) {
    try {
      const pendingClientTasks = await rawQuery<any>(
        `SELECT DISTINCT t."clientId" AS "clientId", c.name AS "clientName"
         FROM tasks t
         JOIN clients c ON c.id = t."clientId"
         WHERE t."companyId"=$1 AND t.status='pending' AND t."clientId" IS NOT NULL
         LIMIT 3`,
        [companyId]
      );
      for (const task of pendingClientTasks) {
        const [bestTime] = await rawQuery<any>(
          `SELECT
             EXTRACT(DOW FROM i."createdAt") AS dow,
             EXTRACT(HOUR FROM i."createdAt") AS hour,
             COUNT(*)::int AS cnt
           FROM invoices i
           WHERE i."companyId"=$1 AND i."clientId"=$2
           GROUP BY dow, hour
           ORDER BY cnt DESC
           LIMIT 1`,
          [companyId, task.clientId]
        );
        if (bestTime) {
          const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
          const dayName = days[Number(bestTime.dow)] ?? "";
          const hour = Number(bestTime.hour);
          const hourStr = hour < 12 ? `${hour}:00 صباحاً` : `${hour - 12 || 12}:00 مساءً`;
          recs.push({
            id: `contact-time-${task.clientId}`,
            type: "best_contact_time",
            title: `أفضل وقت للتواصل: ${task.clientName}`,
            description: `بناءً على تاريخ تفاعلاته، أفضل وقت للتواصل مع ${task.clientName} هو يوم ${dayName} حول ${hourStr}`,
            action: "عرض العميل",
            actionLink: `/clients/${task.clientId}`,
            priority: "normal",
          });
        }
      }
    } catch (err) { logger.error(err, "Contact time recs error:"); }
  }

  // 4. Employees with productivity drop
  if (MGR_ROLES.includes(role)) {
    try {
      const prodDrop = await rawQuery<any>(
        `WITH recent AS (
           SELECT t."assignedTo",
                  COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*), 0) AS rate
           FROM tasks t
           WHERE t."companyId"=$1
             AND t."scheduledDate"::date >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY t."assignedTo"
         ),
         historical AS (
           SELECT t."assignedTo",
                  COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*), 0) AS rate
           FROM tasks t
           WHERE t."companyId"=$1
             AND t."scheduledDate"::date BETWEEN CURRENT_DATE - INTERVAL '37 days' AND CURRENT_DATE - INTERVAL '8 days'
           GROUP BY t."assignedTo"
         )
         SELECT r."assignedTo", e.name AS "empName",
                ROUND(r.rate * 100)::int AS "recentRate",
                ROUND(h.rate * 100)::int AS "historicalRate"
         FROM recent r
         JOIN historical h ON h."assignedTo" = r."assignedTo"
         JOIN employee_assignments ea2 ON ea2.id = r."assignedTo"
       JOIN employees e ON e.id = ea2."employeeId"
         WHERE h.rate > 0.3 AND r.rate < h.rate * 0.7
         LIMIT 5`,
        [companyId]
      );
      for (const emp of prodDrop) {
        recs.push({
          id: `prod-drop-${emp.assignedTo}`,
          type: "productivity_drop",
          title: `انخفاض إنتاجية: ${emp.empName}`,
          description: `إنتاجية ${emp.empName} انخفضت من ${emp.historicalRate}% إلى ${emp.recentRate}% خلال الأسبوع الأخير — يُنصح بالمتابعة`,
          action: "عرض الموظف",
          actionLink: `/hr`,
          priority: "high",
        });
      }
    } catch (err) { logger.error(err, "Productivity drop recs error:"); }
  }

  // 5. Budget overspend warnings
  if (OPS_CLOSE_ROLES.includes(role)) {
    try {
      const budgetAlerts = await rawQuery<any>(
        `SELECT b."accountCode", b.amount, b.used,
                ROUND((b.used / NULLIF(b.amount,0)) * 100)::int AS "utilization"
         FROM budgets b
         WHERE b."companyId"=$1 AND b.period = TO_CHAR(CURRENT_DATE,'YYYY-MM')
           AND b.amount > 0 AND (b.used / NULLIF(b.amount,0)) > 0.8
         ORDER BY (b.used / NULLIF(b.amount,0)) DESC
         LIMIT 3`,
        [companyId]
      );
      for (const b of budgetAlerts) {
        recs.push({
          id: `budget-${b.accountCode}`,
          type: "budget_warning",
          title: `تنبيه ميزانية: حساب ${b.accountCode}`,
          description: `تم استخدام ${b.utilization}% من ميزانية ${b.accountCode} هذا الشهر — المتبقي: ${Number(b.amount - b.used).toLocaleString()}`,
          action: "مراجعة الميزانية",
          actionLink: "/finance",
          priority: b.utilization >= 100 ? "urgent" : "high",
        });
      }
    } catch (err) { logger.error(err, "Budget recs error:"); }
  }

  // 6. Clients with 3+ consecutive unpaid invoices
  if (OPS_CLOSE_ROLES.includes(role)) {
    try {
      const badPayers = await rawQuery<any>(
        `SELECT c.id, c.name, COUNT(i.id)::int AS "unpaidCount",
                COALESCE(SUM(i.total - i."paidAmount"),0)::float AS "totalDue"
         FROM clients c
         JOIN invoices i ON i."clientId"=c.id AND i."companyId"=$1
         WHERE c."companyId"=$1 AND i.status IN ('overdue','sent') AND i."dueDate" < CURRENT_DATE
         GROUP BY c.id, c.name
         HAVING COUNT(i.id) >= 3
         ORDER BY "totalDue" DESC
         LIMIT 5`,
        [companyId]
      );
      for (const cl of badPayers) {
        recs.push({
          id: `unpaid-${cl.id}`,
          type: "consecutive_unpaid",
          title: `${cl.unpaidCount} فواتير غير مسددة: ${cl.name}`,
          description: `العميل ${cl.name} لديه ${cl.unpaidCount} فواتير متأخرة — إجمالي المستحق: ${Number(cl.totalDue).toLocaleString()} ريال`,
          action: "متابعة التحصيل",
          actionLink: "/finance",
          priority: "urgent",
        });
      }
    } catch (err) { logger.error(err, "Unpaid invoices recs error:"); }
  }

  return recs;
}

export async function saveRecommendationsForUser(
  companyId: number,
  userId: number,
  assignmentId: number,
  role: string
): Promise<number> {
  const recs = await getPersonalizedRecommendations(companyId, userId, assignmentId, role);

  await rawExecute(
    `DELETE FROM smart_recommendations WHERE "companyId"=$1 AND "userId"=$2 AND "dismissedAt" IS NULL`,
    [companyId, userId]
  ).catch((e) => logger.error(e, "smart recommendations cleanup failed"));

  let saved = 0;
  for (const rec of recs) {
    try {
      await rawExecute(
        `INSERT INTO smart_recommendations ("companyId","userId",type,title,description,"actionUrl",priority,"expiresAt","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() + INTERVAL '7 days',NOW())`,
        [companyId, userId, rec.type, rec.title, rec.description,
         rec.actionLink ?? null, rec.priority]
      );
      saved++;
    } catch (err) { logger.error(err, "Save recommendation error:"); }
  }
  return saved;
}
