import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Archive, TrendingUp, TrendingDown, Calculator, CheckCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface YearEndPreview {
  dryRun?: boolean;
  year: number;
  retainedEarningsAccountCode: string;
  netIncome: number;
  totalRevenue: number;
  totalExpense: number;
  revenues: Array<{ code: string; name: string; balance: number }>;
  expenses: Array<{ code: string; name: string; balance: number }>;
  lines: Array<{ accountCode: string; debit: number; credit: number; description?: string }>;
  missingPeriods?: string[];
  ref?: string;
  id?: number;
}

export default function YearEndClosePage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [retainedEarningsAccountCode, setRetainedEarningsAccountCode] = useState<string>("3300");
  const [force, setForce] = useState(false);
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [closed, setClosed] = useState(false);
  // Year-end close is the most destructive operation in the system —
  // moves every P&L balance to retained earnings and locks the year.
  // Replaces a native confirm() with a proper AlertDialog so RTL +
  // dark mode + clear messaging all work.
  const [confirmingClose, setConfirmingClose] = useState(false);

  const previewMut = useApiMutation<YearEndPreview, { retainedEarningsAccountCode: string; force: boolean }>(
    () => `/finance/fiscal-periods/${year}/year-end-close?dryRun=true`,
    "POST",
    undefined,
    {
      onSuccess: (data) => {
        setPreview(data);
        setClosed(false);
      },
    }
  );

  const confirmMut = useApiMutation<YearEndPreview, { retainedEarningsAccountCode: string; force: boolean }>(
    () => `/finance/fiscal-periods/${year}/year-end-close`,
    "POST",
    undefined,
    {
      successMessage: `تم إقفال السنة ${year} بنجاح`,
      onSuccess: (data) => {
        setPreview(data);
        setClosed(true);
      },
    }
  );

  const closingEntryColumns: DataTableColumn<YearEndPreview["lines"][number]>[] = [
    {
      key: "accountCode",
      header: "الحساب",
      render: (l) => <span className="font-mono text-xs">{l.accountCode}</span>,
    },
    {
      key: "description",
      header: "البيان",
      render: (l) => <span className="text-xs">{l.description || "—"}</span>,
    },
    {
      key: "debit",
      header: "مدين",
      render: (l) => <span className="font-mono">{l.debit > 0 ? formatCurrency(l.debit) : ""}</span>,
    },
    {
      key: "credit",
      header: "دائن",
      render: (l) => <span className="font-mono">{l.credit > 0 ? formatCurrency(l.credit) : ""}</span>,
    },
  ];

  const wizardTab = () => (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>السنة المالية *</Label>
              <Input
                type="number"
                className="mt-1"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min="2000"
                max="2100"
              />
            </div>
            <div>
              <Label>حساب الأرباح المحتجزة *</Label>
              <Input
                className="mt-1"
                value={retainedEarningsAccountCode}
                onChange={(e) => setRetainedEarningsAccountCode(e.target.value)}
                placeholder="3300"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
                إقفال الفترات الشهرية المتبقية تلقائياً
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => previewMut.mutate({ retainedEarningsAccountCode, force })} disabled={previewMut.isPending}>
              <Calculator className="h-4 w-4 me-1" />
              {previewMut.isPending ? "جاري الحساب..." : "معاينة"}
            </Button>
            <GuardedButton
              perm="finance:approve"
              onClick={() => {
                if (!preview) {
                  toast({ variant: "destructive", title: "قم بالمعاينة أولاً" });
                  return;
                }
                setConfirmingClose(true);
              }}
              disabled={!preview || confirmMut.isPending || closed}
            >
              <CheckCircle className="h-4 w-4 me-1" />
              {confirmMut.isPending ? "جاري الإقفال..." : closed ? "تم الإقفال" : "تأكيد الإقفال"}
            </GuardedButton>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <>
          {preview.missingPeriods && preview.missingPeriods.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-status-warning-foreground mb-2">
                  فترات شهرية غير مُقفلة ({preview.missingPeriods.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {preview.missingPeriods.map((p) => (
                    <Badge key={p} className="bg-status-warning-surface text-status-warning-foreground">{p}</Badge>
                  ))}
                </div>
                {!force && (
                  <p className="text-xs text-status-warning-foreground mt-2">
                    فعّل خيار "إقفال الفترات الشهرية المتبقية تلقائياً" للمتابعة
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-status-success-surface rounded-lg">
                  <TrendingUp className="h-5 w-5 text-status-success-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                  <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(preview.totalRevenue)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-status-error-surface rounded-lg">
                  <TrendingDown className="h-5 w-5 text-status-error-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
                  <p className="text-lg font-bold text-status-error-foreground">{formatCurrency(preview.totalExpense)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Archive className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">صافي الدخل</p>
                  <p
                    className={`text-lg font-bold ${preview.netIncome >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}
                  >
                    {formatCurrency(preview.netIncome)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm font-semibold mb-3">
                قيد إقفال السنة المقترح ({preview.lines.length} بند)
              </p>
              <DataTable
                columns={closingEntryColumns}
                data={preview.lines}
                searchPlaceholder={null}
                noToolbar
                pageSize={0}
                emptyMessage="لا توجد بنود"
              />
              {closed && preview.ref && (
                <p className="text-sm text-status-success-foreground mt-3">
                  تم ترحيل القيد: <span className="font-mono">{preview.ref}</span> (#{preview.id})
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  const tabs: EntityTab[] = [
    { key: "wizard", label: "معالج الإقفال", icon: Archive, content: wizardTab },
  ];

  return (
    <>
      <AlertDialog
        open={confirmingClose}
        onOpenChange={(v) => { if (!v) setConfirmingClose(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إقفال السنة المالية {year}</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم نقل أرصدة الإيرادات والمصروفات إلى الأرباح المحتجزة وقفل السنة.
              <strong className="block mt-2">لا يمكن التراجع عن هذه العملية.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingClose(false)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingClose(false);
                confirmMut.mutate({ retainedEarningsAccountCode, force });
              }}
            >
              تأكيد الإقفال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    <EntityDetailPage
      title="إقفال السنة المالية"
      subtitle="ترحيل الإيرادات والمصروفات إلى الأرباح المحتجزة وإقفال السنة"
      avatar={{ icon: Archive, gradientFrom: "from-indigo-500", gradientTo: "to-purple-600" }}
      backHref="/finance/fiscal-periods"
      backLabel="العودة للفترات المالية"
      tabs={tabs}
      defaultTab="wizard"
    />
    </>
  );
}
