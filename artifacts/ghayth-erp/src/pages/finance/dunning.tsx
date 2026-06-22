import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { STATUSES } from "@/lib/constants";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatNumber, formatDateAr } from "@/lib/formatters";
import { Send, Mail, MessageSquare, Clock, AlertTriangle, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
interface OverdueInvoice {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  daysPastDue: number;
  clientId: number;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  outstanding: number;
  proposedStage: 1 | 2 | 3 | 4 | 5;
  stageTitle: string;
  tone: string;
  lastSentStage: number;
  lastSentAt: string | null;
}

interface PreviewResponse {
  asOf: string;
  total: number;
  byStage: Record<string, number>;
  totalOutstanding: number;
  invoices: OverdueInvoice[];
}

interface HistoryRow {
  id: number;
  invoiceId: number;
  clientId: number | null;
  level: number;
  subject: string;
  body: string;
  sentAt: string | null;
  status: string;
}

const STAGE_INFO: Record<number, { label: string; tone: string; bg: string; icon: any }> = {
  1: { label: "تذكير ودي", tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: MessageSquare },
  2: { label: "إشعار أول", tone: "text-yellow-700", bg: "bg-status-warning-surface border-yellow-200", icon: Clock },
  3: { label: "إشعار ثانٍ", tone: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertTriangle },
  4: { label: "إشعار نهائي", tone: "text-status-error-foreground", bg: "bg-status-error-surface border-status-error-surface", icon: AlertTriangle },
  5: { label: "إجراءات قانونية", tone: "text-red-900", bg: "bg-red-100 border-red-400", icon: Gavel },
};

export default function DunningPage() {
  const { toast } = useToast();
  const [minDays, setMinDays] = useState<number>(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sentVia, setSentVia] = useState<"email" | "sms" | "manual">("email");

  const { data: preview, isLoading, isError, refetch } = useApiQuery<PreviewResponse>(
    ["dunning-preview", String(minDays)],
    `/finance/dunning/preview?minDaysPastDue=${minDays}`,
  );
  const { data: historyResp } = useApiQuery<{ data: HistoryRow[] }>(
    ["dunning-history"], "/finance/dunning/history",
  );

  const sendMut = useApiMutation("/finance/dunning/send", "POST", [
    ["dunning-preview"], ["dunning-history"],
  ]);

  const invoices = preview?.invoices ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<OverdueInvoice>(invoices);

  if (isLoading) return <LoadingSpinner />;

  if (isError || !preview) return <ErrorState />;

  const allSelected = invoices.length > 0 && selected.size === invoices.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.invoiceId)));
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = invoices.filter((i) => selected.has(i.invoiceId));
  const selectedAmount = selectedRows.reduce((s, r) => s + r.outstanding, 0);

  const handleSend = async () => {
    if (selectedRows.length === 0) {
      toast({ variant: "destructive", title: "اختر فاتورة واحدة على الأقل" });
      return;
    }
    try {
      await sendMut.mutateAsync({
        invoiceIds: selectedRows.map((r) => r.invoiceId),
        sentVia,
      });
      toast({ title: `تم إرسال ${selectedRows.length} رسالة تذكير` });
      setSelected(new Set());
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "تعذّر الإرسال",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  const cols: DataTableColumn<OverdueInvoice>[] = [
    { key: "_sel", header: (
        <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
      ) as any,
      render: (r) => (
        <Checkbox
          checked={selected.has(r.invoiceId)}
          onCheckedChange={() => toggle(r.invoiceId)}
        />
      ),
    },
    { key: "invoiceNumber", header: "الفاتورة",
      render: (r) => (
        <Link href={`/finance/invoices/${r.invoiceId}`}
          className="font-mono text-xs text-status-info-foreground hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
    },
    { key: "clientName", header: "العميل",
      render: (r) => r.clientName ?? "—" },
    { key: "dueDate", header: "تاريخ الاستحقاق",
      render: (r) => <span className="text-xs">{formatDateAr(r.dueDate)}</span> },
    { key: "daysPastDue", header: "أيام التأخر",
      render: (r) => {
        const tone = r.daysPastDue > 90 ? "text-status-error-foreground"
          : r.daysPastDue > 60 ? "text-orange-700"
          : r.daysPastDue > 30 ? "text-status-warning-foreground" : "text-yellow-700";
        return <span className={`font-mono font-bold ${tone}`}>{r.daysPastDue}</span>;
      },
    },
    { key: "outstanding", header: "المتبقي",
      render: (r) => <span className="font-mono">{formatCurrency(r.outstanding)}</span> },
    { key: "proposedStage", header: "المرحلة المقترحة",
      render: (r) => {
        const info = STAGE_INFO[r.proposedStage];
        const Icon = info.icon;
        return (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${info.bg} ${info.tone}`}>
            <Icon className="h-3 w-3" />
            {info.label}
          </span>
        );
      },
    },
    { key: "lastSent", header: "آخر إرسال",
      render: (r) => r.lastSentStage > 0
        ? (
          <span className="text-xs">
            مرحلة {r.lastSentStage}
            <br />
            <span className="text-muted-foreground">{r.lastSentAt ? formatDateAr(r.lastSentAt) : "—"}</span>
          </span>
        )
        : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  const historyCols: DataTableColumn<HistoryRow>[] = [
    { key: "sentAt", header: "تاريخ الإرسال",
      render: (r) => <span className="text-xs">{r.sentAt ? formatDateAr(r.sentAt) : "—"}</span> },
    { key: "invoiceId", header: "الفاتورة",
      render: (r) => (
        <Link href={`/finance/invoices/${r.invoiceId}`} className="font-mono text-xs text-status-info-foreground hover:underline">
          #{r.invoiceId}
        </Link>
      ),
    },
    { key: "level", header: "المستوى",
      render: (r) => {
        const info = STAGE_INFO[r.level] ?? STAGE_INFO[1];
        return <Badge variant="outline" className={`text-xs ${info.tone}`}>{info.label}</Badge>;
      },
    },
    { key: "subject", header: "الموضوع",
      render: (r) => <span className="text-xs">{r.subject}</span> },
    { key: "status", header: "الحالة",
      render: (r) => <Badge variant="outline" className="text-xs">{STATUSES[r.status] ?? r.status}</Badge> },
  ];

  return (
    <PageShell
      title="متابعة تحصيل الذمم"
      subtitle="إرسال تذكيرات تدريجية للعملاء المتأخرين عن السداد — 5 مراحل من تذكير ودي إلى إحالة قانونية"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/receivables", label: "التحصيل" },
        { label: "متابعة التحصيل" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/ar-collection-workbench">
              <Send className="h-3.5 w-3.5 ml-1" />
              منضدة التحصيل
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/ar-aging">
              <Clock className="h-3.5 w-3.5 ml-1" />
              تقادم الذمم
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/collection">
              <Gavel className="h-3.5 w-3.5 ml-1" />
              مراحل التصعيد
            </Link></Button>
          <PrintButton
            entityType="report_finance_dunning"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "متابعة تحصيل الذمم", total: printRows.length },
              items: printRows.map((r) => ({
                "الفاتورة": r.invoiceNumber || "—",
                "العميل": r.clientName || "—",
                "تاريخ الاستحقاق": r.dueDate || "—",
                "أيام التأخر": r.daysPastDue ?? 0,
                "المتبقي": r.outstanding ?? 0,
                "المرحلة المقترحة": STAGE_INFO[r.proposedStage]?.label ?? "—",
                "آخر إرسال": r.lastSentStage > 0 ? `مرحلة ${r.lastSentStage}` : "—",
              })),
            })}
          />
        </div>
      }
    >
      <FinanceTabsNav />
      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">الحد الأدنى لأيام التأخر</label>
          <Input
            type="number" min={1} value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value) || 1)}
            className="w-32" dir="ltr"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 border rounded-lg p-2">
          <label className="text-xs text-muted-foreground">طريقة الإرسال:</label>
          <select
            value={sentVia}
            onChange={(e) => setSentVia(e.target.value as any)}
            className="h-8 rounded border bg-background px-2 text-sm"
          >
            <option value="email">بريد إلكتروني</option>
            <option value="sms">رسالة نصية (SMS)</option>
            <option value="manual">يدوي (تسجيل فقط)</option>
          </select>
        </div>
        <GuardedButton
          perm="finance:create" size="sm"
          disabled={selected.size === 0 || sendMut.isPending}
          onClick={handleSend}
          rateLimitAware
        >
          <Send className="h-4 w-4 me-1" />
          {sendMut.isPending ? "جاري الإرسال..." : `إرسال ${selectedRows.length} رسالة (${formatCurrency(selectedAmount)})`}
        </GuardedButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي مؤهل</p>
            <p className="text-lg font-bold font-mono">{formatNumber(preview.total)}</p>
          </CardContent>
        </Card>
        {[1, 2, 3, 4, 5].map((s) => {
          const info = STAGE_INFO[s];
          const Icon = info.icon;
          return (
            <Card key={s} className={info.bg.split(" ")[1]}>
              <CardContent className="p-3 text-center">
                <p className={`text-xs ${info.tone} flex items-center justify-center gap-1`}>
                  <Icon className="h-3 w-3" /> {info.label}
                </p>
                <p className={`text-lg font-bold font-mono ${info.tone}`}>
                  {formatNumber(preview.byStage[s] ?? 0)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4 border-status-warning-surface bg-status-warning-surface/30">
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">إجمالي المبالغ المتأخرة في الفترة المعروضة</p>
            <p className="text-2xl font-bold font-mono text-status-warning-foreground">{formatCurrency(preview.totalOutstanding)}</p>
          </div>
          <p className="text-xs text-muted-foreground">بتاريخ: {preview.asOf}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>الفواتير المؤهلة لإرسال تذكير</span>
            {selected.size > 0 && (
              <Badge variant="default">{selected.size} مختار</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={invoices}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage="لا توجد فواتير مؤهلة لإرسال تذكير في هذه الفترة"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" /> سجل الإرسالات السابقة
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={historyCols} data={historyResp?.data ?? []}
            pageSize={20}
            emptyMessage="لا توجد رسائل تذكير مُرسلة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
