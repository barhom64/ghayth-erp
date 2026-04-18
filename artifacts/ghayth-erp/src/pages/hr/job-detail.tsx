import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { formatDateAr } from "@/lib/formatters";
import {
  Briefcase,
  Building2,
  Calendar,
  Activity,
  Users,
  UserCheck,
  FolderOpen,
  History,
  MessageCircle,
  XCircle,
  RotateCcw,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  new: "جديد",
  screening: "فرز",
  interview: "مقابلة",
  offer: "عرض",
  hired: "تم التوظيف",
  rejected: "مرفوض",
};

export default function JobDetailPage() {
  const [, params] = useRoute("/hr/recruitment/jobs/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { data: job, isLoading, isError, refetch } = useApiQuery<any>(
    ["recruitment-job", id],
    id ? `/recruitment/postings/${id}` : null,
    !!id
  );

  // Applications filtered by posting
  const { data: appsResp } = useApiQuery<any>(
    ["job-applications", id],
    id ? `/recruitment/applications?postingId=${id}` : null,
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

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="المسمى الوظيفي" value={job?.title} />
          <InfoRow label="القسم" value={job?.department} />
          <InfoRow label="الموقع" value={job?.location} />
          <InfoRow label="نوع العمل" value={job?.type} />
          <InfoRow label="الحالة" value={job?.status} />
          <InfoRow label="تاريخ النشر" value={job?.createdAt ? formatDateAr(job.createdAt) : undefined} />
          <InfoRow label="تاريخ الإغلاق" value={job?.closingDate ? formatDateAr(job.closingDate) : undefined} />
          <InfoRow
            label="نطاق الراتب"
            value={job?.salaryMin || job?.salaryMax ? `${job?.salaryMin || "-"} — ${job?.salaryMax || "-"}` : undefined}
          />
        </div>
        {job?.description && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">الوصف الوظيفي</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
          </div>
        )}
        {job?.requirements && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">المتطلبات</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.requirements}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-gray-500">{msg}</CardContent>
    </Card>
  );

  const tabs: EntityTab[] = [
    { key: "overview", label: "نظرة عامة", icon: Activity, content: overviewContent },
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
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="job_posting" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="job_postings" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="job_posting" entityId={id} />,
    },
  ];

  const metaItems = [
    job?.department && { icon: Building2, label: job.department },
    job?.location && { icon: MapPin, label: job.location },
    job?.type && { icon: FileText, label: job.type },
    job?.createdAt && { icon: Calendar, label: formatDateAr(job.createdAt) },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = job?.status ? <Badge variant="outline">{job.status}</Badge> : null;

  const notFound = !isLoading && !job;
  const isClosed = job?.status === "closed";

  return (
    <EntityDetailPage
      title={job?.title || (notFound ? "الوظيفة غير موجودة" : "...")}
      subtitle={job?.department || undefined}
      avatar={{
        icon: Briefcase,
        gradientFrom: "from-indigo-500",
        gradientTo: "to-violet-600",
        text: job?.title?.slice(0, 2),
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/hr/recruitment"
      backLabel="العودة للتوظيف"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على الوظيفة" : "تعذر تحميل بيانات الوظيفة"}
      onRetry={() => refetch()}
      actions={[
        isClosed
          ? {
              label: "إعادة فتح",
              icon: RotateCcw,
              variant: "default" as const,
              onClick: async () => {
                try {
                  await apiFetch(`/recruitment/postings/${id}/reopen`, {
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
              },
            }
          : {
              label: "إغلاق",
              icon: XCircle,
              variant: "outline" as const,
              onClick: async () => {
                try {
                  await apiFetch(`/recruitment/postings/${id}/close`, {
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
              },
            },
      ]}
      kpis={[
        {
          label: "إجمالي المتقدمين",
          value: applicants.length,
          icon: Users,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "في المقابلة",
          value: inInterview,
          icon: UserCheck,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "تم العرض",
          value: offered,
          icon: CheckCircle2,
          color: "text-green-600 bg-green-50",
        },
        {
          label: "أيام الفتح",
          value: daysOpen,
          icon: Clock,
          color: "text-orange-600 bg-orange-50",
        },
      ]}
      tabs={tabs}
      defaultTab="overview"
    />
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
