import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Truck, Star, Phone, Mail, MapPin } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * WarehouseSupplierDetail — detail page for a single warehouse supplier.
 * Fetches from `/warehouse/suppliers/:id` and shows contact, commercial
 * terms, rating, and a rolled-up view of supplied products + total spend.
 */

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  blocked: "محظور",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "inactive") return "muted" as const;
  if (status === "blocked") return "destructive" as const;
  return "default" as const;
}

export default function WarehouseSupplierDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/warehouse/suppliers/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["warehouse-supplier", String(id)],
    id ? `/warehouse/suppliers/${id}` : null,
    !!id
  );

  const supplier = data;

  const productsCount = Number(supplier?.productsCount ?? 0);
  const totalPurchased = Number(supplier?.totalPurchased ?? 0);
  const rating = Number(supplier?.rating ?? 0);

  const printSections: PrintSection[] = useMemo(() => {
    if (!supplier) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "اسم المورد", value: supplier.name || "-" },
          ...(supplier.contactPerson ? [{ label: "مسؤول التواصل", value: supplier.contactPerson }] : []),
          ...(supplier.phone ? [{ label: "الهاتف", value: supplier.phone }] : []),
          ...(supplier.email ? [{ label: "البريد الإلكتروني", value: supplier.email }] : []),
          ...(supplier.address ? [{ label: "العنوان", value: supplier.address }] : []),
          ...(supplier.taxNumber ? [{ label: "الرقم الضريبي", value: supplier.taxNumber }] : []),
          ...(supplier.paymentTerms ? [{ label: "شروط الدفع", value: supplier.paymentTerms }] : []),
          { label: "عدد الأصناف الموردة", value: String(productsCount) },
          { label: "إجمالي المشتريات", value: formatCurrency(totalPurchased) },
          ...(rating ? [{ label: "التقييم", value: `${rating} / 5` }] : []),
          { label: "الحالة", value: STATUS_LABELS[supplier.status] || supplier.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(supplier.createdAt) },
        ],
      },
    ];
    if (supplier.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: supplier.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المدير", name: "" },
        { label: "المسؤول المالي", name: "" },
      ],
    });
    return sections;
  }, [supplier, productsCount, totalPurchased, rating]);

  const handleEdit = () => {
    setLocation(`/warehouse/suppliers/${id}/edit`);
  };

  const ratingStars = (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-300"}`}
        />
      ))}
      {rating > 0 && <span className="ms-1 text-xs text-gray-500">{rating.toFixed(1)}</span>}
    </div>
  );

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4 text-gray-500" />
            بيانات المورد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-2xl font-bold text-gray-900">{supplier?.name || "-"}</span>
            {supplier?.contactPerson && (
              <span className="text-xs text-gray-500">— {supplier.contactPerson}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {supplier?.phone && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> الهاتف
                </p>
                <span className="text-gray-800 font-mono" dir="ltr">
                  {supplier.phone}
                </span>
              </div>
            )}
            {supplier?.email && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> البريد
                </p>
                <span className="text-gray-800" dir="ltr">
                  {supplier.email}
                </span>
              </div>
            )}
            {supplier?.taxNumber && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الرقم الضريبي</p>
                <span className="text-gray-800 font-mono">{supplier.taxNumber}</span>
              </div>
            )}
            {supplier?.paymentTerms && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">شروط الدفع</p>
                <Badge variant="outline">{supplier.paymentTerms}</Badge>
              </div>
            )}
            {supplier?.address && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> العنوان
                </p>
                <span className="text-gray-800">{supplier.address}</span>
              </div>
            )}
            {rating > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">التقييم</p>
                {ratingStars}
              </div>
            )}
          </div>

          {supplier?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{supplier.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص التعامل</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">عدد الأصناف الموردة</span>
              <span className="font-semibold">{productsCount}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-xs text-gray-500">إجمالي المشتريات</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalPurchased)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <DetailPageLayout
      title={supplier?.name ? supplier.name : "تفاصيل المورد"}
      subtitle={supplier?.contactPerson ? supplier.contactPerson : undefined}
      backPath="/warehouse/suppliers"
      refNumber={id ? `SUP-${id}` : undefined}
      status={
        supplier
          ? { label: STATUS_LABELS[supplier.status] || supplier.status || "-", tone: statusTone(supplier.status) }
          : undefined
      }
      createdAt={supplier?.createdAt}
      updatedAt={supplier?.updatedAt}
      createdByName={supplier?.createdByName}
      entityType="warehouse-supplier"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {supplier && (
            <EntityPrintButton
              branchId={supplier.branchId}
              title={supplier.name ? `مورد ${supplier.name}` : "مورد"}
              ref={`SUP-${id}`}
              date={formatDateAr(supplier.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton perm="warehouse:update" variant="outline" size="sm" onClick={handleEdit} disabled={!supplier}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
