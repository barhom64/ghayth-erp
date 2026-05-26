import { useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormSelectField,
  FormTextField,
  FormGrid,
} from "@workspace/ui-core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { useFormContext } from "react-hook-form";
import {
  DetailPageLayout,
  ProcessStages,
  type StageStep,
} from "@workspace/entity-kit";
import { ApprovalActions, ActionHistory } from "@workspace/workflow-kit";
import {
  GraduationCap, Users, MapPin, User, BookOpen, UserPlus, Trash2, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const ENROLLMENT_STATUS_OPTIONS = [
  { value: "enrolled", label: "مسجل" },
  { value: "in_progress", label: "قيد التنفيذ" },
  { value: "completed", label: "مكتمل" },
  { value: "passed", label: "ناجح" },
  { value: "failed", label: "راسب" },
  { value: "dropped", label: "منسحب" },
];

const enrollSchema = z.object({
  employeeId: z.coerce.number().int().positive("اختر الموظف"),
  status: z.enum(["enrolled", "in_progress", "completed", "passed", "failed", "dropped"]),
});
type EnrollForm = z.infer<typeof enrollSchema>;

const patchEnrollSchema = z.object({
  status: z.enum(["enrolled", "in_progress", "completed", "passed", "failed", "dropped"]),
  score: z.coerce.number().min(0).max(100).optional(),
});
type PatchEnrollForm = z.infer<typeof patchEnrollSchema>;

const TRAINING_LIFECYCLE = [
  { key: "planned",   label: "مخطط" },
  { key: "upcoming",  label: "قادم" },
  { key: "active",    label: "نشط" },
  { key: "completed", label: "مكتمل" },
];

function buildTrainingSteps(status: string | undefined): StageStep[] {
  const s = status ?? "planned";
  if (s === "cancelled") {
    return [{ label: "ملغي", status: "rejected" }];
  }
  const idx = TRAINING_LIFECYCLE.findIndex((x) => x.key === s);
  return TRAINING_LIFECYCLE.map((step, i): StageStep => {
    if (idx === -1) return { label: step.label, status: "pending" };
    if (i < idx)    return { label: step.label, status: "completed" };
    if (i === idx)  return { label: step.label, status: "current" };
    return { label: step.label, status: "pending" };
  });
}

const STATUS_TONE_MAP: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  planned: "muted",
  upcoming: "info",
  active: "success",
  completed: "success",
  cancelled: "destructive",
};

