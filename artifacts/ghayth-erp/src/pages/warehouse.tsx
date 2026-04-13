import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
// P4.9 — Warehouse sweep: shared header + status chips.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { useApiQuery, asList } from "@/lib/api";
import { Package, ArrowLeftRight, Layers, Truck, Plus, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function Warehouse() {
  const [tab, setTab] = useState("products");
  return (
    <PageShell
      title="إدارة المستودعات"
      subtitle="متابعة المخزون والمنتجات والحركات"
      breadcrumbs={[{ label: "المستودعات" }]}
    >
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
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery<any>(["warehouse-stats", scopeQueryString], `/warehouse/stats${scopeQueryString ? `?${scopeQueryString}` : ""}`);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useFilters();
  const pageSize = 20;
  const canManage = roleLevel >= 50;
  const { data: productsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-products", String(page), scopeQueryString], `/warehouse/products?page=${page}&limit=${pageSize}${scopeSuffix}`
  );
  const products = asList(productsResp);
  const total = productsResp?.total || products.length;

  const filtered = applyFilters(products, filters, {
    searchFields: ["name", "sku", "categoryName"],
    statusField: "status",
    dateField: "createdAt",
  });

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
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">إجمالي المنتجات</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalProducts || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-rose-600"><AlertTriangle className="h-4 w-4 inline me-1" />مخزون منخفض</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{stats?.lowStock || 0}</div></CardContent></Card>
        <Card className="bg-primary text-primary-foreground"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">قيمة المخزون</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(stats?.totalValue || 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">حركات اليوم</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.todayMovements || 0}</div></CardContent></Card>
      </div>

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
        {canManage && <Link href="/warehouse/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة منتج</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>المنتجات</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
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
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="warehouse_product" entityId={p.id} />;
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
  const pageSize = 20;
  const { data: movementsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["warehouse-movements", String(page)], `/warehouse/movements?page=${page}&limit=${pageSize}`
  );
  const movements = asList(movementsResp);
  const total = movementsResp?.total || movements.length;

  const filtered = applyFilters(movements, filters, {
    searchFields: ["productName", "reference"],
    dateField: "createdAt",
  });

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
        <Link href="/warehouse/movements/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة حركة</Button></Link>
      </div>
      <Card>
        <CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader>
        <CardContent>
          <DataTable<any>
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
  const { data: categoriesResp, isLoading, isError, error, refetch } = useApiQuery<any>(["warehouse-categories"], "/warehouse/categories");
  const categories = asList(categoriesResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(categories, filters, {
    searchFields: ["name"],
    dateField: "createdAt",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "الاسم", sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
    { key: "createdAt", header: "تاريخ الإنشاء", sortable: true, render: (c) => formatDateAr(c.createdAt) },
  ];

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
        <Link href="/warehouse/categories/create"><Button className="gap-2"><Plus className="h-4 w-4" /> تصنيف جديد</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable<any>
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
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
  const { data: suppliersResp, isLoading, isError, error, refetch } = useApiQuery<any>(["warehouse-suppliers"], "/warehouse/suppliers");
  const suppliers = asList(suppliersResp);
  const [filters, setFilters] = useFilters();

  const filtered = applyFilters(suppliers, filters, {
    searchFields: ["name", "contactPerson", "phone"],
    statusField: "status",
    dateField: "createdAt",
  });

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المورد", sortable: true, render: (s) => <span className="font-medium">{s.name}</span> },
    { key: "contactPerson", header: "جهة الاتصال", sortable: true, render: (s) => s.contactPerson || "-" },
    { key: "phone", header: "الهاتف", sortable: true, ltr: true, render: (s) => s.phone || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (s) => <span>⭐ {s.rating}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (s) => <PageStatusBadge status={s.status} /> },
  ];

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
        <Link href="/warehouse/suppliers/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مورد</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable<any>
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
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
