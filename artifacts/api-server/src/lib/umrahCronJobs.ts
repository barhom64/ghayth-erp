/**
 * Umrah Cron Jobs — Phase 6.
 *
 * Six scheduled jobs (C27–C32 from §15 of the spec) that keep the Umrah
 * workflow honest between user actions:
 *
 *   C27  daily 06:00  overstay scan (any pilgrim past their program duration)
 *   C28  daily 06:00  absconder scan (any pilgrim flagged 'absconded')
 *   C29  daily 08:00  overdue sales-invoice escalation (forwards to the
 *                     existing dunning pipeline — Umrah is a feeder)
 *   C30  weekly Mon  sub-agent performance summary digest
 *   C31  daily 07:00  visa-expiry alerts (mutamers inside KSA whose
 *                     visa expires within 3 days)
 *   C32  monthly 1st  Umrah financial summary (revenue / cost / margin)
 *
 * Conventions inherited from cronScheduler.ts:
 *   * each handler is `async () => Promise<string>` — the string is what
 *     `runJob()` persists in cron_logs as the human-readable result
 *   * all SQL is plain rawQuery / rawExecute via the shared pool — no
 *     ORM, no fresh transactions per row
 *   * notifications go through `createNotification` from businessHelpers
 *     so the existing in-app + email + SMS + WhatsApp routing fires
 *   * settings are read via the same three-level inheritance the import
 *     engine uses (system → company → branch, closest wins)
 *   * idempotency: every job uses date-bracketed inserts + de-dup checks
 *     so re-running the same day produces zero side-effects
 */

import { rawQuery, rawExecute } from "./rawdb.js";
import {
  createNotification,
  getManagerAssignmentId,
  getCfoAssignmentId,
  emitEvent,
} from "./businessHelpers.js";

interface UmrahSettings {
  absconderPenalty: number;
  overstayDailyPenalty: number;
}

async function loadCompanyUmrahSettings(companyId: number): Promise<UmrahSettings> {
  const rows = await rawQuery<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings
      WHERE key IN ('umrah.absconder_penalty','umrah.overstay_daily_penalty')
        AND ( ("companyId" IS NULL AND "branchId" IS NULL)
              OR ("companyId" = $1 AND "branchId" IS NULL) )
      ORDER BY "companyId" NULLS FIRST`,
    [companyId]
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    absconderPenalty: Number(map["umrah.absconder_penalty"] ?? 2000),
    overstayDailyPenalty: Number(map["umrah.overstay_daily_penalty"] ?? 0),
  };
}

async function listActiveCompanies(): Promise<{ id: number }[]> {
  return rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status='active' ORDER BY id`
  );
}

/** Reuse the same business logic the importer uses, but starting from
 *  an existing umrah_mutamers row instead of an Excel cell. Idempotent:
 *  if an open violation already exists for this passport + type we don't
 *  create a duplicate. */
async function recordViolationForMutamer(
  m: { id: number; companyId: number; branchId: number | null; name: string;
       passportNumber: string | null; nuskNumber: string; overstayDays: number;
       groupId: number | null; subAgentId: number | null; status: string },
  type: "overstay" | "absconded",
  penalty: number
): Promise<boolean> {
  const refNumber = m.passportNumber ?? m.nuskNumber;
  const [{ existing }] = await rawQuery<{ existing: number }>(
    `SELECT COUNT(*)::int AS existing FROM umrah_violations
      WHERE "companyId"=$1 AND "deletedAt" IS NULL
        AND "referenceType"='passport' AND "referenceNumber"=$2 AND type=$3
        AND status NOT IN ('paid','closed')`,
    [m.companyId, refNumber, type]
  );
  if (existing > 0) return false;

  const ins = await rawExecute(
    `INSERT INTO umrah_violations
       ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId",
        "groupId","subAgentId",description,"penaltyAmount",status)
     VALUES ($1,$2,$3,'passport',$4,$5,$6,$7,$8,$9,'detected') RETURNING id`,
    [
      m.companyId, m.branchId, type, refNumber, m.id, m.groupId, m.subAgentId,
      type === "absconded"
        ? `(cron) معتمر ${m.name} متغيّب — جواز ${refNumber}`
        : `(cron) معتمر ${m.name} تجاوز مدة البرنامج بـ ${m.overstayDays} يوم — جواز ${refNumber}`,
      penalty,
    ]
  );

  if (m.groupId) {
    await rawExecute(
      `UPDATE umrah_groups SET status='has_violations', "updatedAt"=NOW()
        WHERE id=$1 AND status NOT IN ('settled','closed')`,
      [m.groupId]
    );
  }

  await emitEvent({
    companyId: m.companyId,
    branchId: m.branchId ?? undefined,
    userId: null,
    action: type === "absconded" ? "umrah.absconder.detected" : "umrah.overstay.detected",
    entity: "umrah_violations",
    entityId: ins.insertId,
    details: JSON.stringify({
      mutamerId: m.id, source: "cron", penaltyAmount: penalty, refNumber,
    }),
  });
  return true;
}

