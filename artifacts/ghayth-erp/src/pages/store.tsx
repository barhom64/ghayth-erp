import { useState } from "react";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
  FormShell,
  FormTextField,
  FormNumberField,
  FormGrid,
} from "@workspace/ui-core";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Package, Plus, X, DollarSign, Eye } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { StoreTabsNav } from "@/components/shared/store-tabs-nav";

// Coerced numeric fields — the old form tracked them as strings and
// Number()-coerced at submit. zod handles both checks (numeric + non-
// negative) before the request leaves the page.
const productSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  sku: z.string().trim(),
  category: z.string().trim(),
  price: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  costPrice: z.coerce.number().min(0, "سعر التكلفة يجب أن يكون 0 أو أكثر"),
  quantity: z.coerce.number().int().min(0, "الكمية يجب أن تكون 0 أو أكثر"),
});
type ProductForm = z.infer<typeof productSchema>;
const defaultProductForm: ProductForm = {
  name: "", sku: "", category: "", price: 0, costPrice: 0, quantity: 0,
};

const orderSchema = z.object({
  customerName: z.string().trim().min(1, "اسم العميل مطلوب"),
  customerPhone: z.string().trim(),
  totalAmount: z.coerce.number().min(0, "المبلغ يجب أن يكون 0 أو أكثر"),
  notes: z.string().trim(),
});
type OrderForm = z.infer<typeof orderSchema>;
const defaultOrderForm: OrderForm = {
  customerName: "", customerPhone: "", totalAmount: 0, notes: "",
};

