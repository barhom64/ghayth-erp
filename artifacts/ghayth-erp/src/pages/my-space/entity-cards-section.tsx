import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Building, Car, Scale } from "lucide-react";

interface EntityCardsSectionProps {
  roleEntities: any;
  role: string | undefined;
}

export function EntityCardsSection({ roleEntities, role }: EntityCardsSectionProps) {
  if (role === "employee") return null;
  if (!roleEntities) return null;
  if (
    !(Number(roleEntities.units?.total) > 0 ||
      Number(roleEntities.vehicles?.total) > 0 ||
      Number(roleEntities.cases?.total) > 0)
  ) {
    return null;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Number(roleEntities.units?.total) > 0 && (
        <Link href="/properties">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50">
                  <Building className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">الوحدات العقارية</p>
                  <p className="text-xs text-gray-500">{roleEntities.units.total} وحدة</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">{roleEntities.units.available || 0} متاحة</span>
                <span className="text-blue-600">{roleEntities.units.rented || 0} مؤجرة</span>
                <span className="text-amber-600">{roleEntities.units.inMaintenance || 0} صيانة</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {Number(roleEntities.vehicles?.total) > 0 && (
        <Link href="/fleet">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50">
                  <Car className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">الأسطول</p>
                  <p className="text-xs text-gray-500">{roleEntities.vehicles.total} مركبة</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">{roleEntities.vehicles.available || 0} متاحة</span>
                <span className="text-blue-600">{roleEntities.vehicles.inUse || 0} قيد الاستخدام</span>
                <span className="text-amber-600">{roleEntities.vehicles.inMaintenance || 0} صيانة</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {Number(roleEntities.cases?.total) > 0 && (
        <Link href="/legal/cases">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50">
                  <Scale className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">القضايا القانونية</p>
                  <p className="text-xs text-gray-500">{roleEntities.cases.total} قضية</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-blue-600">{roleEntities.cases.active || 0} نشطة</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
