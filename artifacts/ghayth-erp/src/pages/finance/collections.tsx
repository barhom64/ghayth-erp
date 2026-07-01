import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { STATUSES } from "@/lib/constants";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { Loader2, Mail, AlertTriangle, History, FileWarning, Calculator, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { currentPeriodRiyadh } from "@/lib/formatters";

/**
 * Finance / Collections — dunning + bad-debt provision.
 *
 * Phase D / Finance gap. Closes 5 unused-backend endpoints in
 * one page (two related collection workflows):
 *
 *   GET  /finance/dunning/preview   — eligible past-due invoices grouped by stage
 *   POST /finance/dunning/send      — record letters for selected invoices
 *   GET  /finance/dunning/history   — log of letters sent
 *   GET  /finance/bad-debt/preview  — aging buckets × provision rates
 *   POST /finance/bad-debt/post     — write the month's provision journal
 *
 * The dunning flow has 5 stages, gradually escalating from a
 * friendly reminder (1–14 days) to legal escalation (90+).
 * Backend assigns the proposed stage per row; the operator
 * picks which to actually send. Once sent, dunning_letters
 * records the text + sent timestamp, and invoices.lastDunningStage
 * advances so the same letter isn't re-sent within 24 hours.
 *
 * The bad-debt flow lets ops adjust per-bucket provision rates
 * (defaults: current 0% / 30d 5% / 60d 25% / 90d 50% / 90+ 75%),
 * see the resulting provision number, and then post one
 * journal entry per period (DR 6700 bad-debt expense /
 * CR 1290 allowance for doubtful accounts). The backend
 * enforces one-provision-per-period via the BAD-DEBT-{YYYY-MM}
 * ref uniqueness, so the operator gets a clear conflict error
 * if they try to re-post.
 */

interface DunningInvoice {
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
  proposedStage: number;
  stageTitle: string;
  tone: string;
  lastSentStage: number;
  lastSentAt: string | null;
}

interface DunningPreview {
  asOf: string;
  total: number;
  byStage: Record<string, number>;
  totalOutstanding: number;
  invoices: DunningInvoice[];
}

interface DunningHistoryRow {
  id: number;
  invoiceId: number;
  invoiceNumber: string | null;
  clientId: number;
  clientName: string | null;
  level: number;
  subject: string;
  sentAt: string;
  status: string;
}

interface BadDebtPreview {
  asOf: string;
  rates: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  buckets: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  provision: { current: number; d30: number; d60: number; d90: number; d90plus: number };
  totalProvision: number;
  invoiceCount: number;
}

const STAGE_LABEL: Record<number, string> = {
  1: "تذكير ودي (1-14)",
  2: "إشعار أول (15-30)",
  3: "إشعار ثانٍ (31-60)",
  4: "إشعار نهائي (61-90)",
  5: "إحالة للتحصيل (90+)",
};

const STAGE_VARIANT: Record<number, "default" | "secondary" | "destructive" | "outline"> = {
  1: "outline",
  2: "secondary",
  3: "default",
  4: "destructive",
  5: "destructive",
};

// Riyadh-time YYYY-MM — UTC would flip a day early at month-end.
const currentPeriod = () => currentPeriodRiyadh();

export default function CollectionsPage() {
  return (
    <PageShell
      title="التحصيل والمتابعة"
      subtitle="إشعارات سداد الذمم المتأخرة + مخصص الديون المشكوك في تحصيلها"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "التحصيل" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/ar-collection-workbench">
              <Mail className="h-3.5 w-3.5 ml-1" />
              منضدة التحصيل
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/dunning">
              <History className="h-3.5 w-3.5 ml-1" />
              متابعة التحصيل
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs"><Link href="/finance/bad-debt-provision">
              <FileWarning className="h-3.5 w-3.5 ml-1" />
              الديون المشكوك بها
            </Link></Button>
          <PrintButton
            entityType="report_finance_collections"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "التحصيل والمتابعة", total: 0 },
              items: [],
            }}
          />
        </div>
      }
    >
      <FinanceTabsNav />

      <Tabs defaultValue="dunning" dir="rtl" className="w-full">
        <TabsList>
          <TabsTrigger value="dunning" className="gap-1.5">
            <Mail className="h-4 w-4" />
            إشعارات التحصيل
          </TabsTrigger>
          <TabsTrigger value="bad-debt" className="gap-1.5">
            <FileWarning className="h-4 w-4" />
            مخصص الديون
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" />
            السجل
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dunning" className="space-y-3">
          <DunningTab />
        </TabsContent>
        <TabsContent value="bad-debt" className="space-y-3">
          <BadDebtTab />
        </TabsContent>
        <TabsContent value="history" className="space-y-3">
          <DunningHistoryTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function DunningTab() {
  const [minDays, setMinDays] = useState(1);
  const { data, isLoading, error, refetch } = useApiQuery<DunningPreview>(
    ["finance-dunning-preview", String(minDays)],
    `/finance/dunning/preview?minDaysPastDue=${minDays}`,
  );
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);

  const invoices = data?.invoices ?? [];
  const allSelected = invoices.length > 0 && selected.size === invoices.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(invoices.map((i) => i.invoiceId)));
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (selected.size === 0) {
      toast({ title: "لم يتم اختيار أي فاتورة" });
      return;
    }
    setSending(true);
    try {
      const result = await apiFetch<{ total: number; sent: number; skipped: number }>(
        "/finance/dunning/send",
        {
          method: "POST",
          body: JSON.stringify({ invoiceIds: Array.from(selected) }),
        },
      );
      toast({
        title: "تم إرسال الإشعارات",
        description: `تم إرسال ${result.sent} من ${result.total} (تم تخطي ${result.skipped})`,
      });
      setSelected(new Set());
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const columns: DataTableColumn<DunningInvoice>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          aria-label="اختيار الكل"
        />
      ) as any,
      render: (r) => (
        <Checkbox
          checked={selected.has(r.invoiceId)}
          onCheckedChange={() => toggleOne(r.invoiceId)}
          aria-label="اختيار"
        />
      ),
    },
    {
      key: "invoiceNumber",
      header: "الفاتورة",
      className: "font-mono text-xs",
      ltr: true,
    },
    { key: "clientName", header: "العميل", className: "font-medium" },
    {
      key: "dueDate",
      header: "تاريخ الاستحقاق",
      render: (r) => new Date(r.dueDate).toLocaleDateString("ar-SA"),
    },
    {
      key: "daysPastDue",
      header: "أيام التأخر",
      render: (r) => (
        <span className="font-semibold text-status-warning-foreground">{r.daysPastDue}</span>
      ),
    },
    {
      key: "outstanding",
      header: "المتبقي",
      render: (r) => (
        <span className="font-semibold">{r.outstanding.toLocaleString("ar-SA")}</span>
      ),
    },
    {
      key: "proposedStage",
      header: "المرحلة المقترحة",
      render: (r) => (
        <Badge variant={STAGE_VARIANT[r.proposedStage]}>
          {STAGE_LABEL[r.proposedStage] ?? `مرحلة ${r.proposedStage}`}
        </Badge>
      ),
    },
    {
      key: "lastSentAt",
      header: "آخر إشعار",
      render: (r) =>
        r.lastSentAt ? (
          <span className="text-xs text-muted-foreground">
            {new Date(r.lastSentAt).toLocaleDateString("ar-SA")} (مرحلة {r.lastSentStage})
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الحد الأدنى لأيام التأخر</Label>
            <input
              type="number"
              min={1}
              value={minDays}
              onChange={(e) => setMinDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-24 rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="rounded-md bg-surface-subtle p-2 text-center">
                <div className="text-xs text-muted-foreground">{STAGE_LABEL[s]}</div>
                <div className="text-lg font-semibold">{data?.byStage?.[s] ?? 0}</div>
              </div>
            ))}
          </div>
          <GuardedButton
            perm="finance.collection:create"
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            إرسال إشعارات ({selected.size})
          </GuardedButton>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && data.totalOutstanding > 0 && (
          <div className="text-sm text-muted-foreground">
            إجمالي المتأخرات:{" "}
            <span className="font-semibold text-foreground">
              {data.totalOutstanding.toLocaleString("ar-SA")} ر.س
            </span>{" "}
            على {data.total} فاتورة
          </div>
        )}
        <DataTable
          columns={columns}
          data={invoices}
          rowKey={(r) => r.invoiceId}
          emptyMessage="لا توجد فواتير مؤهلة لإرسال إشعار تذكير"
        />
      </PageStateWrapper>
    </>
  );
}

