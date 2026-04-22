import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, CheckCircle2, Clock, User, MapPin, FileText } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلقة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
  cancelled: "ملغاة",
  blocked: "موقوفة",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

type Tone = "default" | "success" | "warning" | "destructive" | "info" | "muted";

function statusTone(status?: string | null): Tone {
  if (!status) return "default";
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  if (status === "cancelled") return "destructive";
  if (status === "blocked") return "destructive";
  return "default";
}

function priorityTone(priority?: string | null): Tone {
  if (!priority) return "default";
  if (priority === "urgent") return "destructive";
  if (priority === "high") return "warning";
  if (priority === "normal") return "default";
  return "muted";
}

export default function TaskDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/tasks/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data: task, isLoading, error, refetch } = useApiQuery<any>(
    ["task", String(id)],
    id ? `/tasks/${id}` : null,
    !!id,
  );

  const completeMut = useApiMutation<any, { status: string }>(
    id ? `/tasks/${id}` : "",
    "PATCH",
    [["task", String(id)], ["tasks"]],
    { successMessage: "تم تحديث حالة المهمة" },
  );

  const printSections: PrintSection[] = useMemo(() => {
    if (!task) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المهمة", value: `TSK-${id}` },
      { label: "العنوان", value: task.title || "-" },
      { label: "النوع", value: task.type || "-" },
      { label: "الأولوية", value: PRIORITY_LABELS[task.priority] || task.priority || "-" },
      { label: "الحالة", value: STATUS_LABELS[task.status] || task.status || "-" },
      { label: "المُعيَّن إليه", value: task.assignedToName || `#${task.assignedTo ?? "-"}` },
      { label: "تاريخ الاستحقاق", value: task.scheduledStart ? formatDateAr(task.scheduledStart) : "-" },
      { label: "الوصف", value: task.description || "-" },
    ];
    return [{ kind: "info-grid", items }];
  }, [task, id]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            بيانات المهمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">العنوان</p>
            <p className="text-base font-semibold">{task?.title || "-"}</p>
          </div>

          {task?.description && (
            <div>
              <p className="text-xs text-gray-500">الوصف</p>
              <p className="whitespace-pre-wrap text-sm">{task.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <p className="text-xs text-gray-500">النوع</p>
              <p className="font-medium">{task?.type || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">الأولوية</p>
              <Badge variant={priorityTone(task?.priority) as any}>
                {PRIORITY_LABELS[task?.priority] || task?.priority || "-"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500">تاريخ البدء المجدول</p>
              <p className="font-medium">
                {task?.scheduledStart ? formatDateAr(task.scheduledStart) : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">تاريخ النهاية المجدول</p>
              <p className="font-medium">
                {task?.scheduledEnd ? formatDateAr(task.scheduledEnd) : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-gray-500" />
            المُعيَّن إليه
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">الموظف</p>
            <p className="font-medium">
              {task?.assignedToName || (task?.assignedTo ? `#${task.assignedTo}` : "غير مُعيَّن")}
            </p>
          </div>
          {(task?.lat && task?.lon) ? (
            <div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> الموقع
              </p>
              <p className="font-mono text-xs" dir="ltr">
                {Number(task.lat).toFixed(5)}, {Number(task.lon).toFixed(5)}
              </p>
            </div>
          ) : null}
          {task?.refType && task?.refId && (
            <div className="border-t pt-2">
              <p className="text-xs text-gray-500">مرتبط بـ</p>
              <p className="font-medium">{task.refType} #{task.refId}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const canComplete = task?.status !== "completed" && task?.status !== "cancelled";

  return (
    <DetailPageLayout
      title={task?.title || `مهمة #${id}`}
      subtitle={task ? (STATUS_LABELS[task.status] || task.status) : undefined}
      refNumber={id ? `TSK-${id}` : undefined}
      status={task ? { label: STATUS_LABELS[task.status] || task.status, tone: statusTone(task.status) } : undefined}
      entityType="task"
      entityId={id ?? 0}
      isLoading={isLoading}
      error={error}
      onRetry={() => refetch()}
      backPath="/tasks"
      backLabel="المهام"
      actions={
        <div className="flex items-center gap-2">
          {canComplete && (
            <GuardedButton
              perm="tasks:write"
              variant="outline"
              className="gap-2"
              onClick={() => completeMut.mutate({ status: "completed" })}
              disabled={completeMut.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              تعليم كمكتملة
            </GuardedButton>
          )}
          <GuardedButton
            perm="tasks:write"
            variant="outline"
            className="gap-2"
            onClick={() => setLocation(`/tasks/${id}/edit`)}
          >
            <Edit className="h-4 w-4" />
            تعديل
          </GuardedButton>
          <EntityPrintButton
            title={task?.title || `مهمة #${id}`}
            ref={id ? `TSK-${id}` : undefined}
            sections={printSections}
          />
        </div>
      }
      overview={overview}
    />
  );
}
