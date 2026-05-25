import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { formatNumber } from "@/lib/formatters";
import { Package, Wrench, ShoppingBag } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

interface ProductCatalogRow {
  id: number;
  name: string;
  sku: string | null;
  itemType: string | null;
  isActive: boolean;
  defaultRevenueAccountId: number | null;
  defaultExpenseAccountId: number | null;
  defaultInventoryAccountId: number | null;
  defaultAssetAccountId: number | null;
  defaultTaxCode: string | null;
  defaultActivityType: string | null;
  requiresVehicle: boolean;
  requiresProperty: boolean;
  requiresProject: boolean;
  requiresContract: boolean;
  requiresUmrahAgent: boolean;
  requiresUmrahSeason: boolean;
  defaultCostCenterStrategy: string | null;
}

const ITEM_TYPE_LABEL: Record<string, { label: string; tone: string; icon: any }> = {
  product:    { label: "منتج",       tone: "bg-status-info-surface text-status-info-foreground", icon: Package },
  service:    { label: "خدمة",       tone: "bg-emerald-50 text-emerald-700",                    icon: Wrench },
  asset:      { label: "أصل ثابت",   tone: "bg-purple-100 text-purple-800",                     icon: ShoppingBag },
  consumable: { label: "مستهلك",     tone: "bg-yellow-50 text-yellow-700",                      icon: Package },
  digital:    { label: "رقمي",        tone: "bg-blue-50 text-blue-700",                          icon: Package },
};

const STRATEGY_LABEL: Record<string, string> = {
  from_vehicle:      "من المركبة",
  from_property:     "من العقار",
  from_unit:         "من الوحدة",
  from_project:      "من المشروع",
  from_employee:     "من الموظف",
  from_contract:     "من العقد",
  from_umrah_agent:  "من مرشد العمرة",
  from_umrah_season: "من موسم العمرة",
  explicit:          "صريح",
  none:              "بدون",
};

