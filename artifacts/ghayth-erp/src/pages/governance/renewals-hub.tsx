// Unified renewals & expiries hub. Reads /calendar/renewals-hub which
// aggregates EVERYTHING with a duration: commercial registrations,
// government licenses, medical insurance, Zakat/GOSI certificates,
// fleet insurance/registration/inspection, employee iqamas + driver
// licenses, bank guarantees, legal contracts, rental contracts.
//
// One sortable severity-coloured table. Click → jump to the source
// record. No more bouncing between /hr/expiring-documents,
// /finance/bank-guarantees, /fleet/insurance, /properties/contracts.

import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { PageShell } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { AlertTriangle, AlertCircle, Clock, CheckCircle2, Plus, Search, RefreshCw } from "lucide-react";

interface RenewalRow {
  source: string;
  sourceLabel: string;
  entityId: number;
  title: string;
  subtitle: string | null;
  expiryDate: string;
  daysLeft: number;
  severity: "expired" | "critical" | "warning" | "normal";
  link: string;
  metadata?: Record<string, unknown>;
}

const SEVERITY_STYLES: Record<RenewalRow["severity"], { bg: string; border: string; text: string; icon: any; label: string }> = {
  expired: {
    bg: "bg-status-error-surface/40",
    border: "border-status-error-surface",
    text: "text-status-error-foreground",
    icon: AlertCircle,
    label: "منتهٍ",
  },
  critical: {
    bg: "bg-status-error-surface/30",
    border: "border-status-error-surface",
    text: "text-status-error-foreground",
    icon: AlertTriangle,
    label: "حرج",
  },
  warning: {
    bg: "bg-status-warning-surface/30",
    border: "border-status-warning-surface",
    text: "text-status-warning-foreground",
    icon: Clock,
    label: "قريب",
  },
  normal: {
    bg: "",
    border: "",
    text: "text-muted-foreground",
    icon: CheckCircle2,
    label: "ضمن الفترة",
  },
};

export default function RenewalsHub() {
  const [days, setDays] = useState("90");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("_all");
  const [severityFilter, setSeverityFilter] = useState<string>("_all");
  const [renewingRow, setRenewingRow] = useState<RenewalRow | null>(null);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["renewals-hub", days],
    `/calendar/renewals-hub?days=${days}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const rows: RenewalRow[] = data?.data ?? [];
  const summary = data?.summary ?? { bySeverity: {}, bySource: {} };

  // Build the source filter dropdown from what we actually got back
  // so the operator never sees a filter for an empty bucket.
  const sourceOptions = Array.from(new Set(rows.map((r) => r.source))).map((s) => ({
    key: s,
    label: rows.find((r) => r.source === s)?.sourceLabel ?? s,
    count: rows.filter((r) => r.source === s).length,
  }));

  const filtered = rows.filter((r) => {
    if (sourceFilter !== "_all" && r.source !== sourceFilter) return false;
    if (severityFilter !== "_all" && r.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.title} ${r.subtitle ?? ""} ${r.sourceLabel}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sevCount = (k: RenewalRow["severity"]) => summary.bySeverity?.[k] ?? 0;

  return (
    <PageShell
      title="مركز التجديدات والانتهاءات"
      subtitle="كل ما له مدة في النظام — وثائق، تأمينات، تراخيص، عقود، ضمانات — في مكان واحد"
      breadcrumbs={[
        { label: "الحوكمة", href: "/governance" },
        { label: "مركز التجديدات" },
      ]}
      actions={
        <Link href="/governance/company-documents/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            وثيقة منشأة جديدة
          </Button>
        </Link>
      }
    >
      {/* KPI strip — coloured by severity so the eye lands on red first. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SevKpi sev="expired" count={sevCount("expired")} />
        <SevKpi sev="critical" count={sevCount("critical")} />
        <SevKpi sev="warning" count={sevCount("warning")} />
        <SevKpi sev="normal" count={sevCount("normal")} />
      </div>

      {/* Filters */}
      <Card className="mb-3">
        <CardContent className="p-3 grid gap-2 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث في العنوان أو الوصف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pe-9"
              />
            </div>
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger><SelectValue placeholder="كل المصادر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">كل المصادر ({rows.length})</SelectItem>
              {sourceOptions.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label} ({s.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="60">آخر 60 يوم</SelectItem>
              <SelectItem value="90">آخر 90 يوم</SelectItem>
              <SelectItem value="180">آخر 180 يوم</SelectItem>
              <SelectItem value="365">آخر سنة</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">عرض {filtered.length} من {rows.length}</CardTitle>
          <div className="flex gap-1 text-[10px]">
            {(["expired", "critical", "warning", "normal"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(severityFilter === s ? "_all" : s)}
                className={`px-2 py-1 rounded border ${severityFilter === s ? SEVERITY_STYLES[s].bg + " " + SEVERITY_STYLES[s].border : ""}`}
              >
                {SEVERITY_STYLES[s].label} ({sevCount(s)})
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              لا توجد عناصر تطابق المرشحات الحالية
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-right p-2">الحالة</th>
                    <th className="text-right p-2">المصدر</th>
                    <th className="text-right p-2">العنصر</th>
                    <th className="text-right p-2">تاريخ الانتهاء</th>
                    <th className="text-right p-2">الأيام المتبقية</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const style = SEVERITY_STYLES[r.severity];
                    const Icon = style.icon;
                    return (
                      <tr key={`${r.source}-${r.entityId}-${idx}`} className={`border-t hover:bg-muted/20 ${style.bg}`}>
                        <td className="p-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${style.border} ${style.text}`}
                          >
                            <Icon className="h-3 w-3" />
                            {style.label}
                          </Badge>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{r.sourceLabel}</td>
                        <td className="p-2">
                          <p className="font-medium">{r.title}</p>
                          {r.subtitle && <p className="text-[10px] text-muted-foreground">{r.subtitle}</p>}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{formatDateAr(r.expiryDate)}</td>
                        <td className={`p-2 font-mono text-xs ${style.text}`}>
                          {r.daysLeft < 0 ? `منذ ${Math.abs(r.daysLeft)} يوم` : `${r.daysLeft} يوم`}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <Link href={r.link}>
                              <a className="text-[11px] text-primary underline-offset-2 hover:underline">فتح ←</a>
                            </Link>
                            {r.source === "company_document" && (
                              <button
                                onClick={() => setRenewingRow(r)}
                                className="text-[11px] text-status-success-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
                              >
                                <RefreshCw className="h-3 w-3" />
                                تم التجديد
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {renewingRow && (
        <RenewDialog
          row={renewingRow}
          onClose={() => setRenewingRow(null)}
          onDone={() => { setRenewingRow(null); refetch(); }}
        />
      )}
    </PageShell>
  );
}

