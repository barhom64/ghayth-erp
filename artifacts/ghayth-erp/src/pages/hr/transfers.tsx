import { useState } from "react";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Plus, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ApprovalActions } from "@/components/approval-actions";
import { PageShell } from "@/components/page-shell";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "معلق", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "مُعتمد", color: "bg-green-100 text-green-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function TransfersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: "", toBranchId: "", reason: "", effectiveDate: "" });
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, refetch } = useApiQuery<any>(
    ["transfers", statusFilter],
    `/hr/transfers${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
  );
  const transfers = asList(data?.data || data);

  const { data: employees } = useApiQuery<any>(["employees-active"], "/employees?status=active&limit=200");
  const { data: branches } = useApiQuery<any>(["branches"], "/settings/branches");
  const employeeList = asList(employees?.data || employees);
  const branchList = asList(branches?.data || branches);

  const handleSubmit = async () => {
    if (!form.employeeId || !form.toBranchId) { toast({ title: "الموظف والفرع مطلوبان", variant: "destructive" }); return; }
    try {
      await apiFetch("/hr/transfers", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "تم إرسال طلب النقل" });
      setShowForm(false);
      setForm({ employeeId: "", toBranchId: "", reason: "", effectiveDate: "" });
      refetch();
    } catch (e: any) { toast({ title: e.message || "خطأ", variant: "destructive" }); }
  };

  const pendingCount = transfers.filter((t: any) => t.status === "pending").length;

  return (
    <PageShell
      title="نقل الموظفين"
      subtitle="إدارة طلبات نقل الموظفين بين الفروع والأقسام"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "نقل الموظفين" }]}
      actions={
        <>
          {pendingCount > 0 && <Badge className="bg-yellow-100 text-yellow-700">{pendingCount} بانتظار الموافقة</Badge>}
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="w-4 h-4 me-1" /> طلب نقل جديد
          </Button>
        </>
      }
    >
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">طلب نقل موظف</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
                <SelectContent>
                  {employeeList.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفرع المستقبل *</Label>
              <Select value={form.toBranchId} onValueChange={(v) => setForm({ ...form, toBranchId: v })}>
                <SelectTrigger><SelectValue placeholder="اختر فرعاً" /></SelectTrigger>
                <SelectContent>
                  {branchList.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تاريخ التفعيل</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>
            <div>
              <Label>سبب النقل</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="السبب..." />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleSubmit}>إرسال الطلب</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>
            {s === "all" ? "الكل" : STATUS_LABELS[s]?.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {transfers.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-gray-400">لا توجد طلبات نقل</CardContent></Card>
        ) : transfers.map((t: any) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.employeeName}</span>
                    <span className="text-xs text-gray-400">#{t.empNumber}</span>
                    <Badge className={STATUS_LABELS[t.status]?.color || "bg-gray-100 text-gray-600"}>{STATUS_LABELS[t.status]?.label || t.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <span>{t.fromBranchName || `فرع #${t.fromBranchId}`}</span>
                    <ArrowRightLeft className="w-3 h-3" />
                    <span className="text-primary font-medium">{t.toBranchName || `فرع #${t.toBranchId}`}</span>
                    {t.effectiveDate && <span>· {t.effectiveDate?.split("T")[0]}</span>}
                  </div>
                  {t.reason && <p className="text-xs text-gray-500 mt-1">{t.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {t.status === "pending" && (
                    <ApprovalActions
                      entityType="transfer"
                      entityId={t.id}
                      currentStatus={t.status}
                      approveEndpoint={`/hr/transfers/${t.id}/approve`}
                      rejectEndpoint={`/hr/transfers/${t.id}/approve`}
                      approveMethod="PATCH"
                      rejectMethod="PATCH"
                      approveBody={(notes) => ({ approved: true, notes })}
                      rejectBody={(notes) => ({ approved: false, notes })}
                      pendingStatuses={["pending"]}
                      onDone={() => refetch()}
                    />
                  )}
                  <button onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                    {expanded === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === t.id && (
                <div className="mt-3 pt-3 border-t text-xs text-gray-500 space-y-1">
                  <div className="grid grid-cols-3 gap-4">
                    <div><span className="font-medium">المسمى السابق:</span> {t.fromJobTitle || "—"}</div>
                    <div><span className="font-medium">المسمى الجديد:</span> {t.toJobTitle || "—"}</div>
                    <div><span className="font-medium">تاريخ الطلب:</span> {t.createdAt?.split("T")[0]}</div>
                    {t.notes && <div className="col-span-3"><span className="font-medium">ملاحظات:</span> {t.notes}</div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
