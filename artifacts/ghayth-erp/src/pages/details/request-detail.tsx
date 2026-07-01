import { useMemo } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity, EntityComments } from "@workspace/entity-kit";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@workspace/workflow-kit";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { Edit, Paperclip, Eye } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  in_review: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  returned: "مُرجع",
  closed: "مغلق",
};

const CATEGORY_LABELS: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  operations: "العمليات",
  support: "الدعم",
  legal: "القانونية",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

function statusTone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "destructive" as const;
  if (status === "returned") return "warning" as const;
  if (status === "in_review") return "info" as const;
  if (status === "closed") return "muted" as const;
  return "default" as const;
}

const requestEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]),
  notes: z.string().optional().default(""),
});
type RequestEditForm = z.infer<typeof requestEditSchema>;

export default function RequestDetail() {
  const [, params] = useRoute("/requests/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("request", id ?? 0);
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["request", String(id)],
    id ? `/requests/${id}` : null,
    !!id
  );
  // GET /requests/:id/actions — chronological action log (approvals,
  // returns, comments). Falls back to the bundled `request.actions`
  // if the dedicated index isn't reachable.
  const actionsQ = useApiQuery<any>(
    ["request-actions", String(id ?? "")],
    id ? `/requests/${id}/actions` : null,
    { enabled: !!id },
  );
  const actionsLog: any[] = actionsQ.data?.data ?? actionsQ.data?.actions ?? [];

  // Fetch request type metadata for category/workflow context
  const { data: typesResp } = useApiQuery<any>(
    ["request-types-all"],
    "/requests/types",
  );

  const request = data;

  const requestType = useMemo(() => {
    if (!request?.typeId) return null;
    const types = typesResp?.data ?? typesResp ?? [];
    return (Array.isArray(types) ? types : []).find((t: any) => t.id === request.typeId);
  }, [typesResp, request?.typeId]);

  // Parse attachments (stored as JSON array on the row)
  const attachments: Array<{ name: string; url?: string; id?: number; mimeType?: string; size?: number }> = useMemo(() => {
    if (!request?.attachments) return [];
    try {
      const raw = typeof request.attachments === "string" ? JSON.parse(request.attachments) : request.attachments;
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, [request?.attachments]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!request) return out;
    if (request.projectId && request.projectName) {
      out.push({ type: "project", id: request.projectId, label: request.projectName, sublabel: "المشروع المرتبط", href: `/projects/${request.projectId}` });
    }
    if (request.clientId && request.clientName) {
      out.push({ type: "client", id: request.clientId, label: request.clientName, sublabel: "العميل", href: `/clients/${request.clientId}` });
    }
    if (request.vendorId && request.vendorName) {
      out.push({ type: "vendor", id: request.vendorId, label: request.vendorName, sublabel: "المورد" });
    }
    if (request.linkedRequestId) {
      out.push({ type: "request", id: request.linkedRequestId, label: `طلب #${request.linkedRequestId}`, sublabel: "مرتبط بطلب سابق", href: `/requests/${request.linkedRequestId}` });
    }
    if (request.linkedLetterId) {
      out.push({ type: "letter", id: request.linkedLetterId, label: `خطاب #${request.linkedLetterId}`, sublabel: "خطاب مرجعي", href: `/correspondence/${request.linkedLetterId}` });
    }
    return out;
  }, [request]);


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل الطلب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {request?.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{request.description}</p>
            </div>
          )}
          {request?.priority && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">الأولوية:</span>
              <Badge variant="outline">{PRIORITY_LABELS[request.priority] || request.priority}</Badge>
            </div>
          )}
          {request?.category && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">التصنيف:</span>
              <Badge variant="outline">{CATEGORY_LABELS[request.category] || request.category}</Badge>
            </div>
          )}
          {request?.currentApprover && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">المعتمد الحالي:</span>
              <Badge>{request.currentApproverName || `#${request.currentApprover}`}</Badge>
            </div>
          )}
          {request?.returnReason && (
            <div className="rounded-md bg-status-warning-surface border border-status-warning-surface p-3">
              <p className="text-xs text-status-warning-foreground font-medium mb-1">سبب الإرجاع</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{request.returnReason}</p>
            </div>
          )}
          {request?.notes && <NotesDisplay notes={request.notes} status={request.status} />}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Embedded attachments shown with preview buttons */}
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

        {/* Approval actions inline — visible when request is pending */}
        {id && request && ["pending", "in_review", "returned"].includes(request.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="request"
                entityId={id}
                currentStatus={request.status}
                approveEndpoint={`/requests/${id}/approve`}
                rejectEndpoint={`/requests/${id}/reject`}
                returnEndpoint={`/requests/${id}/return`}
                approveMethod="POST"
                rejectMethod="POST"
                returnMethod="POST"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "in_review", "returned"]}
                invalidateKeys={[["requests"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الطلب" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history from approval_actions table */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="request" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}

        {actionsLog.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل إجراءات الطلب ({actionsLog.length})</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1 max-h-48 overflow-y-auto">
              {actionsLog.slice(0, 30).map((a: any, i: number) => (
                <div key={a.id ?? i} className="flex items-center justify-between border-b pb-1">
                  <span>{a.action ?? a.kind ?? "—"} {a.actorName ? `· ${a.actorName}` : ""}</span>
                  <span className="text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleString("ar-SA") : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Approval Timeline */}
      {id && (
        <ApprovalTimeline entityType="request" entityId={id} />
      )}

      {id && <EntityComments entityType="request" entityId={id} />}
      {id && <EntityTags entityType="request" entityId={id} />}
    </div>
  );

  return (
    <>
      <DetailPageLayout
        title={request?.title || "تفاصيل الطلب"}
        subtitle={request?.typeName || requestType?.name}
        backPath="/requests"
        refNumber={request?.ref || (id ? `REQ-${id}` : undefined)}
        status={request ? { label: STATUS_LABELS[request.status] || request.status, tone: statusTone(request.status) } : undefined}
        typeLabel={request?.category ? CATEGORY_LABELS[request.category] : undefined}
        createdAt={request?.createdAt}
        updatedAt={request?.updatedAt}
        createdByName={request?.createdByName}
        assignedToName={request?.currentApproverName || request?.reviewedByName}
        relatedEntities={relatedEntities}
        entityType="request"
        entityId={id ?? 0}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        printable
        onPrint={() => { /* print button triggers PrintButton below */ }}
        actions={
          <>
            {request?.branchId && (
              <PrintButton
                entityType="request"
                entityId={id ?? 0}
               />
            )}
            <GuardedButton
              perm="requests:write"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!request || ["closed", "rejected"].includes(request.status)}
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
      {request && id && (
        <EntityEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="تعديل الطلب"
          schema={requestEditSchema}
          defaultValues={{
            title: request.title ?? "",
            description: request.description ?? "",
            priority: (request.priority ?? "medium") as RequestEditForm["priority"],
            notes: request.notes ?? "",
          }}
          endpoint={`/requests/${id}`}
          invalidateKeys={[["request", String(id)], ["requests"]]}
          onSaved={() => refetch()}
        >
          <FormGrid cols={2}>
            <FormTextField name="title" label="العنوان" required className="md:col-span-2" />
            <FormSelectField
              name="priority"
              label="الأولوية"
              options={[
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "critical", label: "حرجة" },
              ]}
            />
            <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
            <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
          </FormGrid>
        </EntityEditDialog>
      )}
    </>
  );
}