export default function TrainingDetailPage() {
  const [, params] = useRoute("/hr/training/:id");
  const id = params?.id;

  const { extraTabs, hideTabs } = useRegistryTabs("training_program", id ?? "");

  const { data: program, isLoading, isError } = useApiQuery<any>(
    ["training-program", id ?? ""],
    `/hr/training/programs/${id ?? 0}`,
    { enabled: !!id },
  );

  const { data: enrollmentsData } = useApiQuery<any>(
    ["training-enrollments", id ?? ""],
    `/hr/training/enrollments?programId=${id ?? 0}`,
    { enabled: !!id },
  );
  const enrollments = enrollmentsData?.data || [];
  const [enrolling, setEnrolling] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<any>(null);
  const [deletingEnrollment, setDeletingEnrollment] = useState<any>(null);

  const kpis = [
    {
      label: "المدرب",
      value: program?.trainer || "-",
      icon: User,
      color: "text-status-info-foreground bg-status-info-surface",
    },
    {
      label: "المشاركين",
      value: `${program?.enrolled || 0} / ${program?.capacity || 0}`,
      icon: Users,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "الموقع",
      value: program?.location || "-",
      icon: MapPin,
      color: "text-status-success-foreground bg-status-success-surface",
    },
    {
      label: "الفئة",
      value: program?.category || "-",
      icon: BookOpen,
      color: "text-status-warning-foreground bg-status-warning-surface",
    },
  ];

  const enrollmentColumns: DataTableColumn<any>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={e.employeeName} color="purple" />
          <span className="font-medium text-sm">{e.employeeName || "-"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (e) => <PageStatusBadge status={e.status} />,
    },
    {
      key: "score",
      header: "الدرجة",
      sortable: true,
      render: (e) => {
        if (e.score == null) return <span className="text-muted-foreground">-</span>;
        const score = Number(e.score);
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              score >= 80 ? "border-status-success-surface text-status-success-foreground bg-status-success-surface" :
              score >= 60 ? "border-status-warning-surface text-status-warning-foreground bg-status-warning-surface" :
              "border-status-error-surface text-status-error-foreground bg-status-error-surface",
            )}
          >
            {score}%
          </Badge>
        );
      },
    },
    {
      key: "feedback",
      header: "الملاحظات",
      render: (e) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {e.feedback || "-"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "تاريخ التسجيل",
      sortable: true,
      render: (e) => (
        <span className="text-sm text-muted-foreground">
          {formatDateAr(e.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (e) => (
        <div className="flex gap-1 justify-end">
          <GuardedButton
            perm="hr.training:update"
            size="sm"
            variant="ghost"
            onClick={() => setEditingEnrollment(e)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          <GuardedButton
            perm="hr.training:delete"
            size="sm"
            variant="ghost"
            className="text-status-error-foreground"
            onClick={() => setDeletingEnrollment(e)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </GuardedButton>
        </div>
      ),
    },
  ];

  const overview = program ? (
    <>
      <KpiGrid items={kpis} />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">مراحل البرنامج</p>
          <ProcessStages steps={buildTrainingSteps(program.status)} />
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-status-neutral-foreground mb-4 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            بيانات البرنامج
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-muted-foreground">العنوان</span>
              <p className="font-medium">{program.title}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الحالة</span>
              <div className="mt-1"><PageStatusBadge status={program.status} /></div>
            </div>
            <div>
              <span className="text-muted-foreground">الفئة</span>
              <p className="font-medium">{program.category || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">المدرب</span>
              <p className="font-medium">{program.trainer || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الموقع</span>
              <p className="font-medium">{program.location || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">السعة</span>
              <p className="font-medium">{program.capacity || 0} مقعد</p>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ البداية</span>
              <p className="font-medium">
                {formatDateAr(program.startDate)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ النهاية</span>
              <p className="font-medium">
                {formatDateAr(program.endDate)}
              </p>
            </div>
            {program.description && (
              <div className="col-span-full">
                <span className="text-muted-foreground">الوصف</span>
                <p className="font-medium">{program.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-status-neutral-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              المشاركون ({enrollments.length})
            </h3>
            <GuardedButton
              perm="hr.training:create"
              size="sm"
              onClick={() => setEnrolling(true)}
              className="gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              تسجيل مشارك
            </GuardedButton>
          </div>
          <DataTable
            columns={enrollmentColumns}
            data={enrollments}
            noToolbar
            emptyMessage="لا يوجد مشاركون في هذا البرنامج — اضغط 'تسجيل مشارك' للبدء"
            pageSize={20}
          />
        </CardContent>
      </Card>

      {enrolling && id && (
        <EnrollDialog
          programId={Number(id)}
          onClose={() => setEnrolling(false)}
        />
      )}
      {editingEnrollment && (
        <EditEnrollmentDialog
          enrollment={editingEnrollment}
          onClose={() => setEditingEnrollment(null)}
        />
      )}
      {deletingEnrollment && (
        <ConfirmDeleteDialog
          open={deletingEnrollment !== null}
          onOpenChange={(o) => { if (!o) setDeletingEnrollment(null); }}
          entity={{
            type: "training_enrollment",
            id: deletingEnrollment.id,
            name: `تسجيل ${deletingEnrollment.employeeName ?? `#${deletingEnrollment.employeeId}`}`,
          }}
          deletePath={`/hr/training/enrollments/${deletingEnrollment.id}`}
          invalidateKeys={[["training-enrollments", String(id ?? "")]]}
          onDeleted={() => setDeletingEnrollment(null)}
        />
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">إجراءات الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <ApprovalActions
            entityType="training-program"
            entityId={Number(id)}
            approveEndpoint={`/hr/training/programs/${id}/approve`}
            rejectEndpoint={`/hr/training/programs/${id}/reject`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            invalidateKeys={[["training-program", id || ""], ["hr-training"]]}
          />
        </CardContent>
      </Card>
      <ActionHistory entityType="training-program" entityId={Number(id)} />
    </>
  ) : null;

  return (
    <DetailPageLayout
      title={program?.title || "تفاصيل البرنامج التدريبي"}
      subtitle={program?.description || undefined}
      backPath="/hr/training"
      backLabel="العودة"
      entityType="training-program"
      entityId={id ?? ""}
      isLoading={isLoading}
      error={isError || (!isLoading && !program) ? true : undefined}
     
      overview={overview}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      status={program?.status ? { label: program.status, tone: STATUS_TONE_MAP[program.status] ?? "default" } : undefined}
      createdAt={program?.createdAt}
      updatedAt={program?.updatedAt}
    />
  );
}

function EnrollDialog({
  programId,
  onClose,
}: {
  programId: number;
  onClose: () => void;
}) {
  const mut = useApiMutation<unknown, EnrollForm>(
    "/hr/training/enrollments",
    "POST",
    [["training-enrollments", String(programId)], ["training-program", String(programId)]],
    { successMessage: "تم تسجيل المشارك", onSuccess: () => onClose() },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            تسجيل مشارك في البرنامج
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={enrollSchema}
          defaultValues={{ employeeId: 0, status: "enrolled" }}
          submitLabel="تسجيل"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync({ ...values, programId } as any);
          }}
        >
          <EnrollEmployeePicker />
          <FormSelectField
            name="status"
            label="حالة التسجيل"
            required
            options={ENROLLMENT_STATUS_OPTIONS}
          />
          <p className="text-xs text-muted-foreground">
            عند الحفظ يزداد عداد المسجلين على البرنامج تلقائياً، ولا يمكن تسجيل نفس الموظف
            مرتين في نفس البرنامج (يقابل قيد UNIQUE خلف هذا الإجراء).
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function EnrollEmployeePicker() {
  const { watch, setValue, formState } = useFormContext<EnrollForm>();
  const value = watch("employeeId");
  const err = formState.errors.employeeId?.message;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        الموظف <span className="text-status-error-foreground">*</span>
      </label>
      <EmployeeSelect
        value={value ? String(value) : ""}
        onChange={(v) =>
          setValue("employeeId", Number(v) || 0, { shouldDirty: true, shouldValidate: true })
        }
        placeholder="ابحث عن موظف..."
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}

function EditEnrollmentDialog({
  enrollment,
  onClose,
}: {
  enrollment: any;
  onClose: () => void;
}) {
  const mut = useApiMutation<unknown, PatchEnrollForm>(
    `/hr/training/enrollments/${enrollment.id}`,
    "PATCH",
    [["training-enrollments", String(enrollment.programId)]],
    { successMessage: "تم تحديث التسجيل", onSuccess: () => onClose() },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            تعديل تسجيل: {enrollment.employeeName ?? `#${enrollment.employeeId}`}
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={patchEnrollSchema}
          defaultValues={{
            status: (enrollment.status as PatchEnrollForm["status"]) ?? "enrolled",
            score: enrollment.score ?? undefined,
          }}
          submitLabel="حفظ التعديلات"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
          }}
        >
          <FormGrid cols={2}>
            <FormSelectField
              name="status"
              label="الحالة"
              required
              options={ENROLLMENT_STATUS_OPTIONS}
            />
            <FormTextField name="score" label="الدرجة (0-100)" type="number" />
          </FormGrid>
          <p className="text-xs text-muted-foreground">
            تحديث الحالة لـ "ناجح" أو "راسب" يثبت نتيجة التدريب في سجل الموظف للتقارير
            ومتابعة الترقيات.
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
