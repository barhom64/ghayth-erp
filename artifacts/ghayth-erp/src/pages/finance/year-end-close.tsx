import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { EntityDetailPage, type EntityTab } from "@/components/shared/entity-detail-page";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  FormShell,
  FormGrid,
  FormNumberField,
  FormTextField,
  FormCheckboxField,
} from "@workspace/ui-core";
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

const yearEndSchema = z.object({
  year: z.string().min(1, "السنة المالية مطلوبة"),
  retainedEarningsAccountCode: z.string().min(1, "الحساب مطلوب"),
  force: z.boolean(),
});
type YearEndForm = z.infer<typeof yearEndSchema>;

// Renders the "force=false + missingPeriods" hint that needs the live
// checkbox value to know when to disappear.
function ForceHint({ force }: { force: boolean }) {
  if (force) return null;
  return (
    <p className="text-xs text-status-warning-foreground mt-2">
      فعّل خيار "إقفال الفترات الشهرية المتبقية تلقائياً" للمتابعة
    </p>
  );
}

function ForceHintFromContext() {
  const { watch } = useFormContext<YearEndForm>();
  const force = watch("force");
  return <ForceHint force={force} />;
}

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

// Preview button lives inside FormShell so it can read getValues().
// type="button" so it doesn't trigger the form's submit (which is wired
// to the destructive close action).
function PreviewButton({
  pending,
  onPreview,
}: {
  pending: boolean;
  onPreview: (values: YearEndForm) => void;
}) {
  const { getValues } = useFormContext<YearEndForm>();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onPreview(getValues())}
      disabled={pending}
    >
      <Calculator className="h-4 w-4 me-1" />
      {pending ? "جاري الحساب..." : "معاينة"}
    </Button>
  );
}

export default function YearEndClosePage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState<string>(String(currentYear));
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [closed, setClosed] = useState(false);
  // Year-end close is the most destructive operation in the system —
  // moves every P&L balance to retained earnings and locks the year.
  // Replaces a native confirm() with a proper AlertDialog so RTL +
  // dark mode + clear messaging all work.
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<{ retainedEarningsAccountCode: string; force: boolean } | null>(null);

  const previewMut = useApiMutation<YearEndPreview, { retainedEarningsAccountCode: string; force: boolean }>(
    () => `/finance/fiscal-periods/${activeYear}/year-end-close?dryRun=true`,
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
    () => `/finance/fiscal-periods/${activeYear}/year-end-close`,
    "POST",
    undefined,
    {
      successMessage: `تم إقفال السنة ${activeYear} بنجاح`,
      onSuccess: (data) => {
        setPreview(data);
        setClosed(true);
      },
    }
  );

  const handlePreview = (values: YearEndForm) => {
    setActiveYear(values.year);
    previewMut.mutate({
      retainedEarningsAccountCode: values.retainedEarningsAccountCode,
      force: values.force,
    });
  };

  const handleOpenConfirm = (values: YearEndForm) => {
    if (!preview) {
      toast({ variant: "destructive", title: "قم بالمعاينة أولاً" });
      return;
    }
    setPendingPayload({
      retainedEarningsAccountCode: values.retainedEarningsAccountCode,
      force: values.force,
    });
    setConfirmingClose(true);
  };

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
    <FormShell
      schema={yearEndSchema}
      defaultValues={{ year: String(currentYear), retainedEarningsAccountCode: "3300", force: false }}
      submitLabel={confirmMut.isPending ? "جاري الإقفال..." : closed ? "تم الإقفال" : "تأكيد الإقفال"}
      submitVariant="default"
      disabled={!preview || confirmMut.isPending || closed}
      secondaryActions={<PreviewButton pending={previewMut.isPending} onPreview={handlePreview} />}
      className="space-y-4"
      onSubmit={(values) => handleOpenConfirm(values)}
    >
      <Card>
        <CardContent className="p-6 space-y-4">
          <FormGrid cols={3}>
            <FormNumberField name="year" label="السنة المالية" min={2000} max={2100} required />
            <FormTextField name="retainedEarningsAccountCode" label="حساب الأرباح المحتجزة" placeholder="3300" required />
            <div className="flex items-end">
              <FormCheckboxField name="force" label="إقفال الفترات الشهرية المتبقية تلقائياً" />
            </div>
          </FormGrid>
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
                <ForceHintFromContext />
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
    </FormShell>
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
            <AlertDialogTitle>تأكيد إقفال السنة المالية {activeYear}</AlertDialogTitle>
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
                if (pendingPayload) confirmMut.mutate(pendingPayload);
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
