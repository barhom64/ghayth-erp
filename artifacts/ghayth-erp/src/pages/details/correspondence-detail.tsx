/**
 * /correspondence/:id — صفحة تفاصيل المراسلة (بريد وارد/صادر)
 *
 * تعرض تفاصيل المراسلة ومحتواها وصاحبها والجهة المرتبطة،
 * مع إجراءات التعديل والطباعة والتذييل المسبق لمذكرة الرد.
 */
import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Paperclip, Eye, Inbox, SendHorizonal, Mail, Send, Reply } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import {
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";

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

const correspondenceEditSchema = z.object({
  subject: z.string().min(1, "الموضوع مطلوب"),
  content: z.string().optional().default(""),
  senderName: z.string().optional().default(""),
  senderOrg: z.string().optional().default(""),
  recipientName: z.string().optional().default(""),
  recipientOrg: z.string().optional().default(""),
  channel: z.enum(["internal", "email", "courier", "fax", "hand_delivery", "post"]),
  notes: z.string().optional().default(""),
});
type CorrespondenceEditForm = z.infer<typeof correspondenceEditSchema>;

export default function CorrespondenceDetail() {
  const [, params] = useRoute("/correspondence/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("correspondence", id ?? 0);
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["correspondence-detail", String(id)],
    `/correspondence/${id}`,
    !!id,
  );

  const item = data;

  // Outbound drafts get "Send"; received items get "Respond". Both hit
  // their own POST endpoint and flip the correspondence status — the
  // list page already exposes them per-row but the detail view didn't,
  // so an operator opening a draft to review had to bounce back to the
  // list to fire it.
  const sendMut = useApiMutation<unknown, { id: number }>(
    (b) => `/correspondence/${b.id}/send`,
    "POST",
    [["correspondence-detail", String(id)], ["correspondence"]],
    { successMessage: "تم الإرسال" },
  );
  const respondMut = useApiMutation<unknown, { id: number }>(
    (b) => `/correspondence/${b.id}/respond`,
    "POST",
    [["correspondence-detail", String(id)], ["correspondence"]],
    { successMessage: "تم تسجيل الرد" },
  );

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
        onPrint={() => { /* handled by PrintButton below */ }}
        actions={
          <>
            {item && (
              <PrintButton
                entityType="official_letter"
                entityId={item.id ?? id}
               />
            )}
            <GuardedButton
              perm="communications:create"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!item || item.status !== "draft"}
              title={item && item.status !== "draft" ? "التعديل متاح للمسودات فقط" : undefined}
            >
              <Edit className="h-4 w-4 ms-1" />
              تعديل
            </GuardedButton>
            {item && id && item.direction === "outgoing" && item.status === "draft" && (
              <GuardedButton
                perm="communications:create"
                variant="default"
                size="sm"
                onClick={() => sendMut.mutate({ id })}
                disabled={sendMut.isPending}
              >
                <Send className="h-4 w-4 ms-1" />
                إرسال
              </GuardedButton>
            )}
            {item && id && item.direction === "incoming" && item.status !== "archived" && !item.responseRef && (
              <GuardedButton
                perm="communications:create"
                variant="outline"
                size="sm"
                onClick={() => respondMut.mutate({ id })}
                disabled={respondMut.isPending}
              >
                <Reply className="h-4 w-4 ms-1" />
                تسجيل رد
              </GuardedButton>
            )}
          </>
        }
      />
      {item && id && (
        <EntityEditDialog<CorrespondenceEditForm>
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="تعديل المراسلة"
          schema={correspondenceEditSchema}
          defaultValues={{
            subject: item.subject ?? "",
            content: item.content ?? "",
            senderName: item.senderName ?? "",
            senderOrg: item.senderOrg ?? "",
            recipientName: item.recipientName ?? "",
            recipientOrg: item.recipientOrg ?? "",
            channel: (item.channel ?? "internal") as CorrespondenceEditForm["channel"],
            notes: item.notes ?? "",
          }}
          endpoint={`/correspondence/${id}`}
          invalidateKeys={[["correspondence-detail", String(id)], ["correspondence"]]}
          onSaved={() => refetch()}
        >
          <FormGrid cols={2}>
            <FormTextField name="subject" label="الموضوع" required className="md:col-span-2" />
            <FormSelectField
              name="channel"
              label="القناة"
              options={[
                { value: "internal", label: "داخلي" },
                { value: "email", label: "بريد إلكتروني" },
                { value: "courier", label: "مراسل" },
                { value: "fax", label: "فاكس" },
                { value: "hand_delivery", label: "استلام يدوي" },
                { value: "post", label: "بريد" },
              ]}
            />
            <FormTextField name="senderName" label="اسم المرسل" />
            <FormTextField name="senderOrg" label="جهة المرسل" />
            <FormTextField name="recipientName" label="اسم المستلم" />
            <FormTextField name="recipientOrg" label="جهة المستلم" />
            <FormTextareaField name="content" label="المحتوى" className="md:col-span-2" />
            <FormTextareaField name="notes" label="ملاحظات داخلية" className="md:col-span-2" />
          </FormGrid>
        </EntityEditDialog>
      )}
      <AttachmentPreview
        attachment={previewAttachment}
        open={!!previewAttachment}
        onOpenChange={(o) => !o && setPreviewAttachment(null)}
      />
    </>
  );
}
