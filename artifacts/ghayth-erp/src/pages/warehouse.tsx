import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  exportToCSV,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
// P4.9 — Warehouse sweep: shared header + status chips.
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Package, ArrowLeftRight, Layers, Truck, Plus, AlertTriangle, DollarSign, Activity } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { KpiGrid } from "@/components/shared/kpi-card";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { useAppContext } from "@/contexts/app-context";
import { WarehouseTabsNav } from "@/components/shared/warehouse-tabs-nav";
import { withListFilters } from "@/lib/list-query";

export default function Warehouse() {
  const [tab, setTab] = useState("products");
  return (
    <PageShell
      title="إدارة المستودعات"
      subtitle="متابعة المخزون والمنتجات والحركات"
      breadcrumbs={[{ label: "المستودعات" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/warehouse/movements/create">
            <GuardedButton perm="warehouse:create" variant="outline" size="sm" className="gap-1.5">
              <ArrowLeftRight className="h-4 w-4" />
              حركة جديدة
            </GuardedButton>
          </Link>
          <Link href="/warehouse/create">
            <GuardedButton perm="warehouse:create" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              منتج جديد
            </GuardedButton>
          </Link>
        </div>
      }
    >
      <WarehouseTabsNav />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products" className="gap-2"><Package className="h-4 w-4" /> المنتجات</TabsTrigger>
          <TabsTrigger value="movements" className="gap-2"><ArrowLeftRight className="h-4 w-4" /> الحركات</TabsTrigger>
          <TabsTrigger value="categories" className="gap-2"><Layers className="h-4 w-4" /> التصنيفات</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2"><Truck className="h-4 w-4" /> الموردون</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-6"><ProductsTab /></TabsContent>
        <TabsContent value="movements" className="mt-6"><MovementsTab /></TabsContent>
        <TabsContent value="categories" className="mt-6"><CategoriesTab /></TabsContent>
        <TabsContent value="suppliers" className="mt-6"><SuppliersTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ProductsTab() {
  const [, navigate] = useLocation();
  const { roleLevel } = useAppContext();
  // Scope (companyIds/branchIds) + scope-aware queryKey are injected
  // automatically by useApiQuery → injectScope. We keep filterParams
  // narrow to the list-endpoint-specific knobs.
  const { data: stats } = useApiQuery<any>(["warehouse-stats"], `/warehouse/stats`);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  useEffect(() => { setPage(1); }, [filters.search, filters.status, filters.dateFrom, filters.dateTo]);
  const pageSize = 20;
  const canManage = roleLevel >= 50;
  const { data: productsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-products", String(page), filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/warehouse/products?page=${page}&limit=${pageSize}`, filters),
  );
  const products = asList(productsResp);
  const total = productsResp?.total || products.length;

  const filtered = products;

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/warehouse/products",
    queryKeys: [["warehouse-products", String(page)], ["warehouse-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "المنتج" },
    { key: "sku", label: "رمز المنتج" },
    { key: "minStock", label: "الحد الأدنى", type: "number" as const },
    { key: "costPrice", label: "سعر التكلفة", type: "number" as const },
    { key: "sellPrice", label: "سعر البيع", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "sku", header: "رمز المنتج", sortable: true, render: (p) => <span className="font-mono text-muted-foreground">{p.sku || "-"}</span> },
    { key: "name", header: "المنتج", sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "categoryName", header: "التصنيف", sortable: true, render: (p) => p.categoryName || "-" },
    { key: "currentStock", header: "المخزون", sortable: true, render: (p) => <span className={`font-bold ${p.currentStock <= p.minStock ? "text-rose-600" : ""}`}>{p.currentStock}</span> },
    { key: "minStock", header: "الحد الأدنى", sortable: true, render: (p) => p.minStock },
    { key: "costPrice", header: "سعر التكلفة", sortable: true, render: (p) => formatCurrency(p.costPrice || 0) },
    { key: "sellPrice", header: "سعر البيع", sortable: true, render: (p) => formatCurrency(p.sellPrice || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "actions", header: "الإجراءات",
      render: (p) => (
        <RowActions
          canEdit={canManage}
          onEdit={() => startEdit(p.id, { name: p.name, sku: p.sku || "", minStock: p.minStock || 0, costPrice: p.costPrice || 0, sellPrice: p.sellPrice || 0, status: p.status || "active" })}
          onDelete={() => startDelete(p.id)}
          deletePerm="warehouse:delete"
        />
      ),
    },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-6">
      <KpiGrid items={[
        { label: "إجمالي المنتجات", value: stats?.totalProducts || 0, icon: Package, color: "text-status-info-foreground bg-status-info-surface" },
        { label: "مخزون منخفض", value: stats?.lowStock || 0, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
        { label: "قيمة المخزون", value: formatCurrency(stats?.totalValue || 0), icon: DollarSign, color: "text-status-success-foreground bg-status-success-surface" },
        { label: "حركات اليوم", value: stats?.todayMovements || 0, icon: Activity, color: "text-purple-600 bg-purple-50" },
      ]} />

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالمنتج أو رمز المنتج أو التصنيف...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "inactive", label: "غير نشط" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "sku", label: "رمز المنتج" },
              { key: "name", label: "المنتج" },
              { key: "categoryName", label: "التصنيف" },
              { key: "currentStock", label: "المخزون" },
              { key: "minStock", label: "الحد الأدنى" },
              { key: "costPrice", label: "سعر التكلفة" },
              { key: "sellPrice", label: "سعر البيع" },
              { key: "status", label: "الحالة" },
            ], "منتجات المستودع")}
            resultCount={filtered.length}
          />
        </div>
        {canManage && <Link href="/warehouse/create"><GuardedButton perm="warehouse:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة منتج</GuardedButton></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>المنتجات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد منتجات"
            emptyIcon={<Package className="h-6 w-6 text-slate-400" />}
            noToolbar
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onRowClick={(row) => navigate(`/warehouse/products/${row.id}`)}
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} initialValues={editForm} onSave={(values) => handleSave(p.id, values)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="warehouse-product" entityId={p.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MovementsTab() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  useEffect(() => { setPage(1); }, [filters.search, filters.status, filters.dateFrom, filters.dateTo]);
  const pageSize = 20;
  const { data: movementsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-movements", String(page), filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/warehouse/movements?page=${page}&limit=${pageSize}`, filters),
  );
  const movements = asList(movementsResp);
  const total = movementsResp?.total || movements.length;

  const filtered = movements;

  const columns: DataTableColumn<any>[] = [
    { key: "productName", header: "المنتج", sortable: true, render: (m) => m.productName || "-" },
    {
      key: "type", header: "النوع", sortable: true,
      render: (m) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${m.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {m.type === 'in' ? 'إدخال' : m.type === 'out' ? 'إخراج' : m.type}
        </span>
      ),
    },
    { key: "quantity", header: "الكمية", sortable: true, render: (m) => <span className="font-bold">{m.quantity}</span> },
    { key: "reference", header: "المرجع", sortable: true, render: (m) => m.reference || "-" },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (m) => formatDateAr(m.createdAt) },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالمنتج أو المرجع...",
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "productName", label: "المنتج" },
              { key: "type", label: "النوع" },
              { key: "quantity", label: "الكمية" },
              { key: "reference", label: "المرجع" },
              { key: "createdAt", label: "التاريخ" },
            ], "حركات المخزون")}
            resultCount={filtered.length}
          />
        </div>
        <TransferDialog onCreated={refetch} />
        <Link href="/warehouse/movements/create"><GuardedButton perm="warehouse:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة حركة</GuardedButton></Link>
      </div>
      <Card>
        <CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد حركات"
            emptyIcon={<ArrowLeftRight className="h-6 w-6 text-slate-400" />}
            noToolbar
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CategoriesTab() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data: categoriesResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-categories", filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/warehouse/categories`, filters),
  );
  const categories = asList(categoriesResp);

  const filtered = categories;

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الاسم", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "createdAt", header: "تاريخ الإنشاء", sortable: true, render: (c) => formatDateAr(c.createdAt) },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم...",
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "name", label: "الاسم" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ], "تصنيفات المستودع")}
            resultCount={filtered.length}
          />
        </div>
        <Link href="/warehouse/categories/create"><GuardedButton perm="warehouse:create" className="gap-2"><Plus className="h-4 w-4" /> تصنيف جديد</GuardedButton></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(c) => navigate(`/warehouse/categories/${c.id}`)}
            emptyMessage="لا توجد تصنيفات"
            emptyIcon={<Layers className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SuppliersTab() {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { data: suppliersResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-suppliers", filters.search, filters.status, filters.dateFrom, filters.dateTo],
    withListFilters(`/warehouse/suppliers`, filters),
  );
  const suppliers = asList(suppliersResp);

  const filtered = suppliers;

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المورد", sortable: true, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: "contactPerson", header: "جهة الاتصال", sortable: true, render: (s) => s.contactPerson || "-" },
    { key: "phone", header: "الهاتف", sortable: true, ltr: true, render: (s) => s.phone || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (s) => <span>⭐ {s.rating}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (s) => <PageStatusBadge status={s.status} /> },
  ];

  if (isError) return <PageStateWrapper error={error} onRetry={refetch}><div /></PageStateWrapper>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالمورد أو جهة الاتصال أو الهاتف...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "inactive", label: "غير نشط" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered, [
              { key: "name", label: "المورد" },
              { key: "contactPerson", label: "جهة الاتصال" },
              { key: "phone", label: "الهاتف" },
              { key: "rating", label: "التقييم" },
              { key: "status", label: "الحالة" },
            ], "موردون المستودع")}
            resultCount={filtered.length}
          />
        </div>
        <Link href="/warehouse/suppliers/create"><GuardedButton perm="warehouse:create" className="gap-2"><Plus className="h-4 w-4" /> إضافة مورد</GuardedButton></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            onRowClick={(s) => navigate(`/warehouse/suppliers/${s.id}`)}
            emptyMessage="لا يوجد موردون"
            emptyIcon={<Truck className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// WH-TRANSFER — wires POST /warehouse/transfers (the dual transfer_in/
// transfer_out movement). The endpoint had no UI; products could only
// move via single "add movement" entries which don't enforce the
// dual-leg invariant. Dialog form: product picker, quantity, from
// warehouse (string or id — backend accepts either), to warehouse,
// notes.
const transferSchema = z.object({
  productId: z.string().min(1, "اختر منتجًا"),
  quantity: z.string().refine((v) => Number(v) > 0, "الكمية مطلوبة"),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  notes: z.string().optional(),
});
type TransferForm = z.infer<typeof transferSchema>;

const TRANSFER_EMPTY: TransferForm = {
  productId: "",
  quantity: "",
  fromLocation: "",
  toLocation: "",
  notes: "",
};

function OverdrawWarning({ products }: { products: Array<{ id: number; name: string; currentStock?: number }> }) {
  const { watch } = useFormContext<TransferForm>();
  const productId = watch("productId");
  const quantity = watch("quantity");
  const selected = products.find((p) => String(p.id) === productId);
  const overdraw = !!selected && Number(selected.currentStock ?? 0) < Number(quantity || 0);
  if (!overdraw) return null;
  return (
    <p className="text-xs text-status-warning-foreground -mt-2">
      ⚠ الكمية المطلوبة تتجاوز الرصيد الحالي ({selected?.currentStock})
    </p>
  );
}

function TransferDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);

  const { data: productsResp } = useApiQuery<any>(
    open ? ["warehouse-products-all"] : [""],
    open ? "/warehouse/products?limit=500" : "",
  );
  const products: Array<{ id: number; name: string; currentStock?: number }> = asList(productsResp);

  const transferMut = useApiMutation<unknown, { productId: number; quantity: number; fromLocation?: string; toLocation?: string; notes?: string }>(
    "/warehouse/transfers",
    "POST",
    [["warehouse-movements"], ["warehouse-products-all"]],
    {
      successMessage: "تم تسجيل التحويل",
      onSuccess: () => {
        setOpen(false);
        onCreated();
      },
    },
  );

  const productOptions = products.map((p) => ({
    value: String(p.id),
    label: p.currentStock !== undefined ? `${p.name} (الرصيد: ${p.currentStock})` : p.name,
  }));

  return (
    <>
      <GuardedButton perm="warehouse.transfers:create" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="h-4 w-4" /> تحويل بين المستودعات
      </GuardedButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تحويل مخزون بين موقعين</DialogTitle>
            <DialogDescription>
              يُنشئ النظام حركتي إخراج وإدخال مرتبطتين تلقائيًا بنفس المرجع
              (`TRANSFER-…`).
            </DialogDescription>
          </DialogHeader>
          <FormShell
            schema={transferSchema}
            defaultValues={TRANSFER_EMPTY}
            submitLabel={transferMut.isPending ? "جاري التحويل..." : "تأكيد التحويل"}
            secondaryActions={
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            }
            onSubmit={async (values) => {
              await transferMut.mutateAsync({
                productId: Number(values.productId),
                quantity: Number(values.quantity),
                fromLocation: values.fromLocation?.trim() || undefined,
                toLocation: values.toLocation?.trim() || undefined,
                notes: values.notes?.trim() || undefined,
              });
            }}
          >
            <FormSelectField name="productId" label="المنتج" options={productOptions} placeholder="اختر منتجًا" required />
            <FormNumberField name="quantity" label="الكمية" min={0} required />
            <OverdrawWarning products={products} />
            <FormGrid cols={2}>
              <FormTextField name="fromLocation" label="من موقع" placeholder="المستودع المصدر" />
              <FormTextField name="toLocation" label="إلى موقع" placeholder="المستودع الهدف" />
            </FormGrid>
            <FormTextField name="notes" label="ملاحظات" placeholder="اختياري" />
          </FormShell>
        </DialogContent>
      </Dialog>
    </>
  );
}
