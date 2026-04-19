import { useState } from "react";
import { useSearch } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart2, Flag, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-300",
  in_progress: "bg-blue-400",
  completed: "bg-green-400",
  blocked: "bg-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  in_progress: "جاري",
  completed: "مكتمل",
  blocked: "محجوب",
};

function GanttBar({ row, projectStart, totalDays }: { row: any; projectStart: Date; totalDays: number }) {
  const start = new Date(row.start || row.end);
  const end = new Date(row.end || row.start);
  const startOffset = Math.max(0, (start.getTime() - projectStart.getTime()) / (24 * 3600 * 1000));
  const duration = Math.max(1, (end.getTime() - start.getTime()) / (24 * 3600 * 1000) + 1);
  const leftPct = (startOffset / totalDays) * 100;
  const widthPct = (duration / totalDays) * 100;

  return (
    <div className="relative h-6 bg-gray-100 rounded">
      <div
        className={`absolute h-full rounded flex items-center px-2 text-xs text-white font-medium truncate ${row.type === "milestone" ? "w-3 h-3 rounded-full bg-orange-400 transform -translate-y-1.5 top-1/2" : STATUS_COLORS[row.status] || "bg-primary"}`}
        style={{ left: `${Math.min(leftPct, 95)}%`, width: row.type === "milestone" ? "12px" : `${Math.max(widthPct, 2)}%` }}
        title={row.title}
      >
        {row.type !== "milestone" && widthPct > 8 && row.title}
      </div>
    </div>
  );
}

export default function GanttPage() {
  const search = useSearch();
  const urlProjectId = new URLSearchParams(search).get("projectId") || "";
  const [projectId, setProjectId] = useState(urlProjectId);

  const { data: projects, isLoading: isProjectsLoading, isError: isProjectsError } = useApiQuery<any>(["projects-list"], "/projects?limit=100");
  const projectList = asList(projects?.data || projects);

  const { data: gantt, isLoading } = useApiQuery<any>(
    ["gantt", projectId],
    `/projects/${projectId}/gantt`,
    { enabled: !!projectId }
  );

  const project = gantt?.project;
  const rows = gantt?.rows || [];
  const phases = rows.filter((r: any) => r.type === "phase");
  const tasks = rows.filter((r: any) => r.type === "task");
  const milestones = rows.filter((r: any) => r.type === "milestone");

  let projectStart = project?.startDate ? new Date(project.startDate) : new Date();
  let projectEnd = project?.endDate ? new Date(project.endDate) : new Date();
  if (projectEnd <= projectStart) projectEnd = new Date(projectStart.getTime() + 30 * 24 * 3600 * 1000);
  const totalDays = Math.max(30, (projectEnd.getTime() - projectStart.getTime()) / (24 * 3600 * 1000));

  if (isProjectsLoading) return <LoadingSpinner />;
  if (isProjectsError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="مخطط غانت"
      subtitle="الجدول الزمني التفاعلي للمشروع"
      breadcrumbs={[{ href: "/projects", label: "إدارة المشاريع" }, { label: "مخطط غانت" }]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <Label>المشروع:</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="اختر مشروعاً" /></SelectTrigger>
            <SelectContent>
              {projectList.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {!projectId && (
        <Card><CardContent className="py-12 text-center text-gray-400">اختر مشروعاً لعرض مخطط غانت</CardContent></Card>
      )}

      {projectId && isLoading && (
        <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
      )}

      {gantt && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold">{tasks.length}</div><div className="text-xs text-gray-500">مهام</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-green-600">{tasks.filter((t: any) => t.status === "completed").length}</div><div className="text-xs text-gray-500">مكتملة</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-orange-600">{milestones.length}</div><div className="text-xs text-gray-500">معالم</div></CardContent></Card>
            <Card><CardContent className="pt-4 text-center"><div className="text-xl font-bold text-blue-600">{phases.length}</div><div className="text-xs text-gray-500">مراحل</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{project?.name}</CardTitle>
                <div className="text-xs text-gray-500">{project?.startDate?.split("T")[0]} — {project?.endDate?.split("T")[0]}</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {rows.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-sm">لا توجد مهام أو معالم</div>
                ) : rows.map((row: any) => (
                  <div key={row.id} className={`flex items-center gap-3 py-1 ${row.type === "phase" ? "border-b" : ""}`}>
                    <div className={`flex-none flex items-center gap-1 ${row.type === "phase" ? "font-semibold text-sm" : "text-xs text-gray-600 ps-4"}`} style={{ width: "200px" }}>
                      {row.type === "milestone" && <Flag className="w-3 h-3 text-orange-400 flex-none" />}
                      {row.type === "task" && <div className={`w-2 h-2 rounded-full flex-none ${STATUS_COLORS[row.status] || "bg-gray-300"}`} />}
                      <span className="truncate">{row.title}</span>
                    </div>
                    <div className="flex-1">
                      <GanttBar row={row} projectStart={projectStart} totalDays={totalDays} />
                    </div>
                    {row.type === "task" && (
                      <div className="flex-none text-xs text-gray-500 w-16 text-end">
                        {row.progress > 0 ? `${row.progress}%` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 mt-4 pt-3 border-t text-xs text-gray-500">
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded ${STATUS_COLORS[k]}`} />
                    <span>{v}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-orange-400" />
                  <span>معلم</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {milestones.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">المعالم الرئيسية</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {milestones.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flag className="w-4 h-4 text-orange-400" />
                      <span className="text-sm">{m.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{m.end?.split("T")[0]}</span>
                      <PageStatusBadge status={m.status} domain="project" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
