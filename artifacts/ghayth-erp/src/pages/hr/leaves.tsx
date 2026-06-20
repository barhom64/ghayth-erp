import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Link, useLocation } from "wouter";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Plus, Calendar, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Timer, Copy, Download, Pencil } from "lucide-react";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  PageShell,
  textColumn,
  dateColumn,
  statusColumn,
  actionsColumn,
  exportToCSV,
} from "@workspace/ui-core";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@workspace/workflow-kit";
import { ProcessStages, EntityTimeline } from "@workspace/entity-kit";
import { useAppContext } from "@/contexts/app-context";
// P3 pilot — switch the page header, status chip, and selected columns
// to the new unified primitives (P1.1 / P1.4 / P1.6).  Approval actions,
// expanded-row stage rendering, and the KPI cards stay as-is for this
// pilot pass; they'll move in P3 follow-ups.
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { LEAVE_TYPES, APPROVAL_ROLES } from "@/lib/hr-type-maps";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

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

const EMPTY_TYPE_FORM = { name: "", maxDays: "", isPaid: "true", description: "" };

export default function LeavesPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Sidebar "اعتماد الطلبات" arrives with ?status=pending so reviewers
  // land on the pending list directly.
  const initialStatus = new URLSearchParams(window.location.search).get("status") || "";
  const [filters, setFilters] = useFilters({ status: initialStatus });
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["leaves", scopeQueryString], `/hr/leave-requests${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["leave-stats", scopeQueryString], `/hr/leave-stats${scopeSuffix}`);
  // HR-REV-2 (ADR — leaves cluster) — البيانات التي كانت في صفحة «إدارة الإجازات»
  // المكرّرة (الأرصدة + إدارة الأنواع) صارت تبويبات هنا، فالصفحة canonical واحدة.
  const { data: balanceData } = useApiQuery<any>(["leave-balance"], "/hr/leave-balance");
  const { data: typesData, refetch: refetchTypes } = useApiQuery<any>(["leave-types"], "/hr/leave-types");
  const balances = balanceData?.data || [];
  const types = typesData?.data || [];
  const items = asList(data);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE_FORM);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);

  const saveLeaveType = async () => {
    const payload = {
      name: typeForm.name,
      maxDays: typeForm.maxDays ? Number(typeForm.maxDays) : undefined,
      isPaid: typeForm.isPaid === "true",
      description: typeForm.description || undefined,
    };
    try {
      if (editingTypeId) {
        await apiFetch(`/hr/leave-types/${editingTypeId}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast({ title: "تم تحديث نوع الإجازة" });
      } else {
        await apiFetch("/hr/leave-types", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "تم إنشاء نوع الإجازة" });
      }
      setShowTypeForm(false);
      setTypeForm(EMPTY_TYPE_FORM);
      setEditingTypeId(null);
      refetchTypes();
    } catch (err: any) {
      toast({ title: "فشل الحفظ", description: err?.message, variant: "destructive" });
    }
  };

  const filtered = applyFilters(items, filters, {
    searchFields: ["employeeName"],
    statusField: "status",
    dateField: "startDate",
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

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
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" title="نسخ الطلب"><Link href={`/hr/leaves/create?copyLeaveType=${encodeURIComponent(l.leaveTypeId || l.leaveType || "")}&copyReason=${encodeURIComponent(l.reason || "")}`}>
              <Copy className="h-3.5 w-3.5" />
            </Link></Button>
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
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "طلبات الإجازات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_hr_leaves"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "طلبات الإجازات", total: printRows.length },
              items: printRows.map((l: any) => ({
                "الموظف": l.employeeName || "—",
                "النوع": l.leaveType || l.type || "—",
                "من": l.startDate || "—",
                "إلى": l.endDate || "—",
                "الأيام": l.days ?? 0,
                "السبب": l.reason || "—",
                "الحالة": l.status || "—",
              })),
            })}
          />
          <Link href="/hr/leaves/create">
            <GuardedButton perm="hr:create" size="sm"><Plus className="h-4 w-4 me-1" />طلب إجازة</GuardedButton>
          </Link>
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Tabs defaultValue="requests" dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="requests">الطلبات ({items.length})</TabsTrigger>
          <TabsTrigger value="balances">أرصدة الإجازات</TabsTrigger>
          <TabsTrigger value="types">أنواع الإجازات ({types.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
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
        onExportCSV={() =>
          exportToCSV(
            filtered || [],
            [
              { key: "employeeName", label: "الموظف" },
              { key: "leaveTypeName", label: "نوع الإجازة" },
              { key: "startDate", label: "تاريخ البداية" },
              { key: "endDate", label: "تاريخ النهاية" },
              { key: "days", label: "عدد الأيام" },
              { key: "status", label: "الحالة" },
              { key: "reason", label: "السبب" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ],
            "طلبات-الإجازات",
          )
        }
        resultCount={filtered?.length}
      />

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
        onSortedDataChange={setPrintRows}
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
        </TabsContent>

        <TabsContent value="balances">
          <DataTable
            columns={[
              { key: "name", header: "نوع الإجازة", sortable: true, render: (v) => <span className="font-medium">{v.name || v.leaveTypeName}</span> },
              { key: "annualDays", header: "المستحق", sortable: true, render: (v) => <span>{v.annualDays || v.entitled || v.maxDays}</span> },
              { key: "used", header: "المستخدم", sortable: true, render: (v) => <span className="text-status-error-foreground">{v.used || 0}</span> },
              { key: "reserved", header: "المحجوز", sortable: true, render: (v) => <span className="text-status-warning-foreground">{v.reserved || 0}</span> },
              { key: "remaining", header: "المتبقي", sortable: true, render: (v) => <span className="font-bold text-status-success-foreground">{v.remaining ?? (Number(v.maxDays || v.annualDays || 0) - Number(v.used || 0))}</span> },
            ] as DataTableColumn<any>[]}
            data={balances}
            noToolbar
            emptyMessage="لا توجد أرصدة"
            pageSize={20}
          />
        </TabsContent>

        <TabsContent value="types">
          <div className="space-y-4">
            <div className="flex justify-end">
              <GuardedButton perm="hr.leaves:update" size="sm" onClick={() => { setShowTypeForm((v) => !v); if (showTypeForm) { setTypeForm(EMPTY_TYPE_FORM); setEditingTypeId(null); } }}>
                <Plus className="h-4 w-4 me-1" />{showTypeForm ? "إلغاء" : "إضافة نوع"}
              </GuardedButton>
            </div>
            {showTypeForm && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h4 className="font-semibold text-sm">{editingTypeId ? "تعديل نوع الإجازة" : "إضافة نوع إجازة جديد"}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>الاسم *</Label>
                      <Input value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>عدد الأيام السنوية</Label>
                      <Input type="number" value={typeForm.maxDays} onChange={(e) => setTypeForm((f) => ({ ...f, maxDays: e.target.value }))} />
                    </div>
                    <div>
                      <Label>مدفوعة؟</Label>
                      <select className="w-full h-10 border rounded-md px-2" value={typeForm.isPaid} onChange={(e) => setTypeForm((f) => ({ ...f, isPaid: e.target.value }))}>
                        <option value="true">نعم</option>
                        <option value="false">لا</option>
                      </select>
                    </div>
                    <div>
                      <Label>وصف</Label>
                      <Input value={typeForm.description} onChange={(e) => setTypeForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={!typeForm.name} onClick={saveLeaveType}>{editingTypeId ? "تحديث" : "إنشاء"}</Button>
                    <Button variant="outline" onClick={() => { setShowTypeForm(false); setTypeForm(EMPTY_TYPE_FORM); setEditingTypeId(null); }}>إلغاء</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {types.map((t: any) => (
                <Card key={t.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-status-info" />
                      <span className="font-semibold">{t.name}</span>
                      <GuardedButton perm="hr.leaves:update" variant="ghost" size="sm" className="ms-auto h-6 w-6 p-0"
                        onClick={() => { setEditingTypeId(t.id); setTypeForm({ name: t.name, maxDays: String(t.maxDays || t.annualDays || ""), isPaid: t.isPaid ? "true" : "false", description: t.description || "" }); setShowTypeForm(true); }}>
                        <Pencil className="h-3 w-3" />
                      </GuardedButton>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>الأيام السنوية: <span className="font-medium text-status-neutral-foreground">{t.maxDays || t.annualDays || 0}</span></p>
                      <p>مدفوعة: <Badge className={t.isPaid ? "bg-status-success-surface text-status-success-foreground" : "bg-surface-subtle text-status-neutral-foreground"}>{t.isPaid ? "نعم" : "لا"}</Badge></p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {types.length === 0 && <p className="text-center text-muted-foreground col-span-3 py-8">لا توجد أنواع إجازات</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
