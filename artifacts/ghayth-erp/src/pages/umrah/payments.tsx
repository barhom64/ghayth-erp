import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
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
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { Banknote, Plus, Wallet, TrendingUp, Users } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "تحويل بنكي",
  cash: "نقدي",
  cheque: "شيك",
  online: "إلكتروني",
  other: "أخرى",
};

interface PaymentRow {
  id: number;
  ref: string | null;
  subAgentId: number;
  subAgentName: string | null;
  amount: string | number;
  currency: string;
  sarAmount: string | number;
  exchangeRate: string | number | null;
  method: string;
  externalReference: string | null;
  paymentDate: string;
  journalEntryId: number | null;
  notes: string | null;
  createdAt: string;
}

interface SubAgentOption {
  id: number;
  name: string;
  nuskCode: string | null;
}

export default function UmrahPayments() {
  const [filters, setFilters] = useFilters();
  const [createOpen, setCreateOpen] = useState(false);
  const [subAgentId, setSubAgentId] = useState<string>("");
  const [sarAmount, setSarAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("SAR");
  const [amount, setAmount] = useState<string>("");
  const [exchangeRate, setExchangeRate] = useState<string>("");
  const [method, setMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState<string>("");

  const { data, isLoading, isError, error, refetch } = useApiQuery<{ data: PaymentRow[] }>(
    ["umrah-payments"],
    "/umrah/payments",
  );

  const { data: subAgentsResp } = useApiQuery<{ data: SubAgentOption[] } | SubAgentOption[]>(
    ["umrah-sub-agents-picker"],
    "/umrah/sub-agents?limit=500",
  );
  const subAgents = asList<SubAgentOption>(subAgentsResp);

  const createMut = useApiMutation<
    { paymentId: number; ref: string | null; journalEntryId: number | null },
    {
      subAgentId: number;
      sarAmount: number;
      currency?: string;
      amount?: number;
      exchangeRate?: number;
      method?: string;
      reference?: string;
    }
  >(
    () => "/umrah/payments",
    "POST",
    [["umrah-payments"]],
    {
      successMessage: "تم تسجيل الدفعة",
      onSuccess: () => {
        setCreateOpen(false);
        setSubAgentId("");
        setSarAmount("");
        setAmount("");
        setExchangeRate("");
        setReference("");
        setCurrency("SAR");
        setMethod("bank_transfer");
      },
    },
  );

  const payments = asList<PaymentRow>(data?.data ?? data);

  // KPIs over filtered rows so totals reflect the operator's current scope.
  const filtered = applyFilters(payments, filters, {
    searchFields: ["ref", "subAgentName", "externalReference"],
    statusField: "method",
    dateField: "paymentDate",
  });

  const totalSar = filtered.reduce((s, p) => s + Number(p.sarAmount || 0), 0);
  const uniqueSubAgents = new Set(filtered.map((p) => p.subAgentId)).size;
  const totalRecords = filtered.length;

  const columns: DataTableColumn<PaymentRow>[] = [
    { key: "ref", header: "المرجع", sortable: true,
      render: (p) => <span className="font-mono">{p.ref || "-"}</span> },
    { key: "paymentDate", header: "تاريخ الدفع", sortable: true,
      render: (p) => formatDateAr(p.paymentDate) },
    { key: "subAgentName", header: "الوكيل الفرعي", sortable: true,
      render: (p) => <span className="font-medium">{p.subAgentName || `#${p.subAgentId}`}</span> },
    { key: "sarAmount", header: "المبلغ (ر.س)", sortable: true,
      render: (p) => <span className="font-medium text-green-700">{formatCurrency(Number(p.sarAmount))}</span> },
    { key: "amount", header: "العملة الأصلية",
      render: (p) => p.currency === "SAR" ? <span className="text-muted-foreground">—</span> : (
        <span>{formatCurrency(Number(p.amount))} {p.currency}</span>
      ) },
    { key: "exchangeRate", header: "سعر الصرف",
      render: (p) => p.exchangeRate ? <span>{Number(p.exchangeRate).toFixed(4)}</span> : <span className="text-muted-foreground">—</span> },
    { key: "method", header: "طريقة الدفع",
      render: (p) => <Badge variant="outline">{PAYMENT_METHOD_LABELS[p.method] || p.method}</Badge> },
    { key: "externalReference", header: "رقم خارجي",
      render: (p) => p.externalReference || <span className="text-muted-foreground">—</span> },
    { key: "journalEntryId", header: "القيد",
      render: (p) => p.journalEntryId
        ? <span className="font-mono text-xs text-muted-foreground">#{p.journalEntryId}</span>
        : <span className="text-amber-600 text-xs">معلق</span> },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <PageShell
      title="مدفوعات العمرة"
      subtitle="مدفوعات الوكلاء الفرعيين على فواتير المبيعات"
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "العمرة", href: "/umrah" },
        { label: "المدفوعات" },
      ]}
      actions={
        <GuardedButton
          perm="umrah:create"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 ml-1" /> تسجيل دفعة
        </GuardedButton>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Wallet className="h-3 w-3" /> إجمالي المُحصَّل (ر.س)
            </div>
            <div className="text-2xl font-bold text-green-700">{formatCurrency(totalSar)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3" /> عدد الدفعات
            </div>
            <div className="text-2xl font-bold">{totalRecords}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Users className="h-3 w-3" /> وكلاء فرعيون
            </div>
            <div className="text-2xl font-bold">{uniqueSubAgents}</div>
          </CardContent>
        </Card>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمرجع أو الوكيل أو الرقم الخارجي...",
          statuses: Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l })),
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        data={filtered}
        columns={columns}
        emptyMessage="لا توجد مدفوعات بعد — ابدأ بتسجيل دفعة من الوكيل الفرعي"
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              تسجيل دفعة من وكيل فرعي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الوكيل الفرعي</Label>
              <Select value={subAgentId} onValueChange={setSubAgentId}>
                <SelectTrigger><SelectValue placeholder="اختر وكيلاً" /></SelectTrigger>
                <SelectContent>
                  {subAgents.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">لا يوجد وكلاء — أضف أولاً</div>
                  ) : subAgents.map((sa) => (
                    <SelectItem key={sa.id} value={String(sa.id)}>
                      {sa.name}{sa.nuskCode ? ` (${sa.nuskCode})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المبلغ بالريال السعودي *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={sarAmount}
                  onChange={(e) => setSarAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>العملة</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
              <div>
                <Label>المبلغ الأصلي</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={currency === "SAR"}
                  placeholder={currency === "SAR" ? "نفس SAR" : ""}
                />
              </div>
              <div>
                <Label>سعر الصرف</Label>
                <Input
                  type="number" step="0.0001" min="0"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  disabled={currency === "SAR"}
                />
              </div>
            </div>
            <div>
              <Label>المرجع الخارجي (رقم تحويل / شيك)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button
              disabled={!subAgentId || !sarAmount || Number(sarAmount) <= 0 || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  subAgentId: Number(subAgentId),
                  sarAmount: Number(sarAmount),
                  currency: currency || "SAR",
                  amount: amount ? Number(amount) : undefined,
                  exchangeRate: exchangeRate ? Number(exchangeRate) : undefined,
                  method,
                  reference: reference || undefined,
                })
              }
            >
              {createMut.isPending ? "جاري التسجيل..." : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
