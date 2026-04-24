import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory, NotesDisplay } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { AttachmentPreview, type PreviewableAttachment } from "@/components/shared/attachment-preview";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Edit, Paperclip, Eye } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
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
  urgent: "عاجلة",
};

function statusTone(status: string) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "destructive" as const;
  if (status === "returned") return "warning" as const;
  if (status === "in_review") return "info" as const;
  if (status === "closed") return "muted" as const;
  return "default" as const;
}

export default function RequestDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/requests/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["request", String(id)],
    id ? `/requests/${id}` : null,
    !!id
  );

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

  const printSections: PrintSection[] = useMemo(() => {
    if (!request) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "عنوان الطلب", value: request.title },
          { label: "نوع الطلب", value: request.typeName || requestType?.name || "-" },
          { label: "التصنيف", value: CATEGORY_LABELS[request.category] || request.category || "-" },
          { label: "الأولوية", value: PRIORITY_LABELS[request.priority] || request.priority || "-" },
          { label: "الحالة", value: STATUS_LABELS[request.status] || request.status },
          { label: "تاريخ التقديم", value: formatDateAr(request.createdAt) },
          ...(request.reviewedAt ? [{ label: "تاريخ المراجعة", value: formatDateAr(request.reviewedAt) }] : []),
        ],
      },
    ];
    if (request.description) {
      sections.push({ kind: "text", title: "تفاصيل الطلب", body: request.description });
    }
    if (request.notes) {
      sections.push({ kind: "text", title: "الملاحظات", body: request.notes });
    }
    if (request.returnReason) {
      sections.push({ kind: "text", title: "سبب الإرجاع", body: request.returnReason });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مقدم الطلب", name: request.createdByName },
        { label: "المعتمد", name: request.reviewedByName || "" },
      ],
    });
    return sections;
  }, [request, requestType]);

  const handleEdit = () => {
    setLocation(`/requests/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل الطلب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {request?.description && (
            <div>
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{request.description}</p>
            </div>
          )}
          {request?.priority && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">الأولوية:</span>
              <Badge variant="outline">{PRIORITY_LABELS[request.priority] || request.priority}</Badge>
            </div>
          )}
          {request?.category && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">التصنيف:</span>
              <Badge variant="outline">{CATEGORY_LABELS[request.category] || request.category}</Badge>
            </div>
          )}
          {request?.currentApprover && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">المعتمد الحالي:</span>
              <Badge>{request.currentApproverName || `#${request.currentApprover}`}</Badge>
            </div>
          )}
          {request?.returnReason && (
            <div className="rounded-md bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-700 font-medium mb-1">سبب الإرجاع</p>
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
                <Paperclip className="h-4 w-4 text-gray-500" />
                المرفقات ({attachments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {attachments.map((a, i) => {
                const canPreview = !!a.id;
                return (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border text-xs hover:bg-gray-50">
                    <span className="truncate min-w-0">{a.name}</span>
                    {canPreview && (
                      <button
                        className="text-blue-600 hover:text-blue-700 shrink-0"
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
      </div>

      {/* Approval Timeline */}
      {id && (
        <ApprovalTimeline entityType="request" entityId={id} />
      )}
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
        overview={overview}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        printable
        onPrint={() => { /* print button triggers EntityPrintButton below */ }}
        actions={
          <>
            {request?.branchId && (
              <EntityPrintButton
                branchId={request.branchId}
                title={request.title || "طلب"}
                ref={request.ref || `REQ-${id}`}
                date={formatDateAr(request.createdAt)}
                sections={printSections}
              />
            )}
            <GuardedButton
              perm="requests:write"
              variant="outline"
              size="sm"
              onClick={handleEdit}
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
    </>
  );
}
