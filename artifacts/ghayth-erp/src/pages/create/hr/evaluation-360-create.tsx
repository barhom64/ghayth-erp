import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Save, Star, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";

export default function Evaluation360Create() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { scopeQueryString } = useAppContext();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: empResp } = useApiQuery<any>(["employees-list", scopeQueryString], `/employees?${scopeQueryString || ""}&limit=500`);
  const employees = asList(empResp);

  const [form, setForm] = useState({ employeeId: "", period: "", notes: "" });
  const [participants, setParticipants] = useState<{ evaluatorId: string; evaluatorRole: "manager" | "peer"; name: string }[]>([]);
  const [addingParticipant, setAddingParticipant] = useState({ evaluatorId: "", evaluatorRole: "peer" as "manager" | "peer" });

  const addParticipant = () => {
    if (!addingParticipant.evaluatorId) return;
    if (participants.some(p => p.evaluatorId === addingParticipant.evaluatorId)) return;
    const emp = employees.find((e: any) => String(e.id) === addingParticipant.evaluatorId);
    setParticipants([...participants, {
      evaluatorId: addingParticipant.evaluatorId,
      evaluatorRole: addingParticipant.evaluatorRole,
      name: emp?.name || "",
    }]);
    setAddingParticipant({ evaluatorId: "", evaluatorRole: "peer" });
  };

  const removeParticipant = (id: string) => setParticipants(participants.filter(p => p.evaluatorId !== id));

  const handleSave = async () => {
    if (!form.employeeId || !form.period) {
      toast({ variant: "destructive", title: "الموظف والفترة مطلوبان" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/hr/evaluation-360", {
        method: "POST",
        body: JSON.stringify({
          employeeId: Number(form.employeeId),
          period: form.period,
          notes: form.notes || undefined,
          participants: participants.map(p => ({
            evaluatorId: Number(p.evaluatorId),
            evaluatorRole: p.evaluatorRole,
          })),
        }),
      });
      toast({ title: "تم بدء دورة التقييم بنجاح" });
      qc.invalidateQueries({ queryKey: ["evaluation-360"] });
      setLocation("/hr/evaluation-360");
    } catch { toast({ variant: "destructive", title: "حدث خطأ أثناء الإنشاء" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/hr/evaluation-360">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">بدء دورة تقييم جديدة</h1>
            <p className="text-gray-500 text-sm mt-1">تقييم 360° — تقييم شامل متعدد الأطراف</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جارٍ البدء..." : "بدء دورة التقييم"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Star className="h-5 w-5 text-amber-500" /> بيانات التقييم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>الموظف <span className="text-red-500">*</span></Label>
              <Select value={form.employeeId} onValueChange={v => setForm({ ...form, employeeId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفترة <span className="text-red-500">*</span></Label>
              <Input className="mt-1" placeholder="مثال: الربع الأول ٢٠٢٦" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Textarea className="mt-1" placeholder="ملاحظات اختيارية..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">المقيِّمون (مدراء وزملاء)</CardTitle>
          <p className="text-xs text-gray-400">أضف من سيُشاركون في تقييم هذا الموظف — يمكن تخطي هذه الخطوة وإضافتهم لاحقاً</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select value={addingParticipant.evaluatorId} onValueChange={v => setAddingParticipant({ ...addingParticipant, evaluatorId: v })}>
              <SelectTrigger className="flex-1 text-sm"><SelectValue placeholder="اختر موظفاً" /></SelectTrigger>
              <SelectContent>
                {employees
                  .filter((e: any) => String(e.id) !== form.employeeId)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={addingParticipant.evaluatorRole} onValueChange={v => setAddingParticipant({ ...addingParticipant, evaluatorRole: v as "manager" | "peer" })}>
              <SelectTrigger className="w-28 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">مدير</SelectItem>
                <SelectItem value="peer">زميل</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={addParticipant} className="gap-1">
              <Plus className="w-4 h-4" /> إضافة
            </Button>
          </div>
          {participants.length > 0 && (
            <div className="space-y-1">
              {participants.map(p => (
                <div key={p.evaluatorId} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                  <span>{p.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {p.evaluatorRole === "manager" ? "مدير" : "زميل"}
                    </Badge>
                    <button type="button" onClick={() => removeParticipant(p.evaluatorId)} className="text-red-400 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            عند بدء الدورة سيتولد تلقائياً <strong>تقرير أداء آلي</strong> يشمل: الحضور، إنجاز المهام، الالتزام بالمواعيد، رضا العملاء وجودة التوثيق.
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Link href="/hr/evaluation-360">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "جارٍ البدء..." : "بدء دورة التقييم"}
        </Button>
      </div>
    </div>
  );
}
