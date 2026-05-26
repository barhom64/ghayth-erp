import { useState } from "react";
import { useRoute } from "wouter";
import { useApiQuery, useApiMutation, apiFetch, buildErrorToast } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Download, Send, CheckCircle, AlertCircle, AlertTriangle,
  Banknote, FileText, Upload,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";

interface WpsLine {
  id: number;
  employeeId: number;
  employeeName: string;
  iqamaOrId: string;
  iban: string;
  amount: number | string;
  status: string;
  bankRefNumber: string | null;
  errorMessage: string | null;
}

interface WpsRunDetail {
  id: number;
  period: string;
  bankCode: string;
  fileName: string | null;
  status: string;
  totalAmount: number | string;
  recordCount: number;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  skippedEntries: { employeeId: number; employeeName: string; reason: string }[];
  lines: WpsLine[];
}

const REASON_LABELS: Record<string, string> = {
  missing_id: "لا يوجد رقم إقامة/هوية",
  missing_iban: "لا يوجد IBAN",
  invalid_iban: "IBAN غير صحيح",
  zero_amount: "صافي الراتب صفر",
};

export default function WpsRunDetailPage() {
  const [, params] = useRoute<{ id: string }>("/hr/wps/:id");
  const id = params?.id;
  const { toast } = useToast();
  const [ackOpen, setAckOpen] = useState(false);
  const [ackText, setAckText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, isError, refetch } = useApiQuery<WpsRunDetail>(
    ["wps-run", id ?? ""],
    id ? `/hr/wps/runs/${id}` : null,
  );

  const submitMut = useApiMutation<{ status: string }, Record<string, never>>(
    () => `/hr/wps/runs/${id}/submit`,
    "POST",
    [["wps-runs"], ["wps-run", id ?? ""]],
    {
      successMessage: "تم تعليم الـrun كمُرسَل للبنك",
    },
  );

  const ackMut = useApiMutation<
    { finalStatus: string; paid: number; failed: number; held: number; rejected: number; unmatched: number },
    { ackText: string }
  >(
    () => `/hr/wps/runs/${id}/ack`,
    "POST",
    [["wps-runs"], ["wps-run", id ?? ""]],
    {
      successMessage: "تم تطبيق تأكيد البنك",
      onSuccess: () => {
        setAckOpen(false);
        setAckText("");
      },
    },
  );

  if (!id) return <ErrorState />;
  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState onRetry={refetch} />;

  const run = data;
  const canSubmit = run.status === "draft" && run.recordCount > 0;
  const canApplyAck = run.status === "submitted" || run.status === "partial";
  const canDownload = run.recordCount > 0;

  const lineColumns: DataTableColumn<WpsLine>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (l) => <span className="font-medium">{l.employeeName || `#${l.employeeId}`}</span>,
    },
    {
      key: "iqamaOrId",
      header: "رقم الإقامة/الهوية",
      render: (l) => <span className="font-mono text-sm">{l.iqamaOrId}</span>,
    },
    {
      key: "iban",
      header: "IBAN",
      render: (l) => <span className="font-mono text-sm">{l.iban}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      sortable: true,
      render: (l) => <span className="font-medium">{formatCurrency(Number(l.amount))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (l) => <PageStatusBadge status={l.status} />,
    },
    {
      key: "bankRefNumber",
      header: "مرجع البنك",
      render: (l) => (l.bankRefNumber ? <span className="font-mono text-xs">{l.bankRefNumber}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "errorMessage",
      header: "ملاحظات البنك",
      render: (l) =>
        l.errorMessage ? (
          <span className="text-red-600 text-xs">{l.errorMessage}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <PageShell
      title={`تشغيل WPS — ${run.period}`}
      subtitle={`${run.bankCode} • ${run.recordCount} موظف • ${formatCurrency(Number(run.totalAmount))}`}
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "الموارد البشرية", href: "/hr/payroll" },
        { label: "WPS", href: "/hr/wps" },
        { label: run.period },
      ]}
      actions={
        <div className="flex gap-2">
          {canDownload && (
            <a href={`/api/hr/wps/runs/${id}/file`} download>
              <Button variant="outline">
                <Download className="h-4 w-4 ml-1" /> تنزيل الملف
              </Button>
            </a>
          )}
          {canSubmit && (
            <GuardedButton
              perm="hr.payroll.wps:submit"
              onClick={async () => {
                if (!confirm("سيتم تعليم الـrun كمُرسَل للبنك. هل أنت متأكد؟")) return;
                setSubmitting(true);
                try {
                  await submitMut.mutateAsync({} as Record<string, never>);
                } catch (err) {
                  toast(buildErrorToast(err));
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
            >
              <Send className="h-4 w-4 ml-1" /> تعليم كمُرسَل
            </GuardedButton>
          )}
          {canApplyAck && (
            <GuardedButton
              perm="hr.payroll.wps:update"
              onClick={() => setAckOpen(true)}
            >
              <Upload className="h-4 w-4 ml-1" /> تطبيق تأكيد البنك
            </GuardedButton>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4" /> الحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PageStatusBadge status={run.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" /> عدد الموظفين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{run.recordCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4" /> الإجمالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(Number(run.totalAmount))}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <CheckCircle className="h-4 w-4" /> تاريخ الإرسال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {run.submittedAt ? formatDateAr(run.submittedAt) : <span className="text-muted-foreground">لم يُرسل بعد</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      {run.skippedEntries && run.skippedEntries.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" /> موظفون تم تخطيهم ({run.skippedEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {run.skippedEntries.slice(0, 50).map((s) => (
                <div key={s.employeeId} className="flex justify-between border-b border-amber-200 pb-1">
                  <span>{s.employeeName}</span>
                  <Badge variant="outline" className="text-amber-700">
                    {REASON_LABELS[s.reason] || s.reason}
                  </Badge>
                </div>
              ))}
              {run.skippedEntries.length > 50 && (
                <div className="text-xs text-amber-700 pt-2">
                  + {run.skippedEntries.length - 50} موظف آخر
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>سطور التشغيل ({run.lines?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={run.lines || []}
            columns={lineColumns}
            emptyMessage="لا توجد سطور في هذا التشغيل"
          />
        </CardContent>
      </Card>

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> تطبيق تأكيد البنك
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              الصق محتوى ملف الـack المستلَم من البنك. سيتم مطابقة كل سطر مع
              سطور هذا التشغيل وتحديث حالة الدفع لكل موظف.
            </p>
            <div>
              <Label>محتوى ملف التأكيد</Label>
              <Textarea
                value={ackText}
                onChange={(e) => setAckText(e.target.value)}
                rows={10}
                placeholder="الصق نص ملف ack هنا..."
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckOpen(false)}>إلغاء</Button>
            <Button
              disabled={!ackText.trim() || ackMut.isPending}
              onClick={() => ackMut.mutate({ ackText })}
            >
              {ackMut.isPending ? "جاري التطبيق..." : "تطبيق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
