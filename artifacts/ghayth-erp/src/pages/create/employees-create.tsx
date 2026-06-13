import { useState, useEffect, useRef, useMemo } from "react";
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
import { CreatePageLayout, CreationDateField } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { ROLES } from "@/lib/constants";
import { NATIONALITIES } from "@/lib/nationalities";
import { CheckCircle, AlertCircle, User, Briefcase, FileText, Calendar, Shield, DollarSign, Clock, Building2, CreditCard, Users, ArrowRight, Network } from "lucide-react";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { useAppContext } from "@/contexts/app-context";
import { fieldErrorClass, TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import {
  PositionSelect,
  TeamSelect,
  CommitteeSelect,
  EmployeeCategorySelect,
  ProjectSelect,
  CostCenterMasterSelect,
} from "@/components/shared/entity-selects";

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

// IGOC-003 — wizard step navigation overlay for the (intentionally one-form)
// employee creation flow. The server-side transaction is atomic and creates
// 18 things in one call; we keep that as-is and add a guided step indicator
// so the admin sees logical phases (personal data → job/contract → accounts
// → attachments) + per-step completion status. Click a step to scroll to it.
// IntersectionObserver auto-highlights the active step as the user scrolls.
interface WizardStep {
  key: string;
  label: string;
  icon: typeof User;
  // Predicate returns true when the step's REQUIRED fields are filled.
  // Used to render a checkmark (✓) on the step indicator. Optional fields
  // never affect completion — only required fields do.
  isComplete: (f: Record<string, string>, fieldErrors: Record<string, string | null>) => boolean;
}

const WIZARD_STEPS: WizardStep[] = [
  {
    key: "personal",
    label: "البيانات الشخصية",
    icon: User,
    isComplete: (f) => Boolean(f.name && f.nationalId && f.nationality && f.phone),
  },
  {
    key: "job",
    label: "الوظيفة والعقد",
    icon: Briefcase,
    isComplete: (f) => Boolean(f.contractType && f.salary && Number(f.salary) > 0),
  },
  {
    // PR-1 (#2077) — institutional binding step. The five mandatory
    // fields close «الموظف ككيان تشغيلي مؤسسي» at create time so the
    // engineer never has to remember a follow-up step.
    key: "institutional",
    label: "الربط المؤسسي",
    icon: Network,
    isComplete: (f) => Boolean(
      f.positionId && f.categoryKey && f.teamId && f.projectId && f.costCenterId && f.managerId,
    ),
  },
  {
    key: "accounts",
    label: "الحسابات والربط المالي",
    icon: CreditCard,
    isComplete: (_f) => true, // optional section — show ✓ always
  },
  {
    key: "attachments",
    label: "المرفقات والإقامة",
    icon: FileText,
    isComplete: (_f) => true, // optional section — show ✓ always
  },
];

function WizardStepNav({
  form,
  fieldErrors,
}: {
  form: Record<string, string>;
  fieldErrors: Record<string, string | null>;
}) {
  const [activeKey, setActiveKey] = useState<string>("personal");

  // Track which step is in view via IntersectionObserver. Highlight the
  // FIRST visible one so scrolling top-down lights up steps in order.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveKey(visible[0].target.id.replace(/^wizard-step-/, ""));
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    for (const s of WIZARD_STEPS) {
      const el = document.getElementById(`wizard-step-${s.key}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (key: string) => {
    const el = document.getElementById(`wizard-step-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Optimistic — IntersectionObserver will confirm shortly.
      setActiveKey(key);
    }
  };

  const completedCount = useMemo(
    () => WIZARD_STEPS.filter((s) => s.isComplete(form, fieldErrors)).length,
    [form, fieldErrors],
  );

  return (
    <Card className="mb-4 sticky top-0 z-10 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            خطوة {WIZARD_STEPS.findIndex((s) => s.key === activeKey) + 1} من {WIZARD_STEPS.length}
            {" — "}
            <span className="font-medium">{completedCount}/{WIZARD_STEPS.length} مكتمل</span>
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {WIZARD_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = step.key === activeKey;
            const isDone = step.isComplete(form, fieldErrors);
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => scrollTo(step.key)}
                className={`text-right p-2 rounded border transition-colors ${
                  isActive
                    ? "bg-primary/10 border-primary text-primary"
                    : isDone
                    ? "bg-status-success-surface border-status-success-surface text-status-success-foreground"
                    : "bg-surface-subtle border-transparent text-muted-foreground hover:bg-surface-subtle/70"
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                    isActive ? "bg-primary text-white" : isDone ? "bg-status-success-foreground text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {isDone && !isActive ? "✓" : idx + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="truncate font-medium">{step.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
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
  const departments = departmentsData?.data || [];
  const branches = branchesData?.data || [];
  const jobTitles = jobTitlesData?.data || [];
  const employeesList = employeesData?.data || [];
  const [managerSearch, setManagerSearch] = useState("");
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("employees_create", {
    name: "", phone: "", email: "", jobTitle: "", jobTitleId: "", role: "employee", salary: "",
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
    // Integrated HR — three email fields (login vs contact) +
    // create-custody flag + driver-vehicle binding.
    internalEmail: "", personalEmail: "",
    createCustodyAccount: false,
    vehicleId: "",
    // Real comms integration: chosen email domain + local part (the
    // composed address feeds internalEmail), and the PBX extension to
    // bind (existing id or a freshly minted number).
    emailDomain: "", emailLocalPart: "",
    pbxExtensionId: "", pbxExtensionNew: "",
    // PR-1 (#2077) — institutional binding. Five fields are required
    // by the wizard; committeeId is optional (cross-department council
    // bindings are not always relevant at hire time).
    positionId: "", categoryKey: "",
    teamId: "", projectId: "", costCenterId: "",
    committeeId: "",
  });

  // Fleet vehicles — only fetched when role implies driver, but the
  // hook needs a stable dependency so we always fetch (light query).
  const { data: vehiclesData } = useApiQuery<{ data: any[] }>(["fleet-vehicles-employee-create"], "/fleet/vehicles?limit=500");
  const vehicles = vehiclesData?.data || [];

  // Real comms integration — connected email domains + PBX extensions.
  // The `name` query param lets the backend suggest a transliterated
  // local part; we refetch suggestions as the name changes (debounced
  // implicitly by react-query key).
  const { data: emailProvData } = useApiQuery<{ data: { domains: string[]; suggestedLocalPart: string; hasConnectedDomains: boolean } }>(
    ["comms-email-domains", form.name],
    `/communications/provisioning/email-domains?name=${encodeURIComponent(form.name || "")}`,
  );
  const { data: extProvData } = useApiQuery<{ data: { pbxConnected: boolean; available: { id: number; extension: string; name: string }[]; nextExtension: string } }>(
    ["comms-pbx-extensions"],
    "/communications/provisioning/extensions",
  );
  const emailDomains = emailProvData?.data?.domains || [];
  const hasConnectedDomains = emailProvData?.data?.hasConnectedDomains || false;
  const suggestedLocalPart = emailProvData?.data?.suggestedLocalPart || "";
  const pbxConnected = extProvData?.data?.pbxConnected || false;
  const availableExtensions = extProvData?.data?.available || [];
  const nextExtension = extProvData?.data?.nextExtension || "";

  // Auto-fill the local part from the suggested transliteration once the
  // name is entered and the user hasn't typed their own local part yet.
  useEffect(() => {
    if (suggestedLocalPart && !form.emailLocalPart) {
      setForm((f) => ({ ...f, emailLocalPart: suggestedLocalPart }));
    }
  }, [suggestedLocalPart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default the email domain to the first connected one.
  useEffect(() => {
    if (emailDomains.length > 0 && !form.emailDomain) {
      setForm((f) => ({ ...f, emailDomain: emailDomains[0] }));
    }
  }, [emailDomains.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compose internalEmail from the picker whenever domain/local change.
  useEffect(() => {
    if (hasConnectedDomains && form.emailLocalPart && form.emailDomain) {
      const composed = `${form.emailLocalPart}@${form.emailDomain}`;
      if (composed !== form.internalEmail) {
        setForm((f) => ({ ...f, internalEmail: composed }));
      }
    }
  }, [form.emailLocalPart, form.emailDomain, hasConnectedDomains]); // eslint-disable-line react-hooks/exhaustive-deps

  // HR-005 — when the page is opened from a recruitment application, the
  // application id rides along so the POST links the application, emits
  // recruitment.application.converted_to_employee and writes the audit.
  // Creation still goes through the same /employees pipeline.
  const [sourceApplicationId, setSourceApplicationId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBranchId && !form.branchId) {
      setForm((f) => ({ ...f, branchId: String(selectedBranchId) }));
    }
    if (selectedCompanyIds.length === 1 && !form.companyId) {
      setForm((f) => ({ ...f, companyId: String(selectedCompanyIds[0]) }));
    }
  }, [selectedBranchId, selectedCompanyIds]);

  // One-time prefill when arriving from "إنشاء موظف من الطلب" on a hired
  // applicant. A job application only carries name/email/phone — the
  // legally required fields (national id, nationality, department,
  // salary, contract) are completed here by HR. This is the recruitment
  // → employee bridge that the pipeline previously lacked (audit C5).
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const name = qp.get("name");
    const email = qp.get("email");
    const phone = qp.get("phone");
    const appId = qp.get("sourceApplicationId");
    if (appId) setSourceApplicationId(appId);
    if (name || email || phone) {
      setForm((f) => ({
        ...f,
        name: name || f.name,
        email: email || f.email,
        phone: phone || f.phone,
      }));
    }
  }, []);

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
      // PR-1 (#2077) — institutional mandatoriness. The backend has a
      // bootstrap carve-out for the first employee in a company; the
      // UI doesn't, because once the company has any employees, every
      // new hire must be bound to the institutional matrix.
      managerId: form.managerId ? null : "يرجى اختيار المدير المباشر",
      positionId: form.positionId ? null : "يرجى اختيار المنصب الإداري",
      categoryKey: form.categoryKey ? null : "يرجى اختيار فئة الموظف",
      teamId: form.teamId ? null : "يرجى اختيار الفريق",
      projectId: form.projectId ? null : "يرجى اختيار المشروع",
      costCenterId: form.costCenterId ? null : "يرجى اختيار مركز التكلفة",
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
        jobTitleId: form.jobTitleId ? Number(form.jobTitleId) : undefined,
        // Integrated HR — three email roles + finance hooks.
        internalEmail: form.internalEmail || undefined,
        personalEmail: form.personalEmail || undefined,
        createCustodyAccount: Boolean(form.createCustodyAccount),
        vehicleId: form.vehicleId ? Number(form.vehicleId) : undefined,
        pbxExtensionId: form.pbxExtensionId ? Number(form.pbxExtensionId) : undefined,
        pbxExtensionNew: form.pbxExtensionNew || undefined,
        // PR-1 (#2077) — institutional binding payload. Backend
        // validates each id belongs to the company and inserts the
        // bridge rows inside the create transaction.
        positionId: form.positionId ? Number(form.positionId) : undefined,
        categoryKey: form.categoryKey || undefined,
        teamId: form.teamId ? Number(form.teamId) : undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        costCenterId: form.costCenterId ? Number(form.costCenterId) : undefined,
        committeeId: form.committeeId ? Number(form.committeeId) : undefined,
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(sourceApplicationId ? { sourceApplicationId: Number(sourceApplicationId) } : {}),
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
              name: "", phone: "", email: "", jobTitle: "", jobTitleId: "", role: "employee", salary: "",
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
              internalEmail: "", personalEmail: "",
              createCustodyAccount: false,
              vehicleId: "",
              emailDomain: "", emailLocalPart: "",
              pbxExtensionId: "", pbxExtensionNew: "",
              // PR-1 (#2077) — institutional binding reset.
              positionId: "", categoryKey: "",
              teamId: "", projectId: "", costCenterId: "",
              committeeId: "",
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
      {sourceApplicationId && (
        <div className="mb-4 flex items-center gap-2 bg-status-info-surface border border-status-info-surface rounded-lg px-4 py-2 text-sm text-status-info-foreground">
          <Briefcase className="h-4 w-4 shrink-0" />
          <span>يتم إنشاء هذا الموظف من طلب التوظيف رقم #{sourceApplicationId} — أكمل البيانات المطلوبة ثم احفظ.</span>
        </div>
      )}
      {/* IGOC-003 — wizard step nav. Sticky overlay; doesn't change the
          underlying form structure (the server-side transaction stays
          atomic). Clicks scroll to the section; scroll auto-highlights. */}
      <WizardStepNav form={form as unknown as Record<string, string>} fieldErrors={fieldErrors} />
      <div className="mb-4">
        <CreationDateField />
      </div>
      <div id="wizard-step-personal" className="grid grid-cols-1 md:grid-cols-2 gap-4 scroll-mt-24">
        <TextField label="الاسم الرباعي" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} error={fieldErrors.name} className="md:col-span-2" />
        <TextField label="رقم الهوية / الإقامة" required dir="ltr" value={form.nationalId} onChange={(v) => setForm((f) => ({ ...f, nationalId: v }))} placeholder="مثال: 1234567890" error={fieldErrors.nationalId} />
        <FormFieldWrapper label="الجنسية" required error={fieldErrors.nationality}>
          <Select value={form.nationality} onValueChange={(v) => setForm((f) => ({ ...f, nationality: v }))}>
            <SelectTrigger className={fieldErrorClass(fieldErrors.nationality)}>
              <SelectValue placeholder="اختر الجنسية" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {NATIONALITIES.map((n) => (
                <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
              ))}
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
          <Select
            value={form.jobTitle || "_none"}
            onValueChange={(v) => {
              if (v === "_none") {
                setForm((f) => ({ ...f, jobTitle: "", jobTitleId: "" }));
                return;
              }
              // Migration 248 — job_titles carries defaultRoleKey +
              // opensCustody. When the operator picks a title, we
              // auto-suggest the role and the custody-open flag so the
              // form below reflects the policy without manual entry.
              const picked = jobTitles.find((jt: any) => jt.name === v);
              setForm((f) => ({
                ...f,
                jobTitle: v,
                jobTitleId: picked ? String(picked.id) : "",
                role: picked?.defaultRoleKey || f.role,
                createCustodyAccount: Boolean(picked?.opensCustody) || f.createCustodyAccount,
              }));
            }}
          >
            <SelectTrigger className={fieldErrorClass(fieldErrors.jobTitle)}>
              <SelectValue placeholder="اختر المسمى الوظيفي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر المسمى الوظيفي</SelectItem>
              {jobTitles.map((jt: { id: number; name: string; defaultRoleKey?: string | null; opensCustody?: boolean }) => (
                <SelectItem key={jt.id} value={jt.name}>
                  {jt.name}{jt.defaultRoleKey ? ` — ${jt.defaultRoleKey}` : ""}{jt.opensCustody ? " · 💰" : ""}
                </SelectItem>
              ))}
              {jobTitles.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  لا توجد مسميات وظيفية معرَّفة. ستظهر هنا بعد إضافة أول موظف بمسمى جديد.
                </div>
              )}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="القسم" error={fieldErrors.department}>
          <Select value={form.department || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, department: v === "_none" ? "" : v }))}>
            <SelectTrigger className={fieldErrorClass(fieldErrors.department)}>
              <SelectValue placeholder={isLoading ? "جاري التحميل..." : "اختر القسم"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">اختر القسم</SelectItem>
              {departments.map((d: { id: number; name: string }) => (
                <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
              ))}
              {!isLoading && departments.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  لا توجد أقسام مُعرَّفة. أضف الأقسام من <a href="/settings/departments" className="text-status-info-foreground hover:underline">الإعدادات ← الأقسام</a> أولاً.
                </div>
              )}
              {isError && (
                <div className="px-3 py-2 text-xs text-status-error-foreground">
                  تعذر تحميل قائمة الأقسام
                </div>
              )}
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
        <div id="wizard-step-job" className="md:col-span-2 scroll-mt-24" />
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

        {/* PR-1 (#2077) — institutional binding. Five mandatory bindings
            + 1 optional. The wizard step indicator (above) tracks
            completion via WIZARD_STEPS[institutional].isComplete. */}
        <div id="wizard-step-institutional" className="md:col-span-2 border-t pt-4 mt-2 scroll-mt-24">
          <h3 className="text-sm font-semibold text-status-info-foreground mb-1 flex items-center gap-2">
            <Network className="w-4 h-4" />
            الربط المؤسسي
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            هذه الحقول تربط الموظف بهيكل المؤسسة (المنصب الإداري، فريق العمل، المشروع، مركز التكلفة، فئة القوى العاملة).
            بدونها لا تظهر تقاريرك مكتملة ولا تتفعّل سياسة الحضور بالفئة.
          </p>
        </div>
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
            allowCreate={false}
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="الفريق" required error={fieldErrors.teamId}>
          <TeamSelect
            value={form.teamId}
            onChange={(v) => setForm((f) => ({ ...f, teamId: v }))}
            error={fieldErrors.teamId}
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="المشروع" required error={fieldErrors.projectId}>
          <ProjectSelect
            value={form.projectId}
            onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
            error={fieldErrors.projectId}
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="مركز التكلفة" required error={fieldErrors.costCenterId}>
          <CostCenterMasterSelect
            value={form.costCenterId}
            onChange={(v) => setForm((f) => ({ ...f, costCenterId: v }))}
            error={fieldErrors.costCenterId}
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="اللجنة (اختياري)" error={fieldErrors.committeeId}>
          <CommitteeSelect
            value={form.committeeId}
            onChange={(v) => setForm((f) => ({ ...f, committeeId: v }))}
            error={fieldErrors.committeeId}
          />
        </FormFieldWrapper>

        {/* Integrated HR — accounts + finance binding section. */}
        <div id="wizard-step-accounts" className="md:col-span-2 border-t pt-4 mt-2 scroll-mt-24">
          <h3 className="text-sm font-semibold text-muted-foreground mb-1">حسابات الموظف والربط المالي</h3>
          <p className="text-xs text-muted-foreground mb-3">
            أدخل بريد المستخدم الداخلي لتسجيل الدخول. البريد الشخصي للتواصل فقط ولا يُستخدم لتسجيل الدخول.
            ستُفتح عهدة تلقائياً عند تفعيل الخيار أو عند اختيار مسمى وظيفي يفتح عهدة (مثل سائق أو مندوب مبيعات).
          </p>
        </div>
        {/* Internal email — real integration: when mailbox domains are
            connected, offer a local-part input + domain dropdown that
            composes the address. Falls back to free text otherwise. */}
        {hasConnectedDomains ? (
          <FormFieldWrapper label="البريد الإلكتروني للمستخدم الداخلي (للدخول)">
            <div className="flex items-center gap-1" dir="ltr">
              <Input
                className={`flex-1 ${fieldErrorClass(fieldErrors.internalEmail)}`}
                placeholder="ahmed.ali"
                value={form.emailLocalPart}
                onChange={(e) => setForm((f) => ({ ...f, emailLocalPart: e.target.value.trim() }))}
              />
              <span className="text-muted-foreground">@</span>
              <Select
                value={form.emailDomain || (emailDomains[0] ?? "")}
                onValueChange={(v) => setForm((f) => ({ ...f, emailDomain: v }))}
              >
                <SelectTrigger className="w-44"><SelectValue placeholder="اختر النطاق" /></SelectTrigger>
                <SelectContent>
                  {emailDomains.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.internalEmail && (
              <p className="text-xs text-muted-foreground mt-1" dir="ltr">{form.internalEmail}</p>
            )}
            {fieldErrors.internalEmail && (
              <p className="text-xs text-status-error-foreground mt-1">{fieldErrors.internalEmail}</p>
            )}
          </FormFieldWrapper>
        ) : (
          <TextField
            label="البريد الإلكتروني للمستخدم الداخلي (للدخول)"
            type="email" dir="ltr"
            value={form.internalEmail}
            onChange={(v) => setForm((f) => ({ ...f, internalEmail: v }))}
            error={fieldErrors.internalEmail}
          />
        )}
        <TextField
          label="البريد الإلكتروني الشخصي (تواصل)"
          type="email" dir="ltr"
          value={form.personalEmail}
          onChange={(v) => setForm((f) => ({ ...f, personalEmail: v }))}
          error={fieldErrors.personalEmail}
        />
        {/* PBX extension — only shown when a PBX integration is connected
            or extensions exist. Pick an unassigned one or mint the next. */}
        {(pbxConnected || availableExtensions.length > 0) && (
          <FormFieldWrapper label="تحويلة السنترال (PBX)">
            <Select
              value={form.pbxExtensionId ? String(form.pbxExtensionId) : (form.pbxExtensionNew ? "_new" : "_none")}
              onValueChange={(v) => {
                if (v === "_none") setForm((f) => ({ ...f, pbxExtensionId: "", pbxExtensionNew: "" }));
                else if (v === "_new") setForm((f) => ({ ...f, pbxExtensionId: "", pbxExtensionNew: nextExtension }));
                else setForm((f) => ({ ...f, pbxExtensionId: v, pbxExtensionNew: "" }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="اختر تحويلة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— بدون تحويلة —</SelectItem>
                {availableExtensions.map((ext) => (
                  <SelectItem key={ext.id} value={String(ext.id)}>
                    {ext.extension}{ext.name ? ` — ${ext.name}` : ""}
                  </SelectItem>
                ))}
                {nextExtension && (
                  <SelectItem value="_new">+ إنشاء تحويلة جديدة ({nextExtension})</SelectItem>
                )}
              </SelectContent>
            </Select>
            {form.pbxExtensionNew && (
              <p className="text-xs text-muted-foreground mt-1">سيتم إنشاء التحويلة {form.pbxExtensionNew} وربطها بالموظف</p>
            )}
          </FormFieldWrapper>
        )}
        <FormFieldWrapper label="فتح حساب عهدة تلقائياً (حساب فرعي تحت 1400 - العهد)">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.createCustodyAccount)}
              onChange={(e) => setForm((f) => ({ ...f, createCustodyAccount: e.target.checked }))}
              data-testid="check-create-custody"
            />
            <span>نعم — افتح حساب فرعي لعهد هذا الموظف</span>
          </label>
        </FormFieldWrapper>
        {(form.role === "driver" || form.role === "fleet_driver") && (
          <FormFieldWrapper label="المركبة المرتبطة (للسائقين)">
            <Select
              value={form.vehicleId ? String(form.vehicleId) : "_none"}
              onValueChange={(v) => setForm((f) => ({ ...f, vehicleId: v === "_none" ? "" : v }))}
            >
              <SelectTrigger><SelectValue placeholder="اختر مركبة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— بدون ربط الآن —</SelectItem>
                {vehicles.map((v: { id: number; plateNumber?: string; brand?: string }) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.plateNumber || `#${v.id}`}{v.brand ? ` — ${v.brand}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>
        )}

        <div id="wizard-step-attachments" className="md:col-span-2 border-t pt-4 mt-2 scroll-mt-24">
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
