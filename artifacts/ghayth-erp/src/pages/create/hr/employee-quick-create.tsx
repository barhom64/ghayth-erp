import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { todayLocal } from "@/lib/formatters";
import { useApiMutation, useApiQuery, ApiError, buildErrorToast } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { NATIONALITIES } from "@/lib/nationalities";
import { CheckCircle, Shield, Zap } from "lucide-react";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAppContext } from "@/contexts/app-context";
import { fieldErrorClass, FormFieldWrapper, NumberField } from "@/components/shared/form-field-wrapper";
import { PositionSelect, EmployeeCategorySelect } from "@/components/shared/entity-selects";

// مسار «إنشاء موظف سريع» — نموذج مختصر بالحقول الإلزامية فقط (الاسم، الهوية،
// الجنسية، الجوال، القسم، المسمى، نوع العقد، الراتب، المدير، المنصب، الفئة).
// يُرسِل لنفس نقطة النهاية POST /employees التي يستخدمها النموذج الكامل، لكنه
// يتجاوز الأقسام المتقدمة (الإقامة، الحساب البنكي، الاتصالات، توزيع الفروع،
// المرفقات). الفريق والمشروع ومركز التكلفة تُسنَد لاحقًا — اختيارية في الخادم.
export default function EmployeeQuickCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/employees", "POST", [["employees"]], { silent: true });
  const { data: departmentsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: jobTitlesData } = useApiQuery<{ data: any[] }>(["job-titles-list"], "/employees/job-titles");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list-for-manager"], "/employees?limit=200");
  const departments = departmentsData?.data || [];
  const jobTitles = jobTitlesData?.data || [];
  const employeesList = employeesData?.data || [];

  const { fieldErrors, validate, setApiError } = useFieldErrors();
  const [creationResult, setCreationResult] = useState<Record<string, any> | null>(null);

  const [form, setForm] = useState({
    name: "",
    nationalId: "",
    nationality: "سعودي",
    phone: "",
    email: "",
    gender: "male",
    department: "",
    jobTitle: "",
    jobTitleId: "",
    contractType: "full_time",
    salary: "",
    hireDate: todayLocal(),
    managerId: "",
    positionId: "",
    categoryKey: "",
    branchId: selectedBranchId ? String(selectedBranchId) : "",
    companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
    role: "employee",
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      branchId: f.branchId || (selectedBranchId ? String(selectedBranchId) : ""),
      companyId: f.companyId || (selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : ""),
    }));
  }, [selectedBranchId, selectedCompanyIds]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name ? null : "يرجى إدخال اسم الموظف",
      nationalId: form.nationalId ? null : "يرجى إدخال رقم الهوية",
      nationality: form.nationality ? null : "يرجى اختيار الجنسية",
      phone: form.phone ? null : "يرجى إدخال رقم الجوال",
      department: form.department ? null : "يرجى اختيار القسم",
      jobTitle: form.jobTitle ? null : "يرجى اختيار المسمى الوظيفي",
      contractType: form.contractType ? null : "يرجى اختيار نوع العقد",
      salary: !form.salary || Number(form.salary) <= 0 ? "يرجى إدخال الراتب الأساسي" : null,
      managerId: form.managerId ? null : "يرجى اختيار المدير المباشر",
      positionId: form.positionId ? null : "يرجى اختيار المنصب الإداري",
      categoryKey: form.categoryKey ? null : "يرجى اختيار فئة الموظف",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      const result = await createMut.mutateAsync({
        name: form.name,
        nationalId: form.nationalId,
        nationality: form.nationality,
        phone: form.phone,
        email: form.email || undefined,
        gender: form.gender,
        department: form.department,
        jobTitle: form.jobTitle,
        jobTitleId: form.jobTitleId ? Number(form.jobTitleId) : undefined,
        contractType: form.contractType,
        salary: Number(form.salary) || 0,
        hireDate: form.hireDate,
        role: form.role,
        managerId: form.managerId ? Number(form.managerId) : undefined,
        positionId: form.positionId ? Number(form.positionId) : undefined,
        categoryKey: form.categoryKey || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        companyId: form.companyId ? Number(form.companyId) : undefined,
      });
      toast({ title: "تم إضافة الموظف بنجاح" });
      setCreationResult(result as Record<string, any>);
    } catch (err) {
      if (err instanceof ApiError && err.field) {
        setApiError(err);
        toast({
          variant: "destructive",
          title: err.code === "CONFLICT" ? "لا يمكن تنفيذ هذه العملية الآن" : "البيانات غير صالحة",
          description: err.fix ?? err.message,
        });
      } else {
        toast(buildErrorToast(err));
      }
    }
  };

  if (creationResult) {
    const userAccount = creationResult.userAccount;
    return (
      <CreatePageLayout title="تم إنشاء الموظف بنجاح" backPath="/employees">
        {userAccount?.isNewAccount && (
          <Card className="border-status-success-surface bg-status-success-surface mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-status-success-foreground">
                <Shield className="w-5 h-5" />
                تم إنشاء حساب دخول للموظف
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-status-success-foreground">احفظ هذه البيانات وأرسلها للموظف — لن تظهر مرة أخرى:</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-status-success-surface">
                  <p className="text-xs text-muted-foreground mb-1">البريد الإلكتروني</p>
                  <p className="font-mono text-sm font-medium">{userAccount.email}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-status-success-surface">
                  <p className="text-xs text-muted-foreground mb-1">كلمة المرور المؤقتة</p>
                  <p className="font-mono text-sm font-bold text-status-info-foreground">{userAccount.tempPassword}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle className="w-12 h-12 text-status-success-foreground" />
            <p className="text-lg font-semibold text-status-success-foreground">{creationResult.name}</p>
            <p className="text-sm text-muted-foreground">تم إنشاء سجل الموظف وربط التعيين بنجاح.</p>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setCreationResult(null);
              setForm({
                name: "", nationalId: "", nationality: "سعودي", phone: "", email: "", gender: "male",
                department: "", jobTitle: "", jobTitleId: "", contractType: "full_time", salary: "",
                hireDate: todayLocal(), managerId: "", positionId: "", categoryKey: "",
                branchId: selectedBranchId ? String(selectedBranchId) : "",
                companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
                role: "employee",
              });
            }}
          >
            إضافة موظف آخر
          </Button>
          <Button onClick={() => setLocation("/employees")}>قائمة الموظفين</Button>
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout title="إنشاء موظف سريع" backPath="/employees">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-status-info-foreground" />
            البيانات الأساسية
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            نموذج مختصر بالحقول الإلزامية فقط. لإدخال الإقامة والحساب البنكي والمرفقات استخدم{" "}
            <button type="button" className="text-status-info-foreground hover:underline" onClick={() => setLocation("/employees/create")}>
              النموذج الكامل
            </button>.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldWrapper label="اسم الموظف" required error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="الاسم الكامل"
              className={fieldErrorClass(fieldErrors.name)}
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="رقم الهوية / الإقامة" required error={fieldErrors.nationalId}>
            <Input
              value={form.nationalId}
              onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
              placeholder="١٠ أرقام"
              className={fieldErrorClass(fieldErrors.nationalId)}
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="الجنسية" required error={fieldErrors.nationality}>
            <Select value={form.nationality} onValueChange={(v) => setForm((f) => ({ ...f, nationality: v }))}>
              <SelectTrigger className={fieldErrorClass(fieldErrors.nationality)}>
                <SelectValue placeholder="اختر الجنسية" />
              </SelectTrigger>
              <SelectContent>
                {NATIONALITIES.map((n) => (
                  <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="رقم الجوال" required error={fieldErrors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="05xxxxxxxx"
              className={fieldErrorClass(fieldErrors.phone)}
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="البريد الإلكتروني (اختياري — لإنشاء حساب دخول)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="الجنس">
            <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">ذكر</SelectItem>
                <SelectItem value="female">أنثى</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="القسم" required error={fieldErrors.department}>
            <Select value={form.department || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, department: v === "_none" ? "" : v }))}>
              <SelectTrigger className={fieldErrorClass(fieldErrors.department)}>
                <SelectValue placeholder="اختر القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر القسم</SelectItem>
                {departments.map((d: { id: number; name: string }) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
                {departments.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    لا توجد أقسام مُعرَّفة. أضف الأقسام من <a href="/settings/departments" className="text-status-info-foreground hover:underline">الإعدادات ← الأقسام</a> أولاً.
                  </div>
                )}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="المسمى الوظيفي" required error={fieldErrors.jobTitle}>
            <Select
              value={form.jobTitle || "_none"}
              onValueChange={(v) => {
                if (v === "_none") {
                  setForm((f) => ({ ...f, jobTitle: "", jobTitleId: "" }));
                  return;
                }
                const picked = jobTitles.find((jt: any) => jt.name === v);
                setForm((f) => ({
                  ...f,
                  jobTitle: v,
                  jobTitleId: picked ? String(picked.id) : "",
                  role: picked?.defaultRoleKey || f.role,
                }));
              }}
            >
              <SelectTrigger className={fieldErrorClass(fieldErrors.jobTitle)}>
                <SelectValue placeholder="اختر المسمى الوظيفي" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر المسمى الوظيفي</SelectItem>
                {jobTitles.map((jt: { id: number; name: string; defaultRoleKey?: string | null }) => (
                  <SelectItem key={jt.id} value={jt.name}>
                    {jt.name}{jt.defaultRoleKey ? ` — ${jt.defaultRoleKey}` : ""}
                  </SelectItem>
                ))}
                {jobTitles.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    لا توجد مسميات وظيفية معرَّفة بعد.
                  </div>
                )}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="نوع العقد" required error={fieldErrors.contractType}>
            <Select value={form.contractType} onValueChange={(v) => setForm((f) => ({ ...f, contractType: v }))}>
              <SelectTrigger className={fieldErrorClass(fieldErrors.contractType)}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">دوام كامل</SelectItem>
                <SelectItem value="part_time">دوام جزئي</SelectItem>
                <SelectItem value="contract">عقد مؤقت</SelectItem>
                <SelectItem value="freelance">عمل حر</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <NumberField label="الراتب الأساسي" value={form.salary} onChange={(v) => setForm((f) => ({ ...f, salary: v }))} error={fieldErrors.salary} />
          <FormFieldWrapper label="تاريخ التعيين">
            <DatePicker value={form.hireDate} onChange={(v) => setForm((f) => ({ ...f, hireDate: v }))} />
          </FormFieldWrapper>
          <FormFieldWrapper label="المدير المباشر" required error={fieldErrors.managerId}>
            <Select value={form.managerId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, managerId: v === "_none" ? "" : v }))}>
              <SelectTrigger className={fieldErrorClass(fieldErrors.managerId)}>
                <SelectValue placeholder="اختر المدير المباشر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">اختر المدير المباشر</SelectItem>
                {employeesList.map((e: { id: number; name: string; jobTitle?: string }) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}{e.jobTitle ? ` — ${e.jobTitle}` : ""}
                  </SelectItem>
                ))}
                {employeesList.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    لا يوجد موظفون بعد. لإضافة أول موظف استخدم النموذج الكامل.
                  </div>
                )}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
          <FormFieldWrapper label="المنصب الإداري" required error={fieldErrors.positionId}>
            <PositionSelect
              value={form.positionId}
              onChange={(v) => setForm((f) => ({ ...f, positionId: v }))}
              error={fieldErrors.positionId}
              allowCreate={false}
            />
          </FormFieldWrapper>
          <FormFieldWrapper label="فئة الموظف (سياسة الحضور)" required error={fieldErrors.categoryKey}>
            <EmployeeCategorySelect
              value={form.categoryKey}
              onChange={(v) => setForm((f) => ({ ...f, categoryKey: v }))}
              error={fieldErrors.categoryKey}
            />
          </FormFieldWrapper>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={() => setLocation("/employees")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الموظف"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
