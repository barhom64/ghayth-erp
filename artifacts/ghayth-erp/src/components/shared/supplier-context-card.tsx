import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import {
  Building2, Phone, Mail, FileText, ShoppingCart, AlertTriangle, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SupplierContextCardProps {
  supplierId: string | number | null | undefined;
  className?: string;
}

interface SupplierDetail {
  id: number;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  paymentTerms?: number;
  rating?: number | string;
  status?: string;
  totalPurchases?: number | string;
  activeOrders?: number | string;
  lastOrderAt?: string;
}

export function SupplierContextCard({
  supplierId,
  className,
}: SupplierContextCardProps) {
  const hasId = supplierId !== null && supplierId !== undefined && String(supplierId).trim() !== "";

  const { data: supplier, isLoading } = useApiQuery<SupplierDetail>(
    ["supplier-context", String(supplierId ?? "")],
    hasId ? `/finance/vendors/${supplierId}` : null,
    { enabled: hasId },
  );

  if (!hasId) return null;

  if (isLoading) {
    return (
      <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!supplier) return null;

  const inactive = supplier.status && supplier.status !== "active";
  const totalPurchases = Number(supplier.totalPurchases || 0);
  const activeOrders = Number(supplier.activeOrders || 0);

  return (
    <Card className={cn("border-teal-200 bg-teal-50/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-teal-100">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-600" />
            <span className="font-semibold text-sm">{supplier.name}</span>
            {supplier.taxNumber && (
              <Badge variant="outline" className="text-xs font-mono">
                {supplier.taxNumber}
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              supplier.status === "active" ? "bg-status-success-surface text-status-success-foreground border-status-success-surface" :
              "bg-surface-subtle text-gray-700 border-border"
            )}
          >
            {supplier.status === "active" ? "نشط" : supplier.status || "—"}
          </Badge>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <span>جهة الاتصال</span>
            </p>
            <p className="text-sm font-semibold text-gray-800 truncate">
              {supplier.contactPerson || "—"}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <ShoppingCart className="h-3 w-3" />
              <span>طلبات نشطة</span>
            </p>
            <p className={cn(
              "text-sm font-semibold",
              activeOrders > 0 ? "text-status-info-foreground" : "text-gray-800"
            )}>
              {activeOrders}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span>إجمالي المشتريات</span>
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {totalPurchases > 0 ? formatCurrency(totalPurchases) : "—"}
            </p>
          </div>
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>آخر طلب</span>
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {supplier.lastOrderAt
                ? new Date(supplier.lastOrderAt).toLocaleDateString("ar-SA")
                : "—"}
            </p>
          </div>
        </div>

        {/* Contact row */}
        {(supplier.phone || supplier.email) && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {supplier.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span dir="ltr">{supplier.phone}</span>
              </span>
            )}
            {supplier.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span dir="ltr">{supplier.email}</span>
              </span>
            )}
            {supplier.paymentTerms && (
              <span>شروط الدفع: {supplier.paymentTerms} يوم</span>
            )}
          </div>
        )}

        {/* Warnings */}
        {inactive && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>المورد غير نشط — لا يمكن إنشاء طلبات شراء جديدة</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
