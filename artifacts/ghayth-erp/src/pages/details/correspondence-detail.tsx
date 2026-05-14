/**
 * /correspondence/:id — صفحة تفاصيل المراسلة (بريد وارد/صادر)
 *
 * تعرض تفاصيل المراسلة ومحتواها وصاحبها والجهة المرتبطة،
 * مع إجراءات التعديل والطباعة والتذييل المسبق لمذكرة الرد.
 */
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Paperclip, Eye, Inbox, SendHorizonal, Mail } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sent: "مُرسلة",
  received: "مُستلمة",
  archived: "مؤرشفة",
};

const DIRECTION_LABELS: Record<string, string> = {
  incoming: "وارد",
  outgoing: "صادر",
};

const CHANNEL_LABELS: Record<string, string> = {
  internal: "داخلي",
  email: "بريد إلكتروني",
  courier: "مراسل",
  fax: "فاكس",
  hand_delivery: "استلام يدوي",
  post: "بريد",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  project: "مشروع",
  client: "عميل",
  vendor: "مورد",
  request: "طلب",
  contract: "عقد",
  invoice: "فاتورة",
  employee: "موظف",
};

const ENTITY_TYPE_PATHS: Record<string, string> = {
  project: "/projects",
  client: "/clients",
  vendor: "/vendors",
  request: "/requests",
  contract: "/contracts",
  invoice: "/finance/invoices",
  employee: "/hr/employees",
};

function statusTone(status: string) {
  if (status === "sent" || status === "received") return "success" as const;
  if (status === "archived") return "muted" as const;
  if (status === "draft") return "warning" as const;
  return "default" as const;
}

