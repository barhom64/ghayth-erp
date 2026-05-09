import { useState, Fragment } from "react";
import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Plus, Building2, Eye, CheckCircle, Star, TrendingUp } from "lucide-react";
import { CLASSIFICATIONS } from "@/lib/constants";
import { formatCurrency } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { KpiGrid } from "@/components/shared/kpi-card";
import { CrmTabsNav } from "@/components/shared/crm-tabs-nav";

export default function Clients() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const canManage = roleLevel >= 50;
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const previewFields: PreviewField[] = [
    { label: "اسم العميل", key: "name" },
    { label: "رقم الجوال", key: "phone" },
    { label: "البريد الإلكتروني", key: "email" },
    { label: "التصنيف", key: "classification", type: "badge" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("classification", filters.status);
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (scopeQueryString) { scopeQueryString.split("&").forEach(p => { const [k,v] = p.split("="); if (k) params.set(k, v); }); }
  const { data: clientsResponse, isLoading, isError, error, refetch } = useApiQuery<{ data: any[]; total: number }>(
    ["clients", filters.search, filters.status, String(page), scopeQueryString],
    `/clients?${params.toString()}`
  );
  const clients = clientsResponse?.data;
  const total = clientsResponse?.total || 0;
  const filteredClients = applyFilters(clients || [], filters, { dateField: "createdAt" });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/clients",
    queryKeys: [["clients", filters.search, filters.status, String(page)]],
    onSuccess: () => refetch(),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const editFields = [
    { key: "name", label: "اسم العميل" },
    { key: "phone", label: "رقم الجوال" },
    { key: "classification", label: "التصنيف", type: "select" as const, options: Object.entries(CLASSIFICATIONS).map(([k, v]) => ({ value: k, label: v })) },
  ];

  const getClassificationBadge = (cls: string) => {
    const label = CLASSIFICATIONS[cls] || cls;
    switch (cls) {
      case "vip": return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400">{label}</Badge>;
      case "premium": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">{label}</Badge>;
      case "regular": return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400">{label}</Badge>;
      case "prospect": return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">{label}</Badge>;
      case "churned": return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400">{label}</Badge>;
      default: return <Badge variant="outline">{label}</Badge>;
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "name",
      header: "اسم العميل",
      sortable: true,
      render: (client) => (
        <span className="font-medium flex items-center gap-2">
          {client.name || "-"}
          {client.isBlacklisted && <Badge variant="destructive" className="text-[10px]">قائمة سوداء</Badge>}
        </span>
      ),
    },
    {
      key: "phone",
      header: "رقم الجوال",
      sortable: true,
      ltr: true,
      className: "text-end",
      render: (client) => client.phone || "-",
    },
    {
      key: "classification",
      header: "التصنيف",
      sortable: true,
      render: (client) => getClassificationBadge(client.classification),
    },
    {
      key: "totalRevenue",
      header: "إجمالي الإيرادات",
      sortable: true,
      render: (client) => (
        <span className="font-bold">
          {client.totalRevenue ? formatCurrency(client.totalRevenue) : "-"}
        </span>
      ),
    },
    {
      key: "assignedToName",
      header: "المسؤول",
      sortable: true,
      render: (client) => client.assignedToName || "-",
    },
    {
      key: "actions",
      header: "الإجراءات",
      render: (client) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewItem(client)}>
            <Eye className="h-4 w-4" />
          </Button>
          <RowActions
            canEdit={canManage}
            onEdit={() => startEdit(client.id, { name: client.name || "", phone: client.phone || "", classification: client.classification || "regular" })}
            onDelete={() => startDelete(client.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="إدارة العملاء"
      loading={isLoading}
      actions={
        canManage && (
          <Link href="/clients/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة عميل
            </Button>
          </Link>
        )
      }
    >
      <CrmTabsNav />
      <KpiGrid items={[
        { label: "إجمالي العملاء", value: total || 0, icon: Building2, color: "text-blue-600 bg-blue-50" },
        { label: "نشط", value: (clients || []).filter((c: any) => c.status === "active").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
        { label: "VIP", value: (clients || []).filter((c: any) => c.classification === "vip").length, icon: Star, color: "text-purple-600 bg-purple-50" },
        { label: "جديد هذا الشهر", value: (clients || []).filter((c: any) => {
          if (!c.createdAt) return false;
          const d = new Date(c.createdAt);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length, icon: TrendingUp, color: "text-cyan-600 bg-cyan-50" },
      ]} />

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث عن عميل...",
          statuses: Object.entries(CLASSIFICATIONS).map(([k, v]) => ({ value: k, label: v })),
          showDateRange: true,
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        onExportCSV={() => exportToCSV(filteredClients || [], [
          { key: "name", label: "اسم العميل" },
          { key: "phone", label: "الجوال" },
          { key: "email", label: "البريد" },
          { key: "classification", label: "التصنيف" },
          { key: "totalRevenue", label: "الإيرادات" },
        ], "العملاء")}
        resultCount={filteredClients?.length}
      />

      <DataTable
        columns={columns}
        data={filteredClients}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        onRowClick={(client) => navigate(`/clients/${client.id}`)}
        rowClassName={(client) => client.isBlacklisted ? "opacity-50" : undefined}
        emptyMessage="لا يوجد عملاء"
        emptyIcon={<Building2 className="h-6 w-6 text-slate-400" />}
        pageSize={pageSize}
        page={page}
        total={total}
        onPageChange={setPage}
        noToolbar
        renderRowExtras={(client) => {
          if (editingId === client.id) {
            return (
              <InlineEditForm
                fields={editFields}
                form={editForm}
                setForm={setEditForm}
                onSave={() => handleSave(client.id, editForm)}
                onCancel={cancelEdit}
                isPending={isPending}
              />
            );
          }
          if (deletingId === client.id) {
            return (
              <InlineDeleteConfirm
                onConfirm={() => handleDelete(client.id)}
                onCancel={cancelDelete}
                isPending={isPending}
                itemName={client.name}
                entityType="client"
                entityId={client.id}
              />
            );
          }
          return null;
        }}
      />

      <QuickPreviewDialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)} title="معاينة العميل" data={previewItem} fields={previewFields} />
    </PageShell>
  );
}
