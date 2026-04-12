import { useState } from "react";
import { useApiQuery, useApiMutation, apiFetch, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Plug, Mail, MessageSquare, Webhook, Phone, Plus, X, Play,
  RefreshCw, AlertCircle, CheckCircle, Clock, Settings,
} from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  email: "بريد إلكتروني",
  sms: "رسائل نصية",
  whatsapp: "واتساب",
  webhook: "ويب هوك",
};

const CHANNEL_ICONS: Record<string, any> = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
  webhook: Webhook,
};

function IntegrationsList() {
  const { data: intResp, isLoading, isError, error, refetch } = useApiQuery<any>(["admin-integrations"], "/admin/integrations");
  const createMut = useApiMutation<unknown, Record<string, any>>("/admin/integrations", "POST", [["admin-integrations"]]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "email", config: "{}", status: "inactive" });
  const { toast } = useToast();
  const qc = useQueryClient();
  const integrations = asList(intResp);

  const handleCreate = async () => {
    try {
      let parsedConfig = {};
      try { parsedConfig = JSON.parse(form.config); } catch { toast({ variant: "destructive", title: "خطأ في صيغة الإعدادات JSON" }); return; }
      await createMut.mutateAsync({ ...form, config: parsedConfig });
      setForm({ name: "", type: "email", config: "{}", status: "inactive" });
      setShowForm(false);
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ في الإنشاء" }); }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      await apiFetch(`/admin/integrations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
    } catch { toast({ variant: "destructive", title: "خطأ" }); }
  };

  const handleTest = async (id: number) => {
    try {
      const result = await apiFetch(`/admin/integrations/${id}/test`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (result.success) {
        toast({ title: "نجح الاختبار" });
      } else {
        toast({ variant: "destructive", title: "فشل الاختبار", description: result.error });
      }
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الاختبار" }); }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/admin/integrations/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["admin-integrations"] });
    } catch { toast({ variant: "destructive", title: "خطأ في الحذف" }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">التكاملات المُعدّة</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة تكامل</>}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>الاسم</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم التكامل" /></div>
            <div><Label>النوع</Label>
              <select className="w-full border rounded-md p-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="email">بريد إلكتروني</option>
                <option value="sms">رسائل نصية</option>
                <option value="whatsapp">واتساب</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>الإعدادات (JSON)</Label>
              <textarea
                className="w-full border rounded-md p-2 font-mono text-sm min-h-[100px]"
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                placeholder={form.type === "email" ? '{"host":"smtp.gmail.com","port":587,"user":"...","password":"...","from":"..."}' : form.type === "webhook" ? '{"url":"https://...","headers":{}}' : "{}"}
                dir="ltr"
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={handleCreate} disabled={!form.name || createMut.isPending}>حفظ التكامل</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((intg: any) => {
          const Icon = CHANNEL_ICONS[intg.type] || Plug;
          return (
            <Card key={intg.id} className={cn("border", intg.status === "active" ? "border-green-200" : intg.status === "error" ? "border-red-200" : "border-gray-200")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center",
                      intg.status === "active" ? "bg-green-50" : intg.status === "error" ? "bg-red-50" : "bg-gray-50"
                    )}>
                      <Icon className={cn("w-5 h-5",
                        intg.status === "active" ? "text-green-600" : intg.status === "error" ? "text-red-600" : "text-gray-400"
                      )} />
                    </div>
                    <div>
                      <h4 className="font-semibold">{intg.name}</h4>
                      <p className="text-xs text-gray-500">{CHANNEL_LABELS[intg.type] || intg.type}</p>
                    </div>
                  </div>
                  <StatusBadge status={intg.status} />
                </div>

                <div className="text-xs text-gray-500 space-y-1 mb-3">
                  {intg.lastSuccessAt && <p className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />آخر نجاح: {formatDateAr(intg.lastSuccessAt)}</p>}
                  {intg.lastFailureAt && <p className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-500" />آخر فشل: {formatDateAr(intg.lastFailureAt)}</p>}
                  {intg.lastError && <p className="text-red-500 truncate">{intg.lastError}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleToggleStatus(intg.id, intg.status)}>
                    {intg.status === "active" ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleTest(intg.id)}>
                    <Play className="h-3 w-3 me-1" />اختبار
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(intg.id)}>حذف</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {integrations.length === 0 && !isLoading && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <Plug className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>لا توجد تكاملات مُعدّة</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 me-1" />إضافة تكامل
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationLogs() {
  const { data: logsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["admin-int-logs"], "/admin/integration-logs");
  const logs = asList(logsResp);
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleRetry = async () => {
    try {
      const result = await apiFetch("/admin/integration-logs/retry", { method: "POST", body: "{}" });
      toast({ title: `تمت إعادة المحاولة: ${result.retried} رسالة, نجح: ${result.succeeded}` });
      qc.invalidateQueries({ queryKey: ["admin-int-logs"] });
    } catch { toast({ variant: "destructive", title: "خطأ" }); }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed": return <AlertCircle className="w-4 h-4 text-red-500" />;
      case "retrying": return <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: "channel", header: "القناة", render: (log) => <Badge variant="outline">{CHANNEL_LABELS[log.channel] || log.channel}</Badge> },
    { key: "recipient", header: "المستلم", render: (log) => <span className="max-w-[150px] truncate inline-block">{log.recipient || "-"}</span> },
    { key: "subject", header: "الموضوع", render: (log) => <span className="max-w-[200px] truncate inline-block">{log.subject || "-"}</span> },
    {
      key: "status", header: "الحالة",
      render: (log) => (
        <div>
          <div className="flex items-center gap-1">
            {statusIcon(log.status)}
            <StatusBadge status={log.status} />
          </div>
          {log.errorMessage && <p className="text-xs text-red-500 mt-1 truncate max-w-[200px]">{log.errorMessage}</p>}
        </div>
      ),
    },
    { key: "retryAttempt", header: "المحاولة", render: (log) => log.retryAttempt || 0 },
    { key: "createdAt", header: "التاريخ", render: (log) => <span className="text-xs">{formatDateAr(log.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">سجل الإرسال</h3>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="h-4 w-4 me-1" />إعادة المحاولة للفاشلة
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <DataTable<any>
            columns={columns}
            data={logs}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سجلات إرسال"
            emptyIcon={<Mail className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminIntegrations() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Plug className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">مركز التكاملات</h1>
          <p className="text-sm text-gray-500">إدارة قنوات الإرسال والتكاملات الخارجية</p>
        </div>
      </div>

      <Tabs defaultValue="integrations" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="integrations">التكاملات</TabsTrigger>
          <TabsTrigger value="logs">سجل الإرسال</TabsTrigger>
        </TabsList>
        <TabsContent value="integrations"><IntegrationsList /></TabsContent>
        <TabsContent value="logs"><IntegrationLogs /></TabsContent>
      </Tabs>
    </div>
  );
}
