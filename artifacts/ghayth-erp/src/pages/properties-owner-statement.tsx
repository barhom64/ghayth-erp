import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import {
  Receipt, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Wrench, Crown, FileText, Calendar, Banknote, CheckCircle, History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";

import { PropertyTabsNav } from "@/components/shared/property-tabs-nav";
interface OwnerOption {
  id: number;
  name: string;
  phone?: string;
  unitCount?: number | string;
}

interface RentRow {
  unitId: number;
  unitNumber: string;
  buildingName: string | null;
  contractId: number;
  contractNumber: string | null;
  tenantName: string;
  totalDue: string | number;
  totalCollected: string | number;
  outstanding: string | number;
}

interface OutstandingRow {
  id: number;
  contractId: number;
  dueDate: string;
  amount: string | number;
  paidAmount: string | number;
  outstanding: string | number;
  daysPastDue: number | string;
  unitNumber: string;
  buildingName: string | null;
  tenantName: string;
}

interface MaintRow {
  id: number;
  category: string | null;
  description: string;
  actualCost: string | number | null;
  estimatedCost: string | number | null;
  completedAt: string | null;
  status: string;
  unitId: number;
  unitNumber: string;
  buildingName: string | null;
}

interface OwnerStatement {
  owner: {
    id: number;
    name: string;
    nationalId?: string;
    crNumber?: string;
    iban?: string;
    bankName?: string;
    authorizationNumber?: string;
    authorizationExpiry?: string;
  };
  period: { from: string; to: string };
  commission: { rate: number; amount: number };
  summary: {
    totalRentDue: number;
    totalRentCollected: number;
    totalRentOutstanding: number;
    totalMaintenance: number;
    commissionAmount: number;
    netDueToOwner: number;
    unitsCount: number;
    outstandingPaymentsCount: number;
    maintenanceCount: number;
  };
  rentByUnit: RentRow[];
  outstandingPayments: OutstandingRow[];
  maintenance: MaintRow[];
}

function firstOfMonth(): string {
  return `${todayLocal().slice(0, 7)}-01`;
}

interface PayoutRow {
  id: number;
  period: string;
  fromDate: string;
  toDate: string;
  totalRentCollected: string | number;
  totalMaintenance: string | number;
  commissionRate: string | number;
  commissionAmount: string | number;
  netAmount: string | number;
  paymentMethod: string;
  reference: string | null;
  paidAt: string;
  journalEntryId: number | null;
  notes: string | null;
  createdAt: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقدي",
  cheque: "شيك",
  other: "أخرى",
};

export default function PropertiesOwnerStatement() {
  // Auto-select owner when navigated from owner detail page (?ownerId=X)
  const initialOwnerId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("ownerId") ?? ""
    : "";
  const [ownerId, setOwnerId] = useState<string>(initialOwnerId);
  const [from, setFrom] = useState<string>(firstOfMonth());
  const [to, setTo] = useState<string>(todayLocal());
  const [commissionOverride, setCommissionOverride] = useState<string>("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState<string>("");
  const [payoutNotes, setPayoutNotes] = useState<string>("");
  const { toast } = useToast();

  const { data: ownersResp } = useApiQuery<{ data: OwnerOption[] } | OwnerOption[]>(
    ["property-owners-picker"],
    "/properties/owners?limit=500",
  );
  const owners: OwnerOption[] = Array.isArray(ownersResp)
    ? ownersResp
    : (ownersResp?.data ?? []);

  const { data, isLoading, isError, error, refetch } = useApiQuery<OwnerStatement>(
    ["owner-statement", ownerId, from, to, commissionOverride],
    ownerId
      ? `/properties/owners/${ownerId}/statement?from=${from}&to=${to}${commissionOverride ? `&commissionRate=${commissionOverride}` : ""}`
      : null,
  );

  const { data: payoutsResp, refetch: refetchPayouts } = useApiQuery<{ data: PayoutRow[] }>(
    ["owner-payouts", ownerId],
    ownerId ? `/properties/owners/${ownerId}/payouts` : null,
  );
  const payouts: PayoutRow[] = payoutsResp?.data ?? [];
  // Snapshot the period the operator is currently looking at — used to
  // detect "already paid out" and to fill the payout dialog defaults.
  const currentPeriod = from.slice(0, 7);
  const alreadyPaidForPeriod = payouts.find((p) => p.period === currentPeriod);

  const recordPayoutMut = useApiMutation<
    { id: number; journalEntryId: number | null },
    {
      period: string; fromDate: string; toDate: string;
      totalRentCollected: number; totalMaintenance: number;
      commissionRate: number; commissionAmount: number; netAmount: number;
      paymentMethod: string; reference?: string; notes?: string;
    }
  >(
    () => `/properties/owners/${ownerId}/payouts`,
    "POST",
    [["owner-payouts", ownerId]],
    {
      successMessage: "تم تسجيل سداد المالك",
      onSuccess: () => {
        setPayoutOpen(false);
        setReference("");
        setPayoutNotes("");
        refetchPayouts();
      },
    },
  );

  const rentColumns: DataTableColumn<RentRow>[] = [
    { key: "unitNumber", header: "الوحدة", sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium">{r.unitNumber}</span>
          {r.buildingName && <span className="text-muted-foreground"> — {r.buildingName}</span>}
        </span>
      ) },
    { key: "tenantName", header: "المستأجر", render: (r) => r.tenantName },
    { key: "contractNumber", header: "رقم العقد", render: (r) => r.contractNumber || "-" },
    { key: "totalDue", header: "المستحق", sortable: true,
      render: (r) => formatCurrency(Number(r.totalDue)) },
    { key: "totalCollected", header: "المُحصَّل", sortable: true,
      render: (r) => <span className="text-green-700 font-medium">{formatCurrency(Number(r.totalCollected))}</span> },
    { key: "outstanding", header: "المتبقي", sortable: true,
      render: (r) => {
        const v = Number(r.outstanding);
        return v > 0 ? <span className="text-red-700 font-medium">{formatCurrency(v)}</span> : <span className="text-muted-foreground">—</span>;
      } },
  ];

  const outstandingColumns: DataTableColumn<OutstandingRow>[] = [
    { key: "unitNumber", header: "الوحدة",
      render: (r) => <span className="font-medium">{r.unitNumber}</span> },
    { key: "tenantName", header: "المستأجر" },
    { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => formatDateAr(r.dueDate) },
    { key: "daysPastDue", header: "أيام التأخر", sortable: true,
      render: (r) => {
        const d = Number(r.daysPastDue);
        if (d <= 0) return <span className="text-muted-foreground">-</span>;
        const cls = d > 30 ? "text-red-700 font-bold" : d > 14 ? "text-orange-700 font-medium" : "text-amber-700";
        return <span className={cls}>{d} يوم</span>;
      } },
    { key: "outstanding", header: "المتبقي", sortable: true,
      render: (r) => <span className="text-red-700 font-medium">{formatCurrency(Number(r.outstanding))}</span> },
  ];

  const maintColumns: DataTableColumn<MaintRow>[] = [
    { key: "unitNumber", header: "الوحدة",
      render: (r) => <span className="font-medium">{r.unitNumber}</span> },
    { key: "category", header: "النوع", render: (r) => r.category || "-" },
    { key: "description", header: "الوصف",
      render: (r) => <span className="line-clamp-1">{r.description}</span> },
    { key: "completedAt", header: "تاريخ الإنجاز",
      render: (r) => r.completedAt ? formatDateAr(r.completedAt) : "-" },
    { key: "actualCost", header: "التكلفة",
      render: (r) => formatCurrency(Number(r.actualCost || 0)) },
  ];

  const summary = data?.summary;

  return (
    <PageShell
      title="كشف حساب المالك"
      subtitle="إيرادات + مصاريف + عمولة الإدارة + الصافي المستحق للمالك"
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "العقارات", href: "/properties/dashboard" },
        { label: "كشف حساب المالك" },
      ]}
      actions={
        ownerId && data && summary ? (
          <PrintButton
            entityType="report_owner_statement"
            entityId="list"
            size="icon"
            label="طباعة كشف حساب المالك"
            payload={() => ({
              entity: {
                title: `كشف حساب المالك — ${data.owner.name}`,
                ownerName: data.owner.name,
                iban: data.owner.iban || "—",
                bankName: data.owner.bankName || "—",
                periodFrom: formatDateAr(data.period.from),
                periodTo: formatDateAr(data.period.to),
                totalRent: summary.totalRentDue,
                totalCollected: summary.totalRentCollected,
                totalOutstanding: summary.totalRentOutstanding,
                totalMaintenance: summary.totalMaintenance,
                commissionAmount: summary.commissionAmount,
                netDueToOwner: summary.netDueToOwner,
                totalUnits: data.rentByUnit?.length ?? 0,
              },
              sections: [
                {
                  title: "الإيرادات حسب الوحدة",
                  rows: (data.rentByUnit ?? []).map((u: any) => ({
                    "رقم الوحدة": u.unitNumber || "—",
                    "المستأجر": u.tenantName || "—",
                    "رقم العقد": u.contractNumber || "—",
                    "المستحق": Number(u.totalDue || 0),
                    "المحصل": Number(u.totalCollected || 0),
                    "المتأخر": Number(u.outstanding || 0),
                  })),
                },
                {
                  title: "المدفوعات المتأخرة",
                  rows: (data.outstandingPayments ?? []).map((p: any) => ({
                    "رقم الوحدة": p.unitNumber || "—",
                    "المستأجر": p.tenantName || "—",
                    "تاريخ الاستحقاق": p.dueDate ? formatDateAr(p.dueDate) : "—",
                    "أيام التأخير": p.daysPastDue ?? 0,
                    "المتأخر": Number(p.outstanding || 0),
                  })),
                },
                {
                  title: "مصاريف الصيانة",
                  rows: (data.maintenance ?? []).map((m: any) => ({
                    "رقم الوحدة": m.unitNumber || "—",
                    "التصنيف": m.category || "—",
                    "الوصف": m.description || "—",
                    "تاريخ الإنجاز": m.completedAt ? formatDateAr(m.completedAt) : "—",
                    "التكلفة": Number(m.actualCost || 0),
                  })),
                },
                {
                  title: "سجل المدفوعات السابقة للمالك",
                  rows: payouts.map((p: any) => ({
                    "الفترة": p.period || "—",
                    "تاريخ الدفع": p.paidAt ? formatDateAr(p.paidAt) : "—",
                    "الصافي": Number(p.netAmount || 0),
                    "العمولة": Number(p.commissionAmount || 0),
                    "طريقة الدفع": p.paymentMethod || "—",
                    "المرجع": p.reference || "—",
                  })),
                },
              ],
            })}
          />
        ) : undefined
      }
    >
      <PropertyTabsNav />
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label>المالك</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مالكاً" />
                </SelectTrigger>
                <SelectContent>
                  {owners.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">لا يوجد ملاك</div>
                  ) : owners.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}{o.unitCount ? ` (${o.unitCount} وحدة)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>إلى</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>نسبة العمولة % (اختياري)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="افتراضي من الإعدادات"
                value={commissionOverride}
                onChange={(e) => setCommissionOverride(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!ownerId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            اختر مالكاً لعرض كشف الحساب
          </CardContent>
        </Card>
      )}

      {ownerId && isLoading && <LoadingSpinner />}
      {ownerId && isError && <ErrorState error={error} onRetry={refetch} />}

      {ownerId && data && summary && (
        <>
          <Card className="mb-4 border-2 border-green-200 bg-green-50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Crown className="h-4 w-4" /> {data.owner.name}
                  </div>
                  {data.owner.iban && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      IBAN: {data.owner.iban}
                      {data.owner.bankName && <span> — {data.owner.bankName}</span>}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    <Calendar className="inline h-3 w-3 ml-1" />
                    {formatDateAr(data.period.from)} → {formatDateAr(data.period.to)}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-sm text-muted-foreground">الصافي المستحق للمالك</div>
                  <div className={`text-5xl font-bold ${summary.netDueToOwner >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(summary.netDueToOwner)}
                  </div>
                  {alreadyPaidForPeriod ? (
                    <Badge className="mt-2 bg-green-200 text-green-900 border-green-300 inline-flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      مدفوع — {formatDateAr(alreadyPaidForPeriod.paidAt)}
                    </Badge>
                  ) : summary.netDueToOwner > 0 ? (
                    <GuardedButton
                      perm="properties.owners:create"
                      className="mt-3"
                      onClick={() => setPayoutOpen(true)}
                    >
                      <Banknote className="h-4 w-4 ml-1" />
                      تسجيل سداد {formatCurrency(summary.netDueToOwner)}
                    </GuardedButton>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> المستحق
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCurrency(summary.totalRentDue)}</div>
                <div className="text-xs text-muted-foreground">{summary.unitsCount} وحدة</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <Wallet className="h-3 w-3 text-green-600" /> المُحصَّل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-700">{formatCurrency(summary.totalRentCollected)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-amber-600" /> المتأخرات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-700">{formatCurrency(summary.totalRentOutstanding)}</div>
                <div className="text-xs text-muted-foreground">{summary.outstandingPaymentsCount} دفعة</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <Wrench className="h-3 w-3 text-orange-600" /> الصيانة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-orange-700">{formatCurrency(summary.totalMaintenance)}</div>
                <div className="text-xs text-muted-foreground">{summary.maintenanceCount} عملية</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardContent className="py-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">إجمالي التحصيل</span>
                  <span className="font-medium">{formatCurrency(summary.totalRentCollected)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- مصاريف صيانة</span>
                  <span className="font-medium text-orange-700">{formatCurrency(summary.totalMaintenance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- عمولة إدارة ({data.commission.rate}%)</span>
                  <span className="font-medium text-blue-700">{formatCurrency(data.commission.amount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" /> الإيجارات حسب الوحدة ({data.rentByUnit.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable data={data.rentByUnit} columns={rentColumns} emptyMessage="لا توجد إيجارات في الفترة" />
            </CardContent>
          </Card>

          {data.outstandingPayments.length > 0 && (
            <Card className="mb-4 border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-800">
                  <AlertTriangle className="h-4 w-4" /> دفعات متأخرة ({data.outstandingPayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={data.outstandingPayments} columns={outstandingColumns} />
              </CardContent>
            </Card>
          )}

          {data.maintenance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4" /> مصاريف الصيانة ({data.maintenance.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={data.maintenance} columns={maintColumns} />
              </CardContent>
            </Card>
          )}

          {payouts.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4" /> دفعات سابقة ({payouts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={payouts}
                  columns={[
                    { key: "period", header: "الفترة",
                      render: (p) => <span className="font-mono">{p.period}</span> },
                    { key: "paidAt", header: "تاريخ السداد",
                      render: (p) => formatDateAr(p.paidAt) },
                    { key: "netAmount", header: "المبلغ", sortable: true,
                      render: (p) => <span className="font-medium text-green-700">{formatCurrency(Number(p.netAmount))}</span> },
                    { key: "commissionAmount", header: "العمولة",
                      render: (p) => <span className="text-blue-700">{formatCurrency(Number(p.commissionAmount))} ({Number(p.commissionRate).toFixed(1)}%)</span> },
                    { key: "paymentMethod", header: "طريقة الدفع",
                      render: (p) => <Badge variant="outline">{PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</Badge> },
                    { key: "reference", header: "المرجع",
                      render: (p) => p.reference || <span className="text-muted-foreground">—</span> },
                    { key: "journalEntryId", header: "القيد",
                      render: (p) => p.journalEntryId
                        ? <span className="font-mono text-xs text-muted-foreground">#{p.journalEntryId}</span>
                        : <span className="text-amber-600 text-xs">معلق</span> },
                  ] as DataTableColumn<PayoutRow>[]}
                />
              </CardContent>
            </Card>
          )}

          <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  تسجيل سداد للمالك
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">المالك</span>
                    <span className="font-medium">{data.owner.name}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">الفترة ({currentPeriod})</span>
                    <span className="font-mono text-xs">{formatDateAr(from)} → {formatDateAr(to)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-green-200">
                    <span>المبلغ</span>
                    <span className="text-green-700">{formatCurrency(summary.netDueToOwner)}</span>
                  </div>
                  {data.owner.iban && (
                    <div className="text-xs text-muted-foreground font-mono mt-2 text-center">
                      {data.owner.iban} — {data.owner.bankName || ""}
                    </div>
                  )}
                </div>

                <div>
                  <Label>طريقة الدفع</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                      <SelectItem value="cash">نقدي</SelectItem>
                      <SelectItem value="cheque">شيك</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>المرجع (رقم تحويل / شيك)</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="اختياري"
                    maxLength={120}
                  />
                </div>

                <div>
                  <Label>ملاحظات</Label>
                  <Textarea
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    rows={2}
                    placeholder="اختياري"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayoutOpen(false)}>إلغاء</Button>
                <Button
                  disabled={recordPayoutMut.isPending}
                  onClick={() =>
                    recordPayoutMut.mutate({
                      period: currentPeriod,
                      fromDate: from,
                      toDate: to,
                      totalRentCollected: summary.totalRentCollected,
                      totalMaintenance: summary.totalMaintenance,
                      commissionRate: data.commission.rate,
                      commissionAmount: summary.commissionAmount,
                      netAmount: summary.netDueToOwner,
                      paymentMethod,
                      reference: reference || undefined,
                      notes: payoutNotes || undefined,
                    })
                  }
                >
                  {recordPayoutMut.isPending ? "جاري التسجيل..." : "تأكيد السداد"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="mt-6 text-xs text-muted-foreground bg-muted/30 p-4 rounded-md flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">طريقة الحساب</div>
              <ul className="list-disc pr-4 space-y-0.5">
                <li>التحصيل = مجموع <code>paidAmount</code> من <code>rent_payments</code> ضمن الفترة على وحدات المالك.</li>
                <li>الصيانة = مجموع <code>actualCost</code> من طلبات الصيانة المُنجزة في الفترة على وحدات المالك.</li>
                <li>العمولة = نسبة من إجمالي المُحصَّل (أولوية: query &gt; إعدادات الشركة &gt; 5%).</li>
                <li>الصافي = التحصيل - الصيانة - العمولة.</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
