import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Plus, Calendar, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Timer, Copy, Download } from "lucide-react";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@workspace/workflow-kit";
import { ProcessStages, EntityTimeline } from "@workspace/entity-kit";
import { AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { useAppContext } from "@/contexts/app-context";
// P3 pilot — switch the page header, status chip, and selected columns
// to the new unified primitives (P1.1 / P1.4 / P1.6).  Approval actions,
// expanded-row stage rendering, and the KPI cards stay as-is for this
// pilot pass; they'll move in P3 follow-ups.
import { PageShell } from "@workspace/ui-core";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageStatusBadge } from "@workspace/ui-core";
import { textColumn, dateColumn, statusColumn, actionsColumn } from "@workspace/ui-core";
import { LEAVE_TYPES, APPROVAL_ROLES } from "@/lib/hr-type-maps";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

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
    let detail = APPROVAL_ROLES[cs.requiredRole] || cs.requiredRole;
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
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
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
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["leaves", scopeQueryString], `/hr/leave-requests${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["leave-stats", scopeQueryString], `/hr/leave-stats${scopeSuffix}`);
  const items = asList(data);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName"],
    statusField: "status",
    dateField: "startDate",
  });

  const handleApprovalDone = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["leave-stats"] });
    qc.invalidateQueries({ queryKey: ["leaves-pending"] });
    qc.invalidateQueries({ queryKey: ["leave-balance"] });
    qc.invalidateQueries({ queryKey: ["leave-stages"] });
  };

  // P3 pilot — column definitions now use the P1.4 presets where they
  // fit cleanly. The custom-render columns (employee with avatar,
  // approval-actions, more-menu) stay inline because they need
  // page-local state (`expandedId`, `handleApprovalDone`).
  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (l) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} />
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (l) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={l.employeeName} color="purple" />
          <span className="font-medium">{l.employeeName}</span>
        </div>
      ),
    },
    {
      key: "leaveType",
      header: "النوع",
      sortable: true,
      render: (l) => l.leaveTypeName || LEAVE_TYPES[l.leaveType] || l.leaveType || "-",
    },
    dateColumn("startDate", "من"),
    dateColumn("endDate", "إلى"),
    textColumn("days", "الأيام"),
    {
      key: "reason",
      header: "السبب",
      sortable: true,
      className: "max-w-32 truncate",
      render: (l) => (
        <div className="text-muted-foreground">
          {l.reason || "-"}
          <NotesDisplay status={l.status} notes={l.rejectedReason} returnReason={l.returnReason} rejectionReason={l.rejectedReason} />
        </div>
      ),
    },
    statusColumn("status", "الحالة", "leave"),
    {
      key: "approval",
      header: "إجراءات الموافقة",
      render: (l) => (
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
      ),
    },
    actionsColumn(
      (l) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Link href={`/hr/leaves/create?copyLeaveType=${encodeURIComponent(l.leaveTypeId || l.leaveType || "")}&copyReason=${encodeURIComponent(l.reason || "")}`}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" title="نسخ الطلب">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <button
            onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
            className="text-muted-foreground hover:text-muted-foreground p-1"
          >
            {expandedId === l.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      ),
      { width: "80px" },
    ),
  ];

  const kpis = [
    { label: "إجمالي الطلبات", value: stats?.total ?? items.length, icon: Calendar, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "معلقة", value: stats?.pending ?? items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "موافق عليها", value: stats?.approved ?? items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مرفوضة", value: stats?.rejected ?? items.filter((i: any) => i.status === "rejected").length, icon: XCircle, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="طلبات الإجازات"
      subtitle="متابعة وإدارة طلبات إجازات الموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/leaves/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />طلب إجازة</GuardedButton>
          </Link>
        </div>
      }
      filters={
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
          resultCount={filtered?.length}
        />
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <BulkActionsBar
        entityType="leave-request"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["leaves"], ["leave-stats"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "employeeName", label: "الموظف" },
          { key: "leaveTypeName", label: "النوع" },
          { key: "startDate", label: "من" },
          { key: "endDate", label: "إلى" },
          { key: "days", label: "الأيام" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="طلبات_الإجازات"
      />

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="لا توجد طلبات إجازة"
        noToolbar
        onRowClick={(l) => navigate(`/hr/leaves/${l.id}`)}
        renderRowExtras={(l) =>
          expandedId === l.id ? (
            <div className="p-4 bg-surface-subtle/50 space-y-4">
              <LeaveApprovalStages leaveId={l.id} leaveStatus={l.status} />
              <ActionHistory entityType="leave" entityId={l.id} defaultOpen />
              <EntityTimeline entityType="leave-request" entityId={l.id} maxItems={10} />
            </div>
          ) : null
        }
      />
    </PageShell>
  );
}
