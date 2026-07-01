import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, ArrowRight, AlertTriangle, Phone, Mail } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface OverdueInvoice {
  id: number;
  ref: string;
  total: number | string;
  paidAmount: number | string;
  dueDate: string;
  status: string;
  clientName: string | null;
  clientPhone: string | null;
  daysOverdue: number;
  currentStage: number;
  currentStageName: string | null;
  recommendedStage: number;
  recommendedAction: string;
}

const STAGES = [
  { stage: 1, label: "تذكير SMS + إيميل",              days: 1,  color: "bg-blue-100 text-status-info-foreground" },
  { stage: 2, label: "إشعار محاسب + إيميل ثاني",       days: 7,  color: "bg-cyan-100 text-cyan-800" },
  { stage: 3, label: "مهمة تحصيل ميداني",              days: 14, color: "bg-amber-100 text-status-warning-foreground" },
  { stage: 4, label: "تصعيد للمدير المالي",            days: 21, color: "bg-orange-100 text-orange-800" },
  { stage: 5, label: "إشعار المدير العام + غرامة 2%",  days: 30, color: "bg-red-100 text-status-error-foreground" },
  { stage: 6, label: "إشعار قانوني + تصنيف العميل منقطعًا", days: 60, color: "bg-purple-100 text-purple-800" },
];

