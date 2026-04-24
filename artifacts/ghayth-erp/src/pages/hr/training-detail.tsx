import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import {
  GraduationCap, Users, MapPin, User, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ProcessStages, type StageStep } from "@/components/shared/entity-timeline";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";

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

  const { data: program, isLoading, isError } = useApiQuery<any>(
    ["training-program", id ?? ""],
    `/training/programs/${id ?? 0}`,
    { enabled: !!id },
  );

  const { data: enrollmentsData } = useApiQuery<any>(
    ["training-enrollments", id ?? ""],
    `/training/enrollments?programId=${id ?? 0}`,
    { enabled: !!id },
  );
  const enrollments = enrollmentsData?.data || [];

  const kpis = [
    {
      label: "المدرب",
      value: program?.trainer || "-",
      icon: User,
      color: "text-blue-600 bg-blue-50",
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
      color: "text-green-600 bg-green-50",
    },
    {
      label: "الفئة",
      value: program?.category || "-",
      icon: BookOpen,
      color: "text-amber-600 bg-amber-50",
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
        if (e.score == null) return <span className="text-gray-400">-</span>;
        const score = Number(e.score);
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              score >= 80 ? "border-green-300 text-green-700 bg-green-50" :
              score >= 60 ? "border-amber-300 text-amber-700 bg-amber-50" :
              "border-red-300 text-red-700 bg-red-50",
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
        <span className="text-sm text-gray-500 truncate max-w-[200px] block">
          {e.feedback || "-"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "تاريخ التسجيل",
      sortable: true,
      render: (e) => (
        <span className="text-sm text-gray-500">
          {formatDateAr(e.createdAt)}
        </span>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            بيانات البرنامج
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-gray-500">العنوان</span>
              <p className="font-medium">{program.title}</p>
            </div>
            <div>
              <span className="text-gray-500">الحالة</span>
              <div className="mt-1"><PageStatusBadge status={program.status} /></div>
            </div>
            <div>
              <span className="text-gray-500">الفئة</span>
              <p className="font-medium">{program.category || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">المدرب</span>
              <p className="font-medium">{program.trainer || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">الموقع</span>
              <p className="font-medium">{program.location || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500">السعة</span>
              <p className="font-medium">{program.capacity || 0} مقعد</p>
            </div>
            <div>
              <span className="text-gray-500">تاريخ البداية</span>
              <p className="font-medium">
                {formatDateAr(program.startDate)}
              </p>
            </div>
            <div>
              <span className="text-gray-500">تاريخ النهاية</span>
              <p className="font-medium">
                {formatDateAr(program.endDate)}
              </p>
            </div>
            {program.description && (
              <div className="col-span-full">
                <span className="text-gray-500">الوصف</span>
                <p className="font-medium">{program.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            المشاركون ({enrollments.length})
          </h3>
          <DataTable
            columns={enrollmentColumns}
            data={enrollments}
            noToolbar
            emptyMessage="لا يوجد مشاركون في هذا البرنامج"
            pageSize={20}
          />
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base">إجراءات الاعتماد</CardTitle></CardHeader>
        <CardContent>
          <ApprovalActions
            entityType="training_program"
            entityId={Number(id)}
            approveEndpoint={`/hr/training/programs/${id}/approve`}
            rejectEndpoint={`/hr/training/programs/${id}/reject`}
            approveMethod="PATCH"
            rejectMethod="PATCH"
            invalidateKeys={[["training-program", id || ""], ["hr-training"]]}
          />
        </CardContent>
      </Card>
      <ActionHistory entityType="training_program" entityId={Number(id)} />
    </>
  ) : null;

  return (
    <DetailPageLayout
      title={program?.title || "تفاصيل البرنامج التدريبي"}
      subtitle={program?.description || undefined}
      backPath="/hr/training"
      backLabel="العودة"
      entityType="hr_training"
      entityId={id ?? ""}
      isLoading={isLoading}
      error={isError || (!isLoading && !program) ? true : undefined}
      onRetry={() => window.location.reload()}
      overview={overview}
      status={program?.status ? { label: program.status, tone: STATUS_TONE_MAP[program.status] ?? "default" } : undefined}
      createdAt={program?.createdAt}
      updatedAt={program?.updatedAt}
    />
  );
}
