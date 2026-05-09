import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Clock, Mail, FileSpreadsheet, FileText, Calendar, Send, History } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation as useDeleteMutation } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

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
  const [form, setForm] = useState({
    reportType: "trial-balance",
    title: "",
    frequency: "weekly",
    recipients: "",
    isActive: true,
  });

  const createMut = useApiMutation("/scheduled-reports", "POST", [["scheduled-reports"]]);

  const handleSubmit = async () => {
    if (!form.title || !form.recipients) {
      toast({ variant: "destructive", title: "يرجى تعبئة جميع الحقول المطلوبة" });
      return;
    }
    const emails = form.recipients.split(",").map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان بريد إلكتروني واحد على الأقل" });
      return;
    }
    try {
      await createMut.mutateAsync({
        reportType: form.reportType,
        title: form.title,
        frequency: form.frequency,
        recipients: emails,
        isActive: form.isActive,
      });
      toast({ title: "تم إنشاء جدولة التقرير" });
      setShowForm(false);
      setForm({ reportType: "trial-balance", title: "", frequency: "weekly", recipients: "", isActive: true });
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
            <Clock className="h-7 w-7 text-blue-600" />
            التقارير المجدولة
          </h1>
          <p className="text-sm text-gray-500 mt-1">جدولة إرسال التقارير تلقائياً بالبريد الإلكتروني</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />
          {showForm ? "إلغاء" : "جدولة جديدة"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader><CardTitle className="text-base">إنشاء جدولة تقرير جديدة</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>عنوان التقرير *</Label>
                <Input className="mt-1" placeholder="مثال: ميزان المراجعة الأسبوعي" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>نوع التقرير *</Label>
                <Select value={form.reportType} onValueChange={(v) => setForm({ ...form, reportType: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map((rt) => (
                      <SelectItem key={rt.value} value={rt.value}>
                        <div className="flex items-center gap-2">
                          <rt.icon className="h-4 w-4" />
                          {rt.label} — {rt.format}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>التكرار *</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">يومي (كل صباح)</SelectItem>
                    <SelectItem value="weekly">أسبوعي (كل أحد)</SelectItem>
                    <SelectItem value="monthly">شهري (أول الشهر)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>المستلمون (فصل بفاصلة) *</Label>
                <Input className="mt-1" dir="ltr" placeholder="email1@example.com, email2@example.com" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>تفعيل التقرير المجدول</Label>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
                  <Send className="h-4 w-4 me-1" />
                  {createMut.isPending ? "جاري الحفظ..." : "حفظ الجدولة"}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              </div>
            </div>
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
              [...Array(3)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-16 bg-gray-100 rounded animate-pulse" /></CardContent></Card>)
            ) : items.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">لا توجد تقارير مجدولة</p>
                  <p className="text-xs text-gray-400 mt-1">أنشئ جدولة جديدة لإرسال التقارير تلقائياً</p>
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
                  <p className="p-6 text-center text-gray-400">لا يوجد سجل إرسال</p>
                ) : history.map((h: any) => (
                  <div key={h.id} className="p-3 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${h.status === "sent" ? "bg-green-500" : "bg-red-500"}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{h.reportTitle}</p>
                      <p className="text-xs text-gray-500">{h.sentAt ? formatDateAr(h.sentAt) : "-"}</p>
                    </div>
                    <PageStatusBadge status={h.status} />
                    {h.error && <p className="text-xs text-red-500 max-w-xs">{h.error}</p>}
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
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold">{item.title}</p>
              <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[item.frequency] || item.frequency}</Badge>
              <Badge className={item.isActive ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                {item.isActive ? "نشط" : "متوقف"}
              </Badge>
            </div>
            <p className="text-xs text-gray-500">{reportType?.label || item.reportType} — {reportType?.format}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
              <Mail className="h-3 w-3" />
              <span dir="ltr">{(item.recipients || []).join(", ")}</span>
            </div>
            {item.lastSentAt && (
              <p className="text-xs text-gray-400 mt-1">آخر إرسال: {formatDateAr(item.lastSentAt)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch checked={item.isActive} onCheckedChange={handleToggle} />
            <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
