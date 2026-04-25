import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAppContext } from "@/contexts/app-context";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { DollarSign, Users, Building2, CheckCircle2, Info } from "lucide-react";
import { TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function PayrollCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  // HR-U2 — successMessage + onSuccess (callbacks) بدل try/catch العام.
  // الـ useApiMutation الافتراضي يعرض toast مكتوبًا (ValidationError/Conflict…)
  // فالـ catch السابق كان يبتلع الخطأ الحقيقي ويعرض "حدث خطأ" عامًا.
  const createMut = useApiMutation("/hr/payroll", "POST", [["payroll"]], {
    successMessage: "تم تشغيل مسير الرواتب بنجاح",
  });
  const now = new Date();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("hr_payroll_create", {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    reference: "",
    notes: "",
    scope: "all",
  });

  const { data: empData, isLoading: loadingEmp, isError: errorEmp } = useApiQuery<any>(["employees-list"], `/employees${scopeSuffix}`);
  const employees = empData?.data || [];
  const activeEmployees = employees.filter((e: any) => e.status === "active" || !e.status);
  const totalSalaries = activeEmployees.reduce((sum: number, e: any) => sum + Number(e.salary || 0), 0);

  const { data: branchData, isLoading: loadingBranch, isError: errorBranch } = useApiQuery<any>(["branches"], "/settings/branches");
  const branches = branchData?.data || [];

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (loadingEmp || loadingBranch) return <LoadingSpinner />;
  if (errorEmp || errorBranch) return <ErrorState onRetry={() => window.location.reload()} />;

  const handleSubmit = () => {
    const firstError = validate({
      month: form.month ? null : "الشهر مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    createMut.mutate(
      {
        month: form.month,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
        scope: form.scope,
      },
      {
        onSuccess: () => {
          clearDraft();
          setLocation("/hr/payroll");
        },
        onError: (err: any) => {
          setApiError(err);
        },
      },
    );
  };

  const monthLabel = form.month
    ? formatDateAr(form.month + "-01")
    : "";

  return (
    <CreatePageLayout title="تشغيل مسير الرواتب" backPath="/hr/payroll">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="border-blue-100 bg-blue-50/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-xl font-bold">{activeEmployees.length}</p>
              <p className="text-xs text-muted-foreground">موظفين نشطين</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-100 bg-green-50/30">
          <CardContent className="p-3 flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-xl font-bold">{formatCurrency(totalSalaries)}</p>
              <p className="text-xs text-muted-foreground">إجمالي الرواتب (تقديري)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100 bg-purple-50/30">
          <CardContent className="p-3 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-xl font-bold">{branches.length || 1}</p>
              <p className="text-xs text-muted-foreground">فروع</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-100 bg-orange-50/30">
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-xl font-bold">{monthLabel || "-"}</p>
              <p className="text-xs text-muted-foreground">الشهر المحدد</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            بيانات المسير
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormFieldWrapper label="الشهر" required error={fieldErrors.month}>
              <Input type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} />
            </FormFieldWrapper>
            <FormFieldWrapper label="مرجع الدفعة" hint="رقم مرجعي للتتبع (اختياري)">
              <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder={`PAY-${form.month?.replace("-", "")}`} />
            </FormFieldWrapper>
            <FormFieldWrapper label="النطاق" hint="حدد الفرع أو اختر الجميع">
              <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر النطاق" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الموظفين</SelectItem>
                  {branches.map((b: any) => (
                    <SelectItem key={b.id} value={`branch:${b.id}`}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>
        </div>

        <TextAreaField
          label="ملاحظات"
          value={form.notes}
          onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="ملاحظات إضافية حول هذا المسير..."
          rows={3}
        />

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-medium">ملاحظات مهمة قبل التشغيل:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>سيتم احتساب الرواتب لجميع الموظفين النشطين تلقائياً</li>
                <li>يشمل الحساب: الراتب الأساسي + البدلات - الخصومات - اشتراكات التأمينات</li>
                <li>سيتم خصم أيام الغياب والمخالفات المسجلة خلال الشهر</li>
                <li>تأكد من اكتمال سجلات الحضور والإجازات قبل تشغيل المسير</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/hr/payroll")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.month || createMut.isPending} size="lg">
          {createMut.isPending ? "جاري التشغيل..." : "تشغيل مسير الرواتب"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
