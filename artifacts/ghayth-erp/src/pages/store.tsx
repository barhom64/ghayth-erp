import { useState, Fragment } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Package, Plus, X, DollarSign, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { PaginationBar } from "@/components/data-table-wrapper";

function ProductsTab() {
  const { data: productsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["store-products"], "/store/products"
  );
  const createMut = useApiMutation<unknown, Record<string, string | number>>("/store/products", "POST", [["store-products"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", price: "", costPrice: "", quantity: "", category: "" });
  const items = asList(productsResp);
  const [filters, setFilters] = useFilters();
  const filteredProducts = applyFilters(items, filters, {
    searchFields: ["name", "sku", "category"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filteredProducts);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const paginatedData = sortedData?.slice((page - 1) * pageSize, page * pageSize);

  const handleSubmit = async () => {
    await createMut.mutateAsync({ ...form, price: Number(form.price), costPrice: Number(form.costPrice), quantity: Number(form.quantity) });
    setForm({ name: "", sku: "", price: "", costPrice: "", quantity: "", category: "" });
    setShowForm(false); refetch();
  };

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "name", label: "المنتج" },
              { key: "sku", label: "رمز المنتج" },
              { key: "price", label: "السعر" },
              { key: "quantity", label: "الكمية" },
              { key: "status", label: "الحالة" },
            ], "منتجات المتجر")}
            resultCount={sortedData?.length}
          />
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة منتج</>}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>رمز المنتج</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div><Label>التصنيف</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><Label>السعر</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div><Label>سعر التكلفة</Label><Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
          <div><Label>الكمية</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div className="md:col-span-3"><Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>حفظ</Button></div>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle>المنتجات</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="name" label="المنتج" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="sku" label="رمز المنتج" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="price" label="السعر" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="quantity" label="الكمية" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <DataTableWrapper
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={() => refetch()}
              data={filteredProducts}
              colCount={6}
              emptyMessage="لا توجد منتجات"
              emptyIcon={<Package className="h-6 w-6 text-slate-400" />}
              emptyAction={{ label: "إضافة منتج", onClick: () => setShowForm(true) }}
            >
              {paginatedData?.map((p: any) => (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono">{p.sku || "-"}</TableCell>
                    <TableCell>{formatCurrency(Number(p.price) || 0)}</TableCell>
                    <TableCell>{p.quantity}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => startEdit(p.id, { name: p.name, sku: p.sku || "", price: Number(p.price) || 0, quantity: p.quantity || 0, status: p.status || "active" })}
                        onDelete={() => startDelete(p.id)}
                      />
                    </TableCell>
                  </TableRow>
                  {editingId === p.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-2">
                        <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                      </TableCell>
                    </TableRow>
                  )}
                  {deletingId === p.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-2">
                        <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="store_product" entityId={p.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </DataTableWrapper>
          </Table>
          <PaginationBar page={page} pageSize={pageSize} total={filteredProducts.length} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}

function OrdersTab() {
  const { data: ordersResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["store-orders"], "/store/orders"
  );
  const createMut = useApiMutation<unknown, Record<string, string | number>>("/store/orders", "POST", [["store-orders"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", totalAmount: "", notes: "" });
  const items = asList(ordersResp);
  const [filters, setFilters] = useFilters();
  const filteredOrders = applyFilters(items, filters, {
    searchFields: ["customerName", "orderNumber"],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filteredOrders);

  const handleSubmit = async () => {
    await createMut.mutateAsync({ ...form, totalAmount: Number(form.totalAmount) });
    setForm({ customerName: "", customerPhone: "", totalAmount: "", notes: "" });
    setShowForm(false); refetch();
  };

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "orderNumber", label: "رقم الطلب" },
              { key: "customerName", label: "العميل" },
              { key: "totalAmount", label: "المبلغ" },
              { key: "createdAt", label: "التاريخ" },
              { key: "status", label: "الحالة" },
            ], "طلبات المتجر")}
            resultCount={sortedData?.length}
          />
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />طلب جديد</>}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>اسم العميل</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></div>
          <div><Label>الهاتف</Label><Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></div>
          <div><Label>المبلغ الإجمالي</Label><Input type="number" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} /></div>
          <div><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="md:col-span-2"><Button onClick={handleSubmit} disabled={!form.customerName || createMut.isPending}>حفظ</Button></div>
        </CardContent></Card>
      )}
      <Card>
        <CardHeader><CardTitle>الطلبات</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="orderNumber" label="رقم الطلب" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="customerName" label="العميل" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="totalAmount" label="المبلغ" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
                <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <DataTableWrapper
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={() => refetch()}
              data={filteredOrders}
              colCount={6}
              emptyMessage="لا توجد طلبات"
              emptyIcon={<ShoppingCart className="h-6 w-6 text-slate-400" />}
              emptyAction={{ label: "طلب جديد", onClick: () => setShowForm(true) }}
            >
              {sortedData?.map((o: any) => (
                <Fragment key={o.id}>
                  <TableRow>
                    <TableCell className="font-mono">{o.orderNumber || `#${o.id}`}</TableCell>
                    <TableCell className="font-medium">{o.customerName}</TableCell>
                    <TableCell className="font-bold">{formatCurrency(Number(o.totalAmount) || 0)}</TableCell>
                    <TableCell>{formatDateAr(o.createdAt)}</TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/store/orders/${o.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                        <RowActions
                          onEdit={() => startEdit(o.id, { customerName: o.customerName || "", totalAmount: Number(o.totalAmount) || 0, status: o.status || "pending", notes: o.notes || "" })}
                          onDelete={() => startDelete(o.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === o.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-2">
                        <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(o.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                      </TableCell>
                    </TableRow>
                  )}
                  {deletingId === o.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="p-2">
                        <InlineDeleteConfirm onConfirm={() => handleDelete(o.id)} onCancel={cancelDelete} isPending={isPending} itemName={o.orderNumber || `#${o.id}`} entityType="store_order" entityId={o.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </DataTableWrapper>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StorePage() {
  const { data: stats } = useApiQuery<any>(["store-stats"], "/store/stats");
  const s = stats || {};
  const statCards = [
    { label: "منتجات نشطة", value: s.activeProducts || 0, icon: Package, color: "text-blue-600 bg-blue-50" },
    { label: "إجمالي الطلبات", value: s.totalOrders || 0, icon: ShoppingCart, color: "text-green-600 bg-green-50" },
    { label: "طلبات معلقة", value: s.pendingOrders || 0, icon: ShoppingCart, color: "text-yellow-600 bg-yellow-50" },
    { label: "الإيرادات", value: formatCurrency(s.totalRevenue || 0), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
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
