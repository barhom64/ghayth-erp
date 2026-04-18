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
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  User,
  Phone,
  Mail,
  Building2,
  Activity,
  Target,
  FileText,
  History,
  MessageCircle,
  FolderOpen,
  DollarSign,
  Clock,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  lead: "عميل محتمل",
  qualified: "مؤهل",
  proposal: "عرض سعر",
  negotiation: "تفاوض",
  closed_won: "تم الإغلاق (ربح)",
  closed_lost: "تم الإغلاق (خسارة)",
};

export default function LeadDetailPage() {
  const [, params] = useRoute("/crm/leads/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const queryClient = useQueryClient();

  const { data: lead, isLoading, isError, refetch } = useApiQuery<any>(
    ["crm-lead", id],
    id ? `/crm/opportunities/${id}` : null,
    !!id
  );

  // Activities for this opportunity
  const { data: activitiesResp } = useApiQuery<any>(
    ["crm-lead-activities", id],
    id ? `/crm/opportunities/${id}/activities` : null,
    !!id
  );
  const activities: any[] = activitiesResp?.data || (Array.isArray(activitiesResp) ? activitiesResp : []);

  // Related deals — dedicated endpoint, avoids pulling the full opps list.
  const { data: relatedResp } = useApiQuery<any>(
    ["crm-lead-deals", id],
    id ? `/crm/opportunities/${id}/related` : null,
    !!id
  );
  const deals: any[] = relatedResp?.data || [];

  const totalContacts = activities.length;
  const lastActivity = activities
    .map((a: any) => a.date || a.createdAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];
  const daysInPipeline = lead?.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const dealValue = Number(lead?.value) || 0;

  const activityColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || r.activityType || "-" },
    { key: "subject", header: "الموضوع", sortable: true, render: (r) => r.subject || r.title || r.note || "-" },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
  ];

  const dealsColumns: DataTableColumn<any>[] = [
    { key: "title", header: "الفرصة", sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: "stage", header: "المرحلة", sortable: true, render: (r) => <Badge variant="outline">{STAGE_LABELS[r.stage] || r.stage || "-"}</Badge> },
    { key: "value", header: "القيمة", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.value) || 0)}</span> },
    { key: "probability", header: "الاحتمالية", sortable: true, render: (r) => `${r.probability || 0}%` },
  ];

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="العنوان" value={lead?.title} />
          <InfoRow label="جهة الاتصال" value={lead?.contactName} />
          <InfoRow label="العميل" value={lead?.clientName} />
          <InfoRow label="المسؤول" value={lead?.assigneeName} />
          <InfoRow label="المرحلة" value={STAGE_LABELS[lead?.stage] || lead?.stage} />
          <InfoRow label="القيمة" value={lead?.value != null ? formatCurrency(Number(lead.value)) : undefined} />
          <InfoRow label="الاحتمالية" value={lead?.probability != null ? `${lead.probability}%` : undefined} />
          <InfoRow label="تاريخ الإنشاء" value={lead?.createdAt ? formatDateAr(lead.createdAt) : undefined} />
        </div>
        {lead?.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
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
      key: "activities",
      label: "الأنشطة",
      icon: Target,
      badge: activities.length || undefined,
      content: () =>
        activities.length === 0 ? (
          emptyMsg("لا توجد أنشطة مرتبطة بهذا العميل المحتمل")
        ) : (
          <DataTable columns={activityColumns} data={activities} pageSize={10} emptyMessage="لا توجد أنشطة" noToolbar />
        ),
    },
    {
      key: "deals",
      label: "الصفقات",
      icon: DollarSign,
      badge: deals.length || undefined,
      content: () =>
        deals.length === 0 ? (
          emptyMsg("لا توجد صفقات أخرى مرتبطة")
        ) : (
          <DataTable columns={dealsColumns} data={deals} pageSize={10} emptyMessage="لا توجد صفقات" noToolbar />
        ),
    },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => <EntityDocuments entityType="opportunity" entityId={id} />,
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="opportunity" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="opportunity" entityId={id} />,
    },
  ];

  const metaItems = [
    lead?.phone && { icon: Phone, label: lead.phone },
    lead?.email && { icon: Mail, label: lead.email },
    lead?.clientName && { icon: Building2, label: lead.clientName },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = lead?.stage ? <Badge variant="outline">{STAGE_LABELS[lead.stage] || lead.stage}</Badge> : null;

  const notFound = !isLoading && !lead;

  return (
    <EntityDetailPage
      title={lead?.title || lead?.contactName || (notFound ? "العميل المحتمل غير موجود" : "...")}
      subtitle={lead?.clientName || undefined}
      avatar={{
        icon: User,
        gradientFrom: "from-emerald-500",
        gradientTo: "to-teal-600",
        text: (lead?.title || lead?.contactName || "").slice(0, 2),
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/crm"
      backLabel="العودة للعملاء المحتملين"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على العميل المحتمل" : "تعذر تحميل بيانات العميل المحتمل"}
      onRetry={() => refetch()}
      actions={[
        {
          label: "تحويل",
          icon: CheckCircle2,
          variant: "default",
          onClick: async () => {
            try {
              const newClient = await apiFetch<any>("/clients", {
                method: "POST",
                body: JSON.stringify({
                  name: lead?.contactName || lead?.title || "",
                  email: lead?.email || "",
                  phone: lead?.phone || "",
                  company: lead?.clientName || "",
                }),
              });
              await apiFetch(`/crm/opportunities/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "converted" }),
              });
              queryClient.invalidateQueries({ queryKey: ["crm-lead", id] });
              toast({ title: "تم تحويل العميل المحتمل إلى عميل بنجاح" });
              const clientId = newClient?.id || newClient?.data?.id;
              navigate(clientId ? `/clients/${clientId}` : "/clients");
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "تعذر تحويل العميل المحتمل",
                description: err.message || "حدث خطأ أثناء التحويل",
              });
            }
          },
        },
        {
          label: "تسجيل اتصال",
          icon: Phone,
          variant: "outline",
          onClick: () => {
            navigate("/crm/activities");
          },
        },
      ]}
      kpis={[
        {
          label: "إجمالي الأنشطة",
          value: totalContacts,
          icon: Target,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "آخر نشاط",
          value: lastActivity ? formatDateAr(lastActivity) : "—",
          icon: Clock,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "أيام في الخط",
          value: daysInPipeline,
          icon: UserCheck,
          color: "text-purple-600 bg-purple-50",
        },
        {
          label: "قيمة الصفقة",
          value: formatCurrency(dealValue),
          icon: DollarSign,
          color: "text-green-600 bg-green-50",
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
