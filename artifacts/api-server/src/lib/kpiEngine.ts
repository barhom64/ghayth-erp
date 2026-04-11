import { rawQuery, rawExecute } from "./rawdb.js";

export interface KPISnapshot {
  companyId: number;
  employeeId: number;
  snapshotDate: string;
  metrics: Record<string, number>;
}

async function calcTaskCompletionRate(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; completed: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE t.status = 'completed') AS completed
     FROM tasks t
     WHERE t."companyId" = $1 AND t."assignedTo" = $2
       AND t."scheduledDate"::date <= $3::date
       AND t."scheduledDate"::date >= ($3::date - INTERVAL '30 days')`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const completed = Number(rows[0]?.completed ?? 0);
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

async function calcAvgSpeed(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ avgMinutes: string }>(
    `SELECT COALESCE(AVG(
       EXTRACT(EPOCH FROM (t."completedAt" - t."scheduledStart")) / 60
     ), 0) AS "avgMinutes"
     FROM tasks t
     WHERE t."companyId" = $1 AND t."assignedTo" = $2
       AND t.status = 'completed'
       AND t."completedAt" IS NOT NULL AND t."scheduledStart" IS NOT NULL
       AND t."completedAt"::date >= ($3::date - INTERVAL '30 days')
       AND t."completedAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  return Number(rows[0]?.avgMinutes ?? 0);
}

async function calcOnTimeRate(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; onTime: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE t."completedAt" IS NOT NULL
              AND t."scheduledDate" IS NOT NULL
              AND t."completedAt"::date <= t."scheduledDate"::date) AS "onTime"
     FROM tasks t
     WHERE t."companyId" = $1 AND t."assignedTo" = $2
       AND t.status = 'completed'
       AND t."completedAt"::date >= ($3::date - INTERVAL '30 days')
       AND t."completedAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const onTime = Number(rows[0]?.onTime ?? 0);
  return total > 0 ? Math.round((onTime / total) * 100) : 0;
}

async function calcSlaAdherence(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; breached: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE st."slaBreached" = true) AS breached
     FROM support_tickets st
     WHERE st."companyId" = $1 AND st."assigneeId" = $2
       AND st."createdAt"::date >= ($3::date - INTERVAL '30 days')
       AND st."createdAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const breached = Number(rows[0]?.breached ?? 0);
  return total > 0 ? Math.round(((total - breached) / total) * 100) : 100;
}

async function calcClientSatisfaction(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ avgRating: string }>(
    `SELECT COALESCE(AVG(st.rating), 0) AS "avgRating"
     FROM support_tickets st
     WHERE st."companyId" = $1 AND st."assigneeId" = $2
       AND st.rating IS NOT NULL
       AND st."resolvedAt"::date >= ($3::date - INTERVAL '30 days')
       AND st."resolvedAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  return Math.round(Number(rows[0]?.avgRating ?? 0) * 10) / 10;
}

async function calcReopenRate(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; reopened: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE st."escalationLevel" > 1) AS reopened
     FROM support_tickets st
     WHERE st."companyId" = $1 AND st."assigneeId" = $2
       AND st."resolvedAt"::date >= ($3::date - INTERVAL '30 days')
       AND st."resolvedAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const reopened = Number(rows[0]?.reopened ?? 0);
  return total > 0 ? Math.round((reopened / total) * 100) : 0;
}

async function calcTravelTime(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ totalMinutes: string }>(
    `SELECT COALESCE(SUM(t."actualDuration"), 0) AS "totalMinutes"
     FROM tasks t
     WHERE t."companyId" = $1 AND t."assignedTo" = $2
       AND t."scheduledDate"::date = $3::date`,
    [companyId, employeeId, date]
  );
  return Number(rows[0]?.totalMinutes ?? 0);
}

async function calcDailyTaskCount(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM tasks t
     WHERE t."companyId" = $1 AND t."assignedTo" = $2
       AND t."scheduledDate"::date = $3::date`,
    [companyId, employeeId, date]
  );
  return Number(rows[0]?.count ?? 0);
}

