import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Button } from "@/components/ui/button";
import { Plus, Users, AlertTriangle, Plane, UserPlus, X } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Link, useLocation } from "wouter";
import { AdvancedFilters, useFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { BulkCheckbox } from "@/components/shared/bulk-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function UmrahPilgrims() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["umrah-pilgrims", filters.search, filters.status, String(page)],
    `/umrah/pilgrims?search=${encodeURIComponent(filters.search)}&status=${filters.status || ""}&page=${page}&limit=${pageSize}`
  );
  const items = resp?.data || [];
  const total = resp?.total || 0;

  // UMR-BULK — POST /umrah/assign-bulk takes {pilgrimIds, agentId} and
  // sets the agent on every selected pilgrim. The endpoint had no UI;
  // wired here as a multi-select + agent picker that appears once at
  // least one row is selected.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAgentId, setBulkAgentId] = useState<string>("");
  const { data: agentsResp } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const agents = asList(agentsResp?.data || agentsResp);
  const bulkAssignMut = useApiMutation<unknown, { pilgrimIds: number[]; agentId: number }>(
    "/umrah/assign-bulk",
    "POST",
    [["umrah-pilgrims"]],
    {
      successMessage: "تم إسناد المعتمرين للوكيل",
      onSuccess: () => {
        setSelectedIds(new Set());
        setBulkAgentId("");
        refetch();
      },
    },
  );
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const pageIds = (items as Array<{ id: number }>).map((p) => p.id);
    if (pageIds.every((id) => selectedIds.has(id))) {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.delete(id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.add(id);
      setSelectedIds(next);
    }
  };
  const submitBulk = () => {
    if (!bulkAgentId || selectedIds.size === 0) return;
    bulkAssignMut.mutate({ pilgrimIds: Array.from(selectedIds), agentId: Number(bulkAgentId) });
  };

  const kpiCards = [
    { label: "إجمالي المعتمرين", value: total, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "داخل المملكة", value: (items ?? []).filter((p: any) => ["arrived", "active"].includes(p.status)).length, icon: Plane, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "متأخرين", value: (items ?? []).filter((p: any) => p.status === "overstayed").length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "بدون وكيل", value: (items ?? []).filter((p: any) => !p.agentId).length, icon: UserPlus, color: "text-orange-600 bg-orange-50" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const pageIds = (items as Array<{ id: number }>).map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
        </span>
      ),
    },
    {
      key: "fullName",
      header: "الاسم",
      sortable: true,
      render: (p) => (
        <Link href={`/umrah/pilgrims/${p.id}`} className="text-primary hover:underline font-medium">{p.fullName}</Link>
      ),
    },
    { key: "passportNumber", header: "الجواز", sortable: true },
    { key: "nationality", header: "الجنسية", sortable: true },
    {
      key: "agentName",
      header: "الوكيل",
      sortable: true,
      render: (p) => p.agentName || <span className="text-orange-500">غير معيّن</span>,
    },
    {
      key: "arrivalDate",
      header: "الوصول",
      sortable: true,
      render: (p) => formatDateAr(p.arrivalDate),
    },
    {
      key: "departureDate",
      header: "المغادرة",
      sortable: true,
      render: (p) => formatDateAr(p.departureDate),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المعتمرين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">متابعة ملفات المعتمرين وحالاتهم</p>
        </div>
        <Link href="/umrah/pilgrims/create">
          <GuardedButton perm="umrah:create" className="gap-2"><Plus className="h-4 w-4" />إضافة معتمر</GuardedButton>
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم الجواز...",
          statuses: [
            { value: "pending", label: "لم يصل" },
            { value: "arrived", label: "وصل" },
            { value: "active", label: "نشط" },
            { value: "overstayed", label: "متأخر" },
            { value: "departed", label: "غادر" },
            { value: "violated", label: "مخالف" },
            { value: "cancelled", label: "ملغي" },
          ],
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV(items ?? [], [
          { key: "fullName", label: "الاسم" },
          { key: "passportNumber", label: "الجواز" },
          { key: "nationality", label: "الجنسية" },
          { key: "status", label: "الحالة" },
          { key: "agentName", label: "الوكيل" },
        ], "المعتمرين")}
        resultCount={total}
      />

      {selectedIds.size > 0 && (
        <Card className="border-status-info-surface bg-status-info-surface/30">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{selectedIds.size}</span>
              <span className="text-muted-foreground">معتمر محدّد للإسناد</span>
            </div>
            <Select value={bulkAgentId} onValueChange={setBulkAgentId}>
              <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
              <SelectContent>
                {agents.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <GuardedButton
              perm="umrah:create"
              size="sm"
              disabled={!bulkAgentId || bulkAssignMut.isPending}
              onClick={submitBulk}
              rateLimitAware
              className="gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {bulkAssignMut.isPending ? "جاري الإسناد..." : "إسناد دفعة"}
            </GuardedButton>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3" /> إلغاء التحديد
            </Button>
          </CardContent>
        </Card>
      )}

      {pageIds.length > 0 && (
        <div className="flex justify-start -mb-3">
          <Button variant="ghost" size="sm" className="text-xs" onClick={toggleSelectAll}>
            {allPageSelected ? "إلغاء تحديد هذه الصفحة" : "تحديد كل هذه الصفحة"}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد معتمرين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        pageSize={pageSize}
        page={page}
        total={total}
        onPageChange={setPage}
        noToolbar
        onRowClick={(row) => navigate(`/umrah/pilgrims/${row.id}`)}
      />
    </div>
  );
}
