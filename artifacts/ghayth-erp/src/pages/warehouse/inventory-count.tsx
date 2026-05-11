import { useState, useMemo } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import {
  ClipboardCheck, Plus, Package, CheckCircle, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, FileText, Clock, AlertTriangle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { KpiGrid } from "@/components/shared/kpi-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_OPTIONS = [
  { value: "draft", label: "مسودة" },
  { value: "approved", label: "مُعتمد" },
];

export default function InventoryCountPage() {
  const [showForm, setShowForm] = useState(false);
  const [expandedCount, setExpandedCount] = useState<number | null>(null);
  const [countItems, setCountItems] = useState<Record<number, any[]>>({});
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ countDate: new Date().toISOString().split("T")[0], notes: "", warehouseLocation: "" });
  const [filters, setFilters] = useFilters();
  // Tracks the count being approved. Replaces a native window.confirm()
  // that blocked the event loop and ignored RTL/dark mode. Approval
  // is a destructive operation (updates inventory directly) so it
  // deserves a proper confirmation surface.
  const [approveTargetId, setApproveTargetId] = useState<number | null>(null);

  const { data, refetch } = useApiQuery<any>(["inventory-counts"], "/warehouse/inventory-counts");
  const counts = asList(data?.data || data);

  const { data: products } = useApiQuery<any>(["warehouse-products"], "/warehouse/products?limit=500");
  const productList = asList(products?.data || products);

  const handleCreate = async () => {
    try {
      await apiFetch("/warehouse/inventory-counts", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إنشاء جلسة الجرد" });
      setShowForm(false);
      setForm({ countDate: new Date().toISOString().split("T")[0], notes: "", warehouseLocation: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const loadItems = async (countId: number) => {
    if (expandedCount === countId) { setExpandedCount(null); return; }
    try {
      const resp = await fetch(`/api/warehouse/inventory-counts/${countId}/items`, { credentials: "include" });
      const json = await resp.json();
      setCountItems((prev) => ({ ...prev, [countId]: json.data || json }));
      setExpandedCount(countId);
    } catch (e) { toast({ title: "خطأ في جلب العناصر", variant: "destructive" }); }
  };

  const handleSaveItem = async (countId: number, productId: number, systemStock: number) => {
    const key = `${countId}-${productId}`;
    const physical = physicalCounts[key];
    if (physical === undefined || physical === "") { toast({ title: "أدخل الكمية الفعلية", variant: "destructive" }); return; }
    try {
      await apiFetch(`/warehouse/inventory-counts/${countId}/items`, { method: "POST", body: JSON.stringify({ productId, physicalCount: Number(physical) }) });
      const resp = await fetch(`/api/warehouse/inventory-counts/${countId}/items`, { credentials: "include" });
      const json = await resp.json();
      setCountItems((prev) => ({ ...prev, [countId]: json.data || json }));
      toast({ title: "تم حفظ الجرد" });
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  const confirmApprove = async (countId: number) => {
    try {
      const res = await apiFetch<any>(`/warehouse/inventory-counts/${countId}/approve`, { method: "POST", body: JSON.stringify({}) });
      if (res?.warning) {
        toast({
          variant: "destructive",
          title: `تم اعتماد الجرد — ${res.itemsAdjusted ?? 0} منتج تم تعديله`,
          description: res.warning,
        });
      } else {
        toast({ title: `تم اعتماد الجرد — ${res?.itemsAdjusted ?? 0} منتج تم تعديله` });
      }
      refetch();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
  };

  // --- Filtering ---
  const filtered = applyFilters(counts, filters, {
    searchFields: ["warehouseLocation", "notes", "conductedByName"],
    statusField: "status",
    dateField: "countDate",
  });

  // --- KPI stats ---
  const stats = useMemo(() => {
    const total = counts.length;
    const draft = counts.filter((c: any) => c.status !== "approved").length;
    const approved = counts.filter((c: any) => c.status === "approved").length;
    return { total, draft, approved };
  }, [counts]);

  const kpis = [
    {
      label: "إجمالي الجلسات",
      value: stats.total,
      icon: FileText,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "مسودة",
      value: stats.draft,
      icon: Clock,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "مُعتمد",
      value: stats.approved,
      icon: CheckCircle,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "إجمالي المنتجات",
      value: productList.length,
      icon: Package,
      color: "text-purple-600 bg-purple-50",
    },
  ];

  // --- Main counts table columns ---
  const columns: DataTableColumn<any>[] = [
    {
      key: "countDate",
      header: "تاريخ الجرد",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${row.status === "approved" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"}`}>
            {row.status === "approved" ? <CheckCircle className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
          </div>
          <span className="font-medium text-sm">جرد {row.countDate?.split("T")[0]}</span>
        </div>
      ),
    },
    {
      key: "warehouseLocation",
      header: "موقع المستودع",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-gray-600">{row.warehouseLocation || "—"}</span>
      ),
    },
    {
      key: "conductedByName",
      header: "بواسطة",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-gray-500">{row.conductedByName || "—"}</span>
      ),
    },
    {
      key: "notes",
      header: "ملاحظات",
      render: (row) => (
        <span className="text-xs text-gray-400 truncate max-w-[200px] block">{row.notes || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (row) => (
        <Badge className={row.status === "approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
          {row.status === "approved" ? "مُعتمد" : "مسودة"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.status !== "approved" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-green-700 hover:bg-green-50"
              onClick={(e) => { e.stopPropagation(); setApproveTargetId(row.id); }}
            >
              <CheckCircle className="w-3.5 h-3.5 me-1" /> اعتماد
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={(e) => { e.stopPropagation(); loadItems(row.id); }}
          >
            {expandedCount === row.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      ),
    },
  ];

  // --- Expanded row: product items table ---
  const renderRowExtras = (count: any) => {
    if (expandedCount !== count.id) return null;

    const itemColumns: DataTableColumn<any>[] = [
      {
        key: "name",
        header: "المنتج",
        render: (_row, _idx) => {
          const p = _row;
          return <span className="text-xs">{p.name}</span>;
        },
      },
      {
        key: "sku",
        header: "رمز المنتج",
        align: "center",
        render: (_row) => <span className="text-xs text-gray-400">{_row.sku || "—"}</span>,
      },
      {
        key: "systemStock",
        header: "المخزون النظامي",
        align: "center",
        render: (_row) => {
          const existing = (countItems[count.id] || []).find((i: any) => i.productId === _row.id);
          const sysStock = existing?.systemStock ?? _row.currentStock;
          return <span className="text-xs font-medium">{sysStock}</span>;
        },
      },
      {
        key: "physicalCount",
        header: "الفعلي",
        align: "center",
        render: (_row) => {
          const existing = (countItems[count.id] || []).find((i: any) => i.productId === _row.id);
          const key = `${count.id}-${_row.id}`;
          const physVal = physicalCounts[key] ?? (existing ? String(existing.physicalCount) : "");
          if (count.status === "approved") {
            return <span className="text-xs">{existing ? existing.physicalCount : "—"}</span>;
          }
          return (
            <Input
              type="number"
              min="0"
              className="h-7 w-20 text-center mx-auto text-xs"
              value={physVal}
              onChange={(e) => setPhysicalCounts((prev) => ({ ...prev, [key]: e.target.value }))}
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      },
      {
        key: "variance",
        header: "الفرق",
        align: "center",
        render: (_row) => {
          const existing = (countItems[count.id] || []).find((i: any) => i.productId === _row.id);
          const key = `${count.id}-${_row.id}`;
          const physVal = physicalCounts[key] ?? (existing ? String(existing.physicalCount) : "");
          const sysStock = existing?.systemStock ?? _row.currentStock;
          const variance = existing?.variance ?? (physVal !== "" ? Number(physVal) - Number(sysStock) : null);
          if (variance === null) return null;
          return (
            <span className={`flex items-center justify-center gap-0.5 font-medium text-xs ${variance > 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-gray-400"}`}>
              {variance > 0 ? <ArrowUp className="w-3 h-3" /> : variance < 0 ? <ArrowDown className="w-3 h-3" /> : null}
              {Math.abs(variance)}
            </span>
          );
        },
      },
    ];

    // Add save action column only for drafts
    if (count.status !== "approved") {
      itemColumns.push({
        key: "saveAction",
        header: "",
        render: (_row) => {
          const existing = (countItems[count.id] || []).find((i: any) => i.productId === _row.id);
          const sysStock = existing?.systemStock ?? _row.currentStock;
          return (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={(e) => { e.stopPropagation(); handleSaveItem(count.id, _row.id, sysStock); }}
            >
              حفظ
            </Button>
          );
        },
      });
    }

    return (
      <div className="p-4 bg-muted/30 border-t">
        {count.status !== "approved" && (
          <div className="mb-3 p-3 bg-blue-50 rounded text-xs text-blue-700">
            أدخل الكمية الفعلية لكل منتج ثم احفظ — يُحدَّث المخزون عند الاعتماد.
          </div>
        )}
        <DataTable
          columns={itemColumns}
          data={productList}
          noToolbar
          pageSize={0}
          emptyMessage="لا توجد منتجات"
          rowClassName={(p: any) => {
            const existing = (countItems[count.id] || []).find((i: any) => i.productId === p.id);
            const key = `${count.id}-${p.id}`;
            const physVal = physicalCounts[key] ?? (existing ? String(existing.physicalCount) : "");
            const sysStock = existing?.systemStock ?? p.currentStock;
            const variance = existing?.variance ?? (physVal !== "" ? Number(physVal) - Number(sysStock) : null);
            if (variance !== null && variance !== 0) {
              return variance > 0 ? "bg-green-50/50" : "bg-red-50/50";
            }
            return undefined;
          }}
        />
      </div>
    );
  };

  return (
    <PageShell
      title="جرد المخزن"
      subtitle="إجراء جلسات الجرد الدوري ومطابقة المخزون الفعلي"
      breadcrumbs={[{ href: "/warehouse", label: "إدارة المخازن" }]}
      actions={
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> جلسة جرد جديدة
        </Button>
      }
    >
      <KpiGrid items={kpis} />

      {stats.draft > 0 && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{stats.draft}</strong> جلسة جرد بحالة مسودة بانتظار الاعتماد
          </span>
        </div>
      )}

      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">جلسة جرد جديدة</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div>
              <Label>تاريخ الجرد</Label>
              <UnifiedDateInput value={form.countDate} onChange={(v) => setForm({ ...form, countDate: v })} showDualCalendar showPresets />
            </div>
            <div>
              <Label>موقع المستودع</Label>
              <Input value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} placeholder="اسم المستودع أو القسم" />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="col-span-3 flex gap-2">
              <Button onClick={handleCreate} rateLimitAware>بدء الجرد</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالموقع أو الملاحظات أو اسم المسؤول...",
          statuses: STATUS_OPTIONS,
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
        emptyMessage="لا توجد جلسات جرد — أنشئ جلسة جرد جديدة للبدء"
        pageSize={20}
        renderRowExtras={renderRowExtras}
        onRowClick={(row) => loadItems(row.id)}
      />

      <AlertDialog
        open={approveTargetId !== null}
        onOpenChange={(next) => { if (!next) setApproveTargetId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>اعتماد جلسة الجرد</AlertDialogTitle>
            <AlertDialogDescription>
              سيؤدي اعتماد الجرد إلى تحديث رصيد المخزون تلقائيًا وفق العدّ الفعلي.
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setApproveTargetId(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (approveTargetId != null) {
                  const id = approveTargetId;
                  setApproveTargetId(null);
                  confirmApprove(id);
                }
              }}
            >
              اعتماد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
