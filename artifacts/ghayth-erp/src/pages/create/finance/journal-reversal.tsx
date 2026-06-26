import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import {
  Undo2, AlertTriangle, FileSignature, Lock, CheckCircle2, Search,
  ArrowRight, Calendar, RotateCcw,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * JE Reversal Wizard
 *
 * Picks any non-reversed JE, shows the original lines side-by-side with the
 * proposed reversal lines (debit/credit swapped), captures a mandatory reason,
 * and posts the reversal via POST /finance/journal/:id/reverse.
 *
 * Saves the operator from reading hex-dumped account codes — visualizes the
 * impact before they commit.
 */

interface JeLine {
  accountCode: string;
  debit: number | string;
  credit: number | string;
  description?: string;
}

interface Je {
  id: number;
  ref: string;
  description: string;
  status: string;
  createdAt: string;
  reversalOfId: number | null;
  reversedById: number | null;
  operationType?: string;
  totalDebit: number | string;
  totalCredit: number | string;
  lines: JeLine[];
}

interface JeListResp {
  data: Je[];
  total: number;
}

export default function JournalReversalPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reverseDate, setReverseDate] = useState(() => todayLocal());
  const [confirming, setConfirming] = useState(false);

  // م٧ — وصول من صفحة تفاصيل القيد (?id=) يُختار القيد مسبقًا، فيصبح العكس إجراءً
  // مبدوءًا من التفاصيل (doc 25 §٤) مع إبقاء المعاينة والسبب الإلزامي هنا.
  useEffect(() => {
    const qid = new URLSearchParams(window.location.search).get("id");
    if (qid && /^\d+$/.test(qid)) setSelectedId(Number(qid));
  }, []);

  const { data: jeList, isLoading } = useApiQuery<JeListResp>(
    ["journal-list-reversal-pick"],
    `/finance/journal`,
  );

  const filtered = (jeList?.data ?? []).filter(je => {
    if (je.reversedById || je.reversalOfId) return false;
    if (je.status === "reversed" || je.status === "cancelled") return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      je.ref.toLowerCase().includes(s) ||
      (je.description ?? "").toLowerCase().includes(s) ||
      String(je.id).includes(s)
    );
  });

  const selected = (jeList?.data ?? []).find(je => je.id === selectedId);

  const reverseMutation = useApiMutation<{ newJournalId?: number; newRef?: string }>(
    (selectedId ? `/finance/journal/${selectedId}/reverse` : ""),
    "POST",
    [["journal-list-reversal-pick"], ["journal"]],
  );

  const handlePost = () => {
    if (!selectedId) return;
    reverseMutation.mutate(
      { reason, reverseDate },
      {
        onSuccess: (data) => {
          setConfirming(false);
          if (data?.newJournalId) {
            setTimeout(() => setLocation(`/finance/journal/${data.newJournalId}`), 1500);
          }
        },
      },
    );
  };

  return (
    <PageShell
      title="عكس قيد محاسبي"
      subtitle="معالج آمن لإنشاء قيد عاكس مع التحقق من شروط الأمان"
    >
      <FinanceTabsNav />

      {/* Step 1: Pick JE */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="inline-flex w-6 h-6 rounded-full bg-status-info-foreground text-white items-center justify-center text-xs">1</span>
            اختر القيد المراد عكسه
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم أو مرجع أو وصف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>

          {isLoading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              {search ? "لا قيود مطابقة" : "لا توجد قيود قابلة للعكس"}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <DataTable<Je>
                noToolbar
                pageSize={0}
                data={filtered.slice(0, 50)}
                rowKey={(je) => je.id}
                onRowClick={(je) => setSelectedId(je.id)}
                rowClassName={(je) => (selectedId === je.id ? "bg-status-info-surface" : undefined)}
                columns={[
                  { key: "ref", header: "المرجع", sortable: false, className: "font-mono text-xs", render: (je) => je.ref },
                  { key: "description", header: "الوصف", sortable: false, className: "text-xs max-w-md truncate", render: (je) => je.description },
                  { key: "date", header: "التاريخ", sortable: false, className: "text-xs whitespace-nowrap", render: (je) => formatDateAr(je.createdAt.split("T")[0]) },
                  { key: "total", header: "الإجمالي", sortable: false, align: "end", className: "tabular-nums", render: (je) => formatCurrency(Number(je.totalDebit)) },
                  { key: "status", header: "الحالة", sortable: false, render: (je) => <Badge variant="outline" className="text-[10px]">{je.status}</Badge> },
                  { key: "_sel", header: "", sortable: false, render: (je) => (selectedId === je.id ? <CheckCircle2 className="w-4 h-4 text-status-info-foreground" /> : null) },
                ]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Preview reversal */}
      {selected && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="inline-flex w-6 h-6 rounded-full bg-status-info-foreground text-white items-center justify-center text-xs">2</span>
              معاينة العكس
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Original */}
              <div className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-muted-foreground">القيد الأصلي</div>
                  <Badge variant="outline" className="font-mono text-[10px]">{selected.ref}</Badge>
                </div>
                <div className="text-sm font-medium mb-2 truncate" title={selected.description}>
                  {selected.description}
                </div>
                <DataTable<JeLine>
                  noToolbar
                  pageSize={0}
                  className="text-xs"
                  data={selected.lines}
                  rowKey={(_l, i) => i}
                  columns={[
                    {
                      key: "accountCode", header: "الحساب",
                      render: (l) => <span className="font-mono">{l.accountCode}</span>,
                    },
                    {
                      key: "debit", header: "مدين", align: "end",
                      render: (l) => (
                        <span className="tabular-nums">
                          {Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : "—"}
                        </span>
                      ),
                    },
                    {
                      key: "credit", header: "دائن", align: "end",
                      render: (l) => (
                        <span className="tabular-nums">
                          {Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : "—"}
                        </span>
                      ),
                    },
                  ] satisfies DataTableColumn<JeLine>[]}
                />
              </div>

              {/* Reversal preview */}
              <div className="border-2 border-status-warning-foreground rounded p-3 bg-status-warning-surface">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-status-warning-foreground flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    القيد العاكس (سيُنشأ)
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] bg-background">
                    REV-{selected.ref}
                  </Badge>
                </div>
                <div className="text-sm font-medium mb-2 truncate">
                  عكس قيد: {selected.description}
                </div>
                <DataTable<JeLine>
                  noToolbar
                  pageSize={0}
                  className="text-xs"
                  data={selected.lines}
                  rowKey={(_l, i) => i}
                  columns={[
                    {
                      key: "accountCode", header: "الحساب",
                      render: (l) => <span className="font-mono">{l.accountCode}</span>,
                    },
                    {
                      key: "debit", header: "مدين", align: "end",
                      render: (l) => (
                        <span className="tabular-nums">
                          {Number(l.credit) > 0 ? <span className="text-status-success-foreground font-semibold">{formatCurrency(Number(l.credit))}</span> : "—"}
                        </span>
                      ),
                    },
                    {
                      key: "credit", header: "دائن", align: "end",
                      render: (l) => (
                        <span className="tabular-nums">
                          {Number(l.debit) > 0 ? <span className="text-status-danger-foreground font-semibold">{formatCurrency(Number(l.debit))}</span> : "—"}
                        </span>
                      ),
                    },
                  ] satisfies DataTableColumn<JeLine>[]}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center text-muted-foreground text-xs">
              <span>كل مدين</span>
              <ArrowRight className="w-4 h-4 mx-2" />
              <span>دائن (والعكس) — صافي الأثر على الحسابات = 0</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirm */}
      {selected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="inline-flex w-6 h-6 rounded-full bg-status-info-foreground text-white items-center justify-center text-xs">3</span>
              السبب والترحيل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                سبب العكس (إلزامي — يُسجَّل في القيدين)
              </label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: تصحيح خطأ في رمز الحساب — تم تسجيله للمصاريف بدلاً من العملاء"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                تاريخ القيد العاكس
              </label>
              <Input
                type="date"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
                className="max-w-xs"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                يجب أن يكون في فترة محاسبية مفتوحة. الافتراضي: اليوم.
              </div>
            </div>

            {!reason.trim() ? (
              <div className="flex items-center gap-2 text-sm bg-status-warning-surface text-status-warning-foreground p-3 rounded">
                <AlertTriangle className="w-4 h-4" />
                يجب إدخال سبب العكس قبل المتابعة
              </div>
            ) : !confirming ? (
              <GuardedButton
                perm="finance.journal.create"
                onClick={() => setConfirming(true)}
                className="w-full"
                size="lg"
              >
                <Undo2 className="w-4 h-4 ml-2" />
                إنشاء قيد عاكس
              </GuardedButton>
            ) : (
              <div className="border-2 border-status-warning-foreground rounded p-4 bg-status-warning-surface">
                <div className="flex items-start gap-2 mb-3">
                  <Lock className="w-5 h-5 text-status-warning-foreground" />
                  <div>
                    <div className="font-semibold">تأكيد العكس</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      سيتم إنشاء قيد عاكس بمرجع <code className="font-mono">REV-{selected.ref}</code>{" "}
                      بمبلغ <strong>{formatCurrency(Number(selected.totalDebit))}</strong>{" "}
                      بتاريخ {formatDateAr(reverseDate)}.
                      <br />
                      <strong>لا يمكن إلغاء هذا الإجراء.</strong> القيد الأصلي ستتحول حالته إلى "معكوس".
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handlePost} disabled={reverseMutation.isPending} className="flex-1" rateLimitAware>
                    <FileSignature className="w-4 h-4 ml-2" />
                    {reverseMutation.isPending ? "جاري الترحيل..." : "تأكيد وإنشاء القيد العاكس"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirming(false)}
                    disabled={reverseMutation.isPending}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}

            {reverseMutation.isSuccess && reverseMutation.data?.newJournalId && (
              <div className="bg-status-success-surface text-status-success-foreground p-3 rounded flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                تم إنشاء القيد العاكس بنجاح — JE #{reverseMutation.data.newJournalId}{" "}
                {reverseMutation.data.newRef && <span className="font-mono">({reverseMutation.data.newRef})</span>}.
                جاري التحويل...
              </div>
            )}
            {reverseMutation.isError && (
              <div className="bg-status-danger-surface text-status-danger-foreground p-3 rounded flex items-center gap-2 text-sm">
                <AlertTriangle className="w-5 h-5" />
                فشل العكس: {(reverseMutation.error as Error)?.message ?? "خطأ غير معروف"}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