export default function CorrespondenceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/correspondence/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("correspondence", id ?? 0);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["correspondence-detail", String(id)],
    id ? `/correspondence/${id}` : null,
    !!id,
  );

  const item = data;

  const attachments: Array<{ name: string; url?: string; id?: number; mimeType?: string; size?: number }> = useMemo(() => {
    if (!item?.attachments) return [];
    try {
      const raw = typeof item.attachments === "string" ? JSON.parse(item.attachments) : item.attachments;
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, [item?.attachments]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.entityType && item.entityId) {
      const basePath = ENTITY_TYPE_PATHS[item.entityType];
      out.push({
        type: item.entityType,
        id: item.entityId,
        label: `${ENTITY_TYPE_LABELS[item.entityType] || item.entityType} #${item.entityId}`,
        sublabel: "جهة مرتبطة",
        href: basePath ? `${basePath}/${item.entityId}` : undefined,
      });
    }
    if (item.responseRef) {
      out.push({
        type: "correspondence",
        id: item.responseRef,
        label: `رد: ${item.responseRef}`,
        sublabel: "مراسلة مرتبطة",
      });
    }
    return out;
  }, [item]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!item) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "الرقم المرجعي", value: item.ref || "-" },
          { label: "الاتجاه", value: DIRECTION_LABELS[item.direction] || item.direction },
          { label: "الموضوع", value: item.subject || "-" },
          { label: "القناة", value: CHANNEL_LABELS[item.channel] || item.channel || "-" },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status },
          ...(item.direction === "outgoing"
            ? [
                { label: "المرسل", value: item.senderName || "-" },
                ...(item.senderOrg ? [{ label: "جهة المرسل", value: item.senderOrg }] : []),
                { label: "المستلم", value: item.recipientName || "-" },
                ...(item.recipientOrg ? [{ label: "جهة المستلم", value: item.recipientOrg }] : []),
              ]
            : [
                { label: "المرسل", value: item.senderName || "-" },
                ...(item.senderOrg ? [{ label: "جهة المرسل", value: item.senderOrg }] : []),
                { label: "المستلم", value: item.recipientName || "-" },
                ...(item.recipientOrg ? [{ label: "جهة المستلم", value: item.recipientOrg }] : []),
              ]),
          { label: "تاريخ الإنشاء", value: formatDateAr(item.createdAt) },
          ...(item.sentAt ? [{ label: "تاريخ الإرسال", value: formatDateAr(item.sentAt) }] : []),
          ...(item.receivedAt ? [{ label: "تاريخ الاستلام", value: formatDateAr(item.receivedAt) }] : []),
          ...(item.respondedAt ? [{ label: "تاريخ الرد", value: formatDateAr(item.respondedAt) }] : []),
        ],
      },
    ];
    if (item.content) {
      sections.push({ kind: "text", title: "المحتوى", body: item.content });
    }
    if (item.notes) {
      sections.push({ kind: "text", title: "ملاحظات داخلية", body: item.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: item.direction === "outgoing" ? "المرسل" : "المستلم", name: item.createdByName || "" },
        { label: "المعتمد", name: "" },
      ],
    });
    return sections;
  }, [item]);

  const handleEdit = () => {
    setLocation(`/correspondence/${id}/edit`);
  };

  const DirectionIcon = item?.direction === "outgoing" ? SendHorizonal : Inbox;
  const directionTone = item?.direction === "outgoing" ? "bg-status-info-surface text-status-info-foreground border-status-info-surface" : "bg-emerald-50 text-emerald-700 border-emerald-200";

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            تفاصيل المراسلة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Direction + subject banner */}
          <div className="flex items-start gap-3">
            <div className={`shrink-0 rounded-full p-2 border ${directionTone}`}>
              <DirectionIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-0.5">الموضوع</p>
              <h3 className="text-base font-semibold text-gray-900 break-words">
                {item?.subject || "-"}
              </h3>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="outline" className={directionTone}>
                  {DIRECTION_LABELS[item?.direction] || item?.direction}
                </Badge>
                {item?.channel && (
                  <Badge variant="outline">
                    {CHANNEL_LABELS[item.channel] || item.channel}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Sender/recipient grid */}
          <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">المرسل</p>
              <p className="font-medium text-gray-900">{item?.senderName || "-"}</p>
              {item?.senderOrg && <p className="text-xs text-muted-foreground">{item.senderOrg}</p>}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">المستلم</p>
              <p className="font-medium text-gray-900">{item?.recipientName || "-"}</p>
              {item?.recipientOrg && <p className="text-xs text-muted-foreground">{item.recipientOrg}</p>}
            </div>
          </div>

          {/* Body */}
          {item?.content && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">المحتوى</p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-status-neutral-foreground bg-surface-subtle rounded-md p-3 border">
                {item.content}
              </pre>
            </div>
          )}

          {/* Notes */}
          {item?.notes && (
            <div className="rounded-md bg-status-warning-surface border border-status-warning-surface p-3">
              <p className="text-xs text-status-warning-foreground font-medium mb-1">ملاحظات داخلية</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}

          {/* Response reference */}
          {item?.responseRef && (
            <div className="rounded-md bg-status-info-surface border border-status-info-surface p-3 text-sm text-blue-900">
              تم الرد عليها — مرجع الرد: <span className="font-mono font-medium">{item.responseRef}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Timing card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">التواريخ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {item?.createdAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الإنشاء</span>
                <span className="font-medium">{formatDateAr(item.createdAt)}</span>
              </div>
            )}
            {item?.sentAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الإرسال</span>
                <span className="font-medium">{formatDateAr(item.sentAt)}</span>
              </div>
            )}
            {item?.receivedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الاستلام</span>
                <span className="font-medium">{formatDateAr(item.receivedAt)}</span>
              </div>
            )}
            {item?.respondedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">الرد</span>
                <span className="font-medium">{formatDateAr(item.respondedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments with preview */}
        {attachments.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                المرفقات ({attachments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {attachments.map((a, i) => {
                const canPreview = !!a.id;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border text-xs hover:bg-surface-subtle">
                    <span className="truncate min-w-0">{a.name}</span>
                    {canPreview && (
                      <button
                        className="text-status-info-foreground hover:text-status-info-foreground shrink-0"
                        onClick={() => setPreviewAttachment({
                          id: a.id!,
                          title: a.name,
                          fileName: a.name,
                          mimeType: a.mimeType,
                          fileSize: a.size,
                        })}
                        title="معاينة"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="correspondence" entityId={id} />}
      {id && <EntityTags entityType="correspondence" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={item?.subject || "تفاصيل المراسلة"}
        subtitle={item?.direction ? DIRECTION_LABELS[item.direction] : undefined}
        backPath="/correspondence"
        refNumber={item?.ref || (id ? `CORR-${id}` : undefined)}
        status={item ? { label: STATUS_LABELS[item.status] || item.status, tone: statusTone(item.status) } : undefined}
        typeLabel={item?.channel ? (CHANNEL_LABELS[item.channel] || item.channel) : undefined}
        createdAt={item?.createdAt}
        updatedAt={item?.updatedAt}
        createdByName={item?.createdByName}
        relatedEntities={relatedEntities}
        entityType="correspondence"
        entityId={id ?? 0}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        printable
        onPrint={() => { /* handled by EntityPrintButton below */ }}
        actions={
          <>
            {item && (
              <EntityPrintButton
                branchId={item.branchId}
                title={item.subject || "مراسلة"}
                ref={item.ref || `CORR-${id}`}
                date={formatDateAr(item.createdAt)}
                sections={printSections}
                entityType="official_letter"
                entityId={item.id ?? id}
                formats={["a4"]}
              />
            )}
            <GuardedButton
              perm="comms:update"
              variant="outline"
              size="sm"
              onClick={handleEdit}
              disabled={!item || item.status !== "draft"}
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
