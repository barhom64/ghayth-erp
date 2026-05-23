import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { DetailPageLayout, type ExtraTab } from "@workspace/entity-kit";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import {
  User,
  Phone,
  Mail,
  Building2,
  Activity,
  Target,
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
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("crm_lead", id ?? "");
  const queryClient = useQueryClient();

  const { data: lead, isLoading, isError, refetch } = useApiQuery<any>(
    ["crm-lead", id],
    id ? `/crm/opportunities/${id}` : null,
    !!id
  );

  const { data: activitiesResp } = useApiQuery<any>(
    ["crm-lead-activities", id],
    id ? `/crm/opportunities/${id}/activities` : null,
    !!id
  );
  const activities: any[] = activitiesResp?.data || (Array.isArray(activitiesResp) ? activitiesResp : []);

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

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const handleConvert = async () => {
    try {
      // CRM-006: use the canonical convert endpoint. The old code POSTed a
      // brand-new /clients row every time (never linking an existing client)
      // and then PATCHed an out-of-enum status="converted". The canonical
      // endpoint runs handleDealWon (creates/links the client correctly) and
      // applyTransition to `won`, and is idempotent (rejects a re-convert).
      const result = await apiFetch<any>(`/crm/opportunities/${id}/convert`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      queryClient.invalidateQueries({ queryKey: ["crm-lead", id] });
      toast({ title: "تم تحويل العميل المحتمل إلى عميل بنجاح" });
      const clientId = result?.convertedClientId;
      navigate(clientId ? `/clients/${clientId}` : "/clients");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحويل العميل المحتمل",
        description: err.message || "حدث خطأ أثناء التحويل",
      });
    }
  };

  const overview = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-info-foreground bg-status-info-surface">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{totalContacts}</p>
              <p className="text-xs text-muted-foreground truncate">إجمالي الأنشطة</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-orange-600 bg-orange-50">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{lastActivity ? formatDateAr(lastActivity) : "—"}</p>
              <p className="text-xs text-muted-foreground truncate">آخر نشاط</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-purple-600 bg-purple-50">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{daysInPipeline}</p>
              <p className="text-xs text-muted-foreground truncate">أيام في الخط</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-success-foreground bg-status-success-surface">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(dealValue)}</p>
              <p className="text-xs text-muted-foreground truncate">قيمة الصفقة</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <GuardedButton perm="crm:create" size="sm" onClick={handleConvert} className="gap-1">
        <CheckCircle2 className="h-4 w-4" />
        تحويل
      </GuardedButton>
      <Button size="sm" variant="outline" onClick={() => navigate("/crm/activities")} className="gap-1">
        <Phone className="h-4 w-4" />
        تسجيل اتصال
      </Button>
    </div>
  );

  const extraTabs: ExtraTab[] = [
    {
      key: "activities",
      label: "الأنشطة",
      icon: Target,
      badge: activities.length || undefined,
      content: () =>
        activities.length === 0
          ? emptyMsg("لا توجد أنشطة مرتبطة بهذا العميل المحتمل")
          : <DataTable columns={activityColumns} data={activities} pageSize={10} emptyMessage="لا توجد أنشطة" noToolbar />,
    },
    {
      key: "deals",
      label: "الصفقات",
      icon: DollarSign,
      badge: deals.length || undefined,
      content: () =>
        deals.length === 0
          ? emptyMsg("لا توجد صفقات أخرى مرتبطة")
          : <DataTable columns={dealsColumns} data={deals} pageSize={10} emptyMessage="لا توجد صفقات" noToolbar />,
    },
  ];

  return (
    <DetailPageLayout
      title={lead?.title || lead?.contactName || "العميل المحتمل"}
      subtitle={lead?.clientName || undefined}
      backPath="/crm/leads"
      backLabel="العودة للعملاء المحتملين"
      status={lead?.stage ? { label: STAGE_LABELS[lead.stage] || lead.stage, tone: "info" } : undefined}
      entityType="crm_lead"
      entityId={id}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={lead?.createdAt}
      updatedAt={lead?.updatedAt}
      overview={overview}
      actions={actions}
      extraTabs={[...extraTabs, ...registryExtraTabs]}
      hideTabs={registryHideTabs}
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