export default function CollectionStagesPage() {
  const { toast } = useToast();
  const [actionTarget, setActionTarget] = useState<OverdueInvoice | null>(null);
  const [actionNotes, setActionNotes] = useState<string>("");

  const { data, isLoading, isError } = useApiQuery<OverdueInvoice[]>(
    ["collection-overdue"],
    `/finance/collection`,
  );

  const actionMut = useApiMutation<unknown, { invoiceId: number; stage: number; notes?: string }>(
    (b) => `/finance/collection/${b.invoiceId}/action`,
    "POST",
    [["collection-overdue"]],
  );

  const rows = data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const totalOverdueAmount = rows.reduce((s, r) => {
    const out = Number(r.total ?? 0) - Number(r.paidAmount ?? 0);
    return s + (out > 0 ? out : 0);
  }, 0);

  const stagesBehind = rows.filter((r) => r.recommendedStage > r.currentStage).length;
  const stage5Plus  = rows.filter((r) => r.recommendedStage >= 5).length;
  const avgDays = rows.length === 0 ? 0
    : Math.round(rows.reduce((s, r) => s + Number(r.daysOverdue), 0) / rows.length);

  const submitAction = async () => {
    if (!actionTarget) return;
    try {
      await actionMut.mutateAsync({
        invoiceId: actionTarget.id,
        stage: actionTarget.recommendedStage,
        notes: actionNotes || undefined,
      });
      toast({ title: `تم تسجيل ${STAGES.find((s) => s.stage === actionTarget.recommendedStage)?.label ?? "الإجراء"}` });
      setActionTarget(null);
      setActionNotes("");
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر تسجيل الإجراء", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<OverdueInvoice>[] = [
    {
      key: "ref",
      header: "الفاتورة",
      render: (r) => (
        <Link href={`/finance/invoices/${r.id}`}
          className="font-mono text-xs text-status-info-foreground hover:underline">
          {r.ref}
        </Link>
      ),
    },
    {
      key: "clientName",
      header: "العميل",
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{r.clientName ?? "—"}</span>
          {r.clientPhone && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Phone className="h-2.5 w-2.5" /> {r.clientPhone}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "outstanding",
      header: "المتبقي",
      render: (r) => {
        const out = Number(r.total ?? 0) - Number(r.paidAmount ?? 0);
        return <span className="font-mono text-xs font-semibold">{formatCurrency(out)}</span>;
      },
    },
    {
      key: "dueDate",
      header: "تاريخ الاستحقاق",
      render: (r) => <span className="text-xs">{formatDateAr(r.dueDate)}</span>,
    },
    {
      key: "daysOverdue",
      header: "أيام التأخر",
      render: (r) => {
        const d = Number(r.daysOverdue);
        const color = d >= 60 ? "text-status-error-foreground" : d >= 30 ? "text-status-error-foreground" : d >= 14 ? "text-status-warning-foreground" : "text-orange-600";
        return <span className={`font-mono font-semibold ${color}`}>{d}</span>;
      },
    },
    {
      key: "currentStage",
      header: "المرحلة الحالية",
      render: (r) => {
        if (!r.currentStage || r.currentStage === 0) {
          return <span className="text-muted-foreground italic text-xs">لا يوجد</span>;
        }
        const info = STAGES.find((s) => s.stage === r.currentStage);
        return info
          ? <Badge className={`text-[10px] ${info.color}`}>{r.currentStage}. {info.label}</Badge>
          : <Badge variant="outline" className="text-[10px]">{r.currentStage}</Badge>;
      },
    },
    {
      key: "recommendedStage",
      header: "المرحلة المقترحة",
      render: (r) => {
        const info = STAGES.find((s) => s.stage === r.recommendedStage);
        const isAhead = r.recommendedStage > r.currentStage;
        return (
          <div className="flex items-center gap-1">
            {info && (
              <Badge variant={isAhead ? "default" : "outline"}
                className={`text-[10px] ${isAhead ? info.color : ""}`}>
                {r.recommendedStage}. {info.label}
              </Badge>
            )}
            {isAhead && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        );
      },
    },
    {
      key: "_actions",
      header: "تنفيذ",
      render: (r) => {
        const needsAction = r.recommendedStage > r.currentStage;
        if (!needsAction) {
          return <span className="text-muted-foreground italic text-xs">محدّث</span>;
        }
        return (
          <GuardedButton perm="finance:create" variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => { setActionTarget(r); setActionNotes(""); }}>
            <Megaphone className="h-3 w-3 me-1" /> تنفيذ
          </GuardedButton>
        );
      },
    },
  ];

  return (
    <PageShell
      title="مراحل تحصيل الفواتير المتأخرة"
      subtitle="6 مراحل تحصيل من تذكير لطيف إلى إحالة قانونية، مع توصية تلقائية حسب أيام التأخر"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/receivables", label: "الذمم" },
        { label: "التحصيل" },
      ]}
      actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/finance/dunning">
              <Mail className="h-4 w-4 me-1" /> متابعة التحصيل (إيميلات جماعية)
            </Link></Button>
          <PrintButton
            entityType="report_finance_collection_stages"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "مراحل التصعيد للتحصيل", total: printRows.length },
              items: printRows.map((r) => ({
                "الفاتورة": r.ref,
                "العميل": r.clientName || "—",
                "الإجمالي": Number(r.total || 0),
                "المدفوع": Number(r.paidAmount || 0),
                "المتبقي": Number(r.total || 0) - Number(r.paidAmount || 0),
                "الاستحقاق": r.dueDate || "—",
                "أيام التأخر": r.daysOverdue,
                "المرحلة الحالية": r.currentStage,
                "المرحلة الموصى": r.recommendedStage,
                "الإجراء": r.recommendedAction || "—",
              })),
            })}
          />
        </>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> منطق المراحل
          </p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            <li><strong>1 يوم</strong> — تذكير SMS + إيميل لطيف</li>
            <li><strong>7 أيام</strong> — إشعار محاسب + إيميل ثاني</li>
            <li><strong>14 يوم</strong> — مهمة تحصيل ميداني</li>
            <li><strong>21 يوم</strong> — تصعيد للمدير المالي</li>
            <li><strong>30 يوم</strong> — إشعار GM + غرامة 2%</li>
            <li><strong>60 يوم</strong> — إحالة قانونية + تصنيف churned</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            المراحل تطبق <strong>بالتسلسل</strong> — لا يمكن القفز من المرحلة 2 إلى 5.
            يجب اتباع 3, 4, 5 على الترتيب.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-status-error-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> فواتير متأخرة
            </p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المتبقي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalOverdueAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">يحتاج تصعيد</p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatNumber(stagesBehind)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-400">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مرحلة 5+ (GM/قانوني)</p>
            <p className="text-lg font-bold font-mono text-status-error-foreground">{formatNumber(stage5Plus)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3 text-xs text-muted-foreground">
          متوسط أيام التأخر: <span className="font-mono font-bold ms-2 text-foreground">{avgDays} يوم</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الفواتير ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={30}
            emptyMessage="ما في فواتير متأخرة 🎉 — كل الذمم سارية"
          />
        </CardContent>
      </Card>

      <Dialog open={actionTarget != null} onOpenChange={(open) => { if (!open) setActionTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              تنفيذ مرحلة التحصيل {actionTarget?.recommendedStage}
            </DialogTitle>
          </DialogHeader>
          {actionTarget && (
            <div className="text-sm space-y-2 py-2">
              <p>الفاتورة: <span className="font-mono">{actionTarget.ref}</span></p>
              <p>العميل: <span className="font-medium">{actionTarget.clientName ?? "—"}</span></p>
              <p>التأخر: <span className="font-mono font-bold text-status-error-foreground">{actionTarget.daysOverdue} يوم</span></p>
              <p>الإجراء: <span className="font-semibold">{STAGES.find((s) => s.stage === actionTarget.recommendedStage)?.label}</span></p>
              <div>
                <Label className="text-xs">ملاحظات (اختياري)</Label>
                <Textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} rows={2}
                  placeholder="مثال: تواصلت مع المحاسب، وعد بالسداد خلال 3 أيام" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)}>إلغاء</Button>
            <Button onClick={submitAction} disabled={actionMut.isPending}>
              {actionMut.isPending ? "جاري التسجيل..." : "تسجيل الإجراء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
