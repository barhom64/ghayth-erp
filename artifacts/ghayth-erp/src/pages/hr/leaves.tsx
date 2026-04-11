import { useState, Fragment } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Plus, Calendar, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Timer, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@/components/approval-actions";
import { ProcessStages, EntityTimeline } from "@/components/shared/entity-timeline";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

const typeMap: Record<string, string> = {
  annual: "سنوية", sick: "مرضية", personal: "شخصية", unpaid: "بدون راتب",
  maternity: "أمومة", paternity: "أبوة", emergency: "طارئة",
};

const roleLabels: Record<string, string> = {
  manager: "المدير", hr: "الموارد البشرية", owner: "المالك", director: "المدير العام", finance: "المالية",
};

function LeaveApprovalStages({ leaveId, leaveStatus }: { leaveId: number; leaveStatus: string }) {
  const { data } = useApiQuery<any>(
    ["leave-stages", String(leaveId)],
    `/hr/leave-requests/${leaveId}/stages`,
    !!leaveId
  );
  if (!data) return null;
  const stages = data.stages || [];
  const chainSteps = data.chainSteps || [];

  const steps = chainSteps.map((cs: any) => {
    const stageRecord = stages.find((s: any) => s.stage === cs.stepOrder);
    let status: "completed" | "current" | "pending" | "rejected" | "skipped" = "pending";
    let detail = roleLabels[cs.requiredRole] || cs.requiredRole;
    let time: string | undefined;

    if (stageRecord) {
      if (stageRecord.decision === "approved" || stageRecord.status === "approved") {
        status = "completed";
        detail = stageRecord.decidedByName || detail;
        time = stageRecord.decidedAt ? formatDateAr(stageRecord.decidedAt) : undefined;
      } else if (stageRecord.decision === "rejected" || stageRecord.status === "rejected") {
        status = "rejected";
        detail = stageRecord.decidedByName || detail;
      } else {
        status = "current";
        if (stageRecord.expiresAt) {
          const remaining = new Date(stageRecord.expiresAt).getTime() - Date.now();
          if (remaining > 0) {
            const hrs = Math.floor(remaining / 3600000);
            detail = `${detail} — متبقي ${hrs} ساعة`;
          } else {
            detail = `${detail} — تجاوز المهلة`;
          }
        }
      }
    } else if (leaveStatus === "rejected") {
      status = "skipped";
    }

    return { label: `المرحلة ${cs.stepOrder}`, status, detail, time };
  });

  if (leaveStatus === "approved") {
    steps.push({ label: "مكتمل", status: "completed" as const, detail: "تمت الموافقة", time: undefined });
  }

  if (steps.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
        <Timer className="w-3.5 h-3.5" />
        مسار الموافقة
      </p>
      <ProcessStages steps={steps} />
    </div>
  );
}

export default function LeavesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useFilters();
  const { data, refetch } = useApiQuery<any>(["leaves", scopeQueryString], `/hr/leave-requests${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["leave-stats", scopeQueryString], `/hr/leave-stats${scopeSuffix}`);
  const items = asList(data);
  const qc = useQueryClient();

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName"],
    statusField: "status",
    dateField: "startDate",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const handleApprovalDone = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["leave-stats"] });
    qc.invalidateQueries({ queryKey: ["leaves-pending"] });
    qc.invalidateQueries({ queryKey: ["leave-balance"] });
    qc.invalidateQueries({ queryKey: ["leave-stages"] });
  };

  const kpis = [
    { label: "إجمالي الطلبات", value: stats?.total ?? items.length, icon: Calendar, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: stats?.pending ?? items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "موافق عليها", value: stats?.approved ?? items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "مرفوضة", value: stats?.rejected ?? items.filter((i: any) => i.status === "rejected").length, icon: XCircle, color: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">طلبات الإجازات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">متابعة وإدارة طلبات إجازات الموظفين</p>
        </div>
        <Link href="/hr/leaves/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />طلب إجازة</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: [
            { value: "pending", label: "معلقة" },
            { value: "approved", label: "موافق عليها" },
            { value: "rejected", label: "مرفوضة" },
            { value: "returned", label: "مُرجعة" },
            { value: "cancelled", label: "ملغية" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={sortedData?.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="leaveType" label="النوع" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="startDate" label="من" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="endDate" label="إلى" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="days" label="الأيام" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="reason" label="السبب" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                <TableHead>إجراءات الموافقة</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <DataTableWrapper
              isLoading={false}
              data={sortedData}
              colCount={9}
              emptyMessage="لا توجد طلبات إجازة"
            >
              {(sortedData || []).map((l: any) => (
                <Fragment key={l.id}>
                  <TableRow className="hover:bg-gray-50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-xs font-bold">
                          {(l.employeeName || "؟").charAt(0)}
                        </div>
                        <span className="font-medium">{l.employeeName}</span>
                      </div>
                    </TableCell>
                    <TableCell>{l.leaveTypeName || typeMap[l.leaveType] || l.leaveType || "-"}</TableCell>
                    <TableCell className="text-gray-500">{l.startDate}</TableCell>
                    <TableCell className="text-gray-500">{l.endDate}</TableCell>
                    <TableCell className="font-medium">{l.days || "-"}</TableCell>
                    <TableCell className="text-gray-500 max-w-32 truncate">
                      <div>
                        {l.reason || "-"}
                        <NotesDisplay status={l.status} notes={l.rejectedReason} returnReason={l.returnReason} rejectionReason={l.rejectedReason} />
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      <ApprovalActions
                        entityType="leave"
                        entityId={l.id}
                        currentStatus={l.status}
                        approveEndpoint={`/hr/leave-requests/${l.id}/approve`}
                        rejectEndpoint={`/hr/leave-requests/${l.id}/approve`}
                        returnEndpoint={`/hr/leave-requests/${l.id}/approve`}
                        approveMethod="PATCH"
                        rejectMethod="PATCH"
                        returnMethod="PATCH"
                        approveBody={(notes) => ({ approved: true, reason: notes || undefined })}
                        rejectBody={(notes) => ({ approved: false, reason: notes })}
                        returnBody={(notes) => ({ approved: "returned", reason: notes })}
                        pendingStatuses={["pending"]}
                        onDone={handleApprovalDone}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/hr/leaves/create?copyLeaveType=${encodeURIComponent(l.leaveTypeId || l.leaveType || "")}&copyReason=${encodeURIComponent(l.reason || "")}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-500" title="نسخ الطلب">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <button onClick={() => setExpandedId(expandedId === l.id ? null : l.id)} className="text-gray-400 hover:text-gray-600 p-1">
                          {expandedId === l.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === l.id && (
                    <TableRow><TableCell colSpan={9} className="p-4 bg-gray-50/50 space-y-4">
                      <LeaveApprovalStages leaveId={l.id} leaveStatus={l.status} />
                      <ActionHistory entityType="leave" entityId={l.id} defaultOpen />
                      <EntityTimeline entityType="hr_leave_requests" entityId={l.id} maxItems={10} />
                    </TableCell></TableRow>
                  )}
                </Fragment>
              ))}
            </DataTableWrapper>
          </Table>
        </div>
      </div>
    </div>
  );
}
