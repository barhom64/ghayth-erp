import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";

export const calendarRouter = Router();
calendarRouter.use(authMiddleware);

interface MilestoneRow { id: number; title: string; date: string; status: string; projectName: string | null; projectId: number; }
interface ObligationCalRow { id: number; title: string; date: string; status: string; entityType: string; entityId: number; obligationType: string; }
interface ContractExpiryRow { id: number; date: string; type: string; tenantName: string | null; unitId: number | null; }
interface TaskCalRow { id: number; title: string; date: string; status: string; priority: string; projectName: string | null; }
interface TrainingRow { id: number; name: string; date: string; status: string; provider: string | null; }
interface EmployeeDocRow { id: number; type: string; name: string; date: string; employeeId: number; employeeName: string; }
interface VehicleExpiryRow { id: number; plateNumber: string | null; make: string | null; model: string | null; regExp: string | null; inspExp: string | null; svcExp: string | null; }
interface PropertyInsuranceRow { id: number; unitNumber: string | null; date: string; }
interface LeaveCalRow { id: number; date: string; endDate: string; status: string; days: number; employeeId: number; employeeName: string; leaveTypeName: string | null; }
interface InterviewRow { id: number; date: string; candidateName: string; status: string; jobTitle: string | null; postingId: number | null; }

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  category: string;
  status: string;
  priority?: string;
  context?: string;
  link: string;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (e) { logger.error(e, "calendar query failed"); return fallback; }
}

