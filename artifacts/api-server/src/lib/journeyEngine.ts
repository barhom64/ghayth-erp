// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY ENGINE — محرك الرحلات التشغيلية
// ─────────────────────────────────────────────────────────────────────────────
// Cross-module work journeys that span multiple domains.  Each journey is a
// sequence of steps that the system tracks to completion.
//
// Examples:
//   hire→onboard→assign→payroll  (HR)
//   season→agents→pilgrims→invoices→close  (Umrah)
//   lead→opportunity→contract→invoice  (CRM)
//   vehicle_add→insure→assign→maintain  (Fleet)
//   property_add→units→tenant→lease→collect  (Properties)
//
// A journey instance tracks which steps are done vs. pending.  The engine
// does NOT enforce ordering — it observes events and marks steps complete
// as they happen.  Dashboards use this to show progress and highlight
// blocked steps.

import { rawExecute, rawQuery, pool } from "./rawdb.js";
import { emitEvent } from "./businessHelpers.js";
import { logger } from "./logger.js";

export interface JourneyStepDef {
  key: string;
  label: string;
  requiredEvent?: string;
}

export interface JourneyDefinition {
  type: string;
  label: string;
  domain: string;
  steps: JourneyStepDef[];
}

export const JOURNEY_DEFINITIONS: JourneyDefinition[] = [
  {
    type: "hr_onboarding",
    label: "رحلة التوظيف والتهيئة",
    domain: "hr",
    steps: [
      { key: "posting_created", label: "إنشاء إعلان وظيفي", requiredEvent: "hr.posting.created" },
      { key: "application_received", label: "استقبال طلبات", requiredEvent: "hr.application.created" },
      { key: "employee_hired", label: "توظيف الموظف", requiredEvent: "hr.employee.created" },
      { key: "assignment_created", label: "تعيين في فرع", requiredEvent: "hr.assignment.created" },
      { key: "documents_uploaded", label: "رفع المستندات", requiredEvent: "hr.document.uploaded" },
      { key: "first_attendance", label: "أول حضور", requiredEvent: "hr.attendance.checked_in" },
      { key: "first_payroll", label: "أول مسير رواتب", requiredEvent: "hr.payroll.run_completed" },
    ],
  },
  {
    type: "umrah_season",
    label: "رحلة موسم العمرة",
    domain: "umrah",
    steps: [
      { key: "season_opened", label: "فتح الموسم", requiredEvent: "umrah.season.opened" },
      { key: "agents_registered", label: "تسجيل الوكلاء", requiredEvent: "umrah.agent.created" },
      { key: "packages_created", label: "إنشاء الباقات", requiredEvent: "umrah.package.created" },
      { key: "pilgrims_added", label: "إضافة المعتمرين", requiredEvent: "umrah.pilgrim.created" },
      { key: "transport_scheduled", label: "جدولة النقل", requiredEvent: "umrah.transport.created" },
      { key: "invoices_generated", label: "إصدار الفواتير", requiredEvent: "umrah.invoice.generated" },
      { key: "payments_collected", label: "تحصيل المدفوعات", requiredEvent: "umrah.payment.received" },
    ],
  },
  {
    type: "crm_deal",
    label: "رحلة الصفقة",
    domain: "crm",
    steps: [
      { key: "lead_created", label: "إنشاء العميل المحتمل", requiredEvent: "crm.lead.created" },
      { key: "opportunity_opened", label: "فتح الفرصة", requiredEvent: "crm.opportunity.created" },
      { key: "proposal_sent", label: "إرسال العرض", requiredEvent: "crm.proposal.sent" },
      { key: "deal_won", label: "كسب الصفقة", requiredEvent: "crm.deal.won" },
      { key: "contract_signed", label: "توقيع العقد", requiredEvent: "legal.contract.created" },
      { key: "invoice_created", label: "إصدار الفاتورة", requiredEvent: "finance.invoice.created" },
    ],
  },
  {
    type: "fleet_vehicle",
    label: "رحلة المركبة",
    domain: "fleet",
    steps: [
      { key: "vehicle_added", label: "إضافة المركبة", requiredEvent: "fleet.vehicle.created" },
      { key: "insurance_set", label: "تأمين المركبة", requiredEvent: "fleet.insurance.created" },
      { key: "driver_assigned", label: "تعيين السائق", requiredEvent: "fleet.assignment.created" },
      { key: "first_trip", label: "أول رحلة", requiredEvent: "fleet.trip.started" },
      { key: "first_maintenance", label: "أول صيانة", requiredEvent: "fleet.maintenance.created" },
    ],
  },
  {
    type: "property_lease",
    label: "رحلة التأجير",
    domain: "property",
    steps: [
      { key: "property_added", label: "إضافة العقار", requiredEvent: "property.created" },
      { key: "unit_created", label: "إنشاء الوحدة", requiredEvent: "property.unit.created" },
      { key: "tenant_registered", label: "تسجيل المستأجر", requiredEvent: "property.tenant.created" },
      { key: "lease_signed", label: "توقيع العقد", requiredEvent: "property.lease.created" },
      { key: "first_collection", label: "أول تحصيل", requiredEvent: "property.payment.received" },
    ],
  },
  {
    type: "finance_month_close",
    label: "رحلة إقفال الشهر",
    domain: "finance",
    steps: [
      { key: "reconciliation_done", label: "المطابقات", requiredEvent: "finance.reconciliation.completed" },
      { key: "accruals_posted", label: "المستحقات", requiredEvent: "finance.accrual.posted" },
      { key: "depreciation_run", label: "الإهلاك", requiredEvent: "finance.depreciation.run" },
      { key: "trial_balance_reviewed", label: "مراجعة الميزان", requiredEvent: "finance.trial_balance.reviewed" },
      { key: "period_closed", label: "إقفال الفترة", requiredEvent: "finance.period.closed" },
    ],
  },
];

let tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journey_instances (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "journeyType" VARCHAR(40) NOT NULL,
      "entityType" VARCHAR(40),
      "entityId" INTEGER,
      label TEXT NOT NULL,
      "completedSteps" JSONB NOT NULL DEFAULT '[]',
      "totalSteps" INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
      metadata JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_journey_company
      ON journey_instances ("companyId", "journeyType", status)
  `);
  tableEnsured = true;
}

export async function startJourney(
  companyId: number,
  journeyType: string,
  entityType?: string,
  entityId?: number,
  metadata?: Record<string, any>
): Promise<number> {
  await ensureTable();
  const def = JOURNEY_DEFINITIONS.find((d) => d.type === journeyType);
  if (!def) throw new Error(`Unknown journey type: ${journeyType}`);

  const [row] = await rawQuery<{ id: number }>(
    `INSERT INTO journey_instances
     ("companyId","journeyType","entityType","entityId",label,"totalSteps",metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [companyId, journeyType, entityType ?? null, entityId ?? null,
     def.label, def.steps.length, metadata ? JSON.stringify(metadata) : null]
  );
  return row.id;
}

export async function advanceJourney(
  companyId: number,
  journeyType: string,
  stepKey: string,
  entityType?: string,
  entityId?: number
): Promise<{ journeyId: number; completed: boolean; progress: number } | null> {
  await ensureTable();
  const params: any[] = [companyId, journeyType];
  let where = `"companyId"=$1 AND "journeyType"=$2 AND status='in_progress'`;
  if (entityType && entityId) {
    params.push(entityType, entityId);
    where += ` AND "entityType"=$${params.length - 1} AND "entityId"=$${params.length}`;
  }

  const instances = await rawQuery<{ id: number; completedSteps: any[]; totalSteps: number }>(
    `SELECT id, "completedSteps", "totalSteps" FROM journey_instances WHERE ${where} ORDER BY id DESC LIMIT 1`,
    params
  );
  if (instances.length === 0) return null;
  const def = JOURNEY_DEFINITIONS.find((d) => d.type === journeyType);
  const validKeys = def ? new Set(def.steps.map((s) => s.key)) : null;
  if (validKeys && !validKeys.has(stepKey)) return null;

  const inst = instances[0];
  const steps: string[] = Array.isArray(inst.completedSteps) ? inst.completedSteps : [];
  if (steps.includes(stepKey)) return { journeyId: inst.id, completed: false, progress: steps.length / inst.totalSteps };

  steps.push(stepKey);
  const completed = steps.length >= inst.totalSteps;
  await rawExecute(
    `UPDATE journey_instances
       SET "completedSteps"=$1, status=$2, "updatedAt"=NOW()
     WHERE id=$3`,
    [JSON.stringify(steps), completed ? "completed" : "in_progress", inst.id]
  );

  if (completed) {
    emitEvent({
      companyId, userId: 0,
      action: "system.journey.completed",
      entity: "journey_instances", entityId: inst.id,
      details: `رحلة مكتملة: ${journeyType}`,
    }).catch((err) => { logger.error(err, "JourneyEngine: journey completion event failed"); });
  }

  return { journeyId: inst.id, completed, progress: steps.length / inst.totalSteps };
}

export async function getJourneyProgress(
  companyId: number,
  journeyType: string,
  entityType?: string,
  entityId?: number
): Promise<{ id: number; completedSteps: string[]; totalSteps: number; status: string; progress: number } | null> {
  await ensureTable();
  const params: any[] = [companyId, journeyType];
  let where = `"companyId"=$1 AND "journeyType"=$2`;
  if (entityType && entityId) {
    params.push(entityType, entityId);
    where += ` AND "entityType"=$${params.length - 1} AND "entityId"=$${params.length}`;
  }
  const [row] = await rawQuery<any>(
    `SELECT * FROM journey_instances WHERE ${where} ORDER BY id DESC LIMIT 1`,
    params
  );
  if (!row) return null;
  const steps: string[] = Array.isArray(row.completedSteps) ? row.completedSteps : [];
  return { id: row.id, completedSteps: steps, totalSteps: row.totalSteps, status: row.status, progress: steps.length / row.totalSteps };
}

export async function listJourneys(
  companyId: number,
  status?: string
): Promise<any[]> {
  await ensureTable();
  const params: any[] = [companyId];
  let where = `"companyId"=$1`;
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  return rawQuery<any>(
    `SELECT *, (jsonb_array_length("completedSteps")::float / NULLIF("totalSteps",0)) AS progress
     FROM journey_instances WHERE ${where} ORDER BY "updatedAt" DESC LIMIT 100`,
    params
  );
}
