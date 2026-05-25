import { useState } from "react";
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
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatNumber } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { Files, Trash2, Plus } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

interface TemplateLine {
  id: number;
  templateId: number;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  side: "debit" | "credit";
  description: string | null;
  amountFormula: string | null;
  sortOrder: number;
}

interface JournalTemplate {
  id: number;
  name: string;
  operationType: string;
  description: string | null;
  branchId: number | null;
  activityType: string | null;
  createdAt: string;
  lines: TemplateLine[];
}

export default function JournalTemplatesPage() {
  const { toast } = useToast();
  const [opTypeFilter, setOpTypeFilter] = useState<string>("");

  const qs = opTypeFilter ? `?operationType=${encodeURIComponent(opTypeFilter)}` : "";
  const { data, isLoading, isError } = useApiQuery<{ data: JournalTemplate[]; total: number }>(
    ["journal-templates", opTypeFilter],
    `/finance/journal-templates${qs}`,
  );

  const deleteMut = useApiMutation<unknown, { id: number }>(
    (b) => `/finance/journal-templates/${b.id}`,
    "DELETE",
    [["journal-templates"]],
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const templates = data?.data ?? [];
  const opTypes = Array.from(new Set(templates.map((t) => t.operationType))).sort();

  const handleDelete = async (id: number) => {
    try {
      await deleteMut.mutateAsync({ id });
      toast({ title: "تم حذف القالب" });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الحذف", description: getErrorMessage(err) });
    }
  };

  const cols: DataTableColumn<JournalTemplate>[] = [
    {
      key: "name",
      header: "الاسم",
      render: (t) => <span className="font-medium text-sm">{t.name}</span>,
    },
    {
      key: "operationType",
      header: "نوع العملية",
      render: (t) => <Badge variant="outline" className="font-mono text-[10px]">{t.operationType}</Badge>,
    },
    {
      key: "activityType",
      header: "النشاط",
      render: (t) => t.activityType
        ? <Badge variant="outline" className="text-[10px]">{t.activityType}</Badge>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "lines",
      header: "البنود",
      render: (t) => {
        const debitCount  = t.lines?.filter((l) => l.side === "debit").length ?? 0;
        const creditCount = t.lines?.filter((l) => l.side === "credit").length ?? 0;
        return (
          <div className="flex items-center gap-1.5 text-[10px]">
            <Badge variant="outline" className="text-emerald-700">{debitCount} مدين</Badge>
            <span className="text-muted-foreground">·</span>
            <Badge variant="outline" className="text-red-700">{creditCount} دائن</Badge>
          </div>
        );
      },
    },
    {
      key: "description",
      header: "الوصف",
      render: (t) => t.description
        ? <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs">{t.description}</span>
        : <span className="text-muted-foreground italic">—</span>,
    },
    {
      key: "_actions",
      header: "إجراءات",
      render: (t) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <GuardedButton perm="finance:delete" variant="ghost" size="sm" className="h-7 text-xs text-red-700">
              <Trash2 className="h-3 w-3 me-1" /> حذف
            </GuardedButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف قالب القيد؟</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{t.name}</strong> — لن يحذف القيود السابقة المنشأة منه، لكن لن يستخدم مستقبلاً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDelete(t.id)}
                className="bg-red-600 hover:bg-red-700">حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];

  return (
    <PageShell
      title="قوالب القيود الجاهزة"
      subtitle="journal_entry_templates — قيود متكررة معرّفة مسبقاً (مرتبات / استهلاكات / إيجارات) يستخدمها الـ recurring scheduler لإنشاء قيود تلقائياً"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/recurring-journals", label: "القيود المتكررة" },
        { label: "القوالب" },
      ]}
      actions={
        <GuardedButton perm="finance:create"
          onClick={() => toast({ title: "صفحة الإنشاء — follow-up PR", description: "حالياً استخدم POST /finance/journal-templates من الـ API" })}>
          <Plus className="h-4 w-4 me-1" /> قالب جديد
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Files className="h-4 w-4" /> ما هي قوالب القيود؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            قوالب القيود تعرّف الشكل العام لقيد متكرر (الحسابات + الـ formula
            للمبلغ + الوصف) بدون قيمة محددة. لما الـ recurring scheduler يطلق
            القيد (أو لما المستخدم يختار القالب يدوياً)، يُملأ المبلغ الفعلي
            وينتج قيد JE حقيقي. توفر وقتاً وتقلل أخطاء الإدخال للقيود الشهرية
            الثابتة (مرتبات، استهلاكات، إيجارات، ...).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي القوالب</p>
            <p className="text-lg font-bold font-mono">{formatNumber(templates.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">أنواع العمليات</p>
            <p className="text-lg font-bold font-mono">{formatNumber(opTypes.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي البنود</p>
            <p className="text-lg font-bold font-mono">
              {formatNumber(templates.reduce((s, t) => s + (t.lines?.length ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {opTypes.length > 1 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-muted-foreground">نوع العملية:</span>
          <Badge variant={opTypeFilter === "" ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setOpTypeFilter("")}>الكل ({templates.length})</Badge>
          {opTypes.map((op) => {
            const count = templates.filter((t) => t.operationType === op).length;
            return (
              <Badge key={op}
                variant={opTypeFilter === op ? "default" : "outline"}
                className="cursor-pointer text-xs font-mono"
                onClick={() => setOpTypeFilter(op)}>
                {op} ({count})
              </Badge>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">القوالب ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={templates}
            pageSize={50}
            emptyMessage="لا توجد قوالب — أضف قالباً عبر POST /finance/journal-templates"
          />
        </CardContent>
      </Card>

      <Card className="mt-4 bg-amber-50/30 border-amber-200">
        <CardContent className="p-3 text-xs text-amber-800">
          ⓘ صفحة الإنشاء والتعديل التفصيلية — follow-up PR. حالياً استخدم
          <code className="bg-white border px-1 mx-1 rounded">POST /finance/journal-templates</code>
          مع الـ body مباشرة. شاهد <code className="bg-white border px-1 mx-1 rounded">/finance/recurring-journals/create</code>
          لإنشاء جدول تشغيل من قالب موجود.
        </CardContent>
      </Card>
    </PageShell>
  );
}
