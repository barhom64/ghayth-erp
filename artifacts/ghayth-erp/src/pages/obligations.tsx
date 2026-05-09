import { useState } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { KpiGrid } from "@/components/shared/kpi-card";
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert, Search, RefreshCw, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  met: "ملبى",
  breached: "متجاوز",
  escalated_l1: "تصعيد 1",
  escalated_l2: "تصعيد 2",
  closed: "مغلق",
  cancelled: "ملغى",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  met: "bg-green-100 text-green-700",
  breached: "bg-red-100 text-red-700",
  escalated_l1: "bg-orange-100 text-orange-700",
  escalated_l2: "bg-red-200 text-red-800",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-gray-100 text-gray-500",
};

const TYPE_LABELS: Record<string, string> = {
  payment: "دفع",
  renewal: "تجديد",
  maintenance: "صيانة",
  hearing: "جلسة",
  document_expiry: "انتهاء وثيقة",
  approval: "موافقة",
  delivery: "تسليم",
  inspection: "فحص",
  declaration: "إقرار",
  follow_up: "متابعة",
};

const ENTITY_LABELS: Record<string, string> = {
  invoice: "فاتورة",
  contract: "عقد",
  vehicle: "مركبة",
  legal_case: "قضية",
  employee: "موظف",
  workflow: "مسار اعتماد",
  project: "مشروع",
  property_unit: "وحدة عقارية",
};

export default function ObligationsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("pending,breached,escalated_l1,escalated_l2");
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);

  const { data: summary, refetch: refetchSummary } = useApiQuery<any>(
    ["obligations-summary"],
    "/obligations/summary"
  );

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["obligations-list", statusFilter],
    `/obligations?${statusFilter !== "all" ? `status=${encodeURIComponent(statusFilter)}&` : ""}limit=200`
  );
  const list = asList(data?.data || data);
  const filtered = search
    ? list.filter((o: any) =>
        (o.title || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.entityType || "").toLowerCase().includes(search.toLowerCase())
      )
    : list;

  const handleAction = async (id: number, action: "met" | "cancel") => {
    try {
      await apiFetch(`/obligations/${id}/${action}`, { method: "POST" });
      toast({ title: action === "met" ? "تم تعليم الالتزام كملبى" : "تم إلغاء الالتزام" });
      refetch();
      refetchSummary();
    } catch (e: any) {
      toast({ title: e.message || "خطأ", variant: "destructive" });
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result: any = await apiFetch("/obligations/scan", { method: "POST" });
      toast({ title: "اكتمل الفحص", description: `تم تحديث ${result?.breached || 0} التزام متجاوز` });
      refetch();
      refetchSummary();
    } catch (e: any) {
      toast({ title: e.message || "خطأ في الفحص", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const s = summary || {};
  const isOverdue = (dueAt: string) => new Date(dueAt) < new Date();

  return (
    <PageShell
      title="مركز الالتزامات الزمنية"
      subtitle="تتبع وإدارة جميع المواعيد النهائية عبر النظام (دفعات، تجديدات، صيانة، جلسات، انتهاء وثائق)"
      breadcrumbs={[{ label: "العمليات" }, { label: "الالتزامات" }]}
      actions={
        <Button size="sm" variant="outline" className="gap-1" onClick={handleScan} disabled={scanning}>
          <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "جاري الفحص..." : "فحص المتجاوزات"}
        </Button>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي معلق", value: s.pending || 0, icon: Clock, color: "text-gray-600 bg-gray-50" },
        { label: "متجاوزة", value: s.breached || 0, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
        { label: "تصعيد", value: (s.escalated_l1 || 0) + (s.escalated_l2 || 0), icon: ShieldAlert, color: "text-orange-600 bg-orange-50" },
        { label: "تستحق خلال 24س", value: s.dueIn24h || 0, icon: Clock, color: "text-amber-600 bg-amber-50" },
      ]} />

      <div className="flex items-center gap-3 mt-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في العنوان أو نوع الكيان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-3 pe-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending,breached,escalated_l1,escalated_l2">النشطة فقط</SelectItem>
            <SelectItem value="pending">معلق</SelectItem>
            <SelectItem value="breached">متجاوز</SelectItem>
            <SelectItem value="escalated_l1,escalated_l2">في تصعيد</SelectItem>
            <SelectItem value="met">ملبى</SelectItem>
            <SelectItem value="cancelled">ملغى</SelectItem>
            <SelectItem value="all">الكل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> الالتزامات ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-300" />
              لا توجد التزامات تطابق المعايير
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((o: any) => {
                const overdue = o.status !== "met" && o.status !== "cancelled" && o.dueAt && isOverdue(o.dueAt);
                return (
                  <div key={o.id} className={`p-4 flex items-start justify-between gap-4 ${overdue ? "bg-red-50/40" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{o.title}</span>
                        <PageStatusBadge status={o.status} domain="obligation" />
                        {o.obligationType && (
                          <Badge variant="outline" className="text-xs">
                            {TYPE_LABELS[o.obligationType] || o.obligationType}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>{ENTITY_LABELS[o.entityType] || o.entityType} #{o.entityId}</span>
                        {o.dueAt && (
                          <span className={overdue ? "text-red-600 font-medium" : ""}>
                            <Clock className="h-3 w-3 inline ms-1" />
                            استحقاق: {formatDateAr(o.dueAt)}
                          </span>
                        )}
                        {o.assignedTo && <span>مسؤول: {o.assignedToName || `موظف #${o.assignedTo}`}</span>}
                      </div>
                    </div>
                    {(o.status === "pending" || o.status === "breached" ||
                      o.status === "escalated_l1" || o.status === "escalated_l2") && (
                      <div className="flex items-center gap-1 flex-none">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs h-7"
                          onClick={() => handleAction(o.id, "met")}
                        >
                          <CheckCircle2 className="h-3 w-3" /> ملبى
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-xs h-7 text-muted-foreground"
                          onClick={() => handleAction(o.id, "cancel")}
                        >
                          <X className="h-3 w-3" /> إلغاء
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
