import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { EntityComments } from "@/components/shared/entity-comments";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { PageStatusBadge } from "@/components/page-status-badge";
import { formatCurrency, formatDateAr , todayLocal } from "@/lib/formatters";
import {
  FileText,
  User,
  MapPin,
  Calendar,
  Activity,
  Banknote,
  Wrench,
  ClipboardCheck,
  FolderOpen,
  History,
  MessageCircle,
  RotateCcw,
  XCircle,
  DollarSign,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function ContractDetailPage() {
  const [, params] = useRoute("/properties/contracts/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const queryClient = useQueryClient();
  const [terminateOpen, setTerminateOpen] = useState(false);

  const submitTerminate = async (reason: string) => {
    setTerminateOpen(false);
    try {
      await apiFetch(`/properties/contracts/${id}/terminate`, {
        method: "POST",
        body: JSON.stringify({
          reason,
          terminationDate: todayLocal(),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["properties-contract", id] });
      toast({ title: "تم إنهاء العقد بنجاح" });
      navigate("/properties/contracts");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنهاء العقد",
        description: err.message || "حدث خطأ أثناء إنهاء العقد",
      });
    }
  };

  const { data: contract, isLoading, isError, refetch } = useApiQuery<any>(
    ["properties-contract", id],
    id ? `/properties/contracts/${id}` : null,
    !!id
  );

  // Payment schedule
  const { data: scheduleResp } = useApiQuery<any>(
    ["contract-detail-schedule", id],
    id ? `/properties/contracts/${id}/schedule` : null,
    !!id
  );
  const schedule: any[] = scheduleResp?.data || (Array.isArray(scheduleResp) ? scheduleResp : []);

  // Maintenance requests filtered by contract
  const { data: maintResp } = useApiQuery<any>(
    ["contract-maintenance", id],
    id ? `/properties/maintenance?contractId=${id}` : null,
    !!id
  );
  const maintRequests: any[] = maintResp?.data || [];

  // Inspections filtered by contract
  const { data: inspResp } = useApiQuery<any>(
    ["contract-inspections", id],
    id ? `/properties/inspections?contractId=${id}` : null,
    !!id
  );
  const inspections: any[] = inspResp?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const monthlyRent = Number(contract?.monthlyRent) || 0;
  const totalPaid = schedule
    .filter((p: any) => p.status === "paid")
    .reduce((s: number, p: any) => s + (Number(p.paidAmount) || 0), 0);
  const outstanding = schedule
    .filter((p: any) => p.status !== "paid")
    .reduce((s: number, p: any) => s + (Number(p.amount) || 0) - (Number(p.paidAmount) || 0), 0);
  const daysRemaining = contract?.endDate
    ? Math.max(0, Math.ceil((new Date(contract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const paymentsColumns: DataTableColumn<any>[] = [
    { key: "installmentNumber", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.installmentNumber}</span> },
    { key: "dueDate", header: "الاستحقاق", sortable: true, render: (r) => formatDateAr(r.dueDate) },
    { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount) || 0)}</span> },
    { key: "paidAmount", header: "المدفوع", sortable: true, render: (r) => formatCurrency(Number(r.paidAmount) || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} domain="rent_payment" /> },
  ];

  const maintColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "title", header: "الموضوع", sortable: true, render: (r) => r.title || r.subject || "-" },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} domain="maintenance" /> },
  ];

  const inspColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || r.inspectionType || "-" },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.inspectionDate || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <PageStatusBadge status={r.status} /> },
  ];

  const overviewContent = () => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="رقم إيجار" value={contract?.ejarNumber} />
          <InfoRow label="المستأجر" value={contract?.tenantName} />
          <InfoRow label="الوحدة" value={contract?.unitNumber} />
          <InfoRow label="المبنى" value={contract?.buildingName} />
          <InfoRow label="تاريخ البداية" value={contract?.startDate ? formatDateAr(contract.startDate) : undefined} />
          <InfoRow label="تاريخ النهاية" value={contract?.endDate ? formatDateAr(contract.endDate) : undefined} />
          <InfoRow label="الإيجار الشهري" value={monthlyRent ? formatCurrency(monthlyRent) : undefined} />
          <InfoRow label="الإيجار السنوي" value={contract?.annualRent ? formatCurrency(Number(contract.annualRent)) : undefined} />
          <InfoRow label="نوع العقد" value={contract?.contractType} />
          <InfoRow label="دورة السداد" value={contract?.paymentFrequency} />
        </div>
        {contract?.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contract.notes}</p>
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
      key: "payments",
      label: "الدفعات",
      icon: Banknote,
      badge: schedule.length || undefined,
      content: () =>
        schedule.length === 0 ? (
          emptyMsg("لا يوجد جدول دفعات لهذا العقد")
        ) : (
          <DataTable columns={paymentsColumns} data={schedule} pageSize={12} emptyMessage="لا توجد دفعات" noToolbar />
        ),
    },
    {
      key: "maintenance",
      label: "طلبات الصيانة",
      icon: Wrench,
      badge: maintRequests.length || undefined,
      content: () =>
        maintRequests.length === 0 ? (
          emptyMsg("لا توجد طلبات صيانة")
        ) : (
          <DataTable columns={maintColumns} data={maintRequests} pageSize={10} emptyMessage="لا توجد طلبات" noToolbar />
        ),
    },
    {
      key: "inspections",
      label: "التفتيش",
      icon: ClipboardCheck,
      badge: inspections.length || undefined,
      content: () =>
        inspections.length === 0 ? (
          emptyMsg("لا توجد تفتيشات")
        ) : (
          <DataTable columns={inspColumns} data={inspections} pageSize={10} emptyMessage="لا توجد تفتيشات" noToolbar />
        ),
    },
    {
      key: "financial",
      label: "الملف المالي",
      icon: DollarSign,
      content: () => (
        <div className="space-y-6">
          <EntityFinancialProfile entityType="contract" entityId={id} />
          <FinancialTab entityType="property" entityId={id} />
        </div>
      ),
    },
    {
      key: "documents",
      label: "المستندات",
      icon: FolderOpen,
      content: () => (
        <div className="space-y-4">
          <EntityObligations entityType="rental-contract" entityId={id} hideWhenEmpty />
          <EntityDocuments entityType="contract" entityId={id} />
        </div>
      ),
    },
    {
      key: "timeline",
      label: "السجل الزمني",
      icon: History,
      content: () => <EntityTimeline entityType="rental-contract" entityId={id} />,
    },
    {
      key: "comments",
      label: "التعليقات",
      icon: MessageCircle,
      content: () => <EntityComments entityType="contract" entityId={id} />,
    },
  ];

  const metaItems = [
    contract?.tenantName && { icon: User, label: contract.tenantName },
    contract?.unitNumber && { icon: MapPin, label: `${contract.unitNumber}${contract.buildingName ? ` - ${contract.buildingName}` : ""}` },
    contract?.startDate && { icon: Calendar, label: `${formatDateAr(contract.startDate)} — ${contract.endDate ? formatDateAr(contract.endDate) : ""}` },
  ].filter(Boolean) as Array<{ icon: any; label: string }>;

  const badges = contract?.status ? <PageStatusBadge status={contract.status} domain="lease" /> : null;

  const notFound = !isLoading && !contract;

  return (
    <>
    <EntityDetailPage
      title={contract?.ejarNumber ? `عقد ${contract.ejarNumber}` : contract ? `عقد #${contract.id}` : notFound ? "العقد غير موجود" : "..."}
      subtitle={contract?.tenantName || undefined}
      avatar={{
        icon: FileText,
        gradientFrom: "from-amber-500",
        gradientTo: "to-orange-600",
      }}
      badges={badges}
      metaItems={metaItems}
      backHref="/properties/contracts"
      backLabel="العودة للعقود"
      isLoading={isLoading}
      isError={isError || notFound}
      errorMessage={notFound ? "لم يتم العثور على العقد المطلوب" : "تعذر تحميل بيانات العقد"}
      onRetry={() => refetch()}
      actions={[
        {
          label: "تجديد",
          icon: RotateCcw,
          variant: "default",
          onClick: async () => {
            try {
              const oldEnd = contract?.endDate || todayLocal();
              const newStart = oldEnd;
              const endDate = new Date(oldEnd);
              endDate.setFullYear(endDate.getFullYear() + 1);
              const newEnd = endDate.toISOString().split("T")[0];

              const { id: _oldId, ...contractData } = contract || {};
              const newContract = await apiFetch<any>("/properties/contracts", {
                method: "POST",
                body: JSON.stringify({
                  ...contractData,
                  startDate: newStart,
                  endDate: newEnd,
                  status: "active",
                }),
              });
              queryClient.invalidateQueries({ queryKey: ["properties-contract"] });
              toast({ title: "تم تجديد العقد بنجاح" });
              const newId = newContract?.id || newContract?.data?.id;
              navigate(newId ? `/properties/contracts/${newId}` : "/properties/contracts");
            } catch (err: any) {
              toast({
                variant: "destructive",
                title: "تعذر تجديد العقد",
                description: err.message || "حدث خطأ أثناء تجديد العقد",
              });
            }
          },
        },
        {
          label: "إنهاء",
          icon: XCircle,
          variant: "outline",
          onClick: () => setTerminateOpen(true),
        },
      ]}
      kpis={[
        {
          label: "الإيجار الشهري",
          value: formatCurrency(monthlyRent),
          icon: DollarSign,
          color: "text-blue-600 bg-blue-50",
        },
        {
          label: "إجمالي المدفوع",
          value: formatCurrency(totalPaid),
          icon: CheckCircle2,
          color: "text-green-600 bg-green-50",
        },
        {
          label: "الرصيد المستحق",
          value: formatCurrency(outstanding),
          icon: Banknote,
          color: "text-orange-600 bg-orange-50",
        },
        {
          label: "أيام متبقية",
          value: daysRemaining,
          icon: Clock,
          color: "text-purple-600 bg-purple-50",
        },
      ]}
      tabs={tabs}
      defaultTab="overview"
    />
    <PromptDialog
      open={terminateOpen}
      title="إنهاء العقد"
      description="يرجى إدخال سبب إنهاء العقد. سيتم تسجيل العقد كمنتهٍ بتاريخ اليوم."
      confirmLabel="تأكيد الإنهاء"
      onSubmit={submitTerminate}
      onClose={() => setTerminateOpen(false)}
    />
    </>
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
