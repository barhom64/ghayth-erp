import { rawQuery, rawExecute } from "./rawdb.js";
import { roundTo2 } from "./businessHelpers.js";

export interface ClientRFM {
  clientId: number;
  clientName: string;
  recencyDays: number;
  frequencyCount: number;
  monetaryValue: number;
  rfmScore: number;
  segment: string;
  churnRisk: string;
  churnScore: number;
  ltv: number;
  lastOrderDate: string | null;
  trend: "growing" | "stable" | "declining";
}

function classifySegment(rfmScore: number, recencyDays: number): string {
  if (rfmScore >= 4.0 && recencyDays <= 30) return "vip";
  if (rfmScore >= 3.0 && recencyDays <= 60) return "loyal";
  if (rfmScore >= 2.5 && recencyDays <= 90) return "regular";
  if (recencyDays > 180) return "inactive";
  if (recencyDays > 90) return "at_risk";
  return "new";
}

function calcChurnRisk(recencyDays: number, frequencyCount: number, monetaryValue: number): { risk: string; score: number } {
  let score = 0;
  if (recencyDays > 180) score += 50;
  else if (recencyDays > 90) score += 30;
  else if (recencyDays > 60) score += 15;
  if (frequencyCount < 2) score += 20;
  else if (frequencyCount < 5) score += 10;
  if (monetaryValue < 1000) score += 10;
  score = Math.min(100, score);
  const risk = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { risk, score };
}

export async function calculateClientRFM(companyId: number, clientId: number): Promise<ClientRFM | null> {
  const [client] = await rawQuery<any>(
    `SELECT c.id, c.name FROM clients c WHERE c.id = $1 AND c."companyId" = $2`,
    [clientId, companyId]
  );
  if (!client) return null;

  const [invoiceStats] = await rawQuery<any>(
    `SELECT
       COUNT(*)::int AS "frequencyCount",
       COALESCE(SUM(i."paidAmount"),0)::float AS "monetaryValue",
       COALESCE(MIN(CURRENT_DATE - i."dueDate"::date), 9999)::int AS "recencyDays",
       MAX(i."dueDate")::text AS "lastOrderDate"
     FROM invoices i
     WHERE i."companyId" = $1 AND i."clientId" = $2 AND i.status NOT IN ('cancelled','draft')`,
    [companyId, clientId]
  );

  const freq = Number(invoiceStats?.frequencyCount ?? 0);
  const monetary = Number(invoiceStats?.monetaryValue ?? 0);
  const recency = Number(invoiceStats?.recencyDays ?? 9999);
  const lastOrder = invoiceStats?.lastOrderDate ?? null;

  const prevMonthAmount = await rawQuery<any>(
    `SELECT COALESCE(SUM("paidAmount"),0)::float AS amount FROM invoices
     WHERE "companyId" = $1 AND "clientId" = $2
       AND status NOT IN ('cancelled','draft')
       AND "dueDate"::date >= CURRENT_DATE - INTERVAL '60 days'
       AND "dueDate"::date < CURRENT_DATE - INTERVAL '30 days'`,
    [companyId, clientId]
  );
  const currMonthAmount = await rawQuery<any>(
    `SELECT COALESCE(SUM("paidAmount"),0)::float AS amount FROM invoices
     WHERE "companyId" = $1 AND "clientId" = $2
       AND status NOT IN ('cancelled','draft')
       AND "dueDate"::date >= CURRENT_DATE - INTERVAL '30 days'`,
    [companyId, clientId]
  );
  const prev = Number(prevMonthAmount[0]?.amount ?? 0);
  const curr = Number(currMonthAmount[0]?.amount ?? 0);
  const trend: "growing" | "stable" | "declining" =
    curr > prev * 1.1 ? "growing" : curr < prev * 0.9 ? "declining" : "stable";

  const rScore = recency <= 30 ? 5 : recency <= 60 ? 4 : recency <= 90 ? 3 : recency <= 180 ? 2 : 1;
  const fScore = freq >= 10 ? 5 : freq >= 6 ? 4 : freq >= 3 ? 3 : freq >= 1 ? 2 : 1;
  const mScore = monetary >= 50000 ? 5 : monetary >= 20000 ? 4 : monetary >= 5000 ? 3 : monetary >= 1000 ? 2 : 1;
  const rfmScore = (rScore + fScore + mScore) / 3;

  const ltv = monetary + (freq > 0 ? (monetary / freq) * 12 : 0);
  const { risk: churnRisk, score: churnScore } = calcChurnRisk(recency, freq, monetary);
  const segment = classifySegment(rfmScore, recency);

  return {
    clientId: client.id,
    clientName: client.name,
    recencyDays: recency,
    frequencyCount: freq,
    monetaryValue: monetary,
    rfmScore: roundTo2(rfmScore),
    segment,
    churnRisk,
    churnScore,
    ltv: Math.round(ltv),
    lastOrderDate: lastOrder,
    trend,
  };
}