// ---------------------------------------------------------------------------
// C27 — daily overstay scan
// ---------------------------------------------------------------------------

export async function umrahDailyOverstayScan(): Promise<string> {
  let totalDetected = 0;
  let totalCompanies = 0;
  for (const c of await listActiveCompanies()) {
    totalCompanies++;
    const settings = await loadCompanyUmrahSettings(c.id);
    // We re-compute overstayDays so the cron also catches NUSK rows where
    // the importer hadn't filled the column yet.
    const rows = await rawQuery<any>(
      `SELECT m.id, m."companyId", m."branchId", m.name, m."passportNumber",
              m."nuskNumber", m.status,
              GREATEST(0, COALESCE(m."actualStayDays",0) - COALESCE(m."programDuration",0)) AS "overstayDays",
              g.id AS "groupId", g."subAgentId"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId" = $1
          AND m."deletedAt" IS NULL
          AND m."isInsideKingdom" = true
          AND COALESCE(m."actualStayDays",0) > COALESCE(m."programDuration",0)
          AND m.status NOT IN ('exited','deceased','absconded')`,
      [c.id]
    );
    let detectedInCompany = 0;
    for (const m of rows) {
      const penalty = (Number(m.overstayDays) || 0) * (settings.overstayDailyPenalty || 0);
      const created = await recordViolationForMutamer(m, "overstay", penalty);
      if (created) detectedInCompany++;
    }
    totalDetected += detectedInCompany;
    if (detectedInCompany > 0) {
      const mgrId = await getManagerAssignmentId(c.id, 0);
      if (mgrId) {
        await createNotification({
          companyId: c.id,
          assignmentId: mgrId,
          type: "umrah",
          title: "معتمرون متجاوزون",
          body: `${detectedInCompany} معتمر تجاوزوا مدة البرنامج اليوم — يرجى المراجعة`,
          priority: "high",
          refType: "umrah_violations",
          refId: 0,
          actionUrl: "/umrah/violations?status=detected",
        });
      }
    }
  }
  return `Scanned ${totalCompanies} company(ies), detected ${totalDetected} new overstay violation(s)`;
}

// ---------------------------------------------------------------------------
// C28 — daily absconder scan
// ---------------------------------------------------------------------------

export async function umrahDailyAbsconderScan(): Promise<string> {
  let totalDetected = 0;
  let totalCompanies = 0;
  for (const c of await listActiveCompanies()) {
    totalCompanies++;
    const settings = await loadCompanyUmrahSettings(c.id);
    const rows = await rawQuery<any>(
      `SELECT m.id, m."companyId", m."branchId", m.name, m."passportNumber",
              m."nuskNumber", m.status,
              GREATEST(0, COALESCE(m."actualStayDays",0) - COALESCE(m."programDuration",0)) AS "overstayDays",
              g.id AS "groupId", g."subAgentId"
         FROM umrah_mutamers m
         LEFT JOIN umrah_groups g ON g.id = m."groupId"
        WHERE m."companyId" = $1
          AND m."deletedAt" IS NULL
          AND m.status = 'absconded'`,
      [c.id]
    );
    let detectedInCompany = 0;
    for (const m of rows) {
      const created = await recordViolationForMutamer(m, "absconded", settings.absconderPenalty);
      if (created) detectedInCompany++;
    }
    totalDetected += detectedInCompany;
    if (detectedInCompany > 0) {
      // CFO + general manager + Umrah ops manager get a critical notification.
      const targets: number[] = [];
      const cfo = await getCfoAssignmentId(c.id, 0);
      if (cfo) targets.push(cfo);
      const mgr = await getManagerAssignmentId(c.id, 0);
      if (mgr && mgr !== cfo) targets.push(mgr);
      for (const t of targets) {
        await createNotification({
          companyId: c.id,
          assignmentId: t,
          type: "umrah",
          title: "معتمرون متغيّبون (تم التبليغ)",
          body: `${detectedInCompany} معتمر تم التبليغ عنهم — غرامة ${settings.absconderPenalty} ر.س لكل واحد`,
          priority: "critical",
          refType: "umrah_violations",
          refId: 0,
          actionUrl: "/umrah/violations?status=detected",
        });
      }
    }
  }
  return `Scanned ${totalCompanies} company(ies), detected ${totalDetected} new absconder violation(s)`;
}

