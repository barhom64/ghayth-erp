import { useState, Fragment} from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTableWrapper, PaginationBar } from "@/components/data-table-wrapper";
import { SortableTableHead } from "@/components/sortable-table-head";
import { useSortedData } from "@/hooks/use-sorted-data";
import { useApiQuery, asList } from "@/lib/api";
import { Package, ArrowLeftRight, Layers, Truck, Plus, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useInlineActions, RowActions, InlineEditForm, InlineDeleteConfirm } from "@/components/inline-actions";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";

export default function Warehouse() {
  const [tab, setTab] = useState("products");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">إدارة المستودعات</h1>
        <p className="text-sm text-muted-foreground mt-0.5">متابعة المخزون والمنتجات والحركات</p>
      </div>
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
    </div>
  );
}

const PRODUCT_STATUS_OPTIONS = [
  { value: "active", label: "نشط" },
  { value: "inactive", label: "غير نشط" },
];

function ProductsTab() {
  const { roleLevel, scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: stats } = useApiQuery(["warehouse-stats", scopeQueryString], `/warehouse/stats${scopeQueryString ? `?${scopeQueryString}` : ""}`);
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "sku", label: "رمز المنتج" },
              { key: "name", label: "المنتج" },
              { key: "categoryName", label: "التصنيف" },
              { key: "currentStock", label: "المخزون" },
              { key: "minStock", label: "الحد الأدنى" },
              { key: "costPrice", label: "سعر التكلفة" },
              { key: "sellPrice", label: "سعر البيع" },
              { key: "status", label: "الحالة" },
            ], "منتجات المستودع")}
            resultCount={sortedData?.length}
          />
        </div>
        {canManage && <Link href="/warehouse/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة منتج</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>المنتجات</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="sku" label="رمز المنتج" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="name" label="المنتج" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="categoryName" label="التصنيف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="currentStock" label="المخزون" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="minStock" label="الحد الأدنى" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="costPrice" label="سعر التكلفة" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="sellPrice" label="سعر البيع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <TableHead className="text-start">الإجراءات</TableHead>
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={9} emptyMessage="لا توجد منتجات" emptyIcon={<Package className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(p => (
              <Fragment key={p.id}>
                <TableRow key={p.id} className={p.currentStock <= p.minStock ? "bg-rose-50" : ""}>
                  <TableCell className="font-mono text-muted-foreground">{p.sku || "-"}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.categoryName || "-"}</TableCell>
                  <TableCell className={`font-bold ${p.currentStock <= p.minStock ? "text-rose-600" : ""}`}>{p.currentStock}</TableCell>
                  <TableCell>{p.minStock}</TableCell>
                  <TableCell>{formatCurrency(p.costPrice || 0)}</TableCell>
                  <TableCell>{formatCurrency(p.sellPrice || 0)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-start">
                    <RowActions
                      canEdit={canManage}
                      onEdit={() => startEdit(p.id, { name: p.name, sku: p.sku || "", minStock: p.minStock || 0, costPrice: p.costPrice || 0, sellPrice: p.sellPrice || 0, status: p.status || "active" })}
                      onDelete={() => startDelete(p.id)}
                    />
                  </TableCell>
                </TableRow>
                {editingId === p.id && (
                  <TableRow key={`edit-${p.id}`}><TableCell colSpan={9}>
                    <InlineEditForm fields={editFields} form={editForm} setForm={setEditForm} onSave={() => handleSave(p.id, editForm)} onCancel={cancelEdit} isPending={isPending} />
                  </TableCell></TableRow>
                )}
                {deletingId === p.id && (
                  <TableRow key={`del-${p.id}`}><TableCell colSpan={9}>
                    <InlineDeleteConfirm onConfirm={() => handleDelete(p.id)} onCancel={cancelDelete} isPending={isPending} itemName={p.name} entityType="warehouse_product" entityId={p.id} />
                  </TableCell></TableRow>
                )}
              </Fragment>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "productName", label: "المنتج" },
              { key: "type", label: "النوع" },
              { key: "quantity", label: "الكمية" },
              { key: "reference", label: "المرجع" },
              { key: "createdAt", label: "التاريخ" },
            ], "حركات المخزون")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/warehouse/movements/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة حركة</Button></Link>
      </div>
      <Card>
        <CardHeader><CardTitle>حركات المخزون</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow>
            <SortableTableHead column="productName" label="المنتج" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="quantity" label="الكمية" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="reference" label="المرجع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={5} emptyMessage="لا توجد حركات" emptyIcon={<ArrowLeftRight className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(m => (
              <TableRow key={m.id}>
                <TableCell>{m.productName || "-"}</TableCell>
                <TableCell><span className={`px-2 py-1 rounded text-xs font-medium ${m.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{m.type === 'in' ? 'إدخال' : m.type === 'out' ? 'إخراج' : m.type}</span></TableCell>
                <TableCell className="font-bold">{m.quantity}</TableCell>
                <TableCell>{m.reference || "-"}</TableCell>
                <TableCell>{formatDateAr(m.createdAt)}</TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "name", label: "الاسم" },
              { key: "createdAt", label: "تاريخ الإنشاء" },
            ], "تصنيفات المستودع")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/warehouse/categories/create"><Button className="gap-2"><Plus className="h-4 w-4" /> تصنيف جديد</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table><TableHeader><TableRow>
            <SortableTableHead column="name" label="الاسم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="createdAt" label="تاريخ الإنشاء" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={2} emptyMessage="لا توجد تصنيفات" emptyIcon={<Layers className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(c => (
              <TableRow key={c.id}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{formatDateAr(c.createdAt)}</TableCell></TableRow>
            ))}
          </DataTableWrapper></Table>
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
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

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
            onExportCSV={() => exportToCSV(sortedData || [], [
              { key: "name", label: "المورد" },
              { key: "contactPerson", label: "جهة الاتصال" },
              { key: "phone", label: "الهاتف" },
              { key: "rating", label: "التقييم" },
              { key: "status", label: "الحالة" },
            ], "موردون المستودع")}
            resultCount={sortedData?.length}
          />
        </div>
        <Link href="/warehouse/suppliers/create"><Button className="gap-2"><Plus className="h-4 w-4" /> إضافة مورد</Button></Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table><TableHeader><TableRow>
            <SortableTableHead column="name" label="المورد" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="contactPerson" label="جهة الاتصال" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="phone" label="الهاتف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="rating" label="التقييم" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
          </TableRow></TableHeader>
          <DataTableWrapper isLoading={isLoading} isError={isError} error={error} onRetry={() => refetch()} data={filtered} colCount={5} emptyMessage="لا يوجد موردون" emptyIcon={<Truck className="h-6 w-6 text-slate-400" />}>
            {sortedData?.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.contactPerson || "-"}</TableCell>
                <TableCell dir="ltr" className="text-right">{s.phone || "-"}</TableCell>
                <TableCell>⭐ {s.rating}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </DataTableWrapper></Table>
        </CardContent>
      </Card>
    </div>
  );
}
