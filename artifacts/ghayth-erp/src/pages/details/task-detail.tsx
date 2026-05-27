import { useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  DetailPageLayout,
  EntityComments,
} from "@workspace/entity-kit";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, CheckCircle2, Clock, User, MapPin, FileText } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

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

const taskEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional().default(""),
  type: z.string().optional().default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  scheduledDate: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
type TaskEditForm = z.infer<typeof taskEditSchema>;

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);
  const { toast } = useToast();
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("task", id ?? 0);

  const { data: task, isLoading, error, refetch } = useApiQuery<any>(
    ["task", String(id)],
    `/tasks/${id}`,
    !!id,
  );

  const completeMut = useApiMutation<any, { status: string }>(
    id ? `/tasks/${id}` : "",
    "PATCH",
    [["task", String(id)], ["tasks"]],
    { successMessage: "تم تحديث حالة المهمة" },
  );


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            بيانات المهمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">العنوان</p>
            <p className="text-base font-semibold">{task?.title || "-"}</p>
          </div>

          {task?.description && (
            <div>
              <p className="text-xs text-muted-foreground">الوصف</p>
              <p className="whitespace-pre-wrap text-sm">{task.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">النوع</p>
              <p className="font-medium">{task?.type || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الأولوية</p>
              <Badge variant={priorityTone(task?.priority) as any}>
                {PRIORITY_LABELS[task?.priority] || task?.priority || "-"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تاريخ البدء المجدول</p>
              <p className="font-medium">
                {task?.scheduledStart ? formatDateAr(task.scheduledStart) : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تاريخ النهاية المجدول</p>
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
            <User className="h-4 w-4 text-muted-foreground" />
            المُعيَّن إليه
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">الموظف</p>
            <p className="font-medium">
              {task?.assignedToName || (task?.assignedTo ? `#${task.assignedTo}` : "غير مُعيَّن")}
            </p>
          </div>
          {(task?.lat && task?.lon) ? (
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> الموقع
              </p>
              <p className="font-mono text-xs" dir="ltr">
                {Number(task.lat).toFixed(5)}, {Number(task.lon).toFixed(5)}
              </p>
            </div>
          ) : null}
          {task?.refType && task?.refId && (
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground">مرتبط بـ</p>
              <p className="font-medium">{task.refType} #{task.refId}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {id && <EntityComments entityType="task" entityId={id} />}
      {id && <EntityTags entityType="task" entityId={id} />}
    </div>
  );

  const canComplete = task?.status !== "completed" && task?.status !== "cancelled";

  return (
    <>
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
      extraTabs={registryExtraTabs}
      hideTabs={registryHideTabs}
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
          <EntityPrintButton
            entityType="task"
            entityId={id ?? 0}
            formats={["a4"]}/>
          <GuardedButton
            perm="tasks:write"
            variant="outline"
            className="gap-2"
            onClick={() => setEditOpen(true)}
            disabled={!task || task?.status === "completed"}
          >
            <Edit className="h-4 w-4" />
            تعديل
          </GuardedButton>
        </div>
      }
      overview={overview}
    />
    {task && id && (
      <EntityEditDialog<TaskEditForm>
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل المهمة"
        schema={taskEditSchema}
        defaultValues={{
          title: task.title ?? "",
          description: task.description ?? "",
          type: task.type ?? "",
          priority: (task.priority ?? "medium") as TaskEditForm["priority"],
          status: (task.status ?? "pending") as TaskEditForm["status"],
          scheduledDate: task.scheduledDate ?? "",
          notes: task.notes ?? "",
        }}
        endpoint={`/tasks/${id}`}
        invalidateKeys={[["task", String(id)], ["tasks"]]}
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
              { value: "urgent", label: "عاجلة" },
            ]}
          />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "pending", label: "معلقة" },
              { value: "in_progress", label: "قيد التنفيذ" },
              { value: "completed", label: "مكتملة" },
              { value: "cancelled", label: "ملغاة" },
            ]}
          />
          <FormTextField name="scheduledDate" label="التاريخ المجدول" type="date" />
          <FormTextField name="type" label="النوع" />
          <FormTextareaField name="description" label="الوصف" className="md:col-span-2" />
          <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