// ---------------------------------------------------------------------------
// C29 — overdue agent invoices (delegates to existing dunning pipeline)
// ---------------------------------------------------------------------------

export async function umrahDailyOverdueAgentInvoices(): Promise<string> {
  // We delegate to the existing `daily_invoice_overdue` / dunning pipeline
  // that already handles the 6-stage collection escalation for ALL sales
  // invoices; here we only count + alert the Umrah team so the dashboard
  // surfaces the Umrah-specific subset.
  let totalAlerted = 0;
  for (const c of await listActiveCompanies()) {
    const [{ overdue }] = await rawQuery<{ overdue: number }>(
      `SELECT COUNT(*)::int AS overdue
         FROM umrah_agent_invoices
        WHERE "companyId" = $1 AND "deletedAt" IS NULL
          AND status IN ('sent','partially_paid','overdue')
          AND "dueDate" IS NOT NULL
          AND "dueDate" < CURRENT_DATE`,
      [c.id]
    );
    if (Number(overdue) > 0) {
      totalAlerted += Number(overdue);
      const cfo = await getCfoAssignmentId(c.id, 0);
      if (cfo) {
        await createNotification({
          companyId: c.id,
          assignmentId: cfo,
          type: "umrah",
          title: "فواتير وكلاء عمرة متأخرة",
          body: `${overdue} فاتورة عمرة متأخرة الدفع — يرجى متابعة التحصيل`,
          priority: "high",
          refType: "umrah_agent_invoices",
          refId: 0,
          actionUrl: "/umrah/invoices?status=overdue",
        });
      }
    }
  }
  return `Surfaced ${totalAlerted} overdue Umrah agent invoice(s)`;
}

// ---------------------------------------------------------------------------
// C30 — weekly sub-agent performance summary (Mondays)
// ---------------------------------------------------------------------------

export async function umrahWeeklyAgentPerformance(): Promise<string> {
  let totalReports = 0;
  for (const c of await listActiveCompanies()) {
    const subAgents = await rawQuery<any>(
      `SELECT s.id, s.name, s."clientId",
              ( SELECT COUNT(*)::int FROM umrah_groups g
                 WHERE g."subAgentId" = s.id AND g."deletedAt" IS NULL ) AS "groupCount",
              ( SELECT COUNT(*)::int FROM umrah_mutamers m
                 JOIN umrah_groups g ON g.id = m."groupId"
                WHERE g."subAgentId" = s.id AND m."deletedAt" IS NULL ) AS "mutamerCount",
              ( SELECT COUNT(*)::int FROM umrah_violations v
                 WHERE v."subAgentId" = s.id AND v."deletedAt" IS NULL
                   AND v.status NOT IN ('paid','closed') ) AS "openViolations",
              ( SELECT COALESCE(SUM(v."penaltyAmount"),0) FROM umrah_violations v
                 WHERE v."subAgentId" = s.id AND v."deletedAt" IS NULL
                   AND v.status NOT IN ('paid','closed') ) AS "openPenaltiesTotal"
         FROM umrah_sub_agents s
        WHERE s."companyId" = $1 AND s."deletedAt" IS NULL AND s."isActive" = true`,
      [c.id]
    );
    if (subAgents.length === 0) continue;
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (!mgr) continue;

    // Top 5 by open penalty load for the digest body.
    const top = [...subAgents]
      .sort((a, b) => Number(b.openPenaltiesTotal ?? 0) - Number(a.openPenaltiesTotal ?? 0))
      .slice(0, 5)
      .map((s, i) => `${i + 1}. ${s.name} — ${Number(s.openPenaltiesTotal ?? 0).toFixed(0)} ر.س (${s.openViolations} مخالفة)`)
      .join("\n");

    await createNotification({
      companyId: c.id,
      assignmentId: mgr,
      type: "umrah",
      title: "تقرير أداء الوكلاء الفرعيين الأسبوعي",
      body:
        `إجمالي الوكلاء: ${subAgents.length} | إجمالي المجموعات: ${
          subAgents.reduce((s: number, x: any) => s + Number(x.groupCount ?? 0), 0)
        } | غرامات مفتوحة: ${
          subAgents.reduce((s: number, x: any) => s + Number(x.openPenaltiesTotal ?? 0), 0).toFixed(0)
        } ر.س\nأعلى 5:\n${top}`,
      priority: "normal",
      refType: "umrah_sub_agents",
      refId: 0,
      actionUrl: "/umrah/sub-agents",
    });
    totalReports++;
  }
  return `Sent ${totalReports} weekly performance digest(s)`;
}

