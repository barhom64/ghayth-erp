import { useState, useEffect } from "react";
import { todayLocal } from "@/lib/formatters";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, ApiError, buildErrorToast } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { ROLES } from "@/lib/constants";
import { CheckCircle, AlertCircle, User, Briefcase, FileText, Calendar, Shield, DollarSign, Clock, Building2, CreditCard, Users, ArrowRight } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAppContext } from "@/contexts/app-context";
import { fieldErrorClass, TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const OPERATIONS = [
  { key: "employee", label: "إنشاء سجل الموظف", icon: User },
  { key: "assignment", label: "ربط التعيين بالشركة/الفرع", icon: Building2 },
  { key: "user", label: "إنشاء حساب مستخدم", icon: Shield },
  { key: "role", label: "تعيين الصلاحية والدور", icon: Users },
  { key: "contract", label: "إنشاء عقد العمل", icon: FileText },
  { key: "leave_balance", label: "تهيئة رصيد الإجازات", icon: Calendar },
  { key: "attendance_policy", label: "ربط سياسة الحضور", icon: Clock },
  { key: "salary_structure", label: "إعداد الهيكل الوظيفي", icon: DollarSign },
  { key: "bank_account", label: "إعداد حساب بنكي", icon: CreditCard },
  { key: "onboarding_tasks", label: "إنشاء مهام التأهيل", icon: Briefcase },
  { key: "notification", label: "إرسال إشعار للإدارة", icon: AlertCircle },
];

export default function EmployeesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/employees", "POST", [["employees"]], { silent: true });
  const { data: departmentsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: jobTitlesData } = useApiQuery<{ data: any[] }>(["job-titles-list"], "/employees/job-titles");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list-for-manager"], "/employees?limit=200");
  const departments = departmentsData?.data || [];
  const branches = branchesData?.data || [];
  const jobTitles = jobTitlesData?.data || [];
  const employeesList = employeesData?.data || [];
  const [managerSearch, setManagerSearch] = useState("");
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("employees_create", {
    name: "", phone: "", email: "", jobTitle: "", role: "employee", salary: "",
    hireDate: todayLocal(),
    nationalId: "", nationality: "سعودي", gender: "male", dateOfBirth: "",
    department: "", contractType: "full_time", branchId: selectedBranchId ? String(selectedBranchId) : "",
    companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
    managerId: "",
    iqamaNumber: "", passportNumber: "", iqamaExpiry: "", passportExpiry: "",
    borderNumber: "", visaNumber: "", visaType: "", visaExpiry: "",
    sponsorNumber: "", workPermitNumber: "", workPermitExpiry: "", iqamaStatus: "active",
    bankName: "", bankAccount: "", iban: "",
    emergencyContact: "", emergencyPhone: "",
  });

  useEffect(() => {
    if (selectedBranchId && !form.branchId) {
      setForm((f) => ({ ...f, branchId: String(selectedBranchId) }));
    }
    if (selectedCompanyIds.length === 1 && !form.companyId) {
      setForm((f) => ({ ...f, companyId: String(selectedCompanyIds[0]) }));
    }
  }, [selectedBranchId, selectedCompanyIds]);

  const [creationResult, setCreationResult] = useState<Record<string, any> | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const errCls = (field: string) => fieldErrorClass(fieldErrors[field]);
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-status-error-foreground mt-1">{fieldErrors[field]}</p> : null;

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
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      const result = await createMut.mutateAsync({
        ...form,
        salary: Number(form.salary) || 0,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        managerId: form.managerId ? Number(form.managerId) : undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      clearDraft();
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
        // HR-U2 — بدّلنا toast العام بـ buildErrorToast حتى يعرض
        // رسالة مكتوبة (code + description) للمستخدم بدلاً من "حدث خطأ".
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
              <p className="text-xs text-status-success-foreground">يُنصح الموظف بتغيير كلمة المرور بعد أول تسجيل دخول من صفحة "مساحتي".</p>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-status-success-foreground">
              <CheckCircle className="w-6 h-6" />
              {creationResult.name} — عمليات التهيئة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {OPERATIONS.map((op, i) => {
              const Icon = op.icon;
              const isDone = op.key !== "user" || !!userAccount;
              return (
                <div key={op.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-subtle">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isDone ? "bg-status-success-surface" : "bg-surface-subtle"}`}>
                    <CheckCircle className={`w-3.5 h-3.5 ${isDone ? "text-status-success-foreground" : "text-gray-300"}`} />
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-status-info-surface flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-status-info-foreground" />
                  </div>
                  <span className="text-sm font-medium text-status-neutral-foreground">{i + 1}. {op.label}</span>
                  <Badge className={`ms-auto text-[10px] ${isDone ? "bg-status-success-surface text-status-success-foreground" : "bg-surface-subtle text-muted-foreground"}`}>
                    {isDone ? "مكتمل" : op.key === "user" ? "يتطلب بريد إلكتروني" : "—"}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => {
            setCreationResult(null);
            setManagerSearch("");
            setShowManagerDropdown(false);
            setForm({
              name: "", phone: "", email: "", jobTitle: "", role: "employee", salary: "",
              hireDate: todayLocal(),
              nationalId: "", nationality: "سعودي", gender: "male", dateOfBirth: "",
              department: "", contractType: "full_time",
              branchId: selectedBranchId ? String(selectedBranchId) : "",
              companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
              managerId: "",
              iqamaNumber: "", passportNumber: "", iqamaExpiry: "", passportExpiry: "",
              borderNumber: "", visaNumber: "", visaType: "", visaExpiry: "",
              sponsorNumber: "", workPermitNumber: "", workPermitExpiry: "", iqamaStatus: "active",
              bankName: "", bankAccount: "", iban: "",
              emergencyContact: "", emergencyPhone: "",
            });
          }}>
            إضافة موظف آخر
          </Button>
          <Button onClick={() => setLocation("/employees")} className="gap-1">
            العودة للقائمة <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CreatePageLayout>
    );
  }

  return (
    <CreatePageLayout title="إضافة موظف جديد" backPath="/employees">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="mb-4">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="الاسم الرباعي" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} className="md:col-span-2" />
        <TextField label="رقم الهوية / الإقامة" required dir="ltr" value={form.nationalId} onChange={(v) => setForm((f) => ({ ...f, nationalId: v }))} placeholder="مثال: 1234567890" error={fieldErrors.nationalId} />
        <FormFieldWrapper label="الجنسية" required error={fieldErrors.nationality}>
          <Select value={form.nationality} onValueChange={(v) => setForm((f) => ({ ...f, nationality: v }))}>
            <SelectTrigger className={fieldErrorClass(fieldErrors.nationality)}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="سعودي">سعودي</SelectItem>
              <SelectItem value="يمني">يمني</SelectItem>
              <SelectItem value="مصري">مصري</SelectItem>
              <SelectItem value="سوداني">سوداني</SelectItem>
              <SelectItem value="باكستاني">باكستاني</SelectItem>
              <SelectItem value="بنغلاديشي">بنغلاديشي</SelectItem>
              <SelectItem value="هندي">هندي</SelectItem>
              <SelectItem value="فلبيني">فلبيني</SelectItem>
              <SelectItem value="أخرى">أخرى</SelectItem>
            </SelectContent>
          </Select>
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
        <FormFieldWrapper label="تاريخ الميلاد"><DatePicker value={form.dateOfBirth} onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))} /></FormFieldWrapper>
        <TextField label="رقم الجوال" required type="tel" inputMode="tel" dir="ltr" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} error={fieldErrors.phone} />
        <TextField label="البريد الإلكتروني" type="email" dir="ltr" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} error={fieldErrors.email} />

        <div className="md:col-span-2">
          <Label>المدير المباشر <span className="text-status-error">*</span></Label>
          <div className="relative mt-1">
            <Input
              placeholder="ابحث عن المدير المباشر..."
              value={managerSearch}
              onFocus={() => setShowManagerDropdown(true)}
              onChange={(e) => {
                setManagerSearch(e.target.value);
                setShowManagerDropdown(true);
                if (!e.target.value) setForm((f) => ({ ...f, managerId: "" }));
              }}
              className={`w-full ${errCls("managerId")}`}
            />
            <FieldHint field="managerId" />
            {showManagerDropdown && managerSearch && !form.managerId && (
              <div className="absolute z-10 w-full bg-white border border-border rounded-md shadow-lg max-h-52 overflow-y-auto mt-1">
                {employeesList
                  .filter((emp: { name?: string; jobTitle?: string }) =>
                    emp.name?.toLowerCase().includes(managerSearch.toLowerCase()) ||
                    emp.jobTitle?.toLowerCase().includes(managerSearch.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((emp: { id: number; name: string; jobTitle?: string }) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="w-full text-right px-3 py-2 text-sm hover:bg-surface-subtle flex justify-between items-center gap-2"
                      onClick={() => {
                        setForm((f) => ({ ...f, managerId: String(emp.id) }));
                        setManagerSearch(`${emp.name}${emp.jobTitle ? ` (${emp.jobTitle})` : ""}`);
                        setShowManagerDropdown(false);
                      }}
                    >
                      <span className="font-medium text-status-neutral-foreground">{emp.name}</span>
                      {emp.jobTitle && <span className="text-xs text-muted-foreground">{emp.jobTitle}</span>}
                    </button>
                  ))}
                {employeesList.filter((emp: { name?: string; jobTitle?: string }) =>
                  emp.name?.toLowerCase().includes(managerSearch.toLowerCase()) ||
                  emp.jobTitle?.toLowerCase().includes(managerSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</div>
                )}
              </div>
            )}
            {form.managerId && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-status-success-foreground">
                  ✓ المدير المحدد: {employeesList.find((e: { id: number }) => String(e.id) === form.managerId)?.name}
                </p>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-status-error-foreground"
                  onClick={() => {
                    setForm((f) => ({ ...f, managerId: "" }));
                    setManagerSearch("");
                    setShowManagerDropdown(false);
                  }}
                >
                  تغيير
                </button>
              </div>
            )}
          </div>
        </div>

        <FormFieldWrapper label="المسمى الوظيفي" error={fieldErrors.jobTitle}>
          <Select value={form.jobTitle || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, jobTitle: v === "_none" ? "" : v }))}>
            <SelectTrigger className={fieldErrorClass(fieldErrors.jobTitle)}><SelectValue placeholder="اختر المسمى الوظيفي" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر المسمى الوظيفي</SelectItem>
              {jobTitles.length > 0
                ? jobTitles.map((jt: { id: number; name: string }) => <SelectItem key={jt.id} value={jt.name}>{jt.name}</SelectItem>)
                : <>
                    <SelectItem value="مدير عام">مدير عام</SelectItem>
                    <SelectItem value="مدير قسم">مدير قسم</SelectItem>
                    <SelectItem value="محاسب">محاسب</SelectItem>
                    <SelectItem value="مهندس">مهندس</SelectItem>
                    <SelectItem value="فني">فني</SelectItem>
                    <SelectItem value="سائق">سائق</SelectItem>
                    <SelectItem value="موظف استقبال">موظف استقبال</SelectItem>
                    <SelectItem value="مندوب مبيعات">مندوب مبيعات</SelectItem>
                    <SelectItem value="أخصائي موارد بشرية">أخصائي موارد بشرية</SelectItem>
                  </>
              }
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="القسم" error={fieldErrors.department}>
          <Select value={form.department || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, department: v === "_none" ? "" : v }))}>
            <SelectTrigger className={fieldErrorClass(fieldErrors.department)}><SelectValue placeholder="اختر القسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر القسم</SelectItem>
              {departments.length > 0
                ? departments.map((d: { id: number; name: string }) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)
                : <>
                    <SelectItem value="تقنية المعلومات">تقنية المعلومات</SelectItem>
                    <SelectItem value="الموارد البشرية">الموارد البشرية</SelectItem>
                    <SelectItem value="المالية">المالية</SelectItem>
                    <SelectItem value="التسويق">التسويق</SelectItem>
                    <SelectItem value="العمليات">العمليات</SelectItem>
                    <SelectItem value="المبيعات">المبيعات</SelectItem>
                    <SelectItem value="القانونية">القانونية</SelectItem>
                    <SelectItem value="الإدارة العامة">الإدارة العامة</SelectItem>
                  </>
              }
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الفرع">
          <Select value={form.branchId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختياري —</SelectItem>
              {branches.map((b: { id: number; name: string }) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الصلاحية">
          <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLES).map(([key, value]) => <SelectItem key={key} value={key}>{value as string}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="نوع العقد" error={fieldErrors.contractType}>
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
        <FormFieldWrapper label="تاريخ التعيين"><DatePicker value={form.hireDate} onChange={(v) => setForm((f) => ({ ...f, hireDate: v }))} /></FormFieldWrapper>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">بيانات الإقامة والجواز</h3>
        </div>
        <TextField label="رقم الإقامة" dir="ltr" value={form.iqamaNumber} onChange={(v) => setForm((f) => ({ ...f, iqamaNumber: v }))} />
        <TextField label="رقم الجواز" dir="ltr" value={form.passportNumber} onChange={(v) => setForm((f) => ({ ...f, passportNumber: v }))} />
        <FormFieldWrapper label="تاريخ انتهاء الإقامة"><DatePicker value={form.iqamaExpiry} onChange={(v) => setForm((f) => ({ ...f, iqamaExpiry: v }))} /></FormFieldWrapper>
        <FormFieldWrapper label="تاريخ انتهاء الجواز"><DatePicker value={form.passportExpiry} onChange={(v) => setForm((f) => ({ ...f, passportExpiry: v }))} /></FormFieldWrapper>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block"></span>
            بيانات التأشيرة والتصاريح — الربط الحكومي (مقيم)
          </h3>
        </div>
        <TextField label="رقم الحدود" dir="ltr" value={form.borderNumber} onChange={(v) => setForm((f) => ({ ...f, borderNumber: v }))} placeholder="رقم الحدود" />
        <TextField label="رقم التأشيرة" dir="ltr" value={form.visaNumber} onChange={(v) => setForm((f) => ({ ...f, visaNumber: v }))} placeholder="رقم التأشيرة" />
        <FormFieldWrapper label="نوع التأشيرة">
          <Select value={form.visaType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, visaType: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— اختياري —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختياري —</SelectItem>
              <SelectItem value="work">عمل</SelectItem>
              <SelectItem value="visit">زيارة</SelectItem>
              <SelectItem value="family">تابع / عائلة</SelectItem>
              <SelectItem value="student">طالب</SelectItem>
              <SelectItem value="umrah">عمرة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="تاريخ انتهاء التأشيرة"><DatePicker value={form.visaExpiry} onChange={(v) => setForm((f) => ({ ...f, visaExpiry: v }))} /></FormFieldWrapper>
        <TextField label="رقم الكفيل / المنشأة" dir="ltr" value={form.sponsorNumber} onChange={(v) => setForm((f) => ({ ...f, sponsorNumber: v }))} placeholder="رقم المنشأة أو الكفيل" />
        <TextField label="رقم رخصة العمل" dir="ltr" value={form.workPermitNumber} onChange={(v) => setForm((f) => ({ ...f, workPermitNumber: v }))} placeholder="رقم رخصة العمل" />
        <FormFieldWrapper label="تاريخ انتهاء رخصة العمل"><DatePicker value={form.workPermitExpiry} onChange={(v) => setForm((f) => ({ ...f, workPermitExpiry: v }))} /></FormFieldWrapper>
        <FormFieldWrapper label="حالة الإقامة">
          <Select value={form.iqamaStatus} onValueChange={(v) => setForm((f) => ({ ...f, iqamaStatus: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">سارية</SelectItem>
              <SelectItem value="expired">منتهية</SelectItem>
              <SelectItem value="renewal_pending">قيد التجديد</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">البيانات البنكية</h3>
        </div>
        <FormFieldWrapper label="اسم البنك">
          <Select value={form.bankName || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, bankName: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="اختر البنك" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر البنك</SelectItem>
              <SelectItem value="الراجحي">مصرف الراجحي</SelectItem>
              <SelectItem value="الأهلي">البنك الأهلي السعودي</SelectItem>
              <SelectItem value="الإنماء">مصرف الإنماء</SelectItem>
              <SelectItem value="الرياض">بنك الرياض</SelectItem>
              <SelectItem value="البلاد">بنك البلاد</SelectItem>
              <SelectItem value="الجزيرة">بنك الجزيرة</SelectItem>
              <SelectItem value="العربي">البنك العربي الوطني</SelectItem>
              <SelectItem value="ساب">بنك ساب</SelectItem>
              <SelectItem value="الفرنسي">البنك السعودي الفرنسي</SelectItem>
              <SelectItem value="الاستثمار">بنك الاستثمار السعودي</SelectItem>
              <SelectItem value="الأول">البنك الأول</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextField label="رقم الحساب" dir="ltr" value={form.bankAccount} onChange={(v) => setForm((f) => ({ ...f, bankAccount: v }))} />
        <TextField label="رقم الآيبان" dir="ltr" value={form.iban} onChange={(v) => setForm((f) => ({ ...f, iban: v }))} placeholder="SA..." />

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">جهة الاتصال في حالة الطوارئ</h3>
        </div>
        <TextField label="اسم جهة الاتصال" value={form.emergencyContact} onChange={(v) => setForm((f) => ({ ...f, emergencyContact: v }))} />
        <TextField label="رقم الطوارئ" dir="ltr" value={form.emergencyPhone} onChange={(v) => setForm((f) => ({ ...f, emergencyPhone: v }))} />
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="المرفقات (صور، وثائق)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/employees")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الموظف"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
