import { useState, useEffect, Fragment } from "react";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Eye, CheckCircle, Star, TrendingUp } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { CLASSIFICATIONS } from "@/lib/constants";
import { formatCurrency, periodRiyadh, currentPeriodRiyadh } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { KpiGrid } from "@/components/shared/kpi-card";
import { CrmTabsNav } from "@/components/shared/crm-tabs-nav";

export default function Clients() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const canManage = roleLevel >= 50;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [filters, setFilters] = useFilters();
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [page, setPage] = useState(1);
  // #2713 — سلة المحذوفات: تبديل بين القائمة النشطة والمحذوفة (للاسترجاع).
  const [showDeleted, setShowDeleted] = useState(false);
  const pageSize = 20;

  // POST /clients/auto-create — find-or-create-by-phone shortcut used
  // by the inbound-call popup and the WhatsApp inbox. Exposed here as
  // a quick-add inline form so an operator on a phone call can capture
  // the contact without leaving the list view.
  const autoCreateMut = useApiMutation<any, { phone: string; name?: string; source?: string }>(
    "/clients/auto-create",
    "POST",
    [["clients", scopeQueryString]],
    { successMessage: "تم إنشاء/استدعاء العميل" },
  );
  const [quickPhone, setQuickPhone] = useState("");
  const [quickName, setQuickName] = useState("");
  const handleQuickAdd = () => {
    if (!quickPhone.trim()) return;
    autoCreateMut.mutate(
      { phone: quickPhone.trim(), name: quickName.trim() || undefined, source: "manual" },
      {
        onSuccess: (r: any) => {
          setQuickPhone(""); setQuickName("");
          if (r?.id) navigate(`/clients/${r.id}`);
        },
      },
    );
  };

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
  if (showDeleted) params.set("deleted", "true");
  if (scopeQueryString) { scopeQueryString.split("&").forEach(p => { const [k,v] = p.split("="); if (k) params.set(k, v); }); }
  const { data: clientsResponse, isLoading, isError, error, refetch } = useApiQuery<{ data: any[]; total: number }>(
    ["clients", filters.search, filters.status, String(page), scopeQueryString, showDeleted ? "deleted" : "active"],
    `/clients?${params.toString()}`
  );

  // #2713 — استرجاع عميل محذوف ثم تحديث القائمة.
  async function handleRestore(id: number) {
    try {
      await apiFetch(`/clients/${id}/restore`, { method: "POST" });
      toast({ title: "تم استرجاع العميل" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الاسترجاع" });
    }
  }
  const clients = clientsResponse?.data;
  const total = clientsResponse?.total || 0;
  const filteredClients = clients || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filteredClients);

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
      case "premium": return <Badge className="bg-status-info-surface text-status-info-foreground hover:bg-status-info-surface dark:bg-blue-900/30 dark:text-blue-400">{label}</Badge>;
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
      header: "الإيرادات الفعلية",
      sortable: true,
      render: (client) => (
        <span className="font-bold">
          {client.totalRevenue ? formatCurrency(client.totalRevenue) : "-"}
        </span>
      ),
    },
    {
      key: "expectedRevenue",
      header: "الإيرادات المتوقعة",
      sortable: true,
      render: (client) => (
        <span>
          {client.expectedRevenue ? formatCurrency(client.expectedRevenue) : "-"}
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
          {showDeleted ? (
            canManage && (
              <Button variant="outline" size="sm" onClick={() => handleRestore(client.id)}>استرجاع</Button>
            )
          ) : (
            <RowActions
              canEdit={canManage}
              onEdit={() => startEdit(client.id, { name: client.name || "", phone: client.phone || "", classification: client.classification || "regular" })}
              onDelete={() => startDelete(client.id)}
              deletePerm="clients:delete"
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="إدارة العملاء"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "إدارة العملاء" },
      ]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={showDeleted ? "default" : "outline"}
            size="sm"
            onClick={() => { setShowDeleted((v) => !v); setPage(1); }}
          >
            {showDeleted ? "العملاء النشطون" : "سلة المحذوفات"}
          </Button>
          <PrintButton
            entityType="report_clients"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "قائمة العملاء", total: printRows.length },
              items: printRows.map((c: any) => ({
                "الاسم": c.name || "—",
                "الجوال": c.phone || "—",
                "البريد": c.email || "—",
                "التصنيف": c.classification || "—",
                "الرقم الضريبي": c.taxNumber || "—",
                "الحالة": c.status || "—",
              })),
            })}
          />
          {canManage && (
          <>
            <input
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              placeholder="رقم الجوال"
              dir="ltr"
              className="h-8 px-2 text-xs border rounded w-32"
            />
            <input
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="الاسم (اختياري)"
              className="h-8 px-2 text-xs border rounded w-32"
            />
            <GuardedButton
              perm="clients:create"
              size="sm"
              variant="outline"
              rateLimitAware
              onClick={handleQuickAdd}
              disabled={autoCreateMut.isPending || !quickPhone.trim()}
            >
              + سريع
            </GuardedButton>
            <Link href="/clients/create">
              <GuardedButton perm="clients:create" className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة عميل
              </GuardedButton>
            </Link>
          </>
          )}
        </div>
      }
    >
      <CrmTabsNav />
      <KpiGrid items={[
        { label: "إجمالي العملاء", value: total || 0, icon: Building2, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "نشط", value: (clients || []).filter((c: any) => c.status === "active").length, icon: CheckCircle, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "VIP", value: (clients || []).filter((c: any) => c.classification === "vip").length, icon: Star, color: "text-purple-600 bg-purple-50" },
        { label: "جديد هذا الشهر", value: (clients || []).filter((c: any) => {
          if (!c.createdAt) return false;
          return periodRiyadh(c.createdAt) === currentPeriodRiyadh();
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
          { key: "totalRevenue", label: "الإيرادات الفعلية" },
          { key: "expectedRevenue", label: "الإيرادات المتوقعة" },
        ], "العملاء")}
        resultCount={filteredClients?.length}
      />

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
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
                initialValues={editForm}
                onSave={(values) => handleSave(client.id, values)}
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