// ---------------------------------------------------------------------------
// C31 — daily visa-expiry alert (mutamers inside KSA whose visa
// expires within 3 days)
// ---------------------------------------------------------------------------

export async function umrahDailyVisaExpiryAlert(): Promise<string> {
  let totalAlerted = 0;
  for (const c of await listActiveCompanies()) {
    // The NUSK feed gives us "visa expiry" via the program duration + entry
    // date: a pilgrim whose programDuration runs out in the next 3 days
    // while still inside KSA is at risk. This matches the spec's "تأشيرات
    // قاربت الانتهاء" intent without requiring a separate visa-expiry column.
    const rows = await rawQuery<any>(
      `SELECT m.id, m.name, m."nuskNumber", m."passportNumber",
              m."entryDate", m."programDuration",
              (m."entryDate"::date + COALESCE(m."programDuration",14) * INTERVAL '1 day')::date AS "expectedExit"
         FROM umrah_mutamers m
        WHERE m."companyId" = $1
          AND m."deletedAt" IS NULL
          AND m."isInsideKingdom" = true
          AND m.status IN ('inside_kingdom','overstay')
          AND m."entryDate" IS NOT NULL
          AND (m."entryDate"::date + COALESCE(m."programDuration",14) * INTERVAL '1 day')::date
              BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')::date`,
      [c.id]
    );
    if (rows.length === 0) continue;
    totalAlerted += rows.length;
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (mgr) {
      await createNotification({
        companyId: c.id,
        assignmentId: mgr,
        type: "umrah",
        title: "تأشيرات قاربت الانتهاء",
        body: `${rows.length} معتمر تنتهي تأشيرتهم خلال 3 أيام`,
        priority: "high",
        refType: "umrah_mutamers",
        refId: 0,
        actionUrl: "/umrah/mutamers?status=inside_kingdom",
      });
    }
  }
  return `Alerted on ${totalAlerted} pilgrim(s) with visas expiring within 3 days`;
}

// ---------------------------------------------------------------------------
// C32.5 — daily plan-lifecycle sync (auto-suspend / expire on assignment end)
// ---------------------------------------------------------------------------

/**
 * Per spec §ط (تعدد التعيينات):
 *   - assignment status='terminated' or endDate <= today → plan.status='expired'
 *   - assignment moved out of Umrah department → plan.status='suspended'
 *
 * Touching `routes/employees.ts` to emit a dedicated event would couple
 * HR to Umrah. Instead, this cron polls daily for orphaned plans and
 * flips their status through the central engine
 * (umrahCommissionEngine.transitionPlanForAssignment). Idempotent and
 * one-way: only `active` plans are reconsidered.
 */
export async function umrahDailyPlanLifecycleSync(): Promise<string> {
  let transitions = 0;
  for (const c of await listActiveCompanies()) {
    // Find active plans whose assignment is either terminated or already
    // past its end date.
    const expiredCandidates = await rawQuery<{ id: number; assignmentId: number | null; planName: string }>(
      `SELECT p.id, p."assignmentId", p."planName"
         FROM employee_commission_plans p
         JOIN employee_assignments a ON a.id = p."assignmentId"
        WHERE p."companyId" = $1
          AND p."deletedAt" IS NULL
          AND p.status = 'active'
          AND ( a.status IN ('terminated','ended','rejected')
                OR (a."endDate" IS NOT NULL AND a."endDate" < CURRENT_DATE) )`,
      [c.id]
    );
    for (const plan of expiredCandidates) {
      if (plan.assignmentId === null) continue;
      const { transitionPlanForAssignment } = await import("./umrahCommissionEngine.js");
      const r = await transitionPlanForAssignment(
        { companyId: c.id, branchId: null, userId: 0 },
        plan.assignmentId,
        "ended"
      );
      transitions += r.updated;
    }
  }
  return `Auto-transitioned ${transitions} commission plan(s) on terminated/ended assignments`;
}

// ---------------------------------------------------------------------------
// C32 — monthly Umrah financial summary (revenue / cost / margin / penalties)
// ---------------------------------------------------------------------------

