import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { useApiQuery, useApiMutation, asList, apiFetch, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Phase A.1 — employee detail page on PageShell with a friendly
// not-found state. Replaces the bare "الموظف غير موجود" text
// (regression the programmer reported on /employees/734) with a
// proper error card that links back to the list and the hub.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Link } from "wouter";
import {
  User, Phone, Mail, Briefcase, Calendar, Building, CreditCard,
  ListTodo, Clock, BookOpen, DollarSign, AlertTriangle, Printer,
  ArrowLeft, Home,
  FileText, TrendingUp, Award, History, Activity, CheckCircle2,
  XCircle, AlertCircle, ChevronDown, ChevronUp, Pencil, Check, X
} from "lucide-react";
import { ROLES } from "@/lib/constants";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

const TABS = [
  { key: "overview", label: "نظرة عامة", icon: Activity },
  { key: "info", label: "المعلومات", icon: User },
  { key: "attendance", label: "الحضور", icon: Clock },
  { key: "leaves", label: "الإجازات", icon: Calendar },
  { key: "payroll", label: "الرواتب", icon: DollarSign },
  { key: "violations", label: "المخالفات", icon: AlertTriangle },
  { key: "finance", label: "المالية", icon: BookOpen },
  { key: "tasks", label: "المهام", icon: ListTodo },
  { key: "trainings", label: "التدريب", icon: TrendingUp },
  { key: "documents", label: "المستندات", icon: FileText },
  { key: "timeline", label: "السجل الزمني", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type OperationalStatus = {
  status: string;
  label: string;
  color: string;
  reason: string;
};

function OperationalStatusBar({ employeeId }: { employeeId: string }) {
  const [opStatus, setOpStatus] = useState<OperationalStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    apiFetch<OperationalStatus>(`/hr/employee-status/${employeeId}`)
      .then(setOpStatus)
      .catch(() => setOpStatus({ status: "working", label: "على رأس العمل", color: "bg-green-100 text-green-700", reason: "" }))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) return <Skeleton className="h-8 w-48" />;
  if (!opStatus) return null;

  const statusIcons: Record<string, any> = {
    working: CheckCircle2,
    on_leave: Calendar,
    late: AlertCircle,
    absent: XCircle,
    suspended: AlertTriangle,
    under_action: AlertTriangle,
    terminated: XCircle,
  };
  const Icon = statusIcons[opStatus.status] || CheckCircle2;

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border", opStatus.color)}>
      <Icon className="h-4 w-4" />
      <span>{opStatus.label}</span>
      {opStatus.reason && <span className="text-xs opacity-70">— {opStatus.reason}</span>}
    </div>
  );
}

function QuickSummaryCard({ employee, serviceDays }: { employee: any; serviceDays: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
      <div className="bg-blue-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-blue-700">{serviceDays}</p>
        <p className="text-xs text-gray-500 mt-1">أيام الخدمة</p>
      </div>
      <div className="bg-green-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-green-700">{formatCurrency(Number(employee.salary) || 0)}</p>
        <p className="text-xs text-gray-500 mt-1">الراتب الأساسي</p>
      </div>
      <div className="bg-purple-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-purple-700">{employee.departmentName || "—"}</p>
        <p className="text-xs text-gray-500 mt-1">القسم</p>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 text-center">
        <p className="text-2xl font-bold text-orange-700">{employee.jobTitle || "—"}</p>
        <p className="text-xs text-gray-500 mt-1">المسمى الوظيفي</p>
      </div>
    </div>
  );
}

function AttendanceSummary({ attendance }: { attendance: any[] }) {
  const presentDays = attendance.filter(a => a.status === "present" || a.status === "present_off_day" || a.status === "present_out_of_range").length;
  const lateDays = attendance.filter(a => a.lateMinutes > 0).length;
  const absentDays = attendance.filter(a => a.status === "absent").length;
  const totalLateMin = attendance.reduce((s, a) => s + (a.lateMinutes || 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div className="text-center p-3 bg-green-50 rounded-lg">
        <p className="text-xl font-bold text-green-600">{presentDays}</p>
        <p className="text-xs text-gray-500">أيام حضور</p>
      </div>
      <div className="text-center p-3 bg-yellow-50 rounded-lg">
        <p className="text-xl font-bold text-yellow-600">{lateDays}</p>
        <p className="text-xs text-gray-500">أيام تأخر</p>
      </div>
      <div className="text-center p-3 bg-red-50 rounded-lg">
        <p className="text-xl font-bold text-red-600">{absentDays}</p>
        <p className="text-xs text-gray-500">أيام غياب</p>
      </div>
      <div className="text-center p-3 bg-orange-50 rounded-lg">
        <p className="text-xl font-bold text-orange-600">{totalLateMin}</p>
        <p className="text-xs text-gray-500">دقائق تأخر</p>
      </div>
    </div>
  );
}

function LeaveBalanceSummary({ employeeId }: { employeeId: string }) {
  const { data } = useApiQuery<any>(["leave-balance-emp", employeeId], `/hr/leave-balance`, !!employeeId);
  const balances = data?.data || [];

  if (balances.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
      {balances.slice(0, 6).map((b: any) => (
        <div key={b.leaveTypeId} className="border rounded-lg p-3 bg-gray-50">
          <p className="text-xs text-gray-500">{b.name || b.leaveTypeName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-green-600">{b.remaining ?? 0}</span>
            <span className="text-xs text-gray-400">/ {b.maxDays || b.entitled || 0} يوم</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className="bg-green-500 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, ((b.remaining ?? 0) / (b.maxDays || b.entitled || 1)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ViolationTimeline({ violations }: { violations: any[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const escalationCount = violations.length;
  const escalationLevel = Math.min(escalationCount, 5);

  return (
    <div>
      {escalationCount > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-sm font-medium text-orange-700 mb-2">مستوى التصعيد التأديبي</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <div key={lvl} className="flex items-center gap-0">
                <div className={cn(
                  "w-4 h-4 rounded-full border-2",
                  lvl <= escalationLevel ? "border-orange-500 bg-orange-400" : "border-gray-300 bg-white"
                )} />
                {lvl < 5 && <div className={cn("w-6 h-0.5", lvl < escalationLevel ? "bg-orange-300" : "bg-gray-200")} />}
              </div>
            ))}
            <span className="text-xs text-gray-500 ms-2">المستوى {escalationLevel}/5</span>
          </div>
          {escalationLevel >= 3 && (
            <p className="text-xs text-red-600 mt-1 font-medium">تحذير: الموظف غير مؤهل للترقية حالياً بسبب المخالفات</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {violations.map((v: any) => (
          <div key={v.id} className="border rounded-lg overflow-hidden">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(expanded === v.id ? null : v.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{v.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px]">{violationTypeLabel(v.type)}</Badge>
                  <span className="text-xs text-muted-foreground">{v.period}</span>
                  {v.createdAt && <span className="text-xs text-muted-foreground">{formatDateAr(v.createdAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ms-2">
                <SeverityBadge severity={v.severity} />
                {Number(v.deduction) > 0 && (
                  <span className="text-sm font-bold text-red-600">-{formatCurrency(Number(v.deduction))}</span>
                )}
                {expanded === v.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
            </div>
            {expanded === v.id && (
              <div className="px-3 pb-3 text-xs text-gray-500 bg-gray-50 border-t">
                <p>الشدة: {severityLabel(v.severity)} | النوع: {violationTypeLabel(v.type)} | الفترة: {v.period}</p>
                {v.deduction > 0 && <p className="text-red-600 font-medium">الخصم: {formatCurrency(Number(v.deduction))}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmployeeDetail({ id: propId }: { id?: string }) {
  const [, params] = useRoute("/employees/:id");
  const id = propId || params?.id || "";
  const { data: employee, isLoading, isError, error } = useApiQuery<any>(["employee", id], `/employees/${id}`, !!id);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printHtml, setPrintHtml] = useState("");
  const [printTitle, setPrintTitle] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const branch = useBranchLetterhead(user?.branchId);
  const { data: templatesResp } = useApiQuery<any>(["doc-templates"], "/documents/templates");
  const [govEditing, setGovEditing] = useState(false);
  const [govForm, setGovForm] = useState<Record<string, string>>({});

  const govStartEdit = () => {
    setGovForm({
      borderNumber: employee?.borderNumber || "",
      visaNumber: employee?.visaNumber || "",
      visaType: employee?.visaType || "",
      visaExpiry: employee?.visaExpiry ? employee.visaExpiry.split("T")[0] : "",
      sponsorNumber: employee?.sponsorNumber || "",
      workPermitNumber: employee?.workPermitNumber || "",
      workPermitExpiry: employee?.workPermitExpiry ? employee.workPermitExpiry.split("T")[0] : "",
      iqamaStatus: employee?.iqamaStatus || "active",
    });
    setGovEditing(true);
  };

  const govSaveMut = useApiMutation<any, Record<string, string>>(
    `/employees/${id}`,
    "PATCH",
    [["employee", String(id)]],
    {
      successMessage: "تم تحديث البيانات الحكومية",
      onSuccess: () => setGovEditing(false),
    }
  );
  const govSaveEdit = () => {
    govSaveMut.mutate(govForm);
  };
  const hrTemplates = asList<any>(templatesResp).filter((t: any) => t.category === "hr" && t.isActive !== false);

  const handlePrintTemplate = async (template: any) => {
    setShowPrintMenu(false);
    try {
      const result = await apiFetch<any>(`/documents/templates/${template.id}/generate`, {
        method: "POST",
        body: JSON.stringify({ entityType: "employee", entityId: id }),
      });
      setPrintHtml(result.html || "");
      setPrintTitle(template.name);
      setPrintPreviewOpen(true);
    } catch {
      setPrintHtml("");
      setPrintTitle("خطأ");
      setPrintPreviewOpen(true);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError || !employee) return <ErrorState />;

  const tasks: any[] = employee.tasks || [];
  const attendance: any[] = employee.attendance || [];
  const leaves: any[] = employee.leaves || [];
  const trainings: any[] = employee.trainings || [];
  const payroll: any[] = employee.payroll || [];
  const violations: any[] = employee.violations || [];
  const loans: any[] = employee.loans || [];
  const overtime: any[] = employee.overtime || [];

  const hireDate = employee.hireDate ? new Date(employee.hireDate) : null;
  const serviceDays = hireDate ? Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const pendingTasks = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length;

  return (
    <PageShell
      title={employee.name}
      subtitle={`${employee.empNumber || "—"} · ${employee.jobTitle || "—"} · ${employee.branchName || "—"}`}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/employees", label: "الموظفون" },
      ]}
      resetKey={id}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <OperationalStatusBar employeeId={id} />
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowPrintMenu(!showPrintMenu)}>
              <Printer className="h-4 w-4 me-1" />طباعة
            </Button>
            {showPrintMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPrintMenu(false)} />
                <div className="absolute start-0 top-full mt-1 z-50 bg-white border rounded-lg shadow-lg min-w-[200px] py-1">
                  {hrTemplates.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">لا توجد قوالب</p>
                  ) : (
                    hrTemplates.map((t: any) => (
                      <button
                        key={t.id}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => handlePrintTemplate(t)}
                      >
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const count = tab.key === "tasks" ? tasks.length
            : tab.key === "leaves" ? leaves.length
            : tab.key === "payroll" ? payroll.length
            : tab.key === "violations" ? violations.length
            : tab.key === "attendance" ? attendance.length : 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && tab.key !== "overview" && tab.key !== "info" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">{count}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <QuickSummaryCard employee={employee} serviceDays={serviceDays} />

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1 font-medium">الحضور (آخر 30 يوم)</p>
                <AttendanceSummary attendance={attendance} />
                <Button variant="ghost" size="sm" className="text-xs w-full mt-1" onClick={() => setActiveTab("attendance")}>
                  عرض التفاصيل →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">أرصدة الإجازات</p>
                <LeaveBalanceSummary employeeId={id} />
                <Button variant="ghost" size="sm" className="text-xs w-full mt-1" onClick={() => setActiveTab("leaves")}>
                  عرض الطلبات →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium">المهام والأداء</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">إجمالي المهام</span>
                    <span className="font-bold">{tasks.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">المهام المعلقة</span>
                    <span className="font-bold text-orange-600">{pendingTasks}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">المخالفات</span>
                    <span className={cn("font-bold", violations.length > 0 ? "text-red-600" : "text-green-600")}>
                      {violations.length}
                    </span>
                  </div>
                  {violations.length >= 3 && (
                    <div className="text-xs text-red-600 bg-red-50 rounded p-2 mt-2">
                      تحذير: الموظف غير مؤهل للترقية بسبب مخالفات متراكمة
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-xs w-full mt-3" onClick={() => setActiveTab("tasks")}>
                  عرض المهام →
                </Button>
              </CardContent>
            </Card>
          </div>

          {payroll.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium">آخر سجل راتب</p>
                {(() => {
                  const latest = payroll[0];
                  return (
                    <div className="flex items-center gap-6 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-400">الفترة</p>
                        <p className="font-mono font-bold">{latest.period}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">الأساسي</p>
                        <p className="font-bold">{formatCurrency(Number(latest.basic || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">الإجمالي</p>
                        <p className="font-bold">{formatCurrency(Number(latest.grossSalary || 0))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">الصافي</p>
                        <p className="font-bold text-green-700">{formatCurrency(Number(latest.netSalary || 0))}</p>
                      </div>
                      <PageStatusBadge status={latest.status} />
                    </div>
                  );
                })()}
                <Button variant="ghost" size="sm" className="text-xs w-full mt-3" onClick={() => setActiveTab("payroll")}>
                  عرض كل الرواتب →
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "info" && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                المعلومات الأساسية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="الاسم" value={employee.name} />
              <InfoRow label="الرقم الوظيفي" value={employee.empNumber || "-"} mono />
              <InfoRow label="الجنسية" value={employee.nationality || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Phone className="h-4 w-4" /> الجوال</span>} value={employee.phone || "-"} dir="ltr" />
              <InfoRow label={<span className="flex items-center gap-2"><Mail className="h-4 w-4" /> البريد</span>} value={employee.email || "-"} last />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                معلومات العمل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow label="المسمى الوظيفي" value={employee.jobTitle} bold />
              <InfoRow label="القسم" value={employee.departmentName || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Building className="h-4 w-4" /> الفرع</span>} value={employee.branchName || "-"} />
              <InfoRow label="المدير المباشر" value={employee.managerName || "-"} />
              <InfoRow label={<span className="flex items-center gap-2"><Calendar className="h-4 w-4" /> تاريخ التعيين</span>} value={employee.hireDate ? formatDateAr(employee.hireDate) : "-"} />
              <InfoRow label="مدة الخدمة" value={`${serviceDays} يوم`} />
              <InfoRow label={<span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> الراتب الأساسي</span>} value={formatCurrency(Number(employee.salary) || 0)} bold last />
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                بيانات الإقامة والتأشيرة — الربط الحكومي (مقيم)
              </CardTitle>
              {!govEditing && (
                <Button variant="ghost" size="sm" onClick={govStartEdit}>
                  <Pencil className="h-4 w-4 me-1" />تعديل
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {govEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم الحدود</p>
                      <Input value={govForm.borderNumber} onChange={e => setGovForm(f => ({ ...f, borderNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم التأشيرة</p>
                      <Input value={govForm.visaNumber} onChange={e => setGovForm(f => ({ ...f, visaNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">نوع التأشيرة</p>
                      <Select value={govForm.visaType || "_none"} onValueChange={(v) => setGovForm(f => ({ ...f, visaType: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          <SelectItem value="work">عمل</SelectItem>
                          <SelectItem value="visit">زيارة</SelectItem>
                          <SelectItem value="transit">مرور</SelectItem>
                          <SelectItem value="hajj">حج</SelectItem>
                          <SelectItem value="umrah">عمرة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">انتهاء التأشيرة</p>
                      <Input type="date" value={govForm.visaExpiry} onChange={e => setGovForm(f => ({ ...f, visaExpiry: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم الكفيل / المنشأة</p>
                      <Input value={govForm.sponsorNumber} onChange={e => setGovForm(f => ({ ...f, sponsorNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">رقم رخصة العمل</p>
                      <Input value={govForm.workPermitNumber} onChange={e => setGovForm(f => ({ ...f, workPermitNumber: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">انتهاء رخصة العمل</p>
                      <Input type="date" value={govForm.workPermitExpiry} onChange={e => setGovForm(f => ({ ...f, workPermitExpiry: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">حالة الإقامة</p>
                      <Select value={govForm.iqamaStatus} onValueChange={(v) => setGovForm(f => ({ ...f, iqamaStatus: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">سارية</SelectItem>
                          <SelectItem value="expired">منتهية</SelectItem>
                          <SelectItem value="renewal_pending">قيد التجديد</SelectItem>
                          <SelectItem value="cancelled">ملغاة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" onClick={govSaveEdit}>
                      <Check className="h-4 w-4 me-1" />حفظ
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setGovEditing(false)}>
                      <X className="h-4 w-4 me-1" />إلغاء
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الإقامة</p><p className="font-mono text-sm">{employee.iqamaNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء الإقامة</p><p className="text-sm">{employee.iqamaExpiry ? formatDateAr(employee.iqamaExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">حالة الإقامة</p><p className="text-sm">{employee.iqamaStatus === "active" ? "سارية" : employee.iqamaStatus === "expired" ? "منتهية" : employee.iqamaStatus === "renewal_pending" ? "قيد التجديد" : employee.iqamaStatus || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الجواز</p><p className="font-mono text-sm">{employee.passportNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء الجواز</p><p className="text-sm">{employee.passportExpiry ? formatDateAr(employee.passportExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الحدود</p><p className="font-mono text-sm">{employee.borderNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم التأشيرة</p><p className="font-mono text-sm">{employee.visaNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">نوع التأشيرة</p><p className="text-sm">{employee.visaType || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء التأشيرة</p><p className="text-sm">{employee.visaExpiry ? formatDateAr(employee.visaExpiry) : "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم الكفيل / المنشأة</p><p className="font-mono text-sm">{employee.sponsorNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">رقم رخصة العمل</p><p className="font-mono text-sm">{employee.workPermitNumber || "-"}</p></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">انتهاء رخصة العمل</p><p className="text-sm">{employee.workPermitExpiry ? formatDateAr(employee.workPermitExpiry) : "-"}</p></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "attendance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الحضور والانصراف (آخر 30 يوم)</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceSummary attendance={attendance} />
            {attendance.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد سجل حضور</p>
            ) : (
              <div className="space-y-2">
                {attendance.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{formatDateAr(a.date)}</span>
                      <PageStatusBadge status={a.status} domain="attendance" />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>دخول: {a.checkIn ? new Date(a.checkIn).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                      <span>خروج: {a.checkOut ? new Date(a.checkOut).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                      {a.lateMinutes > 0 && (
                        <Badge variant="destructive" className="text-[10px]">تأخر {a.lateMinutes} د</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "leaves" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">أرصدة الإجازات</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaveBalanceSummary employeeId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">طلبات الإجازات ({leaves.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا توجد طلبات إجازة</p>
              ) : (
                <div className="space-y-3">
                  {leaves.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                      <div>
                        <p className="font-medium">{l.leaveTypeName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateAr(l.startDate)} — {formatDateAr(l.endDate)} ({l.days} أيام)
                        </p>
                        {l.reason && <p className="text-xs text-muted-foreground mt-1">{l.reason}</p>}
                      </div>
                      <PageStatusBadge status={l.status} domain="leave" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "payroll" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              سجل الرواتب ({payroll.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payroll.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا يوجد سجل رواتب</p>
            ) : (
              <div className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-start">الفترة</th>
                      <th className="p-3 text-start">الأساسي</th>
                      <th className="p-3 text-start">الإجمالي</th>
                      <th className="p-3 text-start">التأمينات</th>
                      <th className="p-3 text-start">خصم التأخر</th>
                      <th className="p-3 text-start">الصافي</th>
                      <th className="p-3 text-start">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-mono">{p.period}</td>
                        <td className="p-3">{formatCurrency(Number(p.basic || 0))}</td>
                        <td className="p-3">{formatCurrency(Number(p.grossSalary || 0))}</td>
                        <td className="p-3 text-orange-600">{formatCurrency(Number(p.gosi || 0))}</td>
                        <td className="p-3 text-red-600">{formatCurrency(Number(p.lateDeduction || 0))}</td>
                        <td className="p-3 font-bold text-green-700">{formatCurrency(Number(p.netSalary || 0))}</td>
                        <td className="p-3"><PageStatusBadge status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "violations" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              المخالفات والإجراءات التأديبية ({violations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {violations.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد مخالفات</p>
            ) : (
              <ViolationTimeline violations={violations} />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">المهام المسندة ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد مهام مسندة</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.title}</p>
                      {t.projectName && <p className="text-xs text-muted-foreground">{t.projectName}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={t.status} />
                      <PriorityBadge priority={t.priority} />
                      {t.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          {formatDateAr(t.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "trainings" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الدورات التدريبية ({trainings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {trainings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">لا توجد دورات تدريبية</p>
            ) : (
              <div className="space-y-3">
                {trainings.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50">
                    <div>
                      <p className="font-medium">{t.courseTitle}</p>
                      <p className="text-xs text-muted-foreground">{t.courseType || "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PageStatusBadge status={t.status} />
                      {t.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDateAr(t.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "finance" && (
        <div className="space-y-4">
          {/* سلف الموظف */}
          {loans.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-600" />
                  سلف الموظف ({loans.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-right px-4 py-2 font-medium text-gray-600">رقم السلفة</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">النوع</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">المبلغ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">المتبقي</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((ln: any) => {
                      const loanTypes: Record<string, string> = { salary_advance: "سلفة راتب", personal: "شخصية", emergency: "طارئة" };
                      return (
                        <tr key={ln.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-mono text-xs text-blue-700">{ln.loanNumber}</td>
                          <td className="px-4 py-2">{loanTypes[ln.loanType] || ln.loanType}</td>
                          <td className="px-4 py-2 font-semibold">{formatCurrency(Number(ln.amount))}</td>
                          <td className="px-4 py-2 text-red-600">{formatCurrency(Number(ln.remainingAmount || 0))}</td>
                          <td className="px-4 py-2">
                            <PageStatusBadge status={ln.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* وقت إضافي */}
          {overtime.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-cyan-600" />
                  الوقت الإضافي ({overtime.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-right px-4 py-2 font-medium text-gray-600">رقم الطلب</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">التاريخ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">الساعات</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">المبلغ</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overtime.map((ot: any) => (
                        <tr key={ot.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-mono text-xs text-purple-700">{ot.requestNumber}</td>
                          <td className="px-4 py-2 text-gray-600">{ot.overtimeDate ? new Date(ot.overtimeDate).toLocaleDateString("ar-SA") : "—"}</td>
                          <td className="px-4 py-2">{Number(ot.hours).toFixed(1)} ساعة</td>
                          <td className="px-4 py-2 font-semibold text-green-700">{formatCurrency(Number(ot.totalAmount || 0))}</td>
                          <td className="px-4 py-2">
                            <PageStatusBadge status={ot.status} />
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* الملف المالي العام */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                الملف المالي للموظف
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="employee" entityId={id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">دفتر الأستاذ المساعد</CardTitle></CardHeader>
            <CardContent>
              <FinancialTab entityType="employee" entityId={id} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "documents" && (
        <EntityDocuments entityType="employee" entityId={id} />
      )}

      {activeTab === "timeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              السجل الزمني الشامل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EntityTimeline entityType="employees" entityId={id} maxItems={50} />
            <EntityTimeline entityType="employee" entityId={id} />
          </CardContent>
        </Card>
      )}

      {printPreviewOpen && (
        <PrintPreviewModal
          open={printPreviewOpen}
          onClose={() => setPrintPreviewOpen(false)}
          branch={branch}
          documentTitle={printTitle}
          documentRef=""
          documentDate={formatDateAr(new Date())}
        >
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(printHtml) }} />
        </PrintPreviewModal>
      )}
    </PageShell>
  );
}

function InfoRow({ label, value, mono, dir, bold, last }: {
  label: React.ReactNode; value: string; mono?: boolean; dir?: string; bold?: boolean; last?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-3 py-2", !last && "border-b")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("col-span-2", mono && "font-mono", bold && "font-bold")} dir={dir}>{value}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800",
  };
  const labels: Record<string, string> = {
    critical: "حرج",
    high: "عالي",
    medium: "متوسط",
    low: "منخفض",
  };
  return (
    <Badge className={cn("text-[10px]", colors[priority] || "bg-gray-100 text-gray-800")}>
      {labels[priority] || priority}
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-blue-100 text-blue-800",
  };
  return (
    <Badge className={cn("text-[10px]", colors[severity] || "bg-gray-100 text-gray-800")}>
      {severityLabel(severity)}
    </Badge>
  );
}

function severityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: "حرج",
    high: "عالي",
    medium: "متوسط",
    low: "منخفض",
  };
  return labels[severity] || severity;
}

function violationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    late_arrival: "تأخر",
    gps_out_of_range: "خارج النطاق",
    absence: "غياب",
    early_leave: "انصراف مبكر",
    suspension: "إيقاف",
  };
  return labels[type] || type;
}
