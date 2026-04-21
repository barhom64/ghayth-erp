import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { Edit, Clock } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  approved: "معتمد",
  rejected: "مرفوض",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "destructive" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

export default function ExcuseDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/excuse-requests/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["excuse", String(id)],
    id ? `/hr/excuse-requests/${id}` : null,
    !!id
  );

  const excuse = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!excuse) return out;
    if (excuse.employeeId) {
      out.push({
        type: "employee",
        id: excuse.employeeId,
        label: excuse.employeeName || `موظف #${excuse.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${excuse.employeeId}`,
      });
    }
    return out;
  }, [excuse]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!excuse) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `EXC-${id}` },
          { label: "الموظف", value: excuse.employeeName || "-" },
          { label: "التاريخ", value: formatDateAr(excuse.date) },
          { label: "وقت البداية", value: excuse.startTime || "-" },
          { label: "وقت النهاية", value: excuse.endTime || "-" },
          { label: "المدة", value: excuse.duration || "-" },
          { label: "الحالة", value: STATUS_LABELS[excuse.status] || excuse.status || "-" },
          { label: "تاريخ الطلب", value: formatDateAr(excuse.createdAt) },
        ],
      },
    ];
    if (excuse.reason) {
      sections.push({ kind: "text", title: "السبب", body: excuse.reason });
    }
    if (excuse.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: excuse.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مقدم الطلب", name: excuse.employeeName || "" },
        { label: "المعتمد", name: excuse.approvedByName || "" },
      ],
    });
    return sections;
  }, [excuse, id]);

  const handleEdit = () => {
    setLocation(`/hr/excuse-requests/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            بيانات الاستئذان
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Employee name hero */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-xl font-bold text-gray-900">
              {excuse?.employeeName || "-"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {excuse?.date && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">التاريخ</p>
                <span className="text-gray-800">{formatDateAr(excuse.date)}</span>
              </div>
            )}
            {excuse?.startTime && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">وقت البداية</p>
                <span className="text-gray-800 font-mono">{excuse.startTime}</span>
              </div>
            )}
            {excuse?.endTime && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">وقت النهاية</p>
                <span className="text-gray-800 font-mono">{excuse.endTime}</span>
              </div>
            )}
            {excuse?.duration && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المدة</p>
                <span className="text-gray-800">{excuse.duration}</span>
              </div>
            )}
            {excuse?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الطلب</p>
                <span className="text-gray-800">{formatDateAr(excuse.createdAt)}</span>
              </div>
            )}
          </div>

          {excuse?.reason && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">السبب</p>
              <p className="text-gray-800 whitespace-pre-wrap">{excuse.reason}</p>
            </div>
          )}

          {excuse?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{excuse.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — visible while pending */}
        {id && excuse && excuse.status === "pending" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="excuse"
                entityId={id}
                currentStatus={excuse.status}
                approveEndpoint={`/hr/excuse-requests/${id}/approve`}
                rejectEndpoint={`/hr/excuse-requests/${id}/approve`}
                returnEndpoint={`/hr/excuse-requests/${id}/approve`}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث طلب الاستئذان" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="excuse" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <DetailPageLayout
      title={`طلب استئذان EXC-${id}`}
      subtitle={excuse?.employeeName}
      backPath="/hr/excuse-requests"
      refNumber={`EXC-${id}`}
      status={
        excuse
          ? { label: STATUS_LABELS[excuse.status] || excuse.status || "-", tone: statusTone(excuse.status) }
          : undefined
      }
      createdAt={excuse?.createdAt}
      updatedAt={excuse?.updatedAt}
      createdByName={excuse?.createdByName || excuse?.employeeName}
      assignedToName={excuse?.approvedByName}
      relatedEntities={relatedEntities}
      entityType="excuse"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {excuse && (
            <EntityPrintButton
              branchId={excuse.branchId}
              title={`طلب استئذان EXC-${id}`}
              ref={`EXC-${id}`}
              date={formatDateAr(excuse.date || excuse.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !excuse || ["approved", "rejected"].includes(excuse.status)
            }
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
