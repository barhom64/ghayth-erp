import { rawQuery } from "./rawdb.js";
import { haversineDistance } from "./algorithms.js";
import { logger } from "./logger.js";

export interface ScheduleItem {
  type: "task" | "appointment" | "maintenance" | "ticket";
  id: number;
  title: string;
  priority: number;
  scheduledTime?: string;
  estimatedDuration?: number;
  location?: { lat: number; lon: number };
  distanceFromPrevious?: number;
  slaDeadline?: string;
}

export interface EmployeeSchedule {
  employeeId: number;
  employeeName: string;
  date: string;
  workloadScore: number;
  items: ScheduleItem[];
  estimatedTravelTimeMinutes: number;
}

export async function buildEmployeeSchedule(
  companyId: number,
  employeeId: number,
  date: string
): Promise<EmployeeSchedule> {
  const [empRow] = await rawQuery<{ name: string }>(
    `SELECT e.name FROM employees e WHERE e.id=$1`,
    [employeeId]
  );
  const employeeName = empRow?.name ?? `Employee ${employeeId}`;

  const tasks = await rawQuery<Record<string, unknown>>(
    `SELECT t.id, t.title, t."scheduledDate" as "scheduledTime",
            t."estimatedDuration", t.priority, t.status
     FROM tasks t
     WHERE t."companyId"=$1
       AND t."scheduledDate"::date=$2::date
       AND t.status NOT IN ('completed','cancelled')
       AND t."assignedTo" IN (SELECT id FROM employee_assignments WHERE "employeeId"=$3 AND "companyId"=$1)
     ORDER BY t."scheduledDate"`,
    [companyId, date, employeeId]
  );

  const tickets = await rawQuery<Record<string, unknown>>(
    `SELECT st.id, st.title, st."createdAt" as "scheduledTime",
            st."escalationLevel", st."slaBreached"
     FROM support_tickets st
     WHERE st."companyId"=$1
       AND st.status='open'
       AND st."assigneeId" IN (SELECT id FROM employee_assignments WHERE "employeeId"=$2 AND "companyId"=$1)
     ORDER BY st."createdAt"
     LIMIT 5`,
    [companyId, employeeId]
  );

  const maintenance = await rawQuery<Record<string, unknown>>(
    `SELECT mr.id, mr.description AS title, mr."createdAt" as "scheduledTime", mr.priority
     FROM maintenance_requests mr
     WHERE mr."companyId"=$1
       AND mr."createdAt"::date=$2::date
       AND mr.status NOT IN ('completed','cancelled')
       AND mr."assignedTo" IN (SELECT id FROM employee_assignments WHERE "employeeId"=$3 AND "companyId"=$1)`,
    [companyId, date, employeeId]
  );

  const items: ScheduleItem[] = [];

  for (const t of tasks) {
    items.push({
      type: "task",
      id: t.id as number,
      title: t.title as string,
      priority: t.priority === "urgent" ? 4 : t.priority === "high" ? 3 : t.priority === "normal" ? 2 : 1,
      scheduledTime: t.scheduledTime as string | undefined,
      estimatedDuration: (t.estimatedDuration as number | undefined) ?? 60,
    });
  }

  for (const t of tickets) {
    items.push({
      type: "ticket",
      id: t.id as number,
      title: t.title as string,
      priority: t.slaBreached ? 5 : Number(t.escalationLevel) > 1 ? 4 : 2,
      scheduledTime: t.scheduledTime as string | undefined,
      estimatedDuration: 30,
    });
  }

  for (const m of maintenance) {
    items.push({
      type: "maintenance",
      id: m.id as number,
      title: m.title as string,
      priority: m.priority === "urgent" ? 4 : 2,
      scheduledTime: m.scheduledTime as string | undefined,
      estimatedDuration: 90,
    });
  }

  items.sort((a, b) => b.priority - a.priority);

  let estimatedTravelTimeMinutes = 0;
  let prevLat: number | null = null;
  let prevLon: number | null = null;

  for (const item of items) {
    if (item.location && prevLat != null && prevLon != null) {
      const dist = haversineDistance(prevLat, prevLon, item.location.lat, item.location.lon);
      item.distanceFromPrevious = dist;
      estimatedTravelTimeMinutes += (dist / 40) * 60;
    }
    if (item.location) {
      prevLat = item.location.lat;
      prevLon = item.location.lon;
    }
  }

  const workloadScore = Math.min(100, (items.length / 10) * 100);

  return {
    employeeId,
    employeeName,
    date,
    workloadScore,
    items,
    estimatedTravelTimeMinutes: Math.round(estimatedTravelTimeMinutes),
  };
}

export async function buildAllSchedules(companyId: number, date: string): Promise<EmployeeSchedule[]> {
  const employees = await rawQuery<{ id: number }>(
    `SELECT DISTINCT ea."employeeId" as id FROM employee_assignments ea WHERE ea."companyId"=$1 AND ea.status='active'`,
    [companyId]
  );

  const schedules: EmployeeSchedule[] = [];
  for (const emp of employees) {
    try {
      const schedule = await buildEmployeeSchedule(companyId, emp.id, date);
      schedules.push(schedule);
    } catch (err) {
      logger.error(err, `Schedule build error for employee ${emp.id}:`);
    }
  }
  return schedules;
}
