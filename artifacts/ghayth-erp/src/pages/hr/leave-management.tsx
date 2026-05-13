import { useState } from "react";
import { useLocation } from "wouter";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@/components/approval-actions";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { ImpactPreviewButton } from "@/components/shared/impact-preview";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";

function LeaveApprovalCard({ request, onDone }: { request: any; onDone: () => void }) {
  const [showImpact, setShowImpact] = useState(false);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <AvatarInitial name={request.employeeName} color="yellow" />
              <span className="font-semibold">{request.employeeName}</span>
              <Badge className="bg-status-warning-surface text-status-warning-foreground">معلق</Badge>
            </div>
            <div className="text-sm text-muted-foreground ms-10 space-y-1">
              <p>النوع: {request.leaveTypeName || request.leaveType}</p>
              <p>الفترة: {formatDateAr(request.startDate)} — {formatDateAr(request.endDate)} ({request.days} أيام)</p>
              {request.reason && <p>السبب: {request.reason}</p>}
              <NotesDisplay status={request.status} notes={request.rejectedReason} returnReason={request.returnReason} rejectionReason={request.rejectedReason} />
            </div>

            {request.employeeId && request.leaveTypeId && (
              <div className="mt-3 ms-10">
                <ImpactPreviewButton
                  endpoint="/hr/impact-preview/leave"
                  payload={{
                    employeeId: request.employeeId,
                    leaveTypeId: request.leaveTypeId,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    days: request.days,
                  }}
                  label="معاينة الأثر قبل الاعتماد"
                />
              </div>
            )}
          </div>

          <ApprovalActions
            entityType="leave"
            entityId={request.id}
            currentStatus={request.status}
            approveEndpoint={`/hr/leave-requests/${request.id}/approve`}
            rejectEndpoint={`/hr/leave-requests/${request.id}/approve`}
            returnEndpoint={`/hr/leave-requests/${request.id}/approve`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            returnMethod="PATCH"
            approveBody={(notes) => ({ approved: true, reason: notes || undefined })}
            rejectBody={(notes) => ({ approved: false, reason: notes })}
            returnBody={(notes) => ({ approved: "returned", reason: notes })}
            pendingStatuses={["pending"]}
            onDone={onDone}
          />
        </div>

        <div className="mt-3">
          <ActionHistory entityType="leave" entityId={request.id} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LeaveManagementPage() {
  const [, navigate] = useLocation();
  const { data: requestsData, refetch: refetchPending, isLoading, isError } = useApiQuery<any>(["leaves-pending"], "/hr/leave-requests?status=pending");
  const { data: balanceData } = useApiQuery<any>(["leave-balance"], "/hr/leave-balance");
  const { data: typesData } = useApiQuery<any>(["leave-types"], "/hr/leave-types");
  const { data: statsData } = useApiQuery<any>(["leave-stats"], "/hr/leave-stats");
  const pendingRequests = asList(requestsData);
  const balances = balanceData?.data || [];
  const types = typesData?.data || [];
  const stats = statsData || {};
  const qc = useQueryClient();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleDone = () => {
    refetchPending();
    qc.invalidateQueries({ queryKey: ["leaves"] });
    qc.invalidateQueries({ queryKey: ["leave-balance"] });
    qc.invalidateQueries({ queryKey: ["leave-stats"] });
  };

  const kpis = [
    { label: "طلبات معلقة", value: stats.pending ?? pendingRequests.length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "موافق عليها", value: stats.approved ?? 0, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "مرفوضة", value: stats.rejected ?? 0, icon: XCircle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "أنواع الإجازات", value: types.length, icon: FileText, color: "text-status-info-foreground bg-status-info-surface" },
  ];

  return (
    <PageShell
      title="إدارة الإجازات"
      subtitle="اعتماد طلبات الإجازات ومتابعة الأرصدة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "إدارة الإجازات" }]}
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Tabs defaultValue="pending" dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">الطلبات المعلقة ({pendingRequests.length})</TabsTrigger>
          <TabsTrigger value="balances">أرصدة الإجازات</TabsTrigger>
          <TabsTrigger value="types">أنواع الإجازات</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <div className="space-y-3">
            {pendingRequests.map((r: any) => (
              <LeaveApprovalCard key={r.id} request={r} onDone={handleDone} />
            ))}
            {pendingRequests.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد طلبات معلقة</CardContent></Card>}
          </div>
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
            onRowClick={(row) => navigate(`/hr/leaves/${row.id}`)}
          />
        </TabsContent>

        <TabsContent value="types">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((t: any) => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-status-info" />
                    <span className="font-semibold">{t.name}</span>
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
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
