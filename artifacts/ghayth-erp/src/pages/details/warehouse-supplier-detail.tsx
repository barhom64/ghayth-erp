import { useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, EntityComments } from "@workspace/entity-kit";
import { FormGrid, FormTextField, FormTextareaField, FormNumberField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Truck, Star, Phone, Mail, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import {
  useDetailEditDelete,
  DetailActionButtons,
} from "@/components/shared/detail-edit-delete-actions";

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

const supplierEditSchema = z.object({
  name: z.string().min(1, "اسم المورد مطلوب"),
  contactPerson: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  address: z.string().optional().default(""),
  taxNumber: z.string().optional().default(""),
  paymentTerms: z.coerce.number().optional().default(0),
});
type SupplierEditForm = z.infer<typeof supplierEditSchema>;

export default function WarehouseSupplierDetail() {
  const [, params] = useRoute("/warehouse/suppliers/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);
  const { extraTabs, hideTabs } = useRegistryTabs("warehouse-supplier", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["warehouse-supplier", String(id)],
    id ? `/warehouse/suppliers/${id}` : null,
    !!id
  );

  const supplier = data;

  const editDelete = useDetailEditDelete({
    entityLabel: "المورد",
    patchPath: `/warehouse/suppliers/${id}`,
    deletePath: `/warehouse/suppliers/${id}`,
    listPath: "/warehouse/suppliers",
    initialValues: supplier,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "contactPerson", label: "جهة الاتصال" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "address", label: "العنوان" },
      { key: "rating", label: "التقييم", type: "number" },
    ],
    invalidateKeys: [["warehouse-supplier", String(id)], ["warehouse-suppliers"]],
    onSaved: () => refetch(),
  });

  const productsCount = Number(supplier?.productsCount ?? 0);
  const totalPurchased = Number(supplier?.totalPurchased ?? 0);
  const rating = Number(supplier?.rating ?? 0);


  const ratingStars = (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-4 w-4 ${s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-300"}`}
        />
      ))}
      {rating > 0 && <span className="ms-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>}
    </div>
  );

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            بيانات المورد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-2xl font-bold text-gray-900">{supplier?.name || "-"}</span>
            {supplier?.contactPerson && (
              <span className="text-xs text-muted-foreground">— {supplier.contactPerson}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {supplier?.phone && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> الهاتف
                </p>
                <span className="text-status-neutral-foreground font-mono" dir="ltr">
                  {supplier.phone}
                </span>
              </div>
            )}
            {supplier?.email && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> البريد
                </p>
                <span className="text-status-neutral-foreground" dir="ltr">
                  {supplier.email}
                </span>
              </div>
            )}
            {supplier?.taxNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الرقم الضريبي</p>
                <span className="text-status-neutral-foreground font-mono">{supplier.taxNumber}</span>
              </div>
            )}
            {supplier?.paymentTerms && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">شروط الدفع</p>
                <Badge variant="outline">{supplier.paymentTerms}</Badge>
              </div>
            )}
            {supplier?.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> العنوان
                </p>
                <span className="text-status-neutral-foreground">{supplier.address}</span>
              </div>
            )}
            {rating > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">التقييم</p>
                {ratingStars}
              </div>
            )}
          </div>

          {supplier?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{supplier.notes}</p>
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
              <span className="text-xs text-muted-foreground">عدد الأصناف الموردة</span>
              <span className="font-semibold">{productsCount}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">إجمالي المشتريات</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalPurchased)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="warehouse-supplier" entityId={id} />}
      {id && <EntityTags entityType="warehouse-supplier" entityId={id} />}
    </div>
  );

  return (
    <>
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
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {supplier && (
            <PrintButton
              entityType="vendor"
              entityId={id ?? 0}
             />
          )}
          <GuardedButton perm="warehouse:update" variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={!supplier}>
            <Edit className="h-4 w-4 ms-1" /> تعديل
          </GuardedButton>
          <DetailActionButtons hook={editDelete} editPerm="warehouse:update" deletePerm="warehouse:delete" />
        </>
      }
    />
    {supplier && id && (
      <EntityEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل المورد"
        schema={supplierEditSchema}
        defaultValues={{
          name: supplier.name ?? "",
          contactPerson: supplier.contactPerson ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          address: supplier.address ?? "",
          taxNumber: supplier.taxNumber ?? "",
          paymentTerms: Number(supplier.paymentTerms ?? 0),
        }}
        endpoint={`/warehouse/suppliers/${id}`}
        invalidateKeys={[["warehouse-supplier", String(id)], ["warehouse-suppliers"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم المورد" required className="md:col-span-2" />
          <FormTextField name="contactPerson" label="جهة الاتصال" />
          <FormTextField name="phone" label="الهاتف" />
          <FormTextField name="email" label="البريد الإلكتروني" />
          <FormTextField name="taxNumber" label="الرقم الضريبي" />
          <FormNumberField name="paymentTerms" label="مدة السداد (يوم)" />
          <FormTextareaField name="address" label="العنوان" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
