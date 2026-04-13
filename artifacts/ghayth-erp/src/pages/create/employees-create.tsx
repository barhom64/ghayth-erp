import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, ApiError } from "@/lib/api";
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

export default function EmployeesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedBranchId, selectedCompanyIds } = useAppContext();
  const createMut = useApiMutation("/employees", "POST", [["employees"]]);
  const { data: departmentsData } = useApiQuery<{ data: any[] }>(["departments-list"], "/settings/departments");
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
    hireDate: new Date().toISOString().split("T")[0],
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const errCls = (field: string) => fieldErrors[field] ? "border-red-500 ring-1 ring-red-300" : "";
  const FieldHint = ({ field }: { field: string }) => fieldErrors[field] ? <p className="text-xs text-red-600 mt-1">{fieldErrors[field]}</p> : null;

  const handleSubmit = async () => {
    setFieldErrors({});
    const localErrors: Record<string, string> = {};
    if (!form.name) localErrors.name = "يرجى إدخال اسم الموظف";
    if (!form.nationalId) localErrors.nationalId = "يرجى إدخال رقم الهوية";
    if (!form.nationality) localErrors.nationality = "يرجى اختيار الجنسية";
    if (!form.phone) localErrors.phone = "يرجى إدخال رقم الجوال";
    if (!form.managerId) localErrors.managerId = "يرجى اختيار المدير المباشر";
    if (!form.department) localErrors.department = "يرجى اختيار القسم";
    if (!form.jobTitle) localErrors.jobTitle = "يرجى اختيار المسمى الوظيفي";
    if (!form.contractType) localErrors.contractType = "يرجى اختيار نوع العقد";
    if (!form.salary || Number(form.salary) <= 0) localErrors.salary = "يرجى إدخال الراتب الأساسي";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const firstKey = Object.keys(localErrors)[0];
      toast({ variant: "destructive", title: localErrors[firstKey] });
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
        setFieldErrors({ [err.field]: err.fix ?? err.message });
        toast({
          variant: "destructive",
          title: err.code === "CONFLICT" ? "لا يمكن تنفيذ هذه العملية الآن" : "البيانات غير صالحة",
          description: err.fix ?? err.message,
        });
      } else {
        toast({ variant: "destructive", title: "حدث خطأ أثناء إضافة الموظف" });
      }
    }
  };

  if (creationResult) {
    const userAccount = creationResult.userAccount;
    return (
      <CreatePageLayout title="تم إنشاء الموظف بنجاح" backPath="/employees">
        {userAccount?.isNewAccount && (
          <Card className="border-green-200 bg-green-50 mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-800">
                <Shield className="w-5 h-5" />
                تم إنشاء حساب دخول للموظف
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-green-700">احفظ هذه البيانات وأرسلها للموظف — لن تظهر مرة أخرى:</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">البريد الإلكتروني</p>
                  <p className="font-mono text-sm font-medium">{userAccount.email}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-gray-500 mb-1">كلمة المرور المؤقتة</p>
                  <p className="font-mono text-sm font-bold text-blue-700">{userAccount.tempPassword}</p>
                </div>
              </div>
              <p className="text-xs text-green-600">يُنصح الموظف بتغيير كلمة المرور بعد أول تسجيل دخول من صفحة "مساحتي".</p>
            </CardContent>
          </Card>
        )}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-green-700">
              <CheckCircle className="w-6 h-6" />
              {creationResult.name} — عمليات التهيئة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {OPERATIONS.map((op, i) => {
              const Icon = op.icon;
              const isDone = op.key !== "user" || !!userAccount;
              return (
                <div key={op.key} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isDone ? "bg-green-100" : "bg-gray-100"}`}>
                    <CheckCircle className={`w-3.5 h-3.5 ${isDone ? "text-green-600" : "text-gray-300"}`} />
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{i + 1}. {op.label}</span>
                  <Badge className={`ms-auto text-[10px] ${isDone ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
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
              hireDate: new Date().toISOString().split("T")[0],
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
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <button onClick={clearDraft} className="underline text-amber-600 hover:text-amber-800">تجاهل</button>
        </div>
      )}
      <div className="mb-4">
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2"><Label>الاسم الرباعي <span className="text-red-500">*</span></Label><Input className={`mt-1 ${errCls("name")}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><FieldHint field="name" /></div>
        <div><Label>رقم الهوية / الإقامة <span className="text-red-500">*</span></Label><Input className={`mt-1 ${errCls("nationalId")}`} dir="ltr" value={form.nationalId} onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))} placeholder="مثال: 1234567890" /><FieldHint field="nationalId" /></div>
        <div>
          <Label>الجنسية <span className="text-red-500">*</span></Label>
          <Select value={form.nationality} onValueChange={(v) => setForm((f) => ({ ...f, nationality: v }))}>
            <SelectTrigger className={`mt-1 ${errCls("nationality")}`}><SelectValue /></SelectTrigger>
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
        </div>
        <div>
          <Label>الجنس</Label>
          <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">ذكر</SelectItem>
              <SelectItem value="female">أنثى</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>تاريخ الميلاد</Label><div className="mt-1"><DatePicker value={form.dateOfBirth} onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))} /></div></div>
        <div><Label>رقم الجوال <span className="text-red-500">*</span></Label><Input className={`mt-1 ${errCls("phone")}`} dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /><FieldHint field="phone" /></div>
        <div><Label>البريد الإلكتروني</Label><Input className={`mt-1 ${errCls("email")}`} type="email" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /><FieldHint field="email" /></div>

        <div className="md:col-span-2">
          <Label>المدير المباشر <span className="text-red-500">*</span></Label>
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
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-y-auto mt-1">
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
                      className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center gap-2"
                      onClick={() => {
                        setForm((f) => ({ ...f, managerId: String(emp.id) }));
                        setManagerSearch(`${emp.name}${emp.jobTitle ? ` (${emp.jobTitle})` : ""}`);
                        setShowManagerDropdown(false);
                      }}
                    >
                      <span className="font-medium text-gray-800">{emp.name}</span>
                      {emp.jobTitle && <span className="text-xs text-gray-400">{emp.jobTitle}</span>}
                    </button>
                  ))}
                {employeesList.filter((emp: { name?: string; jobTitle?: string }) =>
                  emp.name?.toLowerCase().includes(managerSearch.toLowerCase()) ||
                  emp.jobTitle?.toLowerCase().includes(managerSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">لا توجد نتائج</div>
                )}
              </div>
            )}
            {form.managerId && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-green-600">
                  ✓ المدير المحدد: {employeesList.find((e: { id: number }) => String(e.id) === form.managerId)?.name}
                </p>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
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

        <div>
          <Label>المسمى الوظيفي</Label>
          <Select value={form.jobTitle || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, jobTitle: v === "_none" ? "" : v }))}>
            <SelectTrigger className={`mt-1 ${errCls("jobTitle")}`}><SelectValue placeholder="اختر المسمى الوظيفي" /></SelectTrigger>
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
          <FieldHint field="jobTitle" />
        </div>
        <div>
          <Label>القسم</Label>
          <Select value={form.department || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, department: v === "_none" ? "" : v }))}>
            <SelectTrigger className={`mt-1 ${errCls("department")}`}><SelectValue placeholder="اختر القسم" /></SelectTrigger>
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
          <FieldHint field="department" />
        </div>
        <div>
          <Label>الفرع</Label>
          <Select value={form.branchId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="— اختياري —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— اختياري —</SelectItem>
              {branches.map((b: { id: number; name: string }) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الصلاحية</Label>
          <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLES).map(([key, value]) => <SelectItem key={key} value={key}>{value as string}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>نوع العقد</Label>
          <Select value={form.contractType} onValueChange={(v) => setForm((f) => ({ ...f, contractType: v }))}>
            <SelectTrigger className={`mt-1 ${errCls("contractType")}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full_time">دوام كامل</SelectItem>
              <SelectItem value="part_time">دوام جزئي</SelectItem>
              <SelectItem value="contract">عقد مؤقت</SelectItem>
              <SelectItem value="freelance">عمل حر</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint field="contractType" />
        </div>
        <div><Label>الراتب الأساسي</Label><Input className={`mt-1 ${errCls("salary")}`} type="number" dir="ltr" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} /><FieldHint field="salary" /></div>
        <div><Label>تاريخ التعيين</Label><div className="mt-1"><DatePicker value={form.hireDate} onChange={(v) => setForm((f) => ({ ...f, hireDate: v }))} /></div></div>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">بيانات الإقامة والجواز</h3>
        </div>
        <div><Label>رقم الإقامة</Label><Input className="mt-1" dir="ltr" value={form.iqamaNumber} onChange={(e) => setForm((f) => ({ ...f, iqamaNumber: e.target.value }))} /></div>
        <div><Label>رقم الجواز</Label><Input className="mt-1" dir="ltr" value={form.passportNumber} onChange={(e) => setForm((f) => ({ ...f, passportNumber: e.target.value }))} /></div>
        <div><Label>تاريخ انتهاء الإقامة</Label><div className="mt-1"><DatePicker value={form.iqamaExpiry} onChange={(v) => setForm((f) => ({ ...f, iqamaExpiry: v }))} /></div></div>
        <div><Label>تاريخ انتهاء الجواز</Label><div className="mt-1"><DatePicker value={form.passportExpiry} onChange={(v) => setForm((f) => ({ ...f, passportExpiry: v }))} /></div></div>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
            بيانات التأشيرة والتصاريح — الربط الحكومي (مقيم)
          </h3>
        </div>
        <div><Label>رقم الحدود</Label><Input className="mt-1" dir="ltr" value={form.borderNumber} onChange={(e) => setForm({ ...form, borderNumber: e.target.value })} placeholder="رقم الحدود" /></div>
        <div><Label>رقم التأشيرة</Label><Input className="mt-1" dir="ltr" value={form.visaNumber} onChange={(e) => setForm({ ...form, visaNumber: e.target.value })} placeholder="رقم التأشيرة" /></div>
        <div>
          <Label>نوع التأشيرة</Label>
          <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.visaType} onChange={(e) => setForm({ ...form, visaType: e.target.value })}>
            <option value="">— اختياري —</option>
            <option value="work">عمل</option>
            <option value="visit">زيارة</option>
            <option value="family">تابع / عائلة</option>
            <option value="student">طالب</option>
            <option value="umrah">عمرة</option>
          </select>
        </div>
        <div><Label>تاريخ انتهاء التأشيرة</Label><div className="mt-1"><DatePicker value={form.visaExpiry} onChange={(v) => setForm({ ...form, visaExpiry: v })} /></div></div>
        <div><Label>رقم الكفيل / المنشأة</Label><Input className="mt-1" dir="ltr" value={form.sponsorNumber} onChange={(e) => setForm({ ...form, sponsorNumber: e.target.value })} placeholder="رقم المنشأة أو الكفيل" /></div>
        <div><Label>رقم رخصة العمل</Label><Input className="mt-1" dir="ltr" value={form.workPermitNumber} onChange={(e) => setForm({ ...form, workPermitNumber: e.target.value })} placeholder="رقم رخصة العمل" /></div>
        <div><Label>تاريخ انتهاء رخصة العمل</Label><div className="mt-1"><DatePicker value={form.workPermitExpiry} onChange={(v) => setForm({ ...form, workPermitExpiry: v })} /></div></div>
        <div>
          <Label>حالة الإقامة</Label>
          <select className="w-full border rounded-md p-2 mt-1 text-sm" value={form.iqamaStatus} onChange={(e) => setForm({ ...form, iqamaStatus: e.target.value })}>
            <option value="active">سارية</option>
            <option value="expired">منتهية</option>
            <option value="renewal_pending">قيد التجديد</option>
          </select>
        </div>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">البيانات البنكية</h3>
        </div>
        <div>
          <Label>اسم البنك</Label>
          <Select value={form.bankName || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, bankName: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="اختر البنك" /></SelectTrigger>
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
        </div>
        <div><Label>رقم الحساب</Label><Input className="mt-1" dir="ltr" value={form.bankAccount} onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))} /></div>
        <div><Label>رقم الآيبان</Label><Input className="mt-1" dir="ltr" value={form.iban} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))} placeholder="SA..." /></div>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">جهة الاتصال في حالة الطوارئ</h3>
        </div>
        <div><Label>اسم جهة الاتصال</Label><Input className="mt-1" value={form.emergencyContact} onChange={(e) => setForm((f) => ({ ...f, emergencyContact: e.target.value }))} /></div>
        <div><Label>رقم الطوارئ</Label><Input className="mt-1" dir="ltr" value={form.emergencyPhone} onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))} /></div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} label="المرفقات (صور، وثائق)" />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/employees")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.name || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ الموظف"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
