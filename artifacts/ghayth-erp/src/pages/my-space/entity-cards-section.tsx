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
                  <p className="text-sm font-semibold text-status-neutral-foreground">الوحدات العقارية</p>
                  <p className="text-xs text-muted-foreground">{roleEntities.units.total} وحدة</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-status-success-foreground">{roleEntities.units.available || 0} متاحة</span>
                <span className="text-status-info-foreground">{roleEntities.units.rented || 0} مؤجرة</span>
                <span className="text-status-warning-foreground">{roleEntities.units.inMaintenance || 0} صيانة</span>
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
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-status-info-surface">
                  <Car className="w-5 h-5 text-status-info-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-status-neutral-foreground">الأسطول</p>
                  <p className="text-xs text-muted-foreground">{roleEntities.vehicles.total} مركبة</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-status-success-foreground">{roleEntities.vehicles.available || 0} متاحة</span>
                <span className="text-status-info-foreground">{roleEntities.vehicles.inUse || 0} قيد الاستخدام</span>
                <span className="text-status-warning-foreground">{roleEntities.vehicles.inMaintenance || 0} صيانة</span>
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
                  <p className="text-sm font-semibold text-status-neutral-foreground">القضايا القانونية</p>
                  <p className="text-xs text-muted-foreground">{roleEntities.cases.total} قضية</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-status-info-foreground">{roleEntities.cases.active || 0} نشطة</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
