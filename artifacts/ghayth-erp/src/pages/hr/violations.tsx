import { formatCurrency } from "@/lib/formatters";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Phase A — HR violations on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Plus, AlertTriangle, Scale, DollarSign, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";

// Status options for filter + edit form. Visual rendering goes through
// the canonical PageStatusBadge (shared domain).
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "active",    label: "نشط"         },
  { value: "open",      label: "مفتوح"       },
  { value: "resolved",  label: "تم الحل"     },
  { value: "appealed",  label: "تم الاستئناف" },
  { value: "cancelled", label: "ملغي"        },
  { value: "escalated", label: "تصعيد"       },
];

// Severity is a separate domain from status — not in STATUS_MAP. Kept
// here as a labels-only list; severity chip uses a custom <Badge>
// below with a tone mapped to severity level.
const SEVERITY_OPTIONS: ReadonlyArray<{ value: string; label: string; tone: string }> = [
  { value: "low",      label: "منخفض", tone: "bg-emerald-100 text-emerald-700" },
  { value: "medium",   label: "متوسط", tone: "bg-amber-100 text-amber-700"     },
  { value: "high",     label: "مرتفع", tone: "bg-orange-100 text-orange-700"   },
  { value: "critical", label: "حرج",   tone: "bg-red-100 text-red-700"         },
];

export default function ViolationsPage() {
  const [filters, setFilters] = useFilters();
  const { data, refetch } = useApiQuery<any>(["violations"], "/hr/violations");
  const { data: stats } = useApiQuery<any>(["violations-stats"], "/hr/violations-stats");
  const items = data?.data || [];

  const filtered = applyFilters(items, filters, { searchFields: ["employeeName"], statusField: "status", dateField: "createdAt" });

  const kpis = [
    { label: "إجمالي المخالفات", value: stats?.total ?? items.length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "مخالفات نشطة", value: stats?.active ?? items.filter((v: any) => v.status === "active").length, icon: Scale, color: "text-yellow-600 bg-yellow-50" },
    { label: "إجمالي الخصومات", value: formatCurrency(stats?.totalDeductions ?? items.reduce((s: number, v: any) => s + Number(v.deduction || 0), 0)), icon: DollarSign, color: "text-orange-600 bg-orange-50" },
    { label: "تم الحل", value: items.filter((v: any) => v.status === "resolved" || v.status === "cancelled").length, icon: Shield, color: "text-green-600 bg-green-50" },
  ];

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/hr/violations",
    queryKeys: [["violations"], ["violations-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "type", label: "نوع المخالفة" },
    { key: "description", label: "الوصف" },
    { key: "severity", label: "الشدة", type: "select" as const, options: SEVERITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
    { key: "deduction", label: "الخصم", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold">
            {(v.employeeName || "؟").charAt(0)}
          </div>
          <span className="font-medium">{v.employeeName}</span>
        </div>
      ),
    },
    { key: "type", header: "نوع المخالفة", sortable: true, render: (v) => v.type || "-" },
    { key: "description", header: "الوصف", sortable: true, className: "text-gray-500 max-w-48 truncate", render: (v) => v.description || "-" },
    {
      key: "severity",
      header: "الشدة",
      sortable: true,
      render: (v) => {
        const sev = SEVERITY_OPTIONS.find((o) => o.value === v.severity);
        return <Badge className={sev?.tone || ""}>{sev?.label || v.severity || "-"}</Badge>;
      },
    },
    {
      key: "deduction",
      header: "الخصم",
      sortable: true,
      className: "text-red-600 font-medium",
      render: (v) => formatCurrency(Number(v.deduction || 0)),
    },
    { key: "status", header: "الحالة", sortable: true, render: (v) => <PageStatusBadge status={v.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      render: (v) => (
        <div onClick={(e) => e.stopPropagation()}>
          <RowActions
            onEdit={() => startEdit(v.id, { type: v.type || "", description: v.description || "", severity: v.severity || "medium", deduction: v.deduction || 0, status: v.status || "active" })}
            onDelete={() => startDelete(v.id)}
          />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="المخالفات"
      subtitle="إدارة مخالفات الموظفين والإجراءات التأديبية"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/violations/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة مخالفة</Button>
        </Link>
      }
    >

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد مخالفات"
        pageSize={20}
        renderRowExtras={(v) => {
          if (editingId === v.id) {
            return (
              <InlineEditForm
                fields={editFields}
                form={editForm}
                setForm={setEditForm}
                onSave={() => handleSave(v.id, editForm)}
                onCancel={cancelEdit}
                isPending={isPending}
              />
            );
          }
          if (deletingId === v.id) {
            return (
              <InlineDeleteConfirm
                onConfirm={() => handleDelete(v.id)}
                onCancel={cancelDelete}
                isPending={isPending}
                itemName={v.employeeName}
                entityType="violation"
                entityId={v.id}
              />
            );
          }
          return null;
        }}
      />
    </PageShell>
  );
}
