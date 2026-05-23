import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, User, Phone, Mail, MapPin, Building2, Banknote, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";

/**
 * OwnerDetail — unified detail page for a single property owner.
 *
 * Reads the row from `/properties/owners/:id`. The backend returns the
 * owner record plus (optionally) aggregate fields like totalProperties
 * and totalRentalIncome. Buildings owned are summarised from either the
 * count on the owner row or a linked buildings list.
 */

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "inactive") return "destructive" as const;
  return "default" as const;
}

export default function OwnerDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/properties/owners/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("owner", id ?? 0);
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["property-owner", String(id)],
    id ? `/properties/owners/${id}` : null,
    !!id
  );

  const owner = data;

  // The buildings owned can be supplied directly by the owner payload as
  // an array, or referenced via totalProperties. We keep both options
  // open so the page is resilient to backend shape variations.
  const buildings: any[] = useMemo(() => {
    return Array.isArray(owner?.buildings) ? owner.buildings : [];
  }, [owner?.buildings]);

  const totalProperties = useMemo(() => {
    if (typeof owner?.totalProperties === "number") return owner.totalProperties;
    if (typeof owner?.propertiesCount === "number") return owner.propertiesCount;
    return buildings.length;
  }, [owner, buildings]);

  const totalRentalIncome = useMemo(() => {
    return Number(owner?.totalRentalIncome ?? owner?.rentalIncome ?? 0);
  }, [owner]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!owner) return out;
    // Link each building the owner holds (up to a reasonable cap so the
    // related card stays scannable; the full list is in buildings tab
    // reachable via the listing page).
    for (const b of buildings.slice(0, 10)) {
      if (!b?.id) continue;
      out.push({
        type: "building",
        id: b.id,
        label: b.name || `مبنى #${b.id}`,
        sublabel: "مبنى مملوك",
        href: `/properties/buildings/${b.id}`,
      });
    }
    return out;
  }, [owner, buildings]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!owner) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: owner.ref || `OWN-${id}` },
          { label: "اسم المالك", value: owner.name || "-" },
          ...(owner.nationalId
            ? [{ label: "رقم الهوية", value: owner.nationalId }]
            : []),
          ...(owner.phone ? [{ label: "الهاتف", value: owner.phone }] : []),
          ...(owner.email ? [{ label: "البريد الإلكتروني", value: owner.email }] : []),
          ...(owner.address ? [{ label: "العنوان", value: owner.address }] : []),
          { label: "إجمالي العقارات المملوكة", value: String(totalProperties) },
          { label: "إجمالي دخل الإيجارات", value: formatCurrency(totalRentalIncome) },
          ...(owner.bankAccount
            ? [{ label: "الحساب البنكي للتحويلات", value: owner.bankAccount }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[owner.status] || owner.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(owner.createdAt) },
        ],
      },
    ];
    if (owner.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: owner.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المالك", name: owner.name || "" },
        { label: "المسؤول", name: owner.createdByName || "" },
      ],
    });
    return sections;
  }, [owner, id, totalProperties, totalRentalIncome]);

  const editDelete = useDetailEditDelete({
    entityLabel: "المالك",
    patchPath: `/properties/owners/${id}`,
    deletePath: `/properties/owners/${id}`,
    listPath: "/properties/owners",
    initialValues: owner,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "address", label: "العنوان" },
      { key: "nationalId", label: "رقم الهوية" },
      { key: "bankAccount", label: "الحساب البنكي" },
    ],
    invalidateKeys: [["owner", id || ""], ["owners"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      {/* Primary info — owner identity + key aggregates */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            بيانات المالك
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero: name + national id */}
          <div className="border-b pb-3">
            <p className="text-2xl font-bold text-gray-900">{owner?.name || "-"}</p>
            {owner?.nationalId && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                رقم الهوية: {owner.nationalId}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {owner?.phone && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> الهاتف
                </p>
                <span className="text-status-neutral-foreground" dir="ltr">{owner.phone}</span>
              </div>
            )}
            {owner?.email && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> البريد الإلكتروني
                </p>
                <span className="text-status-neutral-foreground">{owner.email}</span>
              </div>
            )}
            {owner?.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> العنوان
                </p>
                <span className="text-status-neutral-foreground">{owner.address}</span>
              </div>
            )}
            {owner?.bankAccount && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Banknote className="h-3 w-3" /> الحساب البنكي للتحويلات
                </p>
                <span className="text-status-neutral-foreground font-mono text-xs">{owner.bankAccount}</span>
              </div>
            )}
          </div>

          {owner?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" /> ملاحظات
              </p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{owner.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Portfolio aggregates */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              المحفظة العقارية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي العقارات المملوكة</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{totalProperties}</span>
                <span className="text-xs text-muted-foreground">مبنى</span>
              </div>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي دخل الإيجارات</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-emerald-600">
                  {formatCurrency(totalRentalIncome)}
                </span>
                <span className="text-xs text-muted-foreground">ر.س</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status quick card */}
        {owner?.status && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">الحالة</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge
                variant={
                  owner.status === "active"
                    ? "default"
                    : owner.status === "inactive"
                    ? "destructive"
                    : "secondary"
                }
              >
                {STATUS_LABELS[owner.status] || owner.status}
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="owner" entityId={id} />}
      {id && <EntityTags entityType="owner" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={owner?.name ? `المالك ${owner.name}` : "تفاصيل المالك"}
        subtitle={owner?.nationalId ? `هوية: ${owner.nationalId}` : undefined}
        backPath="/properties/owners"
        refNumber={owner?.ref || (id ? `OWN-${id}` : undefined)}
        status={
          owner
            ? { label: STATUS_LABELS[owner.status] || owner.status || "-", tone: statusTone(owner.status) }
            : undefined
        }
        createdAt={owner?.createdAt}
        updatedAt={owner?.updatedAt}
        createdByName={owner?.createdByName}
        relatedEntities={relatedEntities}
        entityType="owner"
        entityId={id ?? 0}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        actions={
          <DetailActionButtons
            hook={editDelete}
            editPerm="properties:update"
            deletePerm="properties:delete"
            extra={
              owner ? (
                <EntityPrintButton
                  branchId={owner.branchId}
                  title={owner.name ? `مالك: ${owner.name}` : "مالك"}
                  ref={owner.ref || `OWN-${id}`}
                  date={formatDateAr(owner.createdAt)}
                  sections={printSections}
                />
              ) : null
            }
          />
        }
      />
      <AttachmentPreview
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(o) => !o && setPreviewAttachment(null)}
      />
    </>
  );
}
