import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Building2, Home, Plus, Eye, Pencil, Search } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";

export default function PropertiesBuildings() {
  const { scopeQueryString, permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;
  const { data: buildingsResp, isLoading, isError } = useApiQuery<any>(
    ["property-buildings", scopeQueryString],
    `/properties/buildings?${scopeQueryString || ""}`
  );
  const buildings = asList(buildingsResp);
  const [search, setSearch] = useState("");

  const filtered = buildings.filter((b: any) =>
    !search || b.name?.includes(search) || b.address?.includes(search) || b.city?.includes(search)
  );

  if (isLoading) return <PageShell title="المباني والمجمعات" breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "المباني والمجمعات" }]}><LoadingSpinner /></PageShell>;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="المباني والمجمعات"
      subtitle={`${buildings.length} مبنى مسجل`}
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "المباني والمجمعات" }]}
      actions={canManage && (
        <Link href="/properties/buildings/create">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> إضافة مبنى
          </Button>
        </Link>
      )}
    >
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input className="ps-9" placeholder="بحث بالاسم أو العنوان..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">لا توجد مباني مسجلة</p>
          {canManage && (
            <Link href="/properties/buildings/create">
              <Button className="mt-4 gap-2"><Plus className="h-4 w-4" /> إضافة أول مبنى</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b: any) => {
            const occupancy = b.totalUnits > 0 ? Math.round((b.rentedUnits / b.totalUnits) * 100) : 0;
            return (
              <Card key={b.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{b.name}</CardTitle>
                      {b.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{b.address}{b.city ? ` — ${b.city}` : ""}</p>}
                      {b.deedNumber && <p className="text-[10px] text-gray-400 mt-0.5">صك: {b.deedNumber}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {b.type === "residential" ? "سكني" : b.type === "commercial" ? "تجاري" : b.type === "mixed" ? "مختلط" : b.type}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-bold">{b.totalUnits || 0}</p>
                      <p className="text-[10px] text-gray-500">إجمالي</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-blue-600">{b.rentedUnits || 0}</p>
                      <p className="text-[10px] text-gray-500">مؤجرة</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-emerald-600">{b.availableUnits || 0}</p>
                      <p className="text-[10px] text-gray-500">شاغرة</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>نسبة الإشغال</span>
                      <span className="font-bold">{occupancy}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", occupancy >= 80 ? "bg-emerald-500" : occupancy >= 50 ? "bg-amber-500" : "bg-red-400")} style={{ width: `${occupancy}%` }} />
                    </div>
                  </div>
                  {b.totalRevenue > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">الإيرادات</span>
                      <span className="font-bold text-emerald-600">{formatCurrency(b.totalRevenue)}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/properties/buildings/${b.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1 text-xs"><Eye className="h-3 w-3" /> عرض الوحدات</Button>
                    </Link>
                    {canManage && (
                      <Link href={`/properties/buildings/${b.id}/edit`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs"><Pencil className="h-3 w-3" /></Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
