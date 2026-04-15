import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { AlertTriangle, User, Shield, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/formatters";

const violationTypes = [
  { value: "تأخر", label: "تأخر", icon: "⏰", desc: "تأخر عن موعد الحضور" },
  { value: "غياب", label: "غياب بدون عذر", icon: "❌", desc: "غياب بدون إذن مسبق" },
  { value: "سلوك", label: "سلوك غير لائق", icon: "⚠️", desc: "تصرف مخالف لأخلاقيات العمل" },
  { value: "إهمال", label: "إهمال في العمل", icon: "📋", desc: "عدم إنجاز المهام المطلوبة" },
  { value: "مخالفة_نظام", label: "مخالفة نظام داخلي", icon: "📜", desc: "مخالفة السياسات والإجراءات" },
  { value: "أخرى", label: "أخرى", icon: "📝", desc: "مخالفة غير مصنفة" },
];

const severityLevels = [
  { value: "low", label: "منخفضة", color: "bg-yellow-50 text-yellow-700 border-yellow-300", icon: "🟡" },
  { value: "medium", label: "متوسطة", color: "bg-orange-50 text-orange-700 border-orange-300", icon: "🟠" },
  { value: "high", label: "عالية", color: "bg-red-50 text-red-700 border-red-300", icon: "🔴" },
];

const DRAFT_KEY = "hr_violations_create";
const INITIAL = {
  assignmentId: "", type: "", description: "", severity: "medium",
  deduction: "", period: "", witness: "", location: "", actionTaken: "",
};

export default function ViolationsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/violations", "POST", [["violations"]], {
    successMessage: "تم إضافة المخالفة بنجاح",
  });
  const { data: empData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = empData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const selectedEmployee = employees.find((e: any) => String(e.assignmentId || e.id) === form.assignmentId);

  const handleSubmit = () => {
    if (!form.assignmentId) {
      toast({ variant: "destructive", title: "يرجى اختيار الموظف" });
      return;
    }
    if (!form.type) {
      toast({ variant: "destructive", title: "نوع المخالفة مطلوب" });
      return;
    }
    if (!form.description) {
      toast({ variant: "destructive", title: "وصف المخالفة مطلوب" });
      return;
    }
    createMut.mutate(
      {
        assignmentId: Number(form.assignmentId),
        type: form.type,
        description: form.description,
        severity: form.severity,
        deduction: form.deduction ? Number(form.deduction) : 0,
        period: form.period || undefined,
        witness: form.witness || undefined,
        location: form.location || undefined,
        actionTaken: form.actionTaken || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/violations");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="تسجيل مخالفة" backPath="/hr/violations">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> الموظف <span className="text-red-500">*</span></Label>
            <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.assignmentId} onChange={(e) => set("assignmentId", e.target.value)}>
              <option value="">اختر الموظف</option>
              {employees.map((emp: any) => (
                <option key={emp.assignmentId || emp.id} value={emp.assignmentId || emp.id}>
                  {emp.name} {emp.empNumber ? `(${emp.empNumber})` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedEmployee && (
            <div className="p-3 bg-gray-50 rounded-lg border flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                {(selectedEmployee.name || "؟").charAt(0)}
              </div>
              <div>
                <p className="font-medium text-sm">{selectedEmployee.name}</p>
                <p className="text-xs text-gray-500">{selectedEmployee.jobTitle || selectedEmployee.departmentName || "—"}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> نوع المخالفة <span className="text-red-500">*</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {violationTypes.map((vt) => (
              <button
                key={vt.value}
                type="button"
                onClick={() => set("type", vt.value)}
                className={cn(
                  "p-3 rounded-xl border-2 text-right transition-all",
                  form.type === vt.value ? "border-red-300 bg-red-50 ring-2 ring-red-200 ring-offset-1" : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{vt.icon}</span>
                  <span className="text-sm font-medium">{vt.label}</span>
                </div>
                <p className="text-xs text-gray-500">{vt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> مستوى الخطورة
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {severityLevels.map((sl) => (
              <button
                key={sl.value}
                type="button"
                onClick={() => set("severity", sl.value)}
                className={cn(
                  "p-4 rounded-xl border-2 text-center transition-all",
                  form.severity === sl.value ? sl.color + " ring-2 ring-offset-1" : "border-gray-200 hover:border-gray-300"
                )}
              >
                <span className="text-2xl block mb-1">{sl.icon}</span>
                <span className="text-sm font-medium">{sl.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>وصف المخالفة <span className="text-red-500">*</span></Label>
          <Textarea className="mt-1 min-h-[100px]" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="وصف تفصيلي للمخالفة وظروفها..." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="flex items-center gap-1"><Scale className="h-3.5 w-3.5" /> مبلغ الخصم ({getCurrencySymbol()})</Label>
            <Input className="mt-1" type="number" value={form.deduction} onChange={(e) => set("deduction", e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>الفترة</Label>
            <Input className="mt-1" type="month" value={form.period} onChange={(e) => set("period", e.target.value)} />
          </div>
          <div>
            <Label>مكان المخالفة</Label>
            <Input className="mt-1" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="الموقع أو القسم" />
          </div>
          <div>
            <Label>الشاهد</Label>
            <Input className="mt-1" value={form.witness} onChange={(e) => set("witness", e.target.value)} placeholder="اسم الشاهد (اختياري)" />
          </div>
          <div className="md:col-span-2">
            <Label>الإجراء المتخذ</Label>
            <Input className="mt-1" value={form.actionTaken} onChange={(e) => set("actionTaken", e.target.value)} placeholder="إنذار شفهي، إنذار كتابي، خصم..." />
          </div>
        </div>

        {(form.type || form.severity) && form.assignmentId && (
          <div className={cn(
            "p-4 rounded-xl border",
            form.severity === "high" ? "bg-red-50 border-red-200" : form.severity === "medium" ? "bg-orange-50 border-orange-200" : "bg-yellow-50 border-yellow-200"
          )}>
            <h4 className="text-sm font-semibold mb-2">ملخص المخالفة</h4>
            <div className="flex flex-wrap gap-2">
              {selectedEmployee && <Badge variant="outline">{selectedEmployee.name}</Badge>}
              {form.type && <Badge variant="outline">{form.type}</Badge>}
              <Badge variant="outline">{severityLevels.find(s => s.value === form.severity)?.label || "متوسطة"}</Badge>
              {form.deduction && <Badge variant="outline">خصم: {form.deduction} {getCurrencySymbol()}</Badge>}
            </div>
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات المخالفة (صور، مستندات)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/violations")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} variant="destructive">
          {createMut.isPending ? "جاري الحفظ..." : "تسجيل المخالفة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
