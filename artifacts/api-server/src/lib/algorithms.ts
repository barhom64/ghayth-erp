import { rawQuery } from "./rawdb.js";

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const haversineKm = haversineDistance;

export function movingAverage(values: number[], periods?: number): number {
  if (values.length === 0) return 0;
  const p = periods ?? values.length;
  const window = values.slice(-p);
  const totalWeight = window.reduce((sum, _, i) => sum + (i + 1), 0);
  const weightedSum = window.reduce((sum, val, i) => sum + val * (i + 1), 0);
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export interface Resource {
  id: number;
  workload: number;
  lat?: number;
  lon?: number;
  lastAssignedAt?: Date;
  specialty?: string;
  rating?: number;
}

interface LoadBalanceOptions {
  targetLat?: number;
  targetLon?: number;
  maxWorkload?: number;
  requiredSpecialty?: string;
}

export function selectLeastLoadedResource(
  resources: Resource[],
  options: LoadBalanceOptions = {}
): Resource | null {
  const { targetLat, targetLon, maxWorkload = Infinity, requiredSpecialty } = options;
  let available = resources.filter((r) => r.workload < maxWorkload);
  if (available.length === 0) return null;

  const maxTasks = Math.max(...available.map((r) => r.workload), 1);
  const maxDist =
    targetLat != null && targetLon != null
      ? Math.max(
          ...available.map((r) =>
            r.lat != null && r.lon != null ? haversineDistance(targetLat, targetLon, r.lat, r.lon) : 0
          ),
          1
        )
      : 1;

  let best: Resource | null = null;
  let bestScore = Infinity;

  for (const r of available) {
    const taskScore = (r.workload / maxTasks) * 0.4;

    let distScore = 0;
    if (targetLat != null && targetLon != null && r.lat != null && r.lon != null) {
      distScore = (haversineDistance(targetLat, targetLon, r.lat, r.lon) / maxDist) * 0.3;
    }

    let specScore = 0.2;
    if (requiredSpecialty && r.specialty) {
      specScore = r.specialty.toLowerCase() === requiredSpecialty.toLowerCase() ? 0 : 0.2;
    }

    const ratingScore = r.rating != null ? ((5 - r.rating) / 5) * 0.1 : 0.05;

    const total = taskScore + distScore + specScore + ratingScore;
    if (total < bestScore) {
      bestScore = total;
      best = r;
    }
  }

  return best;
}

export async function loadBalanceAssign(
  companyId: number,
  taskType: string,
  targetLat?: number,
  targetLon?: number,
  requiredSpecialty?: string
): Promise<{ employeeId: number; assignmentId: number; score: number } | null> {
  try {
    const employees = await rawQuery<any>(
      `SELECT ea.id AS "assignmentId", ea."employeeId", ea.role,
              e.name, e.lat, e.lon,
              3 AS rating,
              (SELECT COUNT(*) FROM tasks t
               WHERE t."assignedTo" = ea.id AND t."companyId" = $1
               AND t.status NOT IN ('completed','cancelled'))::int AS workload
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1 AND ea.status = 'active'
       ORDER BY workload ASC`,
      [companyId]
    );

    if (employees.length === 0) return null;

    const resources: Resource[] = employees.map((e: any) => ({
      id: e.employeeId,
      workload: e.workload,
      lat: e.lat ? Number(e.lat) : undefined,
      lon: e.lon ? Number(e.lon) : undefined,
      specialty: e.role,
      rating: Number(e.rating),
    }));

    const selected = selectLeastLoadedResource(resources, {
      targetLat,
      targetLon,
      maxWorkload: 15,
      requiredSpecialty,
    });

    if (!selected) return null;

    const emp = employees.find((e: any) => e.employeeId === selected.id);
    return {
      employeeId: selected.id,
      assignmentId: emp?.assignmentId ?? 0,
      score: selected.workload,
    };
  } catch {
    return null;
  }
}

export function criticalPathLength(tasks: { id: number; estimatedHours: number; dependsOn: number[] }[]): number {
  const dp = new Map<number, number>();
  function longest(id: number): number {
    if (dp.has(id)) return dp.get(id)!;
    const t = tasks.find((x) => x.id === id);
    if (!t) return 0;
    const depMax = t.dependsOn.length ? Math.max(...t.dependsOn.map(longest)) : 0;
    const val = depMax + (t.estimatedHours || 0);
    dp.set(id, val);
    return val;
  }
  let max = 0;
  for (const t of tasks) {
    const v = longest(t.id);
    if (v > max) max = v;
  }
  return max;
}

export function slaHours(priority: string): number {
  const map: Record<string, number> = { critical: 2, high: 4, medium: 8, low: 24 };
  return map[priority] ?? 24;
}

export function maintenancePriority(category: string, avgResponseDays: number): string {
  const severityMap: Record<string, number> = {
    plumbing: 3, electrical: 4, structural: 5, hvac: 3, appliance: 2, general: 1,
  };
  const severity = severityMap[category?.toLowerCase()] ?? 2;
  const historyFactor = avgResponseDays < 5 ? 1 : avgResponseDays < 14 ? 2 : 3;
  const score = severity + historyFactor;
  if (score >= 7) return "critical";
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export function slaDeadlineForPriority(priority: string): Date {
  const hours = slaHours(priority);
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}

export function maintenanceSlaDeadline(priority: string): Date {
  const hoursMap: Record<string, number> = { critical: 4, high: 24, medium: 72, low: 168 };
  const hours = hoursMap[priority] ?? 72;
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d;
}
