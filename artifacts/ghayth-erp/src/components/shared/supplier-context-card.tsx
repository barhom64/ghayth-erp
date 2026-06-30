import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import {
  Building2, Phone, Mail, FileText, ShoppingCart, AlertTriangle, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextCardSkeleton, ContextStat, ContextWarning } from "./context-card-kit";

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

  if (isLoading) return <ContextCardSkeleton className={className} />;

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
          <ContextStat
            icon={Phone}
            label="جهة الاتصال"
            value={<span className="block truncate">{supplier.contactPerson || "—"}</span>}
          />
          <ContextStat
            icon={ShoppingCart}
            label="طلبات نشطة"
            tone={activeOrders > 0 ? "text-status-info-foreground" : undefined}
            value={activeOrders}
          />
          <ContextStat
            icon={FileText}
            label="إجمالي المشتريات"
            value={totalPurchases > 0 ? formatCurrency(totalPurchases) : "—"}
          />
          <ContextStat
            icon={Calendar}
            label="آخر طلب"
            value={supplier.lastOrderAt ? new Date(supplier.lastOrderAt).toLocaleDateString("ar-SA") : "—"}
          />
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
          <ContextWarning icon={AlertTriangle}>
            المورد غير نشط — لا يمكن إنشاء طلبات شراء جديدة
          </ContextWarning>
        )}
      </CardContent>
    </Card>
  );
}