export default function ProductCatalogPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [routedFilter, setRoutedFilter] = useState<string>("");

  const { data, isLoading, isError } = useApiQuery<{ data: ProductCatalogRow[] }>(
    ["product-catalog"], "/warehouse/products?limit=500",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const allRows = (data?.data ?? []).filter((p) => p.isActive);

  const filtered = allRows.filter((p) => {
    if (search) {
      const s = search.toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !(p.sku ?? "").toLowerCase().includes(s)) {
        return false;
      }
    }
    if (typeFilter && p.itemType !== typeFilter) return false;
    if (routedFilter === "routed") {
      const hasAny = p.defaultRevenueAccountId || p.defaultExpenseAccountId
        || p.defaultInventoryAccountId || p.defaultAssetAccountId;
      if (!hasAny) return false;
    }
    if (routedFilter === "unrouted") {
      const hasAny = p.defaultRevenueAccountId || p.defaultExpenseAccountId
        || p.defaultInventoryAccountId || p.defaultAssetAccountId;
      if (hasAny) return false;
    }
    return true;
  });

  const stats = allRows.reduce((acc, p) => {
    acc.total += 1;
    const hasRouting = !!(p.defaultRevenueAccountId || p.defaultExpenseAccountId
      || p.defaultInventoryAccountId || p.defaultAssetAccountId);
    if (hasRouting) acc.routed += 1;
    const hasRequirement = p.requiresVehicle || p.requiresProperty || p.requiresProject
      || p.requiresContract || p.requiresUmrahAgent || p.requiresUmrahSeason;
    if (hasRequirement) acc.withRequirement += 1;
    if (p.itemType === "service") acc.services += 1;
    return acc;
  }, { total: 0, routed: 0, withRequirement: 0, services: 0 });

  const cols: DataTableColumn<ProductCatalogRow>[] = [
    { key: "name", header: "الاسم",
      render: (r) => (
        <div>
          <Link href={`/warehouse/products/${r.id}`}
            className="text-status-info-foreground hover:underline font-medium">
            {r.name}
          </Link>
          {r.sku && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">SKU: {r.sku}</p>
          )}
        </div>
      ),
    },
    { key: "itemType", header: "النوع",
      render: (r) => {
        const info = r.itemType ? ITEM_TYPE_LABEL[r.itemType] : null;
        if (!info) return <span className="text-muted-foreground italic text-xs">—</span>;
        const Icon = info.icon;
        return (
          <Badge className={`text-xs ${info.tone}`}>
            <Icon className="h-3 w-3 me-1" />
            {info.label}
          </Badge>
        );
      },
    },
    { key: "accounts", header: "الحسابات الافتراضية",
      render: (r) => {
        const accounts: string[] = [];
        if (r.defaultRevenueAccountId)   accounts.push(`R:${r.defaultRevenueAccountId}`);
        if (r.defaultExpenseAccountId)   accounts.push(`E:${r.defaultExpenseAccountId}`);
        if (r.defaultInventoryAccountId) accounts.push(`I:${r.defaultInventoryAccountId}`);
        if (r.defaultAssetAccountId)     accounts.push(`A:${r.defaultAssetAccountId}`);
        return accounts.length
          ? <span className="font-mono text-[10px]">{accounts.join(" / ")}</span>
          : <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">غير موجَّه</Badge>;
      },
    },
    { key: "defaultTaxCode", header: "رمز الضريبة الافتراضي",
      render: (r) => r.defaultTaxCode
        ? <Badge variant="outline" className="text-xs font-mono">{r.defaultTaxCode}</Badge>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "defaultActivityType", header: "النشاط",
      render: (r) => r.defaultActivityType
        ? <Badge variant="outline" className="text-[10px]">{r.defaultActivityType}</Badge>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "requires", header: "ربط إلزامي",
      render: (r) => {
        const reqs: string[] = [];
        if (r.requiresVehicle)     reqs.push("مركبة");
        if (r.requiresProperty)    reqs.push("عقار");
        if (r.requiresProject)     reqs.push("مشروع");
        if (r.requiresContract)    reqs.push("عقد");
        if (r.requiresUmrahAgent)  reqs.push("مرشد عمرة");
        if (r.requiresUmrahSeason) reqs.push("موسم عمرة");
        return reqs.length
          ? <Badge className="bg-amber-100 text-amber-800 text-[10px]">{reqs.join(" + ")}</Badge>
          : <span className="text-muted-foreground italic text-xs">—</span>;
      },
    },
    { key: "defaultCostCenterStrategy", header: "مركز التكلفة",
      render: (r) => r.defaultCostCenterStrategy
        ? <Badge variant="outline" className="text-[10px]">{STRATEGY_LABEL[r.defaultCostCenterStrategy] ?? r.defaultCostCenterStrategy}</Badge>
        : <span className="text-muted-foreground italic text-xs">—</span> },
  ];

  return (
    <PageShell
      title="كتالوج المنتجات والخدمات المحاسبي"
      subtitle="Product Accounting Catalog — كل منتج/خدمة له توجيه افتراضي للحساب ومركز التكلفة والكيان المرتبط، ينطبق تلقائياً عند اختياره في بنود الفاتورة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/accounts", label: "الحسابات" },
        { label: "كتالوج المنتجات" },
      ]}
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Package className="h-4 w-4" /> ما الفائدة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            بدل ما المحاسب يختار الحساب يدوياً لكل بند فاتورة، يضبط هنا مرة واحدة:
            "نقل رمل → حساب 4100 + يتطلب مركبة + مركز التكلفة من المركبة".
            النتيجة: كل بند فاتورة يختار "نقل رمل" يتعبأ التوجيه المحاسبي تلقائياً.
            الـ LineAllocationPanel يكشف التفاصيل المتعبأة ويسمح بالتعديل اليدوي.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المنتجات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(stats.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">موجَّهة محاسبياً</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatNumber(stats.routed)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stats.total > 0 ? Math.round((stats.routed / stats.total) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card className="border-amber-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">تتطلب ربطاً تشغيلياً</p>
            <p className="text-lg font-bold font-mono text-amber-700">{formatNumber(stats.withRequirement)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">خدمات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(stats.services)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-end gap-2 mb-4 flex-wrap">
        <div className="flex-1 max-w-md">
          <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
          <Input
            placeholder="بحث بالاسم أو SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mb-1">النوع:</span>
          <Badge variant={typeFilter === "" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setTypeFilter("")}>الكل</Badge>
          {Object.entries(ITEM_TYPE_LABEL).map(([k, v]) => (
            <Badge
              key={k}
              variant={typeFilter === k ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setTypeFilter(k)}
            >{v.label}</Badge>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mb-1">التوجيه:</span>
          <Badge variant={routedFilter === "" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setRoutedFilter("")}>الكل</Badge>
          <Badge variant={routedFilter === "routed" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setRoutedFilter("routed")}>موجَّه</Badge>
          <Badge variant={routedFilter === "unrouted" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setRoutedFilter("unrouted")}>غير موجَّه</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            pageSize={50}
            emptyMessage={
              search || typeFilter || routedFilter
                ? "لا توجد منتجات بهذي الفلاتر"
                : "لا توجد منتجات نشطة"
            }
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        💡 تحرير الـ catalog لكل منتج يتم عبر صفحة تفاصيل المنتج
        (<Link href="/warehouse" className="text-status-info-foreground hover:underline">/warehouse</Link>)
        أو عبر <code className="bg-muted px-1 rounded">PATCH /warehouse/products/:id</code> مع
        الحقول المحاسبية الجديدة.
      </p>
    </PageShell>
  );
}