function ProductsTab() {
  const [, navigate] = useLocation();
  const { data: productsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["store-products"], "/store/products"
  );
  const createMut = useApiMutation<unknown, ProductForm>("/store/products", "POST", [["store-products"]]);
  const [showForm, setShowForm] = useState(false);
  const items = asList(productsResp);
  const [filters, setFilters] = useFilters();
  const filteredProducts = applyFilters(items, filters, {
    searchFields: ["name", "sku", "category"],
    statusField: "status",
    dateField: "",
  });
  const pageSize = 20;

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/store/products",
    queryKeys: [["store-products"], ["store-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "name", label: "الاسم" },
    { key: "sku", label: "رمز المنتج" },
    { key: "price", label: "السعر", type: "number" as const },
    { key: "quantity", label: "الكمية", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "غير نشط" }] },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "name", header: "المنتج", sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "sku", header: "رمز المنتج", sortable: true, render: (p) => <span className="text-muted-foreground font-mono">{p.sku || "-"}</span> },
    { key: "price", header: "السعر", sortable: true, render: (p) => formatCurrency(Number(p.price) || 0) },
    { key: "quantity", header: "الكمية", sortable: true, render: (p) => p.quantity },
    { key: "status", header: "الحالة", sortable: true, render: (p) => <PageStatusBadge status={p.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (p) => (
        <RowActions
          onEdit={() => startEdit(p.id, { name: p.name, sku: p.sku || "", price: Number(p.price) || 0, quantity: p.quantity || 0, status: p.status || "active" })}
          onDelete={() => startDelete(p.id)}
          deletePerm="store:delete"
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالاسم أو الرمز أو التصنيف...",
              statuses: [
                { value: "active", label: "نشط" },
                { value: "inactive", label: "غير نشط" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredProducts, [
              { key: "name", label: "المنتج" },
              { key: "sku", label: "رمز المنتج" },
              { key: "price", label: "السعر" },
              { key: "quantity", label: "الكمية" },
              { key: "status", label: "الحالة" },
            ], "منتجات المتجر")}
            resultCount={filteredProducts.length}
          />
        </div>
        <GuardedButton perm="store:create" size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة منتج</>}</GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            schema={productSchema}
            defaultValues={defaultProductForm}
            submitLabel="حفظ"
            secondaryActions={
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await createMut.mutateAsync(values);
              ctx.reset();
              setShowForm(false);
              refetch();
            }}
          >
            <FormGrid cols={3}>
              <FormTextField name="name" label="الاسم" required />
              <FormTextField name="sku" label="رمز المنتج" />
              <FormTextField name="category" label="التصنيف" />
              <FormNumberField name="price" label="السعر" required />
              <FormNumberField name="costPrice" label="سعر التكلفة" required />
              <FormNumberField name="quantity" label="الكمية" required />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle>المنتجات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredProducts}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد منتجات"
            emptyIcon={<Package className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={pageSize}
            onRowClick={(p) => navigate(`/store/products/${p.id}`)}
            renderRowExtras={(p) => {
              if (editingId === p.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === p.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="store-product" entityId={p.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTab() {
  const { data: ordersResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["store-orders"], "/store/orders"
  );
  const createMut = useApiMutation<unknown, OrderForm>("/store/orders", "POST", [["store-orders"]]);
  const [showForm, setShowForm] = useState(false);
  const items = asList(ordersResp);
  const [filters, setFilters] = useFilters();
  const filteredOrders = applyFilters(items, filters, {
    searchFields: ["customerName", "orderNumber"],
    statusField: "status",
    dateField: "",
  });

  const { editingId, deletingId, editForm, setEditForm, startEdit, startDelete, cancelEdit, cancelDelete, isPending, handleSave, handleDelete } = useInlineActions({
    endpoint: "/store/orders",
    queryKeys: [["store-orders"], ["store-stats"]],
    onSuccess: () => refetch(),
  });

  const editFields = [
    { key: "customerName", label: "اسم العميل" },
    { key: "totalAmount", label: "المبلغ", type: "number" as const },
    { key: "status", label: "الحالة", type: "select" as const, options: [{ value: "pending", label: "معلق" }, { value: "processing", label: "قيد التنفيذ" }, { value: "completed", label: "مكتمل" }, { value: "cancelled", label: "ملغي" }] },
    { key: "notes", label: "ملاحظات" },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "orderNumber", header: "رقم الطلب", sortable: true, render: (o) => <span className="font-mono">{o.orderNumber || `#${o.id}`}</span> },
    { key: "customerName", header: "العميل", sortable: true, render: (o) => <span className="font-medium">{o.customerName}</span> },
    { key: "totalAmount", header: "المبلغ", sortable: true, render: (o) => <span className="font-bold">{formatCurrency(Number(o.totalAmount) || 0)}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (o) => formatDateAr(o.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (o) => <PageStatusBadge status={o.status} /> },
    {
      key: "actions", header: "إجراءات",
      render: (o) => (
        <div className="flex items-center gap-1">
          <Link href={`/store/orders/${o.id}`}>
            <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
          </Link>
          <RowActions
            onEdit={() => startEdit(o.id, { customerName: o.customerName || "", totalAmount: Number(o.totalAmount) || 0, status: o.status || "pending", notes: o.notes || "" })}
            onDelete={() => startDelete(o.id)}
            deletePerm="store:delete"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالعميل أو رقم الطلب...",
              statuses: [
                { value: "pending", label: "معلق" },
                { value: "processing", label: "قيد التنفيذ" },
                { value: "completed", label: "مكتمل" },
                { value: "cancelled", label: "ملغي" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filteredOrders, [
              { key: "orderNumber", label: "رقم الطلب" },
              { key: "customerName", label: "العميل" },
              { key: "totalAmount", label: "المبلغ" },
              { key: "createdAt", label: "التاريخ" },
              { key: "status", label: "الحالة" },
            ], "طلبات المتجر")}
            resultCount={filteredOrders.length}
          />
        </div>
        <GuardedButton perm="store:create" size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />طلب جديد</>}</GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            schema={orderSchema}
            defaultValues={defaultOrderForm}
            submitLabel="حفظ"
            secondaryActions={
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await createMut.mutateAsync(values);
              ctx.reset();
              setShowForm(false);
              refetch();
            }}
          >
            <FormGrid cols={2}>
              <FormTextField name="customerName" label="اسم العميل" required />
              <FormTextField name="customerPhone" label="الهاتف" />
              <FormNumberField name="totalAmount" label="المبلغ الإجمالي" required />
              <FormTextField name="notes" label="ملاحظات" />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle>الطلبات</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredOrders}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد طلبات"
            emptyIcon={<ShoppingCart className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
            renderRowExtras={(o) => {
              if (editingId === o.id) return <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(o.id, editForm)} onCancel={cancelEdit} isPending={isPending} />;
              if (deletingId === o.id) return <InlineDeleteConfirm onConfirm={() => handleDelete(o.id)} onCancel={cancelDelete} isPending={isPending} itemName={o.orderNumber || `#${o.id}`} entityType="store-order" entityId={o.id} />;
              return null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function StorePage() {
  const { data: stats, isLoading, isError } = useApiQuery<any>(["store-stats"], "/store/stats");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const s = stats || {};
  const statCards = [
    { label: "منتجات نشطة", value: s.activeProducts || 0, icon: Package, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "إجمالي الطلبات", value: s.totalOrders || 0, icon: ShoppingCart, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "طلبات معلقة", value: s.pendingOrders || 0, icon: ShoppingCart, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "الإيرادات", value: formatCurrency(s.totalRevenue || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <StoreTabsNav />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs defaultValue="products" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="orders">الطلبات</TabsTrigger>
        </TabsList>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
