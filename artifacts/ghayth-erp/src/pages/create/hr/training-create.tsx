import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/formatters";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { BookOpen, Clock, MapPin, Users, DollarSign, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRAINING_TYPES, TRAINING_CATEGORIES } from "@/lib/hr-type-maps";

const DRAFT_KEY = "hr_training_create";
const INITIAL = {
  title: "", description: "", category: "", trainer: "",
  startDate: "", endDate: "", capacity: "", location: "",
  type: "", provider: "", duration: "", durationUnit: "hours", cost: "",
  maxParticipants: "", objectives: "", targetAudience: "",
};

export default function TrainingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/training/programs", "POST", [["training-programs"]], {
    successMessage: "تم إضافة البرنامج التدريبي بنجاح",
  });

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const durationDisplay = form.duration
    ? `${form.duration} ${form.durationUnit === "hours" ? "ساعة" : form.durationUnit === "days" ? "يوم" : "أسبوع"}`
    : null;

  const handleSubmit = () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.title) localErrors.title = "عنوان البرنامج مطلوب";
    if (form.maxParticipants && Number(form.maxParticipants) <= 0) localErrors.maxParticipants = "السعة القصوى يجب أن تكون أكبر من صفر";
    if (form.startDate && form.endDate && form.endDate < form.startDate) localErrors.endDate = "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    createMut.mutate(
      {
        title: form.title,
        description: form.description || undefined,
        category: form.category || undefined,
        trainer: form.trainer || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        location: form.location || undefined,
        type: form.type || undefined,
        provider: form.provider || undefined,
        duration: form.duration ? Number(form.duration) : undefined,
        durationUnit: form.durationUnit || undefined,
        cost: form.cost ? Number(form.cost) : 0,
        maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
        objectives: form.objectives || undefined,
        targetAudience: form.targetAudience || undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/training");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="إضافة برنامج تدريبي" backPath="/hr/training">
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
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> نوع التدريب
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {TRAINING_TYPES.map((tt) => (
              <button
                key={tt.value}
                type="button"
                onClick={() => set("type", tt.value)}
                className={cn(
                  "p-3 rounded-xl border-2 text-center transition-all",
                  form.type === tt.value ? tt.color + " ring-2 ring-offset-1" : "border-gray-200 hover:border-gray-300"
                )}
              >
                <span className="text-xl block mb-1">{tt.icon}</span>
                <span className="text-xs font-medium">{tt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>العنوان <span className="text-red-500">*</span></Label>
            <Input className={`mt-1 ${errCls("title")}`} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="اسم البرنامج التدريبي" />
            <FieldHint field="title" />
          </div>
          <div>
            <Label>التصنيف</Label>
            <Select value={form.category || "_none"} onValueChange={(v) => set("category", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر التصنيف</SelectItem>
                {TRAINING_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> جهة التدريب</Label>
            <Input className="mt-1" value={form.provider} onChange={(e) => set("provider", e.target.value)} placeholder="اسم الجهة المقدمة" />
          </div>
          <div>
            <Label>المدرب</Label>
            <Input className="mt-1" value={form.trainer} onChange={(e) => set("trainer", e.target.value)} placeholder="اسم المدرب" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> المكان</Label>
            <Input className="mt-1" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="قاعة التدريب أو الرابط" />
          </div>
          <div>
            <Label className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> السعة القصوى</Label>
            <Input className={`mt-1 ${errCls("maxParticipants")}`} type="number" value={form.maxParticipants} onChange={(e) => set("maxParticipants", e.target.value)} placeholder="عدد المشاركين" />
            <FieldHint field="maxParticipants" />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> المدة والتواريخ
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>المدة</Label>
              <Input className="mt-1" type="number" value={form.duration} onChange={(e) => set("duration", e.target.value)} placeholder="٠" />
            </div>
            <div>
              <Label>وحدة المدة</Label>
              <Select value={form.durationUnit} onValueChange={(v) => set("durationUnit", v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hours">ساعات</SelectItem>
                <SelectItem value="days">أيام</SelectItem>
                <SelectItem value="weeks">أسابيع</SelectItem>
              </SelectContent>
            </Select>
            </div>
            <div>
              <Label>تاريخ البدء</Label>
              <div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => set("startDate", v)} /></div>
            </div>
            <div>
              <Label>تاريخ الانتهاء</Label>
              <div className={`mt-1 ${errCls("endDate")}`}><DatePicker value={form.endDate} onChange={(v) => set("endDate", v)} /></div>
              <FieldHint field="endDate" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> التكلفة ({getCurrencySymbol()})</Label>
            <Input className="mt-1" type="number" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="٠" />
          </div>
          <div>
            <Label>الفئة المستهدفة</Label>
            <Input className="mt-1" value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} placeholder="المدراء، الموظفون الجدد..." />
          </div>
        </div>

        <div>
          <Label>أهداف البرنامج</Label>
          <Textarea className="mt-1 min-h-[80px]" value={form.objectives} onChange={(e) => set("objectives", e.target.value)} placeholder="الأهداف المتوقعة من البرنامج التدريبي..." />
        </div>

        <div>
          <Label>الوصف التفصيلي</Label>
          <Textarea className="mt-1 min-h-[80px]" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="وصف البرنامج التدريبي ومحتوياته..." />
        </div>

        {form.title && (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <h4 className="text-sm font-semibold text-blue-700 mb-2">ملخص البرنامج</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{form.title}</Badge>
              {form.type && <Badge variant="outline">{TRAINING_TYPES.find(t => t.value === form.type)?.label}</Badge>}
              {form.category && <Badge variant="outline">{TRAINING_CATEGORIES.find(c => c.value === form.category)?.label}</Badge>}
              {durationDisplay && <Badge variant="outline"><Clock className="h-3 w-3 me-1" />{durationDisplay}</Badge>}
              {form.maxParticipants && <Badge variant="outline"><Users className="h-3 w-3 me-1" />{form.maxParticipants} مشارك</Badge>}
              {form.cost && <Badge variant="outline"><DollarSign className="h-3 w-3 me-1" />{Number(form.cost).toLocaleString()} {getCurrencySymbol()}</Badge>}
            </div>
          </div>
        )}
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات التدريب (منهج، مواد تدريبية)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/training")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ البرنامج"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
