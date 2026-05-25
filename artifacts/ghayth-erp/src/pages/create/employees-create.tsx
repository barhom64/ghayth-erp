import { useState, useEffect } from "react";
import { todayLocal } from "@/lib/formatters";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, ApiError, buildErrorToast } from "@/lib/api";
import { useFormContext } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormNumberField,
  FormSelectField,
  FormDateField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { ROLES } from "@/lib/constants";
import { CheckCircle, AlertCircle, User, Briefcase, FileText, Calendar, Shield, DollarSign, Clock, Building2, CreditCard, Users, ArrowRight } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAppContext } from "@/contexts/app-context";

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

const NATIONALITY_OPTIONS = [
  { value: "سعودي", label: "سعودي" },
  { value: "يمني", label: "يمني" },
  { value: "مصري", label: "مصري" },
  { value: "سوداني", label: "سوداني" },
  { value: "باكستاني", label: "باكستاني" },
  { value: "بنغلاديشي", label: "بنغلاديشي" },
  { value: "هندي", label: "هندي" },
  { value: "فلبيني", label: "فلبيني" },
  { value: "أخرى", label: "أخرى" },
];
const GENDER_OPTIONS = [
  { value: "male", label: "ذكر" },
  { value: "female", label: "أنثى" },
];
const CONTRACT_OPTIONS = [
  { value: "full_time", label: "دوام كامل" },
  { value: "part_time", label: "دوام جزئي" },
  { value: "contract", label: "عقد مؤقت" },
  { value: "freelance", label: "عمل حر" },
];
const VISA_TYPE_OPTIONS = [
  { value: "work", label: "عمل" },
  { value: "visit", label: "زيارة" },
  { value: "family", label: "تابع / عائلة" },
  { value: "student", label: "طالب" },
  { value: "umrah", label: "عمرة" },
];
const IQAMA_STATUS_OPTIONS = [
  { value: "active", label: "سارية" },
  { value: "expired", label: "منتهية" },
  { value: "renewal_pending", label: "قيد التجديد" },
];
const BANK_OPTIONS = [
  { value: "الراجحي", label: "مصرف الراجحي" },
  { value: "الأهلي", label: "البنك الأهلي السعودي" },
  { value: "الإنماء", label: "مصرف الإنماء" },
  { value: "الرياض", label: "بنك الرياض" },
  { value: "البلاد", label: "بنك البلاد" },
  { value: "الجزيرة", label: "بنك الجزيرة" },
  { value: "العربي", label: "البنك العربي الوطني" },
  { value: "ساب", label: "بنك ساب" },
  { value: "الفرنسي", label: "البنك السعودي الفرنسي" },
  { value: "الاستثمار", label: "بنك الاستثمار السعودي" },
  { value: "الأول", label: "البنك الأول" },
];

const schema = z.object({
  name: z.string().min(1, "يرجى إدخال اسم الموظف"),
  phone: z.string().min(1, "يرجى إدخال رقم الجوال"),
  email: z.string().optional(),
  jobTitle: z.string().min(1, "يرجى اختيار المسمى الوظيفي"),
  role: z.string(),
  salary: z
    .string()
    .refine((v) => Number(v) > 0, "يرجى إدخال الراتب الأساسي"),
  hireDate: z.string(),
  nationalId: z.string().min(1, "يرجى إدخال رقم الهوية"),
  nationality: z.string().min(1, "يرجى اختيار الجنسية"),
  gender: z.enum(["male", "female"]),
  dateOfBirth: z.string().optional(),
  department: z.string().min(1, "يرجى اختيار القسم"),
  contractType: z.enum(["full_time", "part_time", "contract", "freelance"]),
  branchId: z.string().optional(),
  companyId: z.string().optional(),
  managerId: z.string().optional(),
  iqamaNumber: z.string().optional(),
  passportNumber: z.string().optional(),
  iqamaExpiry: z.string().optional(),
  passportExpiry: z.string().optional(),
  borderNumber: z.string().optional(),
  visaNumber: z.string().optional(),
  visaType: z.string().optional(),
  visaExpiry: z.string().optional(),
  sponsorNumber: z.string().optional(),
  workPermitNumber: z.string().optional(),
  workPermitExpiry: z.string().optional(),
  iqamaStatus: z.enum(["active", "expired", "renewal_pending"]),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  iban: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
});