function DunningHistoryTab() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: DunningHistoryRow[] }>(
    ["finance-dunning-history"],
    "/finance/dunning/history",
  );

  const columns: DataTableColumn<DunningHistoryRow>[] = [
    {
      key: "sentAt",
      header: "تاريخ الإرسال",
      render: (r) => new Date(r.sentAt).toLocaleString("ar-SA"),
    },
    {
      key: "invoiceNumber",
      header: "الفاتورة",
      className: "font-mono text-xs",
      ltr: true,
    },
    { key: "clientName", header: "العميل", className: "font-medium" },
    {
      key: "level",
      header: "المرحلة",
      render: (r) => (
        <Badge variant={STAGE_VARIANT[r.level]}>{STAGE_LABEL[r.level] ?? `مرحلة ${r.level}`}</Badge>
      ),
    },
    { key: "subject", header: "الموضوع" },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant={r.status === "sent" ? "default" : "outline"}>{STATUSES[r.status] ?? r.status}</Badge>
      ),
    },
  ];

  return (
    <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        rowKey={(r) => r.id}
        emptyMessage="لم يتم إرسال أي إشعار حتى الآن"
      />
    </PageStateWrapper>
  );
}

function BadDebtTab() {
  const [rates, setRates] = useState({
    current: 0,
    d30: 0.05,
    d60: 0.25,
    d90: 0.5,
    d90plus: 0.75,
  });
  const [period, setPeriod] = useState(currentPeriod());
  const { toast } = useToast();

  const ratesQuery = useMemo(
    () =>
      `rateCurrent=${rates.current}&rate30=${rates.d30}&rate60=${rates.d60}&rate90=${rates.d90}&rate90plus=${rates.d90plus}`,
    [rates],
  );
  const { data, isLoading, error, refetch } = useApiQuery<BadDebtPreview>(
    ["finance-bad-debt-preview", ratesQuery],
    `/finance/bad-debt/preview?${ratesQuery}`,
  );
  const [posting, setPosting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handlePost = async () => {
    setConfirmOpen(false);
    setPosting(true);
    try {
      const result = await apiFetch<{ journalId: number; totalProvision: number }>(
        "/finance/bad-debt/post",
        {
          method: "POST",
          body: JSON.stringify({ period, rates }),
        },
      );
      toast({
        title: "تم تسجيل المخصص",
        description: `قيد رقم #${result.journalId} — ${result.totalProvision.toLocaleString("ar-SA")} ر.س`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ في التسجيل", description: e.message, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const BUCKETS = [
    { key: "current", label: "حالية" },
    { key: "d30", label: "1-30 يوم" },
    { key: "d60", label: "31-60 يوم" },
    { key: "d90", label: "61-90 يوم" },
    { key: "d90plus", label: "+90 يوم" },
  ] as const;

  return (
    <>
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">فترة المخصص (YYYY-MM)</Label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-05"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              dir="ltr"
            />
          </div>
          {BUCKETS.map((b) => (
            <div key={b.key} className="space-y-1.5">
              <Label className="text-xs">{b.label}</Label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={rates[b.key]}
                  onChange={(e) =>
                    setRates((prev) => ({
                      ...prev,
                      [b.key]: Math.max(0, Math.min(1, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm pe-7"
                />
                <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {BUCKETS.map((b) => (
              <Card key={b.key}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">{b.label}</div>
                  <div className="text-lg font-semibold">
                    {(data.buckets as any)[b.key].toLocaleString("ar-SA")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    مخصص: {((data.provision as any)[b.key] || 0).toLocaleString("ar-SA")} ر.س
                  </div>
                  <div className="text-xs text-status-info-foreground">
                    ({Math.round((rates[b.key] ?? 0) * 100)}%)
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {data && (
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Calculator className="h-6 w-6 text-status-info-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">إجمالي المخصص المُقترح</div>
                  <div className="text-2xl font-bold">
                    {data.totalProvision.toLocaleString("ar-SA")} ر.س
                  </div>
                  <div className="text-xs text-muted-foreground">
                    محسوب من {data.invoiceCount} فاتورة مفتوحة بتاريخ{" "}
                    {new Date(data.asOf).toLocaleDateString("ar-SA")}
                  </div>
                </div>
              </div>
              <GuardedButton
                perm="finance.collection:create"
                onClick={() => setConfirmOpen(true)}
                disabled={posting || data.totalProvision <= 0}
                className="gap-1.5"
              >
                {posting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                تسجيل المخصص للفترة {period}
              </GuardedButton>
            </CardContent>
          </Card>
        )}

        <div className="rounded-md bg-status-warning-surface text-status-warning-foreground p-3 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-0.5">ملاحظة</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>يتم تسجيل قيد واحد لكل فترة (BAD-DEBT-{`{YYYY-MM}`}) — لا يمكن إعادة التسجيل لنفس الفترة</li>
              <li>القيد: مدين 6700 (مصروف ديون مشكوك فيها) / دائن 1290 (مخصص ديون)</li>
              <li>يمكن تعديل النسب حسب سياسة الشركة قبل التسجيل</li>
            </ul>
          </div>
        </div>
      </PageStateWrapper>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="caution"
        title={`تسجيل مخصص ديون لفترة ${period}`}
        description={
          <>
            سيتم إنشاء قيد محاسبي بقيمة{" "}
            <strong>{(data?.totalProvision ?? 0).toLocaleString("ar-SA")} ر.س</strong>{" "}
            (مدين 6700 / دائن 1290). لا يمكن تكرار التسجيل لنفس الفترة بعد الحفظ.
          </>
        }
        confirmLabel="تأكيد التسجيل"
        onConfirm={handlePost}
      />
    </>
  );
}