export async function calculateAllClientsRFM(companyId: number): Promise<number> {
  const clients = await rawQuery<{ id: number }>(
    `SELECT id FROM clients WHERE "companyId" = $1`,
    [companyId]
  );
  let saved = 0;
  for (const c of clients) {
    try {
      const rfm = await calculateClientRFM(companyId, c.id);
      if (!rfm) continue;
      await rawExecute(
        `INSERT INTO client_rfm_scores ("companyId","clientId","recencyDays","frequencyCount","monetaryValue","rfmScore",segment,"churnRisk","churnScore",ltv,"lastCalculated")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT ("companyId","clientId") DO UPDATE SET
           "recencyDays"=$3,"frequencyCount"=$4,"monetaryValue"=$5,"rfmScore"=$6,
           segment=$7,"churnRisk"=$8,"churnScore"=$9,ltv=$10,"lastCalculated"=NOW()`,
        [companyId, c.id, rfm.recencyDays, rfm.frequencyCount, rfm.monetaryValue,
         rfm.rfmScore, rfm.segment, rfm.churnRisk, rfm.churnScore, rfm.ltv]
      );
      saved++;
    } catch (err) {
      console.error(`RFM error for client ${c.id}:`, err);
    }
  }
  return saved;
}

export async function getClientAnalyticsSummary(companyId: number): Promise<{
  segmentBreakdown: Record<string, number>;
  churnRiskBreakdown: Record<string, number>;
  topClients: any[];
  atRiskClients: any[];
}> {
  const segmentRows = await rawQuery<any>(
    `SELECT segment, COUNT(*)::int AS count FROM client_rfm_scores WHERE "companyId"=$1 GROUP BY segment`,
    [companyId]
  );
  const churnRows = await rawQuery<any>(
    `SELECT "churnRisk", COUNT(*)::int AS count FROM client_rfm_scores WHERE "companyId"=$1 GROUP BY "churnRisk"`,
    [companyId]
  );
  const topClients = await rawQuery<any>(
    `SELECT rs.*, c.name AS "clientName", c.phone
     FROM client_rfm_scores rs
     JOIN clients c ON c.id = rs."clientId"
     WHERE rs."companyId"=$1
     ORDER BY rs."rfmScore" DESC, rs."monetaryValue" DESC
     LIMIT 10`,
    [companyId]
  );
  const atRiskClients = await rawQuery<any>(
    `SELECT rs.*, c.name AS "clientName", c.phone
     FROM client_rfm_scores rs
     JOIN clients c ON c.id = rs."clientId"
     WHERE rs."companyId"=$1 AND rs."churnRisk" = 'high'
     ORDER BY rs."churnScore" DESC
     LIMIT 10`,
    [companyId]
  );

  const segmentBreakdown: Record<string, number> = {};
  for (const r of segmentRows) segmentBreakdown[r.segment] = r.count;
  const churnRiskBreakdown: Record<string, number> = {};
  for (const r of churnRows) churnRiskBreakdown[r.churnRisk] = r.count;

  return { segmentBreakdown, churnRiskBreakdown, topClients, atRiskClients };
}

export async function getBestContactTime(companyId: number, clientId: number): Promise<{
  bestDayOfWeek: string;
  bestHourRange: string;
  confidence: number;
}> {
  const activityRows = await rawQuery<any>(
    `SELECT
       EXTRACT(DOW FROM i."createdAt") AS dow,
       EXTRACT(HOUR FROM i."createdAt") AS hour,
       COUNT(*)::int AS cnt
     FROM invoices i
     WHERE i."companyId"=$1 AND i."clientId"=$2
       AND i.status NOT IN ('cancelled','draft')
     GROUP BY dow, hour
     ORDER BY cnt DESC
     LIMIT 5`,
    [companyId, clientId]
  );

  if (activityRows.length === 0) {
    return { bestDayOfWeek: "الأحد", bestHourRange: "9-11 صباحاً", confidence: 0 };
  }

  const topRow = activityRows[0];
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const bestDay = days[Number(topRow.dow)] ?? "الأحد";
  const hour = Number(topRow.hour);
  const bestHour = hour < 12 ? `${hour}-${hour + 2} صباحاً` : `${hour - 12 || 12}-${(hour - 12 || 12) + 2} مساءً`;
  const totalActivity = activityRows.reduce((s: number, r: any) => s + r.cnt, 0);
  const confidence = totalActivity > 0 ? Math.min(100, Math.round((topRow.cnt / totalActivity) * 100 + 10)) : 0;

  return { bestDayOfWeek: bestDay, bestHourRange: bestHour, confidence };
}

export async function detectSeasonalPatterns(companyId: number): Promise<{ month: number; monthName: string; avgRevenue: number; trend: string }[]> {
  const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const rows = await rawQuery<any>(
    `SELECT
       EXTRACT(MONTH FROM i."dueDate") AS month,
       AVG(i.total)::float AS "avgRevenue",
       COUNT(*)::int AS cnt
     FROM invoices i
     WHERE i."companyId"=$1 AND i.status NOT IN ('cancelled','draft')
       AND i."dueDate"::date >= NOW() - INTERVAL '2 years'
     GROUP BY month
     ORDER BY month`,
    [companyId]
  );

  const avgOverall = rows.length > 0 ? rows.reduce((s: number, r: any) => s + r.avgRevenue, 0) / rows.length : 0;
  return rows.map((r: any) => ({
    month: Number(r.month),
    monthName: monthNames[Number(r.month) - 1] ?? String(r.month),
    avgRevenue: Math.round(r.avgRevenue),
    trend: r.avgRevenue > avgOverall * 1.15 ? "peak" : r.avgRevenue < avgOverall * 0.85 ? "low" : "normal",
  }));
}