function ManagerSearchPicker({ employeesList }: { employeesList: any[] }) {
  const { watch, setValue } = useFormContext();
  const managerId = watch("managerId") as string;
  const [managerSearch, setManagerSearch] = useState("");
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);

  // Sync display when managerId is preset (e.g. from draft restore)
  useEffect(() => {
    if (managerId && !managerSearch) {
      const emp = employeesList.find((e: any) => String(e.id) === managerId);
      if (emp) setManagerSearch(`${emp.name}${emp.jobTitle ? ` (${emp.jobTitle})` : ""}`);
    }
  }, [managerId, managerSearch, employeesList]);

  return (
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
            if (!e.target.value) setValue("managerId", "");
          }}
          className="w-full"
        />
        {showManagerDropdown && managerSearch && !managerId && (
          <div className="absolute z-10 w-full bg-white border border-border rounded-md shadow-lg max-h-52 overflow-y-auto mt-1">
            {employeesList
              .filter((emp: { name?: string; jobTitle?: string }) =>
                emp.name?.toLowerCase().includes(managerSearch.toLowerCase()) ||
                emp.jobTitle?.toLowerCase().includes(managerSearch.toLowerCase()),
              )
              .slice(0, 10)
              .map((emp: { id: number; name: string; jobTitle?: string }) => (
                <button
                  key={emp.id}
                  type="button"
                  className="w-full text-right px-3 py-2 text-sm hover:bg-surface-subtle flex justify-between items-center gap-2"
                  onClick={() => {
                    setValue("managerId", String(emp.id));
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
              emp.jobTitle?.toLowerCase().includes(managerSearch.toLowerCase()),
            ).length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</div>
            )}
          </div>
        )}
        {managerId && (
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-status-success-foreground">
              ✓ المدير المحدد: {employeesList.find((e: { id: number }) => String(e.id) === managerId)?.name}
            </p>
            <button
              type="button"
              className="text-xs text-red-400 hover:text-status-error-foreground"
              onClick={() => {
                setValue("managerId", "");
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
  );
}

export default function EmployeesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/employees", "POST", [["employees"]], { silent: true });
  const { data: departmentsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
  const { data: branchesData } = useApiQuery<{ data: any[] }>(["branches-list"], "/settings/branches");
  const { data: jobTitlesData } = useApiQuery<{ data: any[] }>(["job-titles-list"], "/employees/job-titles");
  const { data: employeesData } = useApiQuery<{ data: any[] }>(["employees-list-for-manager"], "/employees?limit=200");

  const [sourceApplicationId, setSourceApplicationId] = useState<string | null>(null);
  const [creationResult, setCreationResult] = useState<Record<string, any> | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [prefill, setPrefill] = useState({ name: "", email: "", phone: "" });

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const name = qp.get("name");
    const email = qp.get("email");
    const phone = qp.get("phone");
    const appId = qp.get("sourceApplicationId");
    if (appId) setSourceApplicationId(appId);
    setPrefill({ name: name || "", email: email || "", phone: phone || "" });
  }, []);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const departments = departmentsData?.data || [];
  const branches = branchesData?.data || [];
  const jobTitles = jobTitlesData?.data || [];
  const employeesList = employeesData?.data || [];

  const jobTitleOptions = jobTitles.length > 0
    ? jobTitles.map((jt: any) => ({ value: jt.name, label: jt.name }))
    : [
        { value: "مدير عام", label: "مدير عام" },
        { value: "مدير قسم", label: "مدير قسم" },
        { value: "محاسب", label: "محاسب" },
        { value: "مهندس", label: "مهندس" },
        { value: "فني", label: "فني" },
        { value: "سائق", label: "سائق" },
        { value: "موظف استقبال", label: "موظف استقبال" },
        { value: "مندوب مبيعات", label: "مندوب مبيعات" },
        { value: "أخصائي موارد بشرية", label: "أخصائي موارد بشرية" },
      ];

  const departmentOptions = departments.length > 0
    ? departments.map((d: any) => ({ value: d.name, label: d.name }))
    : [
        { value: "تقنية المعلومات", label: "تقنية المعلومات" },
        { value: "الموارد البشرية", label: "الموارد البشرية" },
        { value: "المالية", label: "المالية" },
        { value: "التسويق", label: "التسويق" },
        { value: "العمليات", label: "العمليات" },
        { value: "المبيعات", label: "المبيعات" },
        { value: "القانونية", label: "القانونية" },
        { value: "الإدارة العامة", label: "الإدارة العامة" },
      ];

  const branchOptions = branches.map((b: any) => ({ value: String(b.id), label: b.name }));
  const roleOptions = Object.entries(ROLES).map(([k, v]) => ({ value: k, label: v as string }));

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
          <Button variant="outline" onClick={() => setCreationResult(null)}>
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
      {sourceApplicationId && (
        <div className="mb-4 flex items-center gap-2 bg-status-info-surface border border-status-info-surface rounded-lg px-4 py-2 text-sm text-status-info-foreground">
          <Briefcase className="h-4 w-4 shrink-0" />
          <span>يتم إنشاء هذا الموظف من طلب التوظيف رقم #{sourceApplicationId} — أكمل البيانات المطلوبة ثم احفظ.</span>
        </div>
      )}
      <div className="mb-4">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          name: prefill.name,
          phone: prefill.phone,
          email: prefill.email,
          jobTitle: "",
          role: "employee",
          salary: "",
          hireDate: todayLocal(),
          nationalId: "",
          nationality: "سعودي",
          gender: "male",
          dateOfBirth: "",
          department: "",
          contractType: "full_time",
          branchId: selectedBranchId ? String(selectedBranchId) : "",
          companyId: selectedCompanyIds.length === 1 ? String(selectedCompanyIds[0]) : "",
          managerId: "",
          iqamaNumber: "",
          passportNumber: "",
          iqamaExpiry: "",
          passportExpiry: "",
          borderNumber: "",
          visaNumber: "",
          visaType: "",
          visaExpiry: "",
          sponsorNumber: "",
          workPermitNumber: "",
          workPermitExpiry: "",
          iqamaStatus: "active",
          bankName: "",
          bankAccount: "",
          iban: "",
          emergencyContact: "",
          emergencyPhone: "",
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ الموظف"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/employees")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values, { setFieldError }) => {
          try {
            const result = await createMut.mutateAsync({
              ...values,
              salary: Number(values.salary) || 0,
              branchId: values.branchId ? Number(values.branchId) : undefined,
              managerId: values.managerId ? Number(values.managerId) : undefined,
              ...(attachments.length > 0 ? { attachments } : {}),
              ...(sourceApplicationId ? { sourceApplicationId: Number(sourceApplicationId) } : {}),
            });
            toast({ title: "تم إضافة الموظف بنجاح" });
            setCreationResult(result as Record<string, any>);
          } catch (err) {
            if (err instanceof ApiError && err.field) {
              setFieldError(err.field as any, err.fix ?? err.message);
              toast({
                variant: "destructive",
                title: err.code === "CONFLICT" ? "لا يمكن تنفيذ هذه العملية الآن" : "البيانات غير صالحة",
                description: err.fix ?? err.message,
              });
            } else {
              toast(buildErrorToast(err));
            }
          }
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="الاسم الرباعي" required className="md:col-span-2" />
          <FormTextField name="nationalId" label="رقم الهوية / الإقامة" required placeholder="مثال: 1234567890" />
          <FormSelectField name="nationality" label="الجنسية" required options={NATIONALITY_OPTIONS} />
          <FormSelectField name="gender" label="الجنس" options={GENDER_OPTIONS} />
          <FormDateField name="dateOfBirth" label="تاريخ الميلاد" />
          <FormPhoneField name="phone" label="رقم الجوال" required />
          <FormEmailField name="email" label="البريد الإلكتروني" />
          <ManagerSearchPicker employeesList={employeesList} />
          <FormSelectField name="jobTitle" label="المسمى الوظيفي" required options={jobTitleOptions} placeholder="اختر المسمى الوظيفي" />
          <FormSelectField name="department" label="القسم" required options={departmentOptions} placeholder="اختر القسم" />
          <FormSelectField name="branchId" label="الفرع" options={branchOptions} placeholder="— اختياري —" />
          <FormSelectField name="role" label="الصلاحية" options={roleOptions} />
          <FormSelectField name="contractType" label="نوع العقد" options={CONTRACT_OPTIONS} />
          <FormNumberField name="salary" label="الراتب الأساسي" />
          <FormDateField name="hireDate" label="تاريخ التعيين" />

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">بيانات الإقامة والجواز</h3>
          </div>
          <FormTextField name="iqamaNumber" label="رقم الإقامة" />
          <FormTextField name="passportNumber" label="رقم الجواز" />
          <FormDateField name="iqamaExpiry" label="تاريخ انتهاء الإقامة" />
          <FormDateField name="passportExpiry" label="تاريخ انتهاء الجواز" />

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="text-sm font-semibold text-status-info-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-info-surface0 inline-block"></span>
              بيانات التأشيرة والتصاريح — الربط الحكومي (مقيم)
            </h3>
          </div>
          <FormTextField name="borderNumber" label="رقم الحدود" placeholder="رقم الحدود" />
          <FormTextField name="visaNumber" label="رقم التأشيرة" placeholder="رقم التأشيرة" />
          <FormSelectField name="visaType" label="نوع التأشيرة" options={VISA_TYPE_OPTIONS} placeholder="— اختياري —" />
          <FormDateField name="visaExpiry" label="تاريخ انتهاء التأشيرة" />
          <FormTextField name="sponsorNumber" label="رقم الكفيل / المنشأة" placeholder="رقم المنشأة أو الكفيل" />
          <FormTextField name="workPermitNumber" label="رقم رخصة العمل" placeholder="رقم رخصة العمل" />
          <FormDateField name="workPermitExpiry" label="تاريخ انتهاء رخصة العمل" />
          <FormSelectField name="iqamaStatus" label="حالة الإقامة" options={IQAMA_STATUS_OPTIONS} />

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">البيانات البنكية</h3>
          </div>
          <FormSelectField name="bankName" label="اسم البنك" options={BANK_OPTIONS} placeholder="اختر البنك" />
          <FormTextField name="bankAccount" label="رقم الحساب" />
          <FormTextField name="iban" label="رقم الآيبان" placeholder="SA..." />

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">جهة الاتصال في حالة الطوارئ</h3>
          </div>
          <FormTextField name="emergencyContact" label="اسم جهة الاتصال" />
          <FormPhoneField name="emergencyPhone" label="رقم الطوارئ" />
        </FormGrid>
        <FileDropZone files={attachments} onFilesChange={setAttachments} label="المرفقات (صور، وثائق)" />
      </FormShell>
    </CreatePageLayout>
  );
}
