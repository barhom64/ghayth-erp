import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApiQuery, apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  DetailPageLayout,
  type ExtraTab,
  EntityDocuments,
  PROPERTY_ATTACHMENT_CATEGORIES,
} from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { PropertyAlertsPanel, buildContractAlerts } from "@/components/shared/property-alerts-panel";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  Scale,
} from "lucide-react";

export default function ContractDetailPage() {
  const [, params] = useRoute("/properties/contracts/:id");
  const [, navigate] = useLocation();
  const id = params?.id || "";
  const { hideTabs: registryHideTabs } = useRegistryTabs("rental_contract", id ?? "");
  const queryClient = useQueryClient();

  const [payDialog, setPayDialog] = useState<{ paymentId: number; amount: number } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);

  const [legalOpen, setLegalOpen] = useState(false);
  // caseType is a free string on the backend (z.string().optional()); values
  // below mirror the common Arabic court taxonomy — no server-side enum constraint.
  const [legalForm, setLegalForm] = useState({ caseType: "rental_dispute", description: "", priority: "medium" });
  const [legalSaving, setLegalSaving] = useState(false);

  const { data: contract, isLoading, isError, refetch } = useApiQuery<any>(
    ["properties-contract", id],
    id ? `/properties/contracts/${id}` : null,
    !!id
  );

  // PATCH /properties/contracts/:id is blocked by the backend once the
  // contract leaves the active lifecycle (terminated/expired/etc.) — the
  // hook hides the Edit button below in those cases via the disabled
  // check on the contract status; the server still enforces the same
  // rule even if a privileged user bypasses the UI.
  const isContractLocked = !!contract && ["terminated", "expired", "cancelled", "renewed"].includes(contract.status as string);
  const editDelete = useDetailEditDelete({
    entityLabel: "العقد",
    patchPath: `/properties/contracts/${id}`,
    deletePath: `/properties/contracts/${id}`,
    listPath: "/properties/contracts",
    initialValues: contract,
    fields: [
      { key: "tenantName", label: "اسم المستأجر" },
      { key: "tenantPhone", label: "الهاتف" },
      { key: "tenantEmail", label: "البريد" },
      { key: "monthlyRent", label: "الإيجار الشهري", type: "number" },
      { key: "depositAmount", label: "مبلغ التأمين", type: "number" },
      { key: "paymentDay", label: "يوم السداد", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["properties-contract", id], ["properties-contracts"]],
    onSaved: () => refetch(),
  });

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
    { key: "dueDate", header: "الاستحقاق", sortable: true, render: (r) => {
      const overdue = r.status !== "paid" && new Date(r.dueDate) < new Date();
      const upcoming = r.status !== "paid" && !overdue && new Date(r.dueDate) <= new Date(Date.now() + 7 * 86400000);
      return (
        <span className={overdue ? "text-red-600 font-semibold" : upcoming ? "text-amber-600 font-medium" : r.status === "paid" ? "text-emerald-600" : ""}>
          {formatDateAr(r.dueDate)}
        </span>
      );
    }},
    { key: "amount", header: "المبلغ", sortable: true, render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount) || 0)}</span> },
    { key: "paidAmount", header: "المدفوع", sortable: true, render: (r) => formatCurrency(Number(r.paidAmount) || 0) },
    { key: "status", header: "الحالة", sortable: true, render: (r) => {
      const overdue = r.status !== "paid" && new Date(r.dueDate) < new Date();
      return <Badge variant="outline" className={overdue ? "border-red-200 text-red-600 bg-red-50" : r.status === "paid" ? "border-emerald-200 text-emerald-600 bg-emerald-50" : ""}>{r.status || "-"}</Badge>;
    }},
    { key: "_pay", header: "", render: (r) => r.status !== "paid" ? (
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
        onClick={() => { setPayDialog({ paymentId: r.id, amount: Number(r.amount) || 0 }); setPayAmount(String(Number(r.amount) || 0)); }}
      >
        تحصيل
      </Button>
    ) : null },
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

  async function handleReferToLegal() {
    if (!contract) return;
    setLegalSaving(true);
    try {
      const overdueAmt = schedule
        .filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date())
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      await apiFetch("/legal/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `إخلاء مستأجر — ${contract.tenantName} — وحدة ${contract.unitNumber || ""}`,
          caseType: legalForm.caseType,
          opposingParty: contract.tenantName,
          priority: legalForm.priority,
          description: legalForm.description || `إحالة من عقد إيجار رقم ${contract.ejarNumber || contract.id}`,
          notes: `عقد: ${contract.ejarNumber || contract.id} | وحدة: ${contract.unitNumber || ""} | متأخرات: ${overdueAmt.toLocaleString("ar-SA")} ريال | هاتف: ${contract.tenantPhone || "—"}`,
          filingDate: todayLocal(),
        }),
      });
      toast({ title: "تم إنشاء القضية في النظام القانوني" });
      setLegalOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل إنشاء القضية", description: err.message });
    } finally {
      setLegalSaving(false);
    }
  }

  async function handlePay() {
    if (!payDialog) return;
    setPaying(true);
    try {
      await apiFetch(`/properties/payments/${payDialog.paymentId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAmount: Number(payAmount) || payDialog.amount,
          method: payMethod,
          notes: payNotes || undefined,
        }),
      });
      toast({ title: "تم تسجيل الدفعة بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["properties-contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contract-detail-schedule", id] });
      setPayDialog(null);
      setPayAmount("");
      setPayNotes("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل تسجيل الدفعة", description: err.message });
    } finally {
      setPaying(false);
    }
  }

  const handleRenew = async () => {
    // Use the dedicated /renew endpoint — it runs the audited
    // applyTransition, generates the new installments and resets
    // obligations correctly. The previous code cloned the row via raw
    // POST /properties/contracts which skipped all that side-effect.
    // Empty body → backend defaults to the contract's existing
    // renewalPeriodMonths (or 12) and the current endDate as the new
    // start. Frontend can later prompt for overrides if needed.
    try {
      const result = await apiFetch<any>(`/properties/contracts/${id}/renew`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      queryClient.invalidateQueries({ queryKey: ["properties-contract", id] });
      queryClient.invalidateQueries({ queryKey: ["properties-contracts"] });
      toast({ title: "تم تجديد العقد بنجاح" });
      // The endpoint returns the updated contract (or a new id if the
      // backend chose to chain a successor row). Navigate accordingly.
      const newId = result?.id || result?.data?.id;
      if (newId && newId !== Number(id)) {
        navigate(`/properties/contracts/${newId}`);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذر تجديد العقد",
        description: err.message || "حدث خطأ أثناء تجديد العقد",
      });
    }
  };

  // Termination dialog state — replaces window.prompt with a styled
  // Textarea since the reason becomes part of the audit trail.
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const handleTerminate = () => {
    setTerminateReason("");
    setTerminateOpen(true);
  };
  const confirmTerminate = async () => {
    if (!terminateReason.trim()) {
      toast({ variant: "destructive", title: "سبب الإنهاء مطلوب" });
      return;
    }
    setTerminateOpen(false);
    try {
      // PROP-001: contract termination goes through the dedicated /terminate
      // endpoint — the server rejects a terminal status set via raw PATCH
      // with 409. /terminate runs the audited applyTransition (frees the
      // unit, settles early-termination fees) and requires a non-empty
      // reason — the same constraint enforced client-side above.
      await apiFetch(`/properties/contracts/${id}/terminate`, {
        method: "POST",
        body: JSON.stringify({
          reason: terminateReason.trim(),
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

  const contractAlerts = contract ? buildContractAlerts({ contract, schedule, maintRequests }) : [];

  const overview = (
    <div className="space-y-4">
      <PropertyAlertsPanel alerts={contractAlerts} />
      <InlineEditCard hook={editDelete} />
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
            <InfoRow label="مصدر العقد" value={
              contract?.contractSource === "ejar" ? "منصة إيجار" :
              contract?.contractSource === "manual" ? "إدخال يدوي" :
              contract?.contractSource === "file_import" ? "استيراد ملف" :
              contract?.contractSource === "ejar_later" ? "إيجار لاحقاً" :
              contract?.contractSource === "migrated" ? "مرحّل من نظام قديم" :
              contract?.contractSource || "—"
            } />
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
      <GuardedButton perm="legal.cases:create" size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setLegalOpen(true)}>
        <Scale className="h-4 w-4" />
        إحالة قانونية
      </GuardedButton>
      <PrintButton entityType="rental_contract" entityId={id ?? ""} />
      {!isContractLocked && (
        <DetailActionButtons hook={editDelete} editPerm="properties:update" deletePerm="properties:delete" />
      )}
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
      key: "attachments",
      label: "المرفقات",
      icon: FolderOpen,
      content: () => (
        <EntityDocuments
          entityType="rental_contract"
          entityId={Number(id)}
          title="مرفقات العقد"
          categories={PROPERTY_ATTACHMENT_CATEGORIES}
          defaultCategory="contract_pdf"
          quickUpload
          viewMode="grid"
        />
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
  ];

  return (
    <>
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
    <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنهاء العقد</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الإنهاء (مطلوب)</Label>
          <Textarea
            value={terminateReason}
            onChange={(e) => setTerminateReason(e.target.value)}
            rows={3}
            placeholder="…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTerminateOpen(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={confirmTerminate} rateLimitAware>تأكيد الإنهاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل تحصيل دفعة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">المبلغ المحصل (ريال)</Label>
            <Input
              type="number"
              className="h-9"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
            />
            {payDialog && Number(payAmount) < payDialog.amount && Number(payAmount) > 0 && (
              <p className="text-xs text-amber-600 mt-1">دفعة جزئية — الباقي {formatCurrency(payDialog.amount - Number(payAmount))}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
                <SelectItem value="online">دفع إلكتروني</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Input className="h-9" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="رقم التحويل، رقم الشيك..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPayDialog(null)}>إلغاء</Button>
          <Button size="sm" onClick={handlePay} disabled={paying || !payAmount || Number(payAmount) <= 0} className="gap-1" rateLimitAware>
            {paying ? "جاري الحفظ..." : "تسجيل التحصيل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={legalOpen} onOpenChange={setLegalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إحالة قانونية — {contract?.tenantName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs">
            سيُنشئ هذا الإجراء قضية في وحدة القانونية مرتبطة بهذا العقد وبيانات المستأجر.
          </div>
          <div>
            <Label className="text-xs">نوع القضية</Label>
            <Select value={legalForm.caseType} onValueChange={v => setLegalForm(f => ({ ...f, caseType: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rental_dispute">نزاع إيجاري — إخلاء / مطالبة</SelectItem>
                <SelectItem value="civil">مدنية — مطالبة مالية عامة</SelectItem>
                <SelectItem value="commercial">تجارية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الأولوية</Label>
            <Select value={legalForm.priority} onValueChange={v => setLegalForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="medium">متوسطة</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="critical">حرجة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">وصف الإحالة (اختياري)</Label>
            <Textarea
              rows={3}
              value={legalForm.description}
              onChange={e => setLegalForm(f => ({ ...f, description: e.target.value }))}
              placeholder="سبب الإحالة، تفاصيل المشكلة..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setLegalOpen(false)}>إلغاء</Button>
          <Button size="sm" variant="destructive" onClick={handleReferToLegal} disabled={legalSaving} className="gap-1">
            <Scale className="h-4 w-4" />
            {legalSaving ? "جاري الإنشاء..." : "إنشاء القضية"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
