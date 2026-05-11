import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, FileSignature, Calendar, Target } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * CommitmentDetail — unified detail page for a single financial commitment.
 * Commitments reserve funds against a cost center / project ahead of the
 * actual expense being booked, so the headline fields are the committed
 * amount and the fulfillment progress against it.
 */

const STATUS_LABELS: Record<string, string> = {
  active: "ساري",
  released: "محرر",
  fulfilled: "منفذ",
  cancelled: "ملغى",
  expired: "منتهي",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "fulfilled") return "success" as const;
  if (status === "active") return "info" as const;
  if (status === "released") return "warning" as const;
  if (["cancelled", "expired"].includes(status)) return "destructive" as const;
  return "default" as const;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export default function CommitmentDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/commitments/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("commitment", id ?? 0);
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["commitment", String(id)],
    id ? `/finance/commitments/${id}` : null,
    !!id
  );

  const commitment = data;

  const amount = Number(commitment?.amount ?? 0);
  const fulfilled = Number(commitment?.fulfilledAmount ?? 0);

  // Fulfillment percentage can come from the server as a stored value
  // (preferred: accounts for partial releases that don't map 1:1 to
  // fulfilledAmount) or be derived from amount/fulfilledAmount.
  const fulfillmentPct = useMemo(() => {
    if (typeof commitment?.fulfillmentPercentage === "number") {
      return clampPct(commitment.fulfillmentPercentage);
    }
    if (amount > 0) return clampPct((fulfilled / amount) * 100);
    return 0;
  }, [commitment?.fulfillmentPercentage, amount, fulfilled]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!commitment) return out;
    if (commitment.projectId) {
      out.push({
        type: "project",
        id: commitment.projectId,
        label: commitment.projectName || `مشروع #${commitment.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${commitment.projectId}`,
      });
    }
    if (commitment.vendorId) {
      out.push({
        type: "vendor",
        id: commitment.vendorId,
        label: commitment.vendorName || `مورد #${commitment.vendorId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${commitment.vendorId}`,
      });
    }
    if (commitment.purchaseOrderId) {
      out.push({
        type: "purchase_order",
        id: commitment.purchaseOrderId,
        label: commitment.purchaseOrderRef || `أمر شراء #${commitment.purchaseOrderId}`,
        sublabel: "أمر الشراء",
        href: `/finance/purchase-orders/${commitment.purchaseOrderId}`,
      });
    }
    return out;
  }, [commitment]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!commitment) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: commitment.ref || `COM-${id}` },
          ...(commitment.title
            ? [{ label: "العنوان", value: commitment.title }]
            : []),
          { label: "المبلغ", value: formatCurrency(amount) },
          { label: "نسبة التنفيذ", value: `${fulfillmentPct.toFixed(1)}%` },
          ...(commitment.beneficiary
            ? [{ label: "المستفيد", value: commitment.beneficiary }]
            : commitment.vendorName
            ? [{ label: "المستفيد", value: commitment.vendorName }]
            : []),
          ...(commitment.costCenter
            ? [{ label: "مركز التكلفة", value: commitment.costCenter }]
            : []),
          ...(commitment.projectName
            ? [{ label: "المشروع", value: commitment.projectName }]
            : []),
          ...(commitment.purpose
            ? [{ label: "الغرض", value: commitment.purpose }]
            : []),
          ...(commitment.commitmentDate
            ? [{ label: "تاريخ الالتزام", value: formatDateAr(commitment.commitmentDate) }]
            : []),
          ...(commitment.releaseDate
            ? [{ label: "تاريخ التحرير", value: formatDateAr(commitment.releaseDate) }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[commitment.status] || commitment.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(commitment.createdAt) },
        ],
      },
    ];
    if (commitment.description) {
      sections.push({ kind: "text", title: "وصف الالتزام", body: commitment.description });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مُنشئ الالتزام", name: commitment.createdByName || "" },
        { label: "المعتمد", name: commitment.approvedByName || "" },
      ],
    });
    return sections;
  }, [commitment, amount, fulfillmentPct, id]);

  const handleEdit = () => {
    setLocation(`/finance/commitments/${id}/edit`);
  };

  const beneficiaryDisplay =
    commitment?.beneficiary || commitment?.vendorName || null;

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info — hero amount + commitment metadata */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-gray-500" />
            بيانات الالتزام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-gray-500">ر.س</span>
            {commitment?.title && (
              <span className="text-sm text-gray-600 ms-3 truncate">
                {commitment.title}
              </span>
            )}
          </div>

          {/* Fulfillment progress — the second headline metric */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Target className="h-3 w-3" /> نسبة التنفيذ
              </p>
              <span className="text-xs font-semibold text-gray-700">
                {fulfillmentPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${fulfillmentPct}%` }}
              />
            </div>
            {fulfilled > 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                منفذ: {formatCurrency(fulfilled)} من {formatCurrency(amount)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {beneficiaryDisplay && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">المستفيد</p>
                <span className="text-gray-800">{beneficiaryDisplay}</span>
              </div>
            )}
            {commitment?.costCenter && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">مركز التكلفة</p>
                <Badge variant="outline">{commitment.costCenter}</Badge>
              </div>
            )}
            {commitment?.projectName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المشروع</p>
                <span className="text-gray-800">{commitment.projectName}</span>
              </div>
            )}
            {commitment?.purpose && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الغرض</p>
                <span className="text-gray-800">{commitment.purpose}</span>
              </div>
            )}
            {commitment?.commitmentDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ الالتزام
                </p>
                <span className="text-gray-800">{formatDateAr(commitment.commitmentDate)}</span>
              </div>
            )}
            {commitment?.releaseDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> تاريخ التحرير
                </p>
                <span className="text-gray-800">{formatDateAr(commitment.releaseDate)}</span>
              </div>
            )}
          </div>

          {commitment?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{commitment.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — visible while the commitment is still open */}
        {id && commitment && ["pending", "pending_approval", "draft", "returned"].includes(commitment.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="commitment"
                entityId={id}
                currentStatus={commitment.status}
                approveEndpoint={`/finance/commitments/${id}/approve`}
                rejectEndpoint={`/finance/commitments/${id}/approve`}
                returnEndpoint={`/finance/commitments/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "pending_approval", "draft", "returned"]}
                invalidateKeys={[["commitments"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الالتزام" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الإجراءات</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="commitment" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="commitment" entityId={id} />}

      {id && <EntityComments entityType="commitment" entityId={id} />}
      {id && <EntityTags entityType="commitment" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={commitment?.title || (commitment?.ref ? `التزام ${commitment.ref}` : "تفاصيل الالتزام")}
        subtitle={beneficiaryDisplay || undefined}
        backPath="/finance/commitments"
        refNumber={commitment?.ref || (id ? `COM-${id}` : undefined)}
        status={
          commitment
            ? { label: STATUS_LABELS[commitment.status] || commitment.status || "-", tone: statusTone(commitment.status) }
            : undefined
        }
        typeLabel={commitment?.costCenter || undefined}
        createdAt={commitment?.createdAt}
        updatedAt={commitment?.updatedAt}
        createdByName={commitment?.createdByName}
        assignedToName={commitment?.approvedByName}
        relatedEntities={relatedEntities}
        entityType="commitment"
        entityId={id ?? 0}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        actions={
          <>
            {commitment && (
              <EntityPrintButton
                branchId={commitment.branchId}
                title={commitment.title || (commitment.ref ? `التزام ${commitment.ref}` : "التزام مالي")}
                ref={commitment.ref || `COM-${id}`}
                date={formatDateAr(commitment.createdAt)}
                sections={printSections}
              />
            )}
            <GuardedButton
              perm="finance:update"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={
                !commitment || ["fulfilled", "cancelled", "expired"].includes(commitment.status)
              }
            >
              <Edit className="h-4 w-4 ms-1" />
              تعديل
            </GuardedButton>
          </>
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
