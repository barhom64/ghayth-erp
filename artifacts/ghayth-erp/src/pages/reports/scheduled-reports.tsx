import { useState } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  FormShell,
  FormTextField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Clock, Mail, FileSpreadsheet, FileText, Calendar, Send, History } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation as useDeleteMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const scheduleSchema = z.object({
  reportType: z.string().min(1, "نوع التقرير مطلوب"),
  title: z.string().trim().min(1, "العنوان مطلوب"),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  // Comma-separated emails — schema-level validation replaces the
  // imperative `emails.length === 0` toast plus per-email regex.
  recipients: z.string().refine(
    (v) => {
      const emails = v.split(",").map((e) => e.trim()).filter(Boolean);
      if (emails.length === 0) return false;
      return emails.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    },
    "أدخل عنوان بريد إلكتروني واحد أو أكثر مفصولاً بفاصلة",
  ),
  isActive: z.boolean(),
});
type ScheduleForm = z.infer<typeof scheduleSchema>;

const REPORT_TYPES = [
  { value: "trial-balance", label: "ميزان المراجعة", format: "جدول بيانات", icon: FileSpreadsheet },
  { value: "income-statement", label: "قائمة الدخل", format: "جدول بيانات", icon: FileSpreadsheet },
  { value: "payroll", label: "كشف الرواتب", format: "جدول بيانات", icon: FileSpreadsheet },
  { value: "attendance", label: "سجل الحضور", format: "جدول بيانات", icon: FileSpreadsheet },
  { value: "trial-balance-pdf", label: "ميزان المراجعة (طباعي)", format: "ملف طباعي", icon: FileText },
];

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

