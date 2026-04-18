import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Building2, Home, Plus, ArrowRight, TrendingUp, BookOpen } from "lucide-react";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/contexts/app-context";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function BuildingDetail() {
  const [, params] = useRoute("/properties/buildings/:id");
  const id = params?.id;
  const { permissions, roleLevel } = useAppContext();
  const canManage = permissions.canManageProperty || roleLevel >= 50;

  const { data: building, isLoading, isError } = useApiQuery<any>(
    ["building-detail", id || ""],
    `/properties/buildings/${id}`,
    !!id
  );
  const { data: unitsResp } = useApiQuery<any>(
    ["building-units", id || ""],
    `/properties/units?buildingId=${id}`,
    !!id
  );
  const units = asList(unitsResp);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  if (!building) return (
    <div className="text-center py-12">
      <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">المبنى غير موجود</p>
      <Link href="/properties/buildings"><Button variant="outline" className="mt-4">العودة للمباني</Button></Link>
    </div>
  );

  const totalUnits = units.length;
  const rentedUnits = units.filter((u: any) => u.status === "rented").length;
  const availableUnits = units.filter((u: any) => u.status === "available").length;
  const occupancy = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;

  const subtitleParts = [building.city, building.address, building.floors && `${building.floors} طوابق`].filter(Boolean).join(" — ");

  return (
    <PageShell
      title={building.name}
      subtitle={subtitleParts || undefined}
      loading={isLoading}
      breadcrumbs={[{ href: "/properties", label: "العقارات" }, { href: "/properties/buildings", label: "المباني" }]}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {building.type === "residential" ? "سكني" : building.type === "commercial" ? "تجاري" : building.type === "mixed" ? "مختلط" : building.type}
          </Badge>
          <Link href="/properties/buildings">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-blue-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-blue-600 mb-1">إجمالي الوحدات</p>
            <p className="text-2xl font-bold text-blue-700">{totalUnits}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-emerald-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-emerald-600 mb-1">مؤجرة</p>
            <p className="text-2xl font-bold text-emerald-700">{rentedUnits}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-amber-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-amber-600 mb-1">شاغرة</p>
            <p className="text-2xl font-bold text-amber-700">{availableUnits}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">الإشغال</p>
            <p className={cn("text-2xl font-bold", occupancy >= 80 ? "text-emerald-600" : occupancy >= 50 ? "text-amber-600" : "text-red-600")}>{occupancy}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Home className="h-5 w-5 text-blue-500" /> وحدات المبنى
        </h2>
        {canManage && (
          <Link href={`/properties/create?buildingId=${id}&buildingName=${encodeURIComponent(building.name)}`}>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> إضافة وحدة
            </Button>
          </Link>
        )}
      </div>

      {units.length === 0 ? (
        <div className="text-center py-12">
          <Home className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">لا توجد وحدات في هذا المبنى</p>
          {canManage && (
            <Link href={`/properties/create?buildingId=${id}&buildingName=${encodeURIComponent(building.name)}`}>
              <Button className="mt-4 gap-2" size="sm"><Plus className="h-4 w-4" /> إضافة وحدة</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {units.map((u: any) => (
            <Link key={u.id} href={`/properties/${u.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm">{u.unitNumber}</p>
                      <p className="text-xs text-gray-400">{u.type === "apartment" ? "شقة" : u.type === "villa" ? "فيلا" : u.type === "office" ? "مكتب" : u.type === "shop" ? "محل" : u.type}</p>
                    </div>
                    <PageStatusBadge status={u.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center mt-3">
                    <div>
                      <p className="text-xs font-bold">{u.area ? `${u.area}م²` : "—"}</p>
                      <p className="text-[10px] text-gray-400">المساحة</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold">{u.bedrooms || "—"}</p>
                      <p className="text-[10px] text-gray-400">غرف</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-600">{formatCurrency(u.monthlyRent || 0)}</p>
                      <p className="text-[10px] text-gray-400">إيجار</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" />
            الملف المالي الشامل للمبنى
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntityFinancialProfile entityType="property" entityId={id!} />
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">دفتر الأستاذ المساعد</CardTitle>
        </CardHeader>
        <CardContent>
          <FinancialTab entityType="property" entityId={id!} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
