import { useState } from "react";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { formatDateAr, formatTimeAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Link2,
  AlertTriangle,
  Pencil,
  Wifi,
  RefreshCw,
  Key,
  Save,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const GOV_SYSTEM_INFO: Record<string, { color: string; desc: string; icon: string }> = {
  muqeem: { color: "bg-green-50 border-green-200", desc: "إدارة الإقامات وتصاريح العمل ومعلومات الموظفين الأجانب", icon: "🏛️" },
  tam: { color: "bg-blue-50 border-blue-200", desc: "تسجيل المركبات وبيانات اللوحات والفحص الدوري", icon: "🚗" },
  absher_business: { color: "bg-purple-50 border-purple-200", desc: "خدمات الأعمال الحكومية عبر منصة أبشر", icon: "📱" },
};

export function GovIntegrationsTab() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["gov-integrations"], "/gov-integrations");

  const integrations: any[] = data?.data || [];

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    const cfg = item.config || {};
    setEditForm({
      enabled: item.enabled,
      apiKey: cfg.apiKey || "",
      baseUrl: cfg.baseUrl || "",
      username: cfg.username || "",
      subscriptionId: cfg.subscriptionId || "",
    });
  };

  const handleSave = async (id: number) => {
    try {
      await apiFetch(`/gov-integrations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: editForm.enabled,
          config: {
            apiKey: editForm.apiKey,
            baseUrl: editForm.baseUrl,
            username: editForm.username,
            subscriptionId: editForm.subscriptionId,
          },
        }),
      });
      toast({ title: "تم الحفظ بنجاح" });
      setEditingId(null);
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: getErrorMessage(err) });
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingId(id);
    try {
      const json = await apiFetch<any>(`/gov-integrations/${id}/test`, { method: "POST" });
      toast({
        title: json.success ? "الاتصال ناجح (محاكاة)" : "فشل الاتصال",
        description: json.message,
        variant: json.success ? "default" : "destructive",
      });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الاتصال", description: getErrorMessage(err) });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (item: any) => {
    try {
      await apiFetch(`/gov-integrations/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      refetch();
      toast({ title: item.enabled ? "تم تعطيل النظام" : "تم تفعيل النظام" });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold">التكاملات الحكومية</h2>
          <p className="text-sm text-muted-foreground">ربط النظام بالمنصات الحكومية السعودية (مقيم، تام، أبشر الأعمال)</p>
        </div>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>هذه التكاملات تعمل حالياً في وضع المحاكاة — بيانات الربط الفعلي ستُفعَّل عند الاشتراك في الخدمات الحكومية المقابلة.</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        <div className="space-y-4">
          {integrations.map((item: any) => {
            const info = GOV_SYSTEM_INFO[item.type] || { color: "bg-gray-50 border-gray-200", desc: "", icon: "🔗" };
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className={`border rounded-lg p-4 ${info.color}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {item.enabled ? "مفعّل" : "معطّل"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.desc}</p>
                      {item.lastCheckStatus && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.lastCheckStatus === "connected" ? "bg-green-100 text-green-700" :
                            item.lastCheckStatus === "auth_error" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.lastCheckStatus === "connected" ? "bg-green-500" :
                              item.lastCheckStatus === "auth_error" ? "bg-yellow-500" :
                              "bg-red-500"
                            }`} />
                            {item.lastCheckStatus === "connected" ? "متصل" :
                             item.lastCheckStatus === "auth_error" ? "خطأ مصادقة" : "غير متصل"}
                          </span>
                          {item.lastCheckedAt && (
                            <span className="text-xs text-muted-foreground">
                              آخر فحص: {formatDateAr(item.lastCheckedAt)} {formatTimeAr(item.lastCheckedAt)}
                            </span>
                          )}
                        </div>
                      )}
                      {item.lastCheckMessage && item.lastCheckStatus !== "connected" && (
                        <p className="text-xs text-red-600 mt-1">{item.lastCheckMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`p-1.5 rounded-md ${item.enabled ? "text-green-600 hover:bg-green-100" : "text-gray-400 hover:bg-gray-100"}`}
                      title={item.enabled ? "تعطيل" : "تفعيل"}
                    >
                      {item.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => (isEditing ? setEditingId(null) : handleEdit(item))}
                      className="p-1.5 rounded-md text-blue-600 hover:bg-blue-100"
                      title="تعديل الإعدادات"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleTestConnection(item.id)}
                      disabled={testingId === item.id}
                      className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      title="اختبار الاتصال"
                    >
                      {testingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" />مفتاح الربط البرمجي</Label>
                        <Input
                          className="mt-1 text-sm font-mono"
                          type="password"
                          placeholder="أدخل مفتاح الربط"
                          value={editForm.apiKey}
                          onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">رابط الخدمة</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="https://api.gov.sa/..."
                          value={editForm.baseUrl}
                          onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">اسم المستخدم</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="اسم المستخدم"
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">رقم الاشتراك</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="رقم الاشتراك / المرجع"
                          value={editForm.subscriptionId}
                          onChange={(e) => setEditForm({ ...editForm, subscriptionId: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                      <Button size="sm" onClick={() => handleSave(item.id)}><Save className="h-3.5 w-3.5 mr-1" />حفظ</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
