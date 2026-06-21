import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, parseId, zodParse, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";

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
interface UmrahSeasonRow { id: number; title: string; date: string; kind: "start" | "end"; }
interface UmrahGroupRow { id: number; name: string | null; nuskGroupNumber: string; date: string; mutamerCount: number | null; }

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
      umrahSeasonStarts,
      umrahSeasonEnds,
      umrahGroupArrivals,
      appointments,
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
      // Umrah season open events (startDate inside the window).
      safe(() => rawQuery<UmrahSeasonRow>(
        `SELECT id, title, "startDate"::text AS "date", 'start'::text AS kind
           FROM umrah_seasons
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "startDate" BETWEEN $2::date AND $3::date
          ORDER BY "startDate" LIMIT 20`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      // Umrah season close events (endDate inside the window).
      safe(() => rawQuery<UmrahSeasonRow>(
        `SELECT id, title, "endDate"::text AS "date", 'end'::text AS kind
           FROM umrah_seasons
          WHERE "companyId" = $1
            AND "deletedAt" IS NULL
            AND "endDate" BETWEEN $2::date AND $3::date
          ORDER BY "endDate" LIMIT 20`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      // Umrah group arrivals — the earliest entryDate inside each group
      // that falls in the window. Captures "this group lands on X".
      safe(() => rawQuery<UmrahGroupRow>(
        `SELECT g.id, g.name, g."nuskGroupNumber", g."mutamerCount",
                MIN(p."entryDate")::text AS "date"
           FROM umrah_groups g
           JOIN umrah_pilgrims p ON p."groupId" = g.id AND p."companyId" = g."companyId"
          WHERE g."companyId" = $1
            AND g."deletedAt" IS NULL
            AND p."deletedAt" IS NULL
            AND p."entryDate" IS NOT NULL
          GROUP BY g.id, g.name, g."nuskGroupNumber", g."mutamerCount"
         HAVING MIN(p."entryDate") BETWEEN $2::date AND $3::date
          ORDER BY MIN(p."entryDate") LIMIT 50`,
        [cid, now.slice(0, 10), cutoff.slice(0, 10)]
      ), []),
      // #2704 — المواعيد المجدولة داخل النافذة.
      safe(() => rawQuery<{ id: number; title: string; date: string; status: string; location: string | null }>(
        `SELECT id, title, "startsAt"::text AS "date", status, location
           FROM appointments
          WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'scheduled'
            AND "startsAt" BETWEEN $2 AND $3
          ORDER BY "startsAt" LIMIT 50`,
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

    umrahSeasonStarts.forEach((s) => events.push({
      id: `umrah-season-start-${s.id}`, date: s.date,
      title: `فتح موسم: ${s.title}`,
      category: "umrah_season", status: "opens",
      context: "بداية الموسم", link: `/umrah/seasons/${s.id}`,
    }));

    umrahSeasonEnds.forEach((s) => events.push({
      id: `umrah-season-end-${s.id}`, date: s.date,
      title: `إغلاق موسم: ${s.title}`,
      category: "umrah_season", status: "closes",
      context: "نهاية الموسم", link: `/umrah/seasons/${s.id}`,
    }));

    umrahGroupArrivals.forEach((g) => events.push({
      id: `umrah-group-${g.id}`, date: g.date,
      title: `وصول مجموعة: ${g.name || g.nuskGroupNumber}`,
      category: "umrah_group_arrival", status: "scheduled",
      context: g.mutamerCount ? `${g.mutamerCount} معتمر` : "",
      link: `/umrah/groups`,
    }));

    appointments.forEach((ap) => events.push({
      id: `appointment-${ap.id}`, date: ap.date, title: ap.title,
      category: "appointment", status: ap.status,
      context: ap.location || "", link: "/calendar",
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
      umrahSeasons: umrahSeasonStarts.length + umrahSeasonEnds.length,
      umrahGroupArrivals: umrahGroupArrivals.length,
      appointments: appointments.length,
    };

    res.json(maskFields(req, { events, summary }));
  } catch (err) {
    handleRouteError(err, res, "Calendar upcoming error:");
  }
});

// ─── المواعيد/الاجتماعات (#2704) ───────────────────────────────────────────
// كيان موعد قابل للإنشاء/التعديل/الإلغاء + توليد دعوة .ics. RBAC: calendar.my.
// حذف ناعم + استرجاع (متوافق مع سلة المحذوفات #2713). تشغيلي — لا يمسّ الدفتر.

interface AppointmentRow {
  id: number;
  companyId: number;
  branchId: number | null;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  attendees: Array<{ name?: string; email?: string }>;
}

const appointmentSchema = z.object({
  title: z.string().min(1, "عنوان الموعد مطلوب").max(300),
  description: z.string().max(5000).optional(),
  location: z.string().max(300).optional(),
  startsAt: z.string().min(1, "وقت البداية مطلوب"),
  endsAt: z.string().min(1, "وقت النهاية مطلوب"),
  allDay: z.boolean().optional(),
  status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  relatedEntityType: z.string().max(60).optional(),
  relatedEntityId: z.coerce.number().int().positive().optional(),
  attendees: z.array(z.object({
    name: z.string().max(200).optional(),
    email: z.string().email("بريد إلكتروني غير صالح").optional(),
  })).max(100).optional(),
  branchId: z.coerce.number().optional(),
});

function icsEscape(s: string | null | undefined): string {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function toIcsStamp(d: string | Date): string {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function buildAppointmentIcs(a: AppointmentRow): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ghayth ERP//Appointments//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appointment-${a.id}@ghayth-erp`,
    `DTSTAMP:${toIcsStamp(new Date())}`,
    `DTSTART:${toIcsStamp(a.startsAt)}`,
    `DTEND:${toIcsStamp(a.endsAt)}`,
    `SUMMARY:${icsEscape(a.title)}`,
  ];
  if (a.description) lines.push(`DESCRIPTION:${icsEscape(a.description)}`);
  if (a.location) lines.push(`LOCATION:${icsEscape(a.location)}`);
  if (a.status === "cancelled") lines.push("STATUS:CANCELLED");
  for (const at of a.attendees ?? []) {
    if (at?.email) lines.push(`ATTENDEE;CN=${icsEscape(at.name || at.email)}:mailto:${at.email}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// GET /calendar/appointments?from=&to=&deleted= — قائمة ضمن نافذة زمنية اختيارية.
calendarRouter.get("/appointments", authorize({ feature: "calendar.my", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const q = req.query as Record<string, string | undefined>;
    const showDeleted = q.deleted === "true";
    const params: unknown[] = [scope.companyId];
    let where = showDeleted
      ? `"companyId" = $1 AND "deletedAt" IS NOT NULL`
      : `"companyId" = $1 AND "deletedAt" IS NULL`;
    if (q.from) { params.push(q.from); where += ` AND "startsAt" >= $${params.length}`; }
    if (q.to) { params.push(q.to); where += ` AND "startsAt" <= $${params.length}`; }
    const rows = await rawQuery<AppointmentRow>(
      `SELECT * FROM appointments WHERE ${where} ORDER BY "startsAt" LIMIT 500`,
      params,
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List appointments error:"); }
});

// POST /calendar/appointments — إنشاء موعد.
calendarRouter.post("/appointments", authorize({ feature: "calendar.my", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(appointmentSchema.safeParse(req.body ?? {}));
    if (new Date(b.endsAt).getTime() < new Date(b.startsAt).getTime()) {
      throw new ValidationError("وقت النهاية قبل وقت البداية", { field: "endsAt", fix: "اجعل وقت النهاية بعد البداية" });
    }
    const [row] = await rawQuery<AppointmentRow>(
      `INSERT INTO appointments ("companyId","branchId",title,description,location,"startsAt","endsAt","allDay",status,"relatedEntityType","relatedEntityId",attendees,"createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) RETURNING *`,
      [scope.companyId, b.branchId ?? scope.branchId ?? null, b.title, b.description ?? null, b.location ?? null,
       b.startsAt, b.endsAt, b.allDay ?? false, b.status ?? "scheduled", b.relatedEntityType ?? null,
       b.relatedEntityId ?? null, JSON.stringify(b.attendees ?? []), scope.userId],
    );
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "appointment.created", entity: "appointments", entityId: row.id, details: JSON.stringify({ title: b.title }) }).catch((e) => logger.error(e, "appointment event failed"));
    auditFromRequest(req, "create", "appointments", row.id, { after: { title: b.title, startsAt: b.startsAt } }).catch((e) => logger.error(e, "appointment audit failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create appointment error:"); }
});

// PATCH /calendar/appointments/:id — تعديل موعد.
calendarRouter.patch("/appointments/:id", authorize({ feature: "calendar.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(appointmentSchema.partial().safeParse(req.body ?? {}));
    // كمرآة لتحقّق POST: لا يجوز أن تصبح النهاية قبل البداية بعد التعديل الجزئي.
    // نحمّل القيم الحالية لحساب القيمة الفعّالة (الجديدة إن وُجدت، وإلا المخزَّنة).
    if (b.startsAt !== undefined || b.endsAt !== undefined) {
      const [cur] = await rawQuery<{ startsAt: string; endsAt: string }>(
        `SELECT "startsAt", "endsAt" FROM appointments WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId],
      );
      if (!cur) throw new NotFoundError("الموعد غير موجود");
      const effStart = b.startsAt ?? cur.startsAt;
      const effEnd = b.endsAt ?? cur.endsAt;
      if (new Date(effEnd).getTime() < new Date(effStart).getTime()) {
        throw new ValidationError("وقت النهاية قبل وقت البداية", { field: "endsAt", fix: "اجعل وقت النهاية بعد البداية" });
      }
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    if (b.title !== undefined) set("title", b.title);
    if (b.description !== undefined) set("description", b.description ?? null);
    if (b.location !== undefined) set("location", b.location ?? null);
    if (b.startsAt !== undefined) set("startsAt", b.startsAt);
    if (b.endsAt !== undefined) set("endsAt", b.endsAt);
    if (b.allDay !== undefined) set("allDay", b.allDay);
    if (b.status !== undefined) set("status", b.status);
    if (b.relatedEntityType !== undefined) set("relatedEntityType", b.relatedEntityType ?? null);
    if (b.relatedEntityId !== undefined) set("relatedEntityId", b.relatedEntityId ?? null);
    if (b.attendees !== undefined) { params.push(JSON.stringify(b.attendees ?? [])); sets.push(`attendees = $${params.length}::jsonb`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث", { field: "body", fix: "أرسل حقلاً واحداً على الأقل" });
    sets.push(`"updatedAt" = NOW()`);
    params.push(id); params.push(scope.companyId);
    const [row] = await rawQuery<AppointmentRow>(
      `UPDATE appointments SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("الموعد غير موجود");
    auditFromRequest(req, "update", "appointments", id).catch((e) => logger.error(e, "appointment audit failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update appointment error:"); }
});

// DELETE /calendar/appointments/:id — حذف ناعم.
calendarRouter.delete("/appointments/:id", authorize({ feature: "calendar.my", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE appointments SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("الموعد غير موجود");
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "appointment.deleted", entity: "appointments", entityId: id }).catch((e) => logger.error(e, "appointment event failed"));
    auditFromRequest(req, "delete", "appointments", id).catch((e) => logger.error(e, "appointment audit failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete appointment error:"); }
});

// POST /calendar/appointments/:id/restore — استرجاع (سلة المحذوفات #2713).
calendarRouter.post("/appointments/:id/restore", authorize({ feature: "calendar.my", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE appointments SET "deletedAt" = NULL WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NOT NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("لا يوجد موعد محذوف بهذا المعرّف");
    auditFromRequest(req, "restore", "appointments", id).catch((e) => logger.error(e, "appointment audit failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "appointment.restored", entity: "appointments", entityId: id }).catch((e) => logger.error(e, "appointment event failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Restore appointment error:"); }
});

// GET /calendar/appointments/:id/ics — تنزيل دعوة iCalendar للموعد.
calendarRouter.get("/appointments/:id/ics", authorize({ feature: "calendar.my", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<AppointmentRow>(`SELECT * FROM appointments WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الموعد غير موجود");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="appointment-${id}.ics"`);
    res.send(buildAppointmentIcs(row));
  } catch (err) { handleRouteError(err, res, "Appointment ICS error:"); }
});
