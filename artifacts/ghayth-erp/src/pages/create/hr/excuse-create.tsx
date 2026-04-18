import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Clock, LogOut, UserCheck } from "lucide-react";

const DRAFT_KEY = "hr_excuse_create";

export default function ExcuseCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createMut = useApiMutation("/hr/excuse-requests", "POST", [["excuse-requests"]], {
    successMessage: "تم تقديم طلب الاستئذان بنجاح",
  });
  const { data: empData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = empData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    excuseDate: "",
    excuseType: "early_leave",
    startTime: "",
    endTime: "",
    estimatedMinutes: "",
    reason: "",
    assignmentId: "",
  });

  const handleSubmit = () => {
    if (!form.excuseDate) {
      toast({ variant: "destructive", title: "تاريخ الاستئذان مطلوب" });
      return;
    }
    createMut.mutate(
      {
        excuseDate: form.excuseDate,
        excuseType: form.excuseType,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
        reason: form.reason || undefined,
        assignmentId: form.assignmentId ? Number(form.assignmentId) : undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/excuse-requests");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="طلب استئذان" backPath="/hr/excuse-requests">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <AutoField label="الموظف" value={user?.name || "-"} />
        <AutoField label="الرقم الوظيفي" value={user?.empNumber || "-"} />
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            تفاصيل الاستئذان
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>تاريخ الاستئذان <span className="text-red-500">*</span></Label>
              <div className="mt-1"><DatePicker value={form.excuseDate} onChange={(v) => setForm((f) => ({ ...f, excuseDate: v }))} /></div>
            </div>
            <div>
              <Label>نوع الاستئذان</Label>
              <Select value={form.excuseType} onValueChange={(v) => setForm((f) => ({ ...f, excuseType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="early_leave">خروج مبكر</SelectItem>
                  <SelectItem value="late_arrival">تأخر عن الحضور</SelectItem>
                  <SelectItem value="personal">استئذان شخصي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>وقت البدء</Label>
              <Input className="mt-1" type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} dir="ltr" />
            </div>
            <div>
              <Label>وقت الانتهاء</Label>
              <Input className="mt-1" type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} dir="ltr" />
            </div>
            <div>
              <Label>المدة التقديرية (دقائق)</Label>
              <Input className="mt-1" type="number" value={form.estimatedMinutes} onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))} placeholder="60" />
            </div>
          </div>
        </div>

        <div>
          <Label>السبب</Label>
          <Textarea className="mt-1" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="سبب طلب الاستئذان..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/excuse-requests")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.excuseDate || createMut.isPending} size="lg">
          {createMut.isPending ? "جاري الإرسال..." : "تقديم الطلب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