// "تم التجديد" dialog for company documents. Calls POST
// /hr/company-documents/:id/renew which atomically:
//   1. shifts expiryDate forward
//   2. marks the old obligation met (calendar stops nagging)
//   3. optionally posts the renewal fee as an expense
//   4. registers the NEXT-cycle obligation + task on the same
//      responsible department
function RenewDialog({ row, onClose, onDone }: {
  row: RenewalRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidAccountCode, setPaidAccountCode] = useState("");
  const [postExpense, setPostExpense] = useState(true);

  const renewMut = useApiMutation<any, any>(
    `/hr/company-documents/${row.entityId}/renew`,
    "POST",
    [["renewals-hub"], ["company-documents"]],
    {
      onSuccess: () => {
        toast({ title: "تم التجديد", description: `الانتهاء الجديد: ${newExpiryDate}` });
        onDone();
      },
    }
  );

  const handleSubmit = () => {
    if (!newExpiryDate) {
      toast({ variant: "destructive", title: "تاريخ مطلوب", description: "حدد تاريخ الانتهاء الجديد" });
      return;
    }
    renewMut.mutate({
      newExpiryDate,
      paidAmount: paidAmount ? Number(paidAmount) : undefined,
      paidAccountCode: paidAccountCode || undefined,
      postExpense: postExpense && !!paidAmount,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجديد: {row.title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">تاريخ الانتهاء الجديد *</Label>
            <DatePicker value={newExpiryDate} onChange={setNewExpiryDate} />
            <p className="text-[10px] text-muted-foreground mt-1">
              التاريخ الذي يصلح إليه السجل/الترخيص/التأمين بعد التجديد.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">الرسوم المدفوعة (ر.س)</Label>
              <Input
                type="number"
                min={0}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">حساب المصروف (اختياري)</Label>
              <Input
                value={paidAccountCode}
                onChange={(e) => setPaidAccountCode(e.target.value)}
                placeholder="افتراضي: 5400"
                dir="ltr"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={postExpense} onCheckedChange={(v) => setPostExpense(!!v)} />
            <span>قيّد المصروف الآن في المالية</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={!newExpiryDate || renewMut.isPending} rateLimitAware>
            تأكيد التجديد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SevKpi({ sev, count }: { sev: RenewalRow["severity"]; count: number }) {
  const style = SEVERITY_STYLES[sev];
  const Icon = style.icon;
  return (
    <Card className={`border ${style.border} ${style.bg}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${style.text}`} />
        <div>
          <p className="text-[10px] text-muted-foreground">{style.label}</p>
          <p className={`text-xl font-bold ${style.text}`}>{count}</p>
        </div>
      </CardContent>
    </Card>
  );
}
