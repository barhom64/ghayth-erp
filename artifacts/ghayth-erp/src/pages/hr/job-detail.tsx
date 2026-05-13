import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailPageLayout, type ExtraTab } from "@/components/shared/detail-page-layout";
import { formatDateAr } from "@/lib/formatters";
import { resolveStatus } from "@/components/page-status-badge";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import {
  Briefcase,
  Building2,
  Calendar,
  Activity,
  Users,
  UserCheck,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  XCircle,
  RotateCcw,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  new: "جديد",
  screening: "فرز",
  interview: "مقابلة",
  offer: "عرض",
  hired: "تم التوظيف",
  rejected: "مرفوض",
};

const STATUS_TONE_MAP: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  open: "success",
  closed: "muted",
  draft: "default",
  paused: "warning",
};

export default function JobDetailPage() {
  const [, params] = useRoute("/hr/recruitment/jobs/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("job_posting", id);

  const { data: job, isLoading, isError, refetch } = useApiQuery<any>(
    ["recruitment-job", id],
    id ? `/hr/recruitment/postings/${id}` : null,
    !!id
  );

  const { data: appsResp } = useApiQuery<any>(
    ["job-applications", id],
    id ? `/hr/recruitment/applications?postingId=${id}` : null,
    !!id
  );
  const applicants: any[] = appsResp?.data || [];

  const inInterview = applicants.filter((a) => (a.status || a.stage) === "interview").length;
  const offered = applicants.filter((a) => (a.status || a.stage) === "offer").length;
  const daysOpen = job?.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(job.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const applicantColumns: DataTableColumn<any>[] = [
    { key: "applicantName", header: "الاسم", sortable: true, render: (a) => <span className="font-medium">{a.applicantName || a.name}</span> },
    { key: "email", header: "البريد", sortable: true, render: (a) => a.email || "-" },
    { key: "phone", header: "الهاتف", sortable: true, render: (a) => a.phone || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (a) => (a.rating ? `${a.rating}/5` : "-") },
    { key: "status", header: "المرحلة", sortable: true, render: (a) => <Badge variant="outline">{STAGE_LABELS[a.status || a.stage] || a.status || a.stage || "-"}</Badge> },
    { key: "createdAt", header: "تاريخ التقديم", sortable: true, render: (a) => formatDateAr(a.createdAt) },
  ];

  const interviewColumns: DataTableColumn<any>[] = [
    { key: "applicantName", header: "المتقدم", sortable: true, render: (a) => <span className="font-medium">{a.applicantName || a.name}</span> },
    { key: "email", header: "البريد", sortable: true, render: (a) => a.email || "-" },
    { key: "rating", header: "التقييم", sortable: true, render: (a) => (a.rating ? `${a.rating}/5` : "-") },
    { key: "interviewDate", header: "موعد المقابلة", sortable: true, render: (a) => (a.interviewDate ? formatDateAr(a.interviewDate) : "—") },
  ];

  const interviews = useMemo(() => applicants.filter((a) => (a.status || a.stage) === "interview"), [applicants]);

  const isClosed = job?.status === "closed";
  const notFound = !isLoading && !job;

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const overview = (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="المسمى الوظيفي" value={job?.title} />
          <InfoRow label="القسم" value={job?.department} />
          <InfoRow label="الموقع" value={job?.location} />
          <InfoRow label="نوع العمل" value={job?.type} />
          <InfoRow label="الحالة" value={resolveStatus(job?.status ?? "")?.label || job?.status} />
          <InfoRow label="تاريخ النشر" value={job?.createdAt ? formatDateAr(job.createdAt) : undefined} />
          <InfoRow label="تاريخ الإغلاق" value={job?.closingDate ? formatDateAr(job.closingDate) : undefined} />
          <InfoRow
            label="نطاق الراتب"
            value={job?.salaryMin || job?.salaryMax ? `${job?.salaryMin || "-"} — ${job?.salaryMax || "-"}` : undefined}
          />
        </div>
        {job?.description && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-1">الوصف الوظيفي</p>
            <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{job.description}</p>
          </div>
        )}
        {job?.requirements && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-1">المتطلبات</p>
            <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{job.requirements}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const actions = (
    <>
      {isClosed ? (
        <GuardedButton
          perm="hr:create"
          size="sm"
          variant="default"
          className="gap-1"
          onClick={async () => {
            try {
              await apiFetch(`/hr/recruitment/postings/${id}/reopen`, {
                method: "POST",
                body: JSON.stringify({}),
              });
              queryClient.invalidateQueries({ queryKey: ["recruitment-job", id] });
              toast({ title: "تم إعادة فتح الإعلان الوظيفي" });
              refetch();
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "تعذر إعادة فتح الإعلان",
                description: err.message || "حدث خطأ",
              });
            }
          }}
        >
          <RotateCcw className="h-4 w-4" />
          إعادة فتح
        </GuardedButton>
      ) : (
        <GuardedButton
          perm="hr:create"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={async () => {
            try {
              await apiFetch(`/hr/recruitment/postings/${id}/close`, {
                method: "POST",
                body: JSON.stringify({}),
              });
              queryClient.invalidateQueries({ queryKey: ["recruitment-job", id] });
              toast({ title: "تم إغلاق الإعلان الوظيفي" });
              refetch();
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "تعذر إغلاق الإعلان",
                description: err.message || "حدث خطأ",
              });
            }
          }}
        >
          <XCircle className="h-4 w-4" />
          إغلاق
        </GuardedButton>
      )}
    </>
  );

  const extraTabs: ExtraTab[] = [
    {
      key: "applicants",
      label: "المتقدمون",
      icon: Users,
      badge: applicants.length || undefined,
      content: () =>
        applicants.length === 0 ? (
          emptyMsg("لا يوجد متقدمون على هذه الوظيفة")
        ) : (
          <DataTable columns={applicantColumns} data={applicants} pageSize={10} emptyMessage="لا يوجد متقدمون" noToolbar />
        ),
    },
    {
      key: "interviews",
      label: "المقابلات",
      icon: UserCheck,
      badge: interviews.length || undefined,
      content: () =>
        interviews.length === 0 ? (
          emptyMsg("لا توجد مقابلات مجدولة")
        ) : (
          <DataTable columns={interviewColumns} data={interviews} pageSize={10} emptyMessage="لا توجد مقابلات" noToolbar />
        ),
    },
  ];

  return (
    <DetailPageLayout
      title={job?.title || (notFound ? "الوظيفة غير موجودة" : "...")}
      subtitle={job?.department || undefined}
      backPath="/hr/jobs"
      backLabel="العودة للتوظيف"
      entityType="hr-job"
      entityId={id}
      isLoading={isLoading}
      error={isError || notFound ? (notFound ? "لم يتم العثور على الوظيفة" : "تعذر تحميل بيانات الوظيفة") : undefined}
      onRetry={() => refetch()}
      overview={overview}
      actions={actions}
      extraTabs={[...extraTabs, ...registryExtraTabs]}
      hideTabs={registryHideTabs}
      status={job?.status ? { label: resolveStatus(job.status)?.label || job.status, tone: STATUS_TONE_MAP[job.status] ?? "default" } : undefined}
      createdAt={job?.createdAt}
      updatedAt={job?.updatedAt}
    />
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-status-neutral-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}
