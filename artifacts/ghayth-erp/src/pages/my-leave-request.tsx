import { useState } from "react";
import { useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useAppContext } from "@/contexts/app-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Calendar, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

export default function MyLeaveRequest() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { scopeQueryString } = useAppContext();

  const { data: leaveTypesData } = useApiQuery<{ data: any[] }>(
    ["leave-types"],
    `/hr/leave-types?${scopeQueryString}`
  );
  const leaveTypes = leaveTypesData?.data || [];

  const createMut = useApiMutation("/hr/leave-requests", "POST", [["my-requests"]]);

  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    reason: "",
  });

  const [submitted, setSubmitted] = useState(false);

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leaveTypeId) { toast({ title: "تنبيه", description: "يجب اختيار نوع الإجازة", variant: "destructive" }); return; }
    if (!form.startDate || !form.endDate) { toast({ title: "تنبيه", description: "يجب تحديد تاريخ البداية والنهاية", variant: "destructive" }); return; }
    if (days <= 0) { toast({ title: "تنبيه", description: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية", variant: "destructive" }); return; }
    if (!form.reason.trim()) { toast({ title: "تنبيه", description: "يجب ذكر سبب الإجازة", variant: "destructive" }); return; }

    try {
      await createMut.mutateAsync({
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        days,
      } as any);
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || "حدث خطأ أثناء إرسال الطلب", variant: "destructive" });
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">تم إرسال طلب الإجازة</h2>
        <p className="text-gray-500 mb-6">سيتم مراجعة طلبك من قِبل المدير المباشر وسيصلك إشعار بالنتيجة.</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setLocation("/my-requests")}>عرض طلباتي</Button>
          <Button onClick={() => { setSubmitted(false); setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" }); }}>
            إضافة طلب آخر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          className="text-gray-400 hover:text-gray-600"
          onClick={() => setLocation("/my-space")}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-500" />
            طلب إجازة
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">تقديم طلب إجازة جديد</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">بيانات الطلب</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>نوع الإجازة <span className="text-red-500">*</span></Label>
              <select
                className="w-full border rounded-md p-2 mt-1 bg-white"
                value={form.leaveTypeId}
                onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
              >
                <option value="">اختر نوع الإجازة</option>
                {leaveTypes.map((lt: any) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name} ({lt.annualDays} يوم سنويًا)
                  </option>
                ))}
                {leaveTypes.length === 0 && (
                  <>
                    <option value="1">إجازة سنوية</option>
                    <option value="2">إجازة مرضية</option>
                    <option value="3">إجازة طارئة</option>
                  </>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>تاريخ البداية <span className="text-red-500">*</span></Label>
                <div className="mt-1">
                  <DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                </div>
              </div>
              <div>
                <Label>تاريخ النهاية <span className="text-red-500">*</span></Label>
                <div className="mt-1">
                  <DatePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
                </div>
              </div>
            </div>

            {days > 0 && (
              <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-2 text-sm text-teal-700 font-medium">
                مدة الإجازة: {days} {days === 1 ? "يوم" : "أيام"}
              </div>
            )}

            <div>
              <Label>سبب الإجازة <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full border rounded-md p-2 mt-1 text-sm min-h-[80px] resize-none"
                placeholder="اذكر سبب طلب الإجازة..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" className="flex-1" disabled={createMut.isPending}>
                {createMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin me-2" />جارٍ الإرسال...</>
                ) : (
                  "إرسال الطلب"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setLocation("/my-requests")}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