calendarRouter.get("/upcoming", authorize({ feature: "projects", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const daysAhead = Math.min(Number(req.query.days) || 30, 90);
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() + daysAhead * 86400000).toISOString();

    const [
      milestones,
      obligations,
      contractExpirations,
      tasks,
      trainings,
      empDocs,
      vehicleExpiries,
      propertyInsurance,
      leaves,
      interviews,
    ] = await Promise.all([
      safe(() => rawQuery<MilestoneRow>(
        `SELECT pm.id, pm.title, pm."dueDate" as "date", pm.status, p.name as "projectName", p.id as "projectId"
         FROM project_milestones pm
         JOIN projects p ON p.id = pm."projectId"
         WHERE p."companyId" = $1 AND p."deletedAt" IS NULL AND pm.status NOT IN ('completed','cancelled')
           AND pm."dueDate" BETWEEN $2 AND $3
         ORDER BY pm."dueDate" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<ObligationCalRow>(
        `SELECT id, title, "dueAt" as "date", status, "entityType", "entityId", "obligationType"
         FROM obligations
         WHERE "companyId" = $1 AND status IN ('pending','breached','escalated_l1','escalated_l2')
           AND "dueAt" BETWEEN $2 AND $3
         ORDER BY "dueAt" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<ContractExpiryRow>(
        `SELECT rc.id, rc."endDate" as "date", 'contract_expiry' as type,
                t.name as "tenantName", rc."unitId"
         FROM rental_contracts rc
         LEFT JOIN tenants t ON t.id = rc."tenantId"
         WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL AND rc.status = 'active'
           AND rc."endDate" BETWEEN $2 AND $3
         ORDER BY rc."endDate" LIMIT 30`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<TaskCalRow>(
        `SELECT t.id, t.title, t."scheduledDate" as "date", t.status, t.priority,
                p.name as "projectName"
         FROM tasks t
         LEFT JOIN projects p ON t."linkedEntityType" = 'project' AND p.id = t."linkedEntityId"
         WHERE t."companyId" = $1 AND t."deletedAt" IS NULL AND t.status NOT IN ('completed','cancelled')
           AND t."scheduledDate" BETWEEN $2 AND $3
         ORDER BY t."scheduledDate" LIMIT 50`,
        [cid, now, cutoff]
      ), []),
      safe(() => rawQuery<TrainingRow>(
        `SELECT id, name, "startDate" as "date", status, provider
         FROM training_programs
         WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('planned','ongoing')
           AND "startDate" BETWEEN $2 AND $3
         ORDER BY "startDate" LIMIT 30`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      safe(() => rawQuery<EmployeeDocRow>(
        `SELECT ed.id, ed.type, ed.name, ed."expiryDate" as "date", ed."employeeId",
                e."name" as "employeeName"
         FROM employee_documents ed
         JOIN employees e ON e.id = ed."employeeId"
         WHERE ed."companyId" = $1 AND ed."expiryDate" BETWEEN $2 AND $3
         ORDER BY ed."expiryDate" LIMIT 30`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      safe(() => rawQuery<VehicleExpiryRow>(
        `SELECT id, "plateNumber", make, model,
                "registrationExpiry" as "regExp",
                "nextInspectionDate" as "inspExp",
                "nextServiceDate" as "svcExp"
         FROM fleet_vehicles
         WHERE "companyId" = $1 AND "deletedAt" IS NULL
           AND (
             ("registrationExpiry" BETWEEN $2 AND $3)
             OR ("nextInspectionDate" BETWEEN $2 AND $3)
             OR ("nextServiceDate" BETWEEN $2 AND $3)
           )
         LIMIT 50`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      safe(() => rawQuery<PropertyInsuranceRow>(
        `SELECT id, "unitNumber", "insuranceExpiry" as "date"
         FROM property_units
         WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "insuranceExpiry" BETWEEN $2 AND $3
         ORDER BY "insuranceExpiry" LIMIT 30`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      safe(() => rawQuery<LeaveCalRow>(
        `SELECT lr.id, lr."startDate" as "date", lr."endDate", lr.status, lr.days,
                lr."employeeId", e."name" as "employeeName",
                lt.name as "leaveTypeName"
         FROM hr_leave_requests lr
         JOIN employees e ON e.id = lr."employeeId"
         LEFT JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."companyId" = $1 AND lr."deletedAt" IS NULL
           AND lr.status IN ('approved','pending')
           AND lr."startDate" BETWEEN $2 AND $3
         ORDER BY lr."startDate" LIMIT 50`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      safe(() => rawQuery<InterviewRow>(
        `SELECT a.id, a."interviewDate" as "date", a."applicantName" as "candidateName",
                a.status, jp.title as "jobTitle", a."postingId"
         FROM job_applications a
         LEFT JOIN job_postings jp ON jp.id = a."postingId"
         WHERE jp."companyId" = $1
           AND a."interviewDate" IS NOT NULL
           AND a."interviewDate" BETWEEN $2 AND $3
           AND a."deletedAt" IS NULL
         ORDER BY a."interviewDate" LIMIT 30`,
        [cid, now, cutoff]
      ), []),
    ]);

    const events: CalendarEvent[] = [];

    milestones.forEach((m) => events.push({
      id: `milestone-${m.id}`, date: m.date, title: m.title,
      category: "milestone", status: m.status,
      context: m.projectName ?? undefined, link: `/projects/${m.projectId}`,
    }));

    obligations.forEach((o) => events.push({
      id: `obligation-${o.id}`, date: o.date, title: o.title,
      category: "obligation", status: o.status,
      context: `${o.entityType} #${o.entityId}`, link: "/obligations",
    }));

    contractExpirations.forEach((c) => events.push({
      id: `contract-${c.id}`, date: c.date, title: `انتهاء عقد ${c.tenantName || ""}`.trim(),
      category: "contract_expiry", status: "expiring",
      context: `وحدة #${c.unitId}`, link: `/properties/contracts/${c.id}`,
    }));

    tasks.forEach((t) => events.push({
      id: `task-${t.id}`, date: t.date, title: t.title,
      category: "task", status: t.status, priority: t.priority,
      context: t.projectName || "", link: "/tasks",
    }));

    trainings.forEach((tr) => events.push({
      id: `training-${tr.id}`, date: tr.date, title: `بدء تدريب: ${tr.name}`,
      category: "training", status: tr.status,
      context: tr.provider || "", link: `/hr/training/${tr.id}`,
    }));

    const docTypeLabel: Record<string, string> = {
      iqama: "إقامة", passport: "جواز سفر", visa: "تأشيرة",
      work_permit: "تصريح عمل", license: "رخصة", contract: "عقد",
      health_certificate: "شهادة صحية", other: "وثيقة",
    };
    empDocs.forEach((d) => events.push({
      id: `empdoc-${d.id}`, date: d.date,
      title: `انتهاء ${docTypeLabel[d.type] || d.type}: ${d.employeeName}`,
      category: "document_expiry", status: "expiring",
      context: d.name, link: `/hr/employees/${d.employeeId}`,
    }));

    const vehicleEvents: CalendarEvent[] = [];
    vehicleExpiries.forEach((v) => {
      const label = `${v.make || ""} ${v.model || ""} (${v.plateNumber || v.id})`.trim();
      if (v.regExp && v.regExp >= now.slice(0, 10) && v.regExp <= cutoff.slice(0, 10)) {
        vehicleEvents.push({
          id: `vehicle-reg-${v.id}`, date: v.regExp,
          title: `انتهاء استمارة: ${label}`,
          category: "vehicle_expiry", status: "expiring",
          context: "الاستمارة", link: `/fleet/vehicles/${v.id}`,
        });
      }
      if (v.inspExp && v.inspExp >= now.slice(0, 10) && v.inspExp <= cutoff.slice(0, 10)) {
        vehicleEvents.push({
          id: `vehicle-insp-${v.id}`, date: v.inspExp,
          title: `فحص دوري: ${label}`,
          category: "vehicle_expiry", status: "due",
          context: "الفحص الدوري", link: `/fleet/vehicles/${v.id}`,
        });
      }
      if (v.svcExp && v.svcExp >= now.slice(0, 10) && v.svcExp <= cutoff.slice(0, 10)) {
        vehicleEvents.push({
          id: `vehicle-svc-${v.id}`, date: v.svcExp,
          title: `صيانة مجدولة: ${label}`,
          category: "vehicle_maintenance", status: "due",
          context: "الصيانة", link: `/fleet/vehicles/${v.id}`,
        });
      }
    });
    events.push(...vehicleEvents);

    propertyInsurance.forEach((pu) => events.push({
      id: `propins-${pu.id}`, date: pu.date,
      title: `انتهاء تأمين وحدة ${pu.unitNumber || pu.id}`,
      category: "insurance_expiry", status: "expiring",
      context: `وحدة ${pu.unitNumber || "#" + pu.id}`,
      link: `/properties/units/${pu.id}`,
    }));

    leaves.forEach((lv) => events.push({
      id: `leave-${lv.id}`, date: lv.date,
      title: `إجازة: ${lv.employeeName}`,
      category: "leave", status: lv.status,
      context: `${lv.leaveTypeName || "إجازة"} · ${lv.days || 1} يوم`,
      link: `/hr/leaves`,
    }));

    interviews.forEach((iv) => events.push({
      id: `interview-${iv.id}`, date: iv.date,
      title: `مقابلة: ${iv.candidateName}`,
      category: "interview", status: iv.status,
      context: iv.jobTitle || "",
      link: iv.postingId ? `/hr/recruitment/${iv.postingId}` : "/hr/recruitment",
    }));

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const summary = {
      total: events.length,
      milestones: milestones.length,
      obligations: obligations.length,
      contractExpirations: contractExpirations.length,
      tasks: tasks.length,
      trainings: trainings.length,
      documentExpiries: empDocs.length,
      vehicleExpiries: vehicleEvents.length,
      insuranceExpiries: propertyInsurance.length,
      leaves: leaves.length,
      interviews: interviews.length,
    };

    res.json({ events, summary });
  } catch (err) {
    handleRouteError(err, res, "Calendar upcoming error:");
  }
});