export default function ScheduledReportsPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["scheduled-reports"], "/scheduled-reports");
  const items = data?.data || [];
  const { data: historyData } = useApiQuery<any>(["scheduled-reports-history"], "/scheduled-reports/history");
  const history = historyData?.data || [];

  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const createMut = useApiMutation<unknown, {
    reportType: string;
    title: string;
    frequency: string;
    recipients: string[];
    isActive: boolean;
  }>("/scheduled-reports", "POST", [["scheduled-reports"]]);

  const handleSubmit = async (values: ScheduleForm) => {
    const emails = values.recipients.split(",").map((e) => e.trim()).filter(Boolean);
    try {
      await createMut.mutateAsync({
        reportType: values.reportType,
        title: values.title,
        frequency: values.frequency,
        recipients: emails,
        isActive: values.isActive,
      });
      toast({ title: "تم إنشاء جدولة التقرير" });
      setShowForm(false);
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-7 w-7 text-status-info-foreground" />
            التقارير المجدولة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">جدولة إرسال التقارير تلقائياً بالبريد الإلكتروني</p>
        </div>
        <GuardedButton perm="reports:create" size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />
          {showForm ? "إلغاء" : "جدولة جديدة"}
        </GuardedButton>
      </div>

      {showForm && (
        <Card className="border-status-info-surface bg-status-info-surface">
          <CardHeader><CardTitle className="text-base">إنشاء جدولة تقرير جديدة</CardTitle></CardHeader>
          <CardContent>
            <FormShell
              schema={scheduleSchema}
              defaultValues={{
                reportType: "trial-balance",
                title: "",
                frequency: "weekly" as const,
                recipients: "",
                isActive: true,
              }}
              submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ الجدولة"}
              secondaryActions={
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values) => {
                await handleSubmit(values);
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="title" label="عنوان التقرير" required placeholder="مثال: ميزان المراجعة الأسبوعي" />
                <FormSelectField
                  name="reportType"
                  label="نوع التقرير"
                  required
                  options={REPORT_TYPES.map((rt) => ({
                    value: rt.value,
                    label: `${rt.label} — ${rt.format}`,
                  }))}
                />
                <FormSelectField
                  name="frequency"
                  label="التكرار"
                  required
                  options={[
                    { value: "daily", label: "يومي (كل صباح)" },
                    { value: "weekly", label: "أسبوعي (كل أحد)" },
                    { value: "monthly", label: "شهري (أول الشهر)" },
                  ]}
                />
                <FormTextField name="recipients" label="المستلمون (فصل بفاصلة)" required placeholder="email1@example.com, email2@example.com" />
              </FormGrid>
              <ActiveSwitch />
            </FormShell>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="schedules">
        <TabsList>
          <TabsTrigger value="schedules" className="gap-1"><Calendar className="h-3.5 w-3.5" />الجداول</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="h-3.5 w-3.5" />السجل</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
          <div className="grid gap-3 mt-4">
            {isLoading ? (
              [...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-16 bg-surface-subtle rounded animate-pulse" /></CardContent></Card>)
            ) : items.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-muted-foreground">لا توجد تقارير مجدولة</p>
                  <p className="text-xs text-muted-foreground mt-1">أنشئ جدولة جديدة لإرسال التقارير تلقائياً</p>
                </CardContent>
              </Card>
            ) : (
              items.map((item: any) => <ScheduledReportCard key={item.id} item={item} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">سجل الإرسال</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {history.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground">لا يوجد سجل إرسال</p>
                ) : history.map((h: any) => (
                  <div key={h.id} className="p-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${h.status === "sent" ? "bg-status-success-surface0" : "bg-status-error-surface0"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{h.reportTitle}</p>
                      <p className="text-xs text-muted-foreground">{h.sentAt ? formatDateAr(h.sentAt) : "-"}</p>
                    </div>
                    <PageStatusBadge status={h.status} />
                    {h.error && <p className="text-xs text-status-error max-w-xs">{h.error}</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScheduledReportCard({ item }: { item: any }) {
  const { toast } = useToast();
  const deleteMut = useDeleteMutation(`/scheduled-reports/${item.id}`, "DELETE", [["scheduled-reports"]]);
  const toggleMut = useDeleteMutation(`/scheduled-reports/${item.id}`, "PATCH", [["scheduled-reports"]]);

  const reportType = REPORT_TYPES.find((r) => r.value === item.reportType);
  const Icon = reportType?.icon || FileSpreadsheet;

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({});
      toast({ title: "تم حذف الجدولة" });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const handleToggle = async (v: boolean) => {
    try {
      await toggleMut.mutateAsync({ isActive: v });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-status-info-surface rounded-lg">
            <Icon className="h-5 w-5 text-status-info-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold">{item.title}</p>
              <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[item.frequency] || item.frequency}</Badge>
              <Badge className={item.isActive ? "bg-status-success-surface text-status-success-foreground text-xs" : "bg-surface-subtle text-muted-foreground text-xs"}>
                {item.isActive ? "نشط" : "متوقف"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{reportType?.label || item.reportType} — {reportType?.format}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              <span dir="ltr">{(item.recipients || []).join(", ")}</span>
            </div>
            {item.lastSentAt && (
              <p className="text-xs text-muted-foreground mt-1">آخر إرسال: {formatDateAr(item.lastSentAt)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={item.isActive} onCheckedChange={handleToggle} />
            <GuardedButton perm="reports:create" variant="ghost" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
              <Trash2 className="h-4 w-4 text-status-error" />
            </GuardedButton>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Boolean Switch as a form field — FormShell's primitives are
// text/number/select, so booleans go through useFormContext.
// Same pattern as ModulesPicker in admin/roles.tsx (#356).
function ActiveSwitch() {
  const { watch, setValue } = useFormContext<ScheduleForm>();
  const isActive = watch("isActive");
  return (
    <div className="flex items-center gap-3 mt-4">
      <Switch
        checked={isActive}
        onCheckedChange={(v) => setValue("isActive", v, { shouldDirty: true })}
      />
      <Label>تفعيل التقرير المجدول</Label>
    </div>
  );
}