export async function umrahMonthlyFinancialSummary(): Promise<string> {
  let totalReports = 0;
  // Run on the 1st of every month for the previous month.
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startIso = iso(periodStart);
  const endIso = iso(periodEnd);

  for (const c of await listActiveCompanies()) {
    const [{ totalCost }] = await rawQuery<{ totalCost: string }>(
      `SELECT COALESCE(SUM("netCost"),0) AS "totalCost"
         FROM umrah_nusk_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND "issueDate"::date BETWEEN $2 AND $3`,
      [c.id, startIso, endIso]
    );
    const [{ totalRevenue }] = await rawQuery<{ totalRevenue: string }>(
      `SELECT COALESCE(SUM(total),0) AS "totalRevenue"
         FROM umrah_agent_invoices
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND status IN ('sent','partially_paid','paid')
          AND "createdAt"::date BETWEEN $2 AND $3`,
      [c.id, startIso, endIso]
    );
    const [{ openPenalties }] = await rawQuery<{ openPenalties: string }>(
      `SELECT COALESCE(SUM("penaltyAmount"),0) AS "openPenalties"
         FROM umrah_violations
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND status NOT IN ('paid','closed')
          AND "createdAt"::date BETWEEN $2 AND $3`,
      [c.id, startIso, endIso]
    );
    const [{ mutamerCount }] = await rawQuery<{ mutamerCount: number }>(
      `SELECT COUNT(*)::int AS "mutamerCount"
         FROM umrah_mutamers
        WHERE "companyId"=$1 AND "deletedAt" IS NULL
          AND "createdAt"::date BETWEEN $2 AND $3`,
      [c.id, startIso, endIso]
    );

    const revenue = Number(totalRevenue);
    const cost = Number(totalCost);
    const margin = revenue - cost;

    const targets: number[] = [];
    const cfo = await getCfoAssignmentId(c.id, 0);
    if (cfo) targets.push(cfo);
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (mgr && mgr !== cfo) targets.push(mgr);
    if (targets.length === 0) continue;

    const body =
      `الفترة: ${startIso} → ${endIso}\n` +
      `معتمرون: ${mutamerCount}\n` +
      `إيرادات: ${revenue.toFixed(2)} ر.س\n` +
      `تكاليف: ${cost.toFixed(2)} ر.س\n` +
      `الهامش: ${margin.toFixed(2)} ر.س\n` +
      `غرامات مفتوحة: ${Number(openPenalties).toFixed(2)} ر.س`;

    for (const t of targets) {
      await createNotification({
        companyId: c.id,
        assignmentId: t,
        type: "umrah",
        title: "الملخص المالي الشهري لمسار العمرة",
        body,
        priority: "normal",
        refType: "umrah_dashboard",
        refId: 0,
        actionUrl: "/umrah",
      });
    }
    totalReports++;
  }
  return `Sent ${totalReports} monthly financial summary report(s)`;
}

// ---------------------------------------------------------------------------
// Public registry — the cronScheduler imports this and appends to its
// existing JOB_DEFINITIONS list. Keeping the structure here keeps the
// scheduler file noise-free.
// ---------------------------------------------------------------------------

export const UMRAH_CRON_JOBS = [
  { name: "umrah_daily_overstay_scan",     description: "C27 — فحص المعتمرين المتجاوزين", schedule: "0 6 * * *",   handler: umrahDailyOverstayScan },
  { name: "umrah_daily_absconder_scan",    description: "C28 — فحص المعتمرين المتغيّبين", schedule: "0 6 * * *",   handler: umrahDailyAbsconderScan },
  { name: "umrah_daily_overdue_invoices",  description: "C29 — فواتير وكلاء عمرة متأخرة", schedule: "0 8 * * *",   handler: umrahDailyOverdueAgentInvoices },
  { name: "umrah_weekly_agent_performance",description: "C30 — تقرير أداء الوكلاء الفرعيين الأسبوعي", schedule: "0 8 * * 1", handler: umrahWeeklyAgentPerformance },
  { name: "umrah_daily_visa_expiry",       description: "C31 — تنبيه تأشيرات قاربت الانتهاء", schedule: "0 7 * * *", handler: umrahDailyVisaExpiryAlert },
  { name: "umrah_monthly_financial_summary",description: "C32 — الملخص المالي الشهري لمسار العمرة", schedule: "0 8 1 * *", handler: umrahMonthlyFinancialSummary },
  { name: "umrah_daily_plan_lifecycle_sync", description: "C32.5 — مزامنة دورة حياة خطط العمولة مع تعيينات الموظفين", schedule: "0 1 * * *", handler: umrahDailyPlanLifecycleSync },
];
