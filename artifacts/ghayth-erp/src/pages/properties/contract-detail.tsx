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
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
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

export default function ContractDetailPage() {
  const [, params] = useRoute("/properties/contracts/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const { hideTabs: registryHideTabs } = useRegistryTabs("rental_contract", id ?? "");
  const queryClient = useQueryClient();

  const { data: contract, isLoading, isError, refetch } = useApiQuery<any>(
    ["properties-contract", id],
    id ? `/properties/contracts/${id}` : null,
    !!id
  );

  const { data: scheduleResp } = useApiQuery<any>(
    ["contract-detail-schedule", id],
    id ? `/properties/contracts/${id}/schedule` : null,
    !!id
  );
  const schedule: any[] = scheduleResp?.data || (Array.isArray(scheduleResp) ? scheduleResp : []);

  const { data: maintResp } = useApiQuery<any>(
    ["contract-maintenance", id],
    id ? `/properties/maintenance?contractId=${id}` : null,
    !!id
  );
  const maintRequests: any[] = maintResp?.data || [];

  const { data: inspResp } = useApiQuery<any>(
    ["contract-inspections", id],
    id ? `/properties/inspections?contractId=${id}` : null,
    !!id
  );
  const inspections: any[] = inspResp?.data || [];

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
    { key: "status", header: "الحالة", sortable: true, render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
  ];

  const maintColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "title", header: "الموضوع", sortable: true, render: (r) => r.title || r.subject || "-" },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
  ];

  const inspColumns: DataTableColumn<any>[] = [
    { key: "id", header: "#", sortable: true, render: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "type", header: "النوع", sortable: true, render: (r) => r.type || r.inspectionType || "-" },
    { key: "date", header: "التاريخ", sortable: true, render: (r) => formatDateAr(r.date || r.inspectionDate || r.createdAt) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => <Badge variant="outline">{r.status || "-"}</Badge> },
  ];

  const emptyMsg = (msg: string) => (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{msg}</CardContent>
    </Card>
  );

  const handleRenew = async () => {
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
  };

  const handleTerminate = async () => {
    // PROP-001: contract termination goes through the dedicated /terminate
    // endpoint — the server rejects a terminal status set via raw PATCH with
    // 409. /terminate runs the audited applyTransition (frees the unit,
    // settles early-termination fees) and requires a non-empty reason.
    const reason = window.prompt("سبب إنهاء العقد:");
    if (reason === null) return; // user dismissed the prompt
    if (!reason.trim()) {
      toast({ variant: "destructive", title: "سبب الإنهاء مطلوب" });
      return;
    }
    try {
      await apiFetch(`/properties/contracts/${id}/terminate`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim(),
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

  const overview = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-info-foreground bg-status-info-surface">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(monthlyRent)}</p>
              <p className="text-xs text-muted-foreground truncate">الإيجار الشهري</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-status-success-foreground bg-status-success-surface">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-muted-foreground truncate">إجمالي المدفوع</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-orange-600 bg-orange-50">
              <Banknote className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{formatCurrency(outstanding)}</p>
              <p className="text-xs text-muted-foreground truncate">الرصيد المستحق</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-purple-600 bg-purple-50">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold truncate">{daysRemaining}</p>
              <p className="text-xs text-muted-foreground truncate">أيام متبقية</p>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm text-status-neutral-foreground whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <GuardedButton perm="properties:create" size="sm" onClick={handleRenew} className="gap-1" rateLimitAware>
        <RotateCcw className="h-4 w-4" />
        تجديد
      </GuardedButton>
      <GuardedButton perm="properties:create" size="sm" variant="outline" onClick={handleTerminate} className="gap-1" rateLimitAware>
        <XCircle className="h-4 w-4" />
        إنهاء
      </GuardedButton>
    </div>
  );

  const statusTone = contract?.status === "active" ? "success" as const
    : contract?.status === "terminated" ? "destructive" as const
    : contract?.status === "expired" ? "warning" as const
    : "default" as const;

  const extraTabs: ExtraTab[] = [
    {
      key: "payments",
      label: "الدفعات",
      icon: Banknote,
      badge: schedule.length || undefined,
      content: () =>
        schedule.length === 0
          ? emptyMsg("لا يوجد جدول دفعات لهذا العقد")
          : <DataTable columns={paymentsColumns} data={schedule} pageSize={12} emptyMessage="لا توجد دفعات" noToolbar />,
    },
    {
      key: "maintenance",
      label: "طلبات الصيانة",
      icon: Wrench,
      badge: maintRequests.length || undefined,
      content: () =>
        maintRequests.length === 0
          ? emptyMsg("لا توجد طلبات صيانة")
          : <DataTable columns={maintColumns} data={maintRequests} pageSize={10} emptyMessage="لا توجد طلبات" noToolbar />,
    },
    {
      key: "inspections",
      label: "التفتيش",
      icon: ClipboardCheck,
      badge: inspections.length || undefined,
      content: () =>
        inspections.length === 0
          ? emptyMsg("لا توجد تفتيشات")
          : <DataTable columns={inspColumns} data={inspections} pageSize={10} emptyMessage="لا توجد تفتيشات" noToolbar />,
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
  ];

  return (
    <DetailPageLayout
      title={contract?.ejarNumber ? `عقد ${contract.ejarNumber}` : contract ? `عقد #${contract.id}` : "العقد"}
      subtitle={contract?.tenantName || undefined}
      backPath="/properties/contracts"
      backLabel="العودة للعقود"
      status={contract?.status ? { label: contract.status, tone: statusTone } : undefined}
      entityType="rental_contract"
      entityId={id}
      hideTabs={registryHideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={contract?.createdAt}
      updatedAt={contract?.updatedAt}
      overview={overview}
      actions={actions}
      extraTabs={extraTabs}
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
