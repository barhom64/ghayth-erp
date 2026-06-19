/**
 * TA-T18-VRP Phase 2 — Fleet Optimizer runs list (SPA).
 *
 * Lists the last 30 days of `vrp_optimization_runs` for the
 * dispatcher's company. Each row links to the detail page where
 * the dispatcher can approve / reject the plan.
 *
 * Phase 3 will add a "new run" form that lets the dispatcher pick
 * bookings + vehicles + date + algorithm before triggering a run.
 * Phase 2 is read-list-only.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Calculator, RefreshCw, ChevronLeft } from "lucide-react";

interface RunRow {
  id: number;
  runDate: string;
  status: string;
  algorithm: string | null;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  solveDurationMs: number | null;
  createdAt: string;
  assignmentCount: number;
  unassignedCount: number;
}

interface ListResponse {
  data: { rows: RunRow[]; windowDays: number };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:            { label: "قيد الحساب",     color: "bg-slate-100 text-slate-700" },
  solved:             { label: "بانتظار المراجعة", color: "bg-amber-100 text-amber-800" },
  approved:           { label: "موافق عليه",     color: "bg-emerald-100 text-emerald-700" },
  partially_approved: { label: "موافقة جزئية",   color: "bg-sky-100 text-sky-700" },
  rejected:           { label: "مرفوض",          color: "bg-rose-100 text-rose-700" },
  failed:             { label: "فشل",            color: "bg-rose-100 text-rose-700" },
};

export default function OptimizerRunsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, refetch } = useApiQuery<ListResponse>(
    ["fleet-optimizer-runs", String(days)],
    `/fleet/optimizer/runs?days=${days}`,
  );

  const rows = data?.data?.rows ?? [];

  return (
    <PageShell
      title="مُحسِّن الإسناد"
      subtitle="خطط دفعية اقتراحية لإسناد الحجوزات على الأسطول — TA-T18-VRP Phase 2"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "مُحسِّن الإسناد" }]}
    >
      <FleetTabsNav />

      <div className="flex justify-between items-center mt-4">
        <div className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">نافذة:</span>
          {[7, 14, 30, 60].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => setDays(n)}
            >
              {n} يوم
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 me-1 ${isLoading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs">
                <tr>
                  <th className="text-start p-2">#</th>
                  <th className="text-start p-2">تاريخ التشغيل</th>
                  <th className="text-start p-2">الحالة</th>
                  <th className="text-start p-2">الخوارزمية</th>
                  <th className="text-end p-2">عدد الإسنادات</th>
                  <th className="text-end p-2">غير مسنَدة</th>
                  <th className="text-end p-2">مسافة (كم)</th>
                  <th className="text-end p-2">زمن الحلّ (مللي)</th>
                  <th className="text-start p-2">أنشئ في</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      <Calculator className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      لا توجد عمليات تحسين في هذه النافذة.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const meta = STATUS_LABELS[r.status] ?? { label: r.status, color: "bg-slate-100" };
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="p-2 font-mono text-xs">{r.id}</td>
                      <td className="p-2">{r.runDate}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {r.algorithm ?? "—"}
                      </td>
                      <td className="p-2 text-end font-mono">{r.assignmentCount}</td>
                      <td className="p-2 text-end font-mono">
                        {r.unassignedCount > 0 ? (
                          <span className="text-rose-600">{r.unassignedCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-2 text-end font-mono">
                        {r.totalDistanceMeters != null
                          ? (r.totalDistanceMeters / 1000).toFixed(1)
                          : "—"}
                      </td>
                      <td className="p-2 text-end font-mono text-xs text-muted-foreground">
                        {r.solveDurationMs ?? "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {r.createdAt.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="p-2">
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/fleet/optimizer/runs/${r.id}`}>
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