function calcOverallPerformance(metrics: Record<string, number>): number {
  const weights: Record<string, number> = {
    task_completion_rate: 0.20,
    sla_adherence: 0.20,
    on_time_rate: 0.15,
    client_satisfaction: 0.20,
    avg_speed_minutes: 0.10,
    reopen_rate: 0.10,
    daily_task_count: 0.05,
  };

  let score = 0;
  score += (metrics.task_completion_rate ?? 0) * weights.task_completion_rate!;
  score += (metrics.sla_adherence ?? 0) * weights.sla_adherence!;
  score += (metrics.on_time_rate ?? 0) * weights.on_time_rate!;

  const satScore = ((metrics.client_satisfaction ?? 0) / 5) * 100;
  score += satScore * weights.client_satisfaction!;

  const speedScore = metrics.avg_speed_minutes > 0 ? Math.max(0, 100 - metrics.avg_speed_minutes / 3) : 50;
  score += speedScore * weights.avg_speed_minutes!;

  const reopenPenalty = 100 - (metrics.reopen_rate ?? 0);
  score += reopenPenalty * weights.reopen_rate!;

  const taskCountScore = Math.min(100, (metrics.daily_task_count ?? 0) * 15);
  score += taskCountScore * weights.daily_task_count!;

  return Math.round(Math.min(100, Math.max(0, score)));
}

async function calcSupportResponseRate(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; responded: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE st."firstResponseAt" IS NOT NULL) AS responded
     FROM support_tickets st
     WHERE st."companyId" = $1 AND st."assigneeId" = $2
       AND st."createdAt"::date >= ($3::date - INTERVAL '30 days')
       AND st."createdAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const responded = Number(rows[0]?.responded ?? 0);
  return total > 0 ? Math.round((responded / total) * 100) : 100;
}

async function calcApprovalChainEfficiency(companyId: number, employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; approved: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'approved') AS approved
     FROM approval_requests
     WHERE "companyId" = $1 AND "assignedTo" = $2
       AND "createdAt"::date >= ($3::date - INTERVAL '30 days')
       AND "createdAt"::date <= $3::date`,
    [companyId, employeeId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const approved = Number(rows[0]?.approved ?? 0);
  return total > 0 ? Math.round((approved / total) * 100) : 100;
}

async function calcInvoiceCollectionRate(companyId: number, _employeeId: number, date: string): Promise<number> {
  const rows = await rawQuery<{ total: string; collected: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'paid') AS collected
     FROM invoices
     WHERE "companyId" = $1
       AND "createdAt"::date >= ($2::date - INTERVAL '30 days')
       AND "createdAt"::date <= $2::date`,
    [companyId, date]
  );
  const total = Number(rows[0]?.total ?? 0);
  const collected = Number(rows[0]?.collected ?? 0);
  return total > 0 ? Math.round((collected / total) * 100) : 0;
}

