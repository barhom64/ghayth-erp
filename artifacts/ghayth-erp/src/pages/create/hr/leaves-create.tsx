import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { asList } from "@/lib/api";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Calendar, Info, Clock, User } from "lucide-react";

const DRAFT_KEY = "hr_leaves_create";

export default function LeavesCreate() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const copyLeaveType = params.get("copyLeaveType") || "";
  const copyReason = params.get("copyReason") || "";
  const { user } = useAuth();
  const { toast } = useToast();
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/leave-requests", "POST", [["leave-requests"], ["leaves"], ["leave-balance"]], {
    successMessage: "تم إرسال طلب الإجازة بنجاح",
  });
  const leaveTypesQ = useApiQuery<any>(["leave-types"], "/hr/leave-types");
  const leaveTypes = asList<any>(leaveTypesQ.data);

  const balanceQ = useApiQuery<any>(["leave-balance"], "/hr/leave-balance");
  const balances = balanceQ.data?.data || balanceQ.data?.balances || [];
  const { data: empData } = useApiQuery<{ data: any[] }>(["employees-list"], "/employees");
  const employees = empData?.data || [];

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, {
    leaveTypeId: copyLeaveType || "",
    startDate: "",
    endDate: "",
    reason: copyReason || "",
    reliefOfficer: "",
    contactDuringLeave: "",
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const selectedType = leaveTypes.find((lt: any) => String(lt.id) === form.leaveTypeId);

  const daysCount = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (end < start) return 0;
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff;
  }, [form.startDate, form.endDate]);

  const selectedBalance = balances.find((b: any) =>
    String(b.leaveTypeId) === form.leaveTypeId || b.type === selectedType?.name
  );

  const handleSubmit = () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.leaveTypeId) localErrors.leaveTypeId = "يرجى اختيار نوع الإجازة";
    if (!form.startDate) localErrors.startDate = "تاريخ البداية مطلوب";
    if (!form.endDate) localErrors.endDate = "تاريخ النهاية مطلوب";
    if (form.startDate && form.endDate && form.endDate < form.startDate) localErrors.endDate = "تاريخ النهاية يجب أن يكون بعد تاريخ البدء";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
      return;
    }
    createMut.mutate(
      {
        leaveTypeId: Number(form.leaveTypeId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        reliefOfficer: form.reliefOfficer || undefined,
        contactDuringLeave: form.contactDuringLeave || undefined,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/leaves");
        },
      },
    );
  };

  return (
    <CreatePageLayout title="طلب إجازة جديد" backPath="/hr/leaves">
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

      {balances.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            رصيد الإجازات
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {balances.slice(0, 4).map((b: any) => (
              <Card key={b.id || b.type} className={`border ${String(b.leaveTypeId) === form.leaveTypeId ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200" : "border-gray-100"}`}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{b.typeName || b.type || "إجازة"}</p>
                  <p className="text-xl font-bold mt-1">{b.remaining ?? b.balance ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">من {b.total ?? b.entitled ?? 0} يوم</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">تفاصيل الإجازة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>نوع الإجازة <span className="text-red-500">*</span></Label>
              <Select value={form.leaveTypeId} onValueChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}>
                <SelectTrigger className={`mt-1 ${errCls("leaveTypeId")}`}>
                  <SelectValue placeholder="اختر النوع" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.length > 0 ? leaveTypes.map((lt: any) => (
                    <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>
                  )) : (
                    <>
                      <SelectItem value="1">إجازة سنوية</SelectItem>
                      <SelectItem value="2">إجازة مرضية</SelectItem>
                      <SelectItem value="3">إجازة شخصية</SelectItem>
                      <SelectItem value="4">إجازة بدون راتب</SelectItem>
                      <SelectItem value="5">إجازة طارئة</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <FieldHint field="leaveTypeId" />
            </div>
            <div>
              <Label>السبب</Label>
              <Textarea className="mt-1" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="سبب طلب الإجازة..." />
            </div>
            <div>
              <Label>من تاريخ <span className="text-red-500">*</span></Label>
              <div className={`mt-1 ${errCls("startDate")}`}><DatePicker value={form.startDate} onChange={(v) => setForm((f) => ({ ...f, startDate: v }))} /></div>
              <FieldHint field="startDate" />
            </div>
            <div>
              <Label>إلى تاريخ <span className="text-red-500">*</span></Label>
              <div className={`mt-1 ${errCls("endDate")}`}><DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} /></div>
              <FieldHint field="endDate" />
            </div>
          </div>
        </div>

        {daysCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">مدة الإجازة</span>
              </div>
              <Badge className="bg-blue-100 text-blue-800 text-base px-3 py-1">{daysCount} {daysCount === 1 ? "يوم" : daysCount === 2 ? "يومان" : daysCount <= 10 ? "أيام" : "يوم"}</Badge>
            </div>
            {selectedBalance && daysCount > (selectedBalance.remaining ?? selectedBalance.balance ?? 999) && (
              <div className="mt-2 flex items-center gap-2 text-amber-700 text-xs">
                <Info className="w-3.5 h-3.5" />
                <span>عدد الأيام المطلوبة يتجاوز رصيدك المتبقي ({selectedBalance.remaining ?? selectedBalance.balance} يوم)</span>
              </div>
            )}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            معلومات إضافية
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>المكلّف بالعمل أثناء الإجازة</Label>
              <Autocomplete
                className="mt-1"
                value={form.reliefOfficer}
                onChange={(v) => setForm((f) => ({ ...f, reliefOfficer: String(v) }))}
                options={employees.map((e: any) => ({ value: String(e.id), label: e.name, subtitle: e.jobTitle || e.departmentName || "" }))}
                placeholder="ابحث عن الزميل المكلّف..."
                emptyMessage="لا يوجد موظفين"
              />
              <p className="text-xs text-muted-foreground mt-1">من سيتولى المهام أثناء غيابك</p>
            </div>
            <div>
              <Label>رقم التواصل أثناء الإجازة</Label>
              <Input className="mt-1" value={form.contactDuringLeave} onChange={(e) => setForm((f) => ({ ...f, contactDuringLeave: e.target.value }))} placeholder="05xxxxxxxx" dir="ltr" />
              <p className="text-xs text-muted-foreground mt-1">للتواصل في حالات الطوارئ</p>
            </div>
          </div>
        </div>
      </div>

      <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات (تقرير طبي، إلخ)" />

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/leaves")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.leaveTypeId || !form.startDate || !form.endDate || createMut.isPending} size="lg">
          {createMut.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
