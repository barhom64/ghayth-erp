import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, Car, Scale, Users, Receipt, ChevronLeft } from "lucide-react";

interface RoleEntitiesGridProps {
  roleEntities: any;
  role: string | undefined;
}

export function RoleEntitiesGrid({ roleEntities, role }: RoleEntitiesGridProps) {
  if (!roleEntities || role === "employee") return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {roleEntities.units && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-500" />
              وحداتي العقارية
            </CardTitle>
            <Link href="/properties">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-emerald-50">
                <p className="text-lg font-bold text-emerald-700">{roleEntities.units.rented || 0}</p>
                <p className="text-[10px] text-emerald-600">مؤجرة</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <p className="text-lg font-bold text-blue-700">{roleEntities.units.available || 0}</p>
                <p className="text-[10px] text-blue-600">متاحة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roleEntities.vehicles && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Car className="w-4 h-4 text-blue-500" />
              أسطولي
            </CardTitle>
            <Link href="/fleet">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-green-50">
                <p className="text-lg font-bold text-green-700">{roleEntities.vehicles.available || 0}</p>
                <p className="text-[10px] text-green-600">متاحة</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-50">
                <p className="text-lg font-bold text-orange-700">{roleEntities.vehicles.maintenance || 0}</p>
                <p className="text-[10px] text-orange-600">صيانة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {roleEntities.cases && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-500" />
              القضايا
            </CardTitle>
            <Link href="/legal/cases">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-red-50">
                <p className="text-lg font-bold text-red-700">{roleEntities.cases.open || 0}</p>
                <p className="text-[10px] text-red-600">مفتوحة</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <p className="text-lg font-bold text-green-700">{roleEntities.cases.closed || 0}</p>
                <p className="text-[10px] text-green-600">مغلقة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {roleEntities.hr && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-500" />
              الموظفون
            </CardTitle>
            <Link href="/employees">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 rounded-lg bg-teal-50">
                <p className="text-lg font-bold text-teal-700">{roleEntities.hr.active || 0}</p>
                <p className="text-[10px] text-teal-600">نشط</p>
              </div>
              <div className="p-2 rounded-lg bg-gray-50">
                <p className="text-lg font-bold text-gray-700">{roleEntities.hr.inactive || 0}</p>
                <p className="text-[10px] text-gray-600">غير نشط</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {roleEntities.finance && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-500" />
              الفواتير
            </CardTitle>
            <Link href="/finance/invoices">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">عرض <ChevronLeft className="w-3 h-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-green-50">
                <p className="text-lg font-bold text-green-700">{roleEntities.finance.paid || 0}</p>
                <p className="text-[10px] text-green-600">مدفوعة</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-50">
                <p className="text-lg font-bold text-yellow-700">{roleEntities.finance.pending || 0}</p>
                <p className="text-[10px] text-yellow-600">معلقة</p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <p className="text-lg font-bold text-red-700">{roleEntities.finance.overdue || 0}</p>
                <p className="text-[10px] text-red-600">متأخرة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