export async function getCompanyKPIs(companyId: number): Promise<{
  supportResponseRate: number;
  invoiceCollectionRate: number;
  approvalEfficiency: number;
  avgClientSatisfaction: number;
  taskCompletionRate: number;
}> {
  const today = new Date().toISOString().split("T")[0];
  const [supResp] = await rawQuery<any>(
    `SELECT COUNT(*) FILTER (WHERE "firstResponseAt" IS NOT NULL)::float / NULLIF(COUNT(*), 0) * 100 AS rate
     FROM support_tickets WHERE "companyId"=$1 AND "createdAt"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId]
  );
  const [collection] = await rawQuery<any>(
    `SELECT COUNT(*) FILTER (WHERE status='paid')::float / NULLIF(COUNT(*),0) * 100 AS rate
     FROM invoices WHERE "companyId"=$1 AND "createdAt"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId]
  );
  const [approval] = await rawQuery<any>(
    `SELECT COUNT(*) FILTER (WHERE status='approved')::float / NULLIF(COUNT(*),0) * 100 AS rate
     FROM approval_requests WHERE "companyId"=$1 AND "createdAt"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId]
  );
  const [satisfaction] = await rawQuery<any>(
    `SELECT COALESCE(AVG(rating),0) AS avg FROM support_tickets
     WHERE "companyId"=$1 AND rating IS NOT NULL AND "resolvedAt"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId]
  );
  const [tasks] = await rawQuery<any>(
    `SELECT COUNT(*) FILTER (WHERE status='completed')::float / NULLIF(COUNT(*),0) * 100 AS rate
     FROM tasks WHERE "companyId"=$1 AND "scheduledDate"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId]
  );
  return {
    supportResponseRate: Math.round(Number(supResp?.rate ?? 0)),
    invoiceCollectionRate: Math.round(Number(collection?.rate ?? 0)),
    approvalEfficiency: Math.round(Number(approval?.rate ?? 0)),
    avgClientSatisfaction: Math.round(Number(satisfaction?.avg ?? 0) * 10) / 10,
    taskCompletionRate: Math.round(Number(tasks?.rate ?? 0)),
  };
}

export async function calculateEmployeeKPIs(
  companyId: number,
  employeeId: number,
  date: string
): Promise<Record<string, number>> {
  const [
    taskCompletionRate,
    avgSpeed,
    onTimeRate,
    slaAdherence,
    clientSatisfaction,
    reopenRate,
    travelTime,
    dailyTaskCount,
    supportResponseRate,
    approvalEfficiency,
    invoiceCollectionRate,
  ] = await Promise.all([
    calcTaskCompletionRate(companyId, employeeId, date),
    calcAvgSpeed(companyId, employeeId, date),
    calcOnTimeRate(companyId, employeeId, date),
    calcSlaAdherence(companyId, employeeId, date),
    calcClientSatisfaction(companyId, employeeId, date),
    calcReopenRate(companyId, employeeId, date),
    calcTravelTime(companyId, employeeId, date),
    calcDailyTaskCount(companyId, employeeId, date),
    calcSupportResponseRate(companyId, employeeId, date),
    calcApprovalChainEfficiency(companyId, employeeId, date),
    calcInvoiceCollectionRate(companyId, employeeId, date),
  ]);

  const metrics: Record<string, number> = {
    task_completion_rate: taskCompletionRate,
    avg_speed_minutes: Math.round(avgSpeed),
    on_time_rate: onTimeRate,
    sla_adherence: slaAdherence,
    client_satisfaction: clientSatisfaction,
    reopen_rate: reopenRate,
    travel_time_minutes: Math.round(travelTime),
    daily_task_count: dailyTaskCount,
    support_response_rate: supportResponseRate,
    approval_chain_efficiency: approvalEfficiency,
    invoice_collection_rate: invoiceCollectionRate,
  };
  metrics.overall_performance_score = calcOverallPerformance(metrics);
  return metrics;
}

export async function saveKPISnapshots(companyId: number, date: string): Promise<number> {
  const employees = await rawQuery<{ id: number }>(
    `SELECT DISTINCT e.id FROM employees e
     JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'`,
    [companyId]
  );

  let saved = 0;
  for (const emp of employees) {
    try {
      const metrics = await calculateEmployeeKPIs(companyId, emp.id, date);
      for (const [metricName, metricValue] of Object.entries(metrics)) {
        await rawExecute(
          `INSERT INTO kpi_snapshots ("companyId", "employeeId", "snapshotDate", "metricName", "metricValue", "createdAt")
           VALUES ($1, $2, $3::date, $4, $5, NOW())
           ON CONFLICT DO NOTHING`,
          [companyId, emp.id, date, metricName, metricValue]
        );
      }
      saved++;
    } catch (err) {
      console.error(`KPI error for employee ${emp.id}:`, err);
    }
  }
  return saved;
}

export async function saveAllCompaniesKPISnapshots(date: string): Promise<number> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let total = 0;
  for (const company of companies) {
    total += await saveKPISnapshots(company.id, date);
  }
  return total;
}
