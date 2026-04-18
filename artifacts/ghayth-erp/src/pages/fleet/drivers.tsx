import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, Eye, Users, UserCheck, UserX, Car } from "lucide-react";
import { KpiGrid } from "@/components/shared/kpi-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { QuickPreviewDialog, type PreviewField } from "@/components/shared/quick-preview-dialog";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function DriversPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["drivers"], "/fleet/drivers");
  const items: any[] = data?.data || [];
  const [previewDriver, setPreviewDriver] = useState<any>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const driverFields: PreviewField[] = [
    { label: "الاسم", key: "name" },
    { label: "الهاتف", key: "phone" },
    { label: "رقم الرخصة", key: "licenseNumber" },
    { label: "نوع الرخصة", key: "licenseType", type: "badge" },
    { label: "انتهاء الرخصة", key: "licenseExpiry", type: "date" },
    { label: "الحالة", key: "status", type: "status" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/fleet/drivers",
    queryKeys: [["drivers"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "phone", label: "الهاتف" },
    { key: "licenseNumber", label: "الرخصة" },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "name", header: "الاسم", sortable: true, searchable: true, className: "font-medium" },
    { key: "phone", header: "الهاتف", sortable: true, searchable: true, className: "text-gray-500", render: (d) => d.phone || "-" },
    { key: "licenseType", header: "الرخصة", sortable: true, searchable: true, sortKey: "licenseNumber", render: (d) => d.licenseNumber || "-" },
    { key: "licenseExpiry", header: "انتهاء الرخصة", sortable: true, className: "text-gray-500", render: (d) => d.licenseExpiry || "-" },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (d) => <PageStatusBadge status={d.status || "active"} domain="driver" />,
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (d) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setPreviewDriver(d)}><Eye className="h-4 w-4" /></Button>
          <RowActions
            onEdit={() => startEdit(d.id, { name: d.name, phone: d.phone || "", licenseNumber: d.licenseNumber || "", status: d.status || "active" })}
            onDelete={() => startDelete(d.id)}
          />
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <PageShell
      title="السائقين"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "السائقين" }]}
      loading={isLoading}
      actions={
        <Link href="/fleet/drivers/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة سائق</Button>
        </Link>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي السائقين", value: items.length, icon: Users, color: "text-blue-600 bg-blue-50" },
        { label: "نشطين", value: items.filter((d: any) => d.status === "active").length, icon: UserCheck, color: "text-green-600 bg-green-50" },
        { label: "غير نشطين", value: items.filter((d: any) => d.status !== "active").length, icon: UserX, color: "text-red-600 bg-red-50" },
        { label: "المركبات المسندة", value: items.filter((d: any) => d.vehicleId).length, icon: Car, color: "text-purple-600 bg-purple-50" },
      ]} />

      <BulkActionsBar
        entityType="driver"
        items={items}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(items.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["drivers"]]}
        actions={["export"]}
        csvColumns={[
          { key: "name", label: "الاسم" },
          { key: "phone", label: "الهاتف" },
          { key: "licenseNumber", label: "رقم الرخصة" },
          { key: "licenseType", label: "نوع الرخصة" },
          { key: "licenseExpiry", label: "انتهاء الرخصة" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="السائقين"
      />

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        searchPlaceholder="بحث بالاسم أو الهاتف أو الرخصة..."
        emptyMessage="لا يوجد سائقين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        renderRowExtras={(d) => {
          if (editingId === d.id) {
            return (
              <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(d.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
            );
          }
          if (deletingId === d.id) {
            return (
              <InlineDeleteConfirm onConfirm={() => handleDelete(d.id)} onCancel={cancelDelete} isPending={isPending} itemName={d.name} entityType="driver" entityId={d.id} />
            );
          }
          return null;
        }}
      />
      <QuickPreviewDialog open={!!previewDriver} onOpenChange={() => setPreviewDriver(null)} title="تفاصيل السائق" data={previewDriver} fields={driverFields} />
    </PageShell>
  );
}
