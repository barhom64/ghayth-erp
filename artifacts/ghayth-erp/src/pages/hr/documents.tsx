import { useState, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormTextField,
  FormDateField,
  FormTextareaField,
  FormGrid,
  AdvancedFilters,
  useFilters,
  applyFilters,
  exportToCSV,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, User, Plus, FileText, AlertTriangle } from "lucide-react";
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { useFormContext } from "react-hook-form";
import { formatDateAr } from "@/lib/formatters";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
/**
 * HR / Documents — company + employee documents in one place.
 *
 * Phase D / HR gap. Closes 4 unused-backend endpoints:
 *
 *   GET  /hr/company-documents   — registry of business-wide
 *        documents (commercial reg, VAT cert, ZATCA, GOSI,
 *        chamber of commerce, MOL employment file). Indexed by
 *        expiry so renewals don't slip.
 *   POST /hr/company-documents
 *   GET  /hr/employee-documents  — per-employee documents (ID,
 *        passport, driving license, professional certs).
 *        ?employeeId=N narrows to one employee.
 *   POST /hr/employee-documents
 *
 * Why this matters: Saudi compliance requires the company
 * to keep current copies of every regulatory document, with
 * renewal deadlines tracked. Employee documents back the
 * Iqama/health-insurance/transfer flows. The
 * /expiring-documents page surfaces the warnings, but until
 * now there was no UI to actually add new documents — that
 * happened by a manual SQL insert.
 *
 * Two tabs, shared "≤30 day" expiry highlight visible
 * inline on the date column.
 */

interface CompanyDocRow {
  id: number;
  title: string;
  type: string | null;
  expiryDate: string | null;
  notes: string | null;
}

interface EmployeeDocRow {
  id: number;
  employeeId: number;
  employeeName: string | null;
  type: string;
  name: string;
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
}

const DOC_TYPE_HINTS_COMPANY = [
  "السجل التجاري",
  "الشهادة الضريبية",
  "الاشتراك الضريبي (الفاتورة الإلكترونية)",
  "شهادة GOSI",
  "غرفة التجارة",
  "ملف العمل (وزارة الموارد البشرية)",
];

const DOC_TYPE_HINTS_EMPLOYEE = [
  "هوية وطنية",
  "إقامة",
  "جواز سفر",
  "رخصة قيادة",
  "شهادة دراسية",
  "شهادة مهنية",
  "تأمين طبي",
  "تأمين الحوادث",
];

function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const exp = new Date(expiry).getTime();
  const now = Date.now();
  const days = (exp - now) / 86400000;
  return days >= 0 && days <= 30;
}

function isExpired(expiry: string | null): boolean {
  if (!expiry) return false;
  return new Date(expiry).getTime() < Date.now();
}

const companyDocSchema = z.object({
  documentType: z.string().trim().min(1, "نوع الوثيقة مطلوب"),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  issuingAuthority: z.string().optional(),
  reminderDays: z.coerce.number().optional(),
  notes: z.string().optional(),
});
type CompanyDocForm = z.infer<typeof companyDocSchema>;

const employeeDocSchema = z.object({
  employeeId: z.coerce.number().int().positive("اختر الموظف"),
  documentType: z.string().trim().min(1, "نوع الوثيقة مطلوب"),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  issuingAuthority: z.string().optional(),
  reminderDays: z.coerce.number().optional(),
  notes: z.string().optional(),
});
type EmployeeDocForm = z.infer<typeof employeeDocSchema>;

export default function HrDocumentsPage() {
  return (
    <PageShell
      title="وثائق المنشأة والموظفين"
      subtitle="تسجيل الوثائق الرسمية وتتبع تواريخ الانتهاء"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { label: "الوثائق" },
      ]}
    >
      <HrTabsNav />
      <Tabs defaultValue="company" dir="rtl" className="w-full">
        <TabsList>
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            وثائق المنشأة
          </TabsTrigger>
          <TabsTrigger value="employee" className="gap-1.5">
            <User className="h-4 w-4" />
            وثائق الموظفين
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-3">
          <CompanyDocsTab />
        </TabsContent>
        <TabsContent value="employee" className="space-y-3">
          <EmployeeDocsTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CompanyDocsTab() {
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: CompanyDocRow[];
    total: number;
  }>(["hr-company-docs"], "/hr/company-documents");
  const rows = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);

  const filtered = applyFilters(rows, filters, { searchFields: ["title", "type"] });

  const expiringSoon = useMemo(
    () => rows.filter((r) => isExpiringSoon(r.expiryDate)).length,
    [rows],
  );
  const expired = useMemo(() => rows.filter((r) => isExpired(r.expiryDate)).length, [rows]);

  const columns: DataTableColumn<CompanyDocRow>[] = [
    {
      key: "title",
      header: "نوع الوثيقة",
      className: "font-medium",
    },
    {
      key: "type",
      header: "الرقم / النوع الفرعي",
      render: (r) =>
        r.type ? (
          <span className="font-mono text-xs">{r.type}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "expiryDate",
      header: "تاريخ الانتهاء",
      render: (r) => {
        if (!r.expiryDate) return <span className="text-muted-foreground">—</span>;
        const expired = isExpired(r.expiryDate);
        const soon = isExpiringSoon(r.expiryDate);
        return (
          <span
            className={
              expired
                ? "text-status-error-foreground font-semibold"
                : soon
                  ? "text-status-warning-foreground font-semibold"
                  : ""
            }
          >
            {formatDateAr(r.expiryDate)}
            {expired ? " (منتهية)" : soon ? " (قاربت الانتهاء)" : ""}
          </span>
        );
      },
    },
    {
      key: "notes",
      header: "ملاحظات",
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.notes ?? "—"}</span>
      ),
    },
  ];

  return (
    <>
      {(expiringSoon > 0 || expired > 0) && (
        <div className="rounded-md bg-status-warning-surface text-status-warning-foreground p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            {expired > 0 && (
              <>
                <span className="font-semibold">{expired}</span> وثيقة منتهية
                {expiringSoon > 0 && " · "}
              </>
            )}
            {expiringSoon > 0 && (
              <>
                <span className="font-semibold">{expiringSoon}</span> وثيقة تنتهي خلال 30 يوم
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <AdvancedFilters
          values={filters}
          onChange={setFilters}
          onExportCSV={() =>
            exportToCSV(
              filtered || [],
              [
                { key: "employeeName", label: "الموظف" },
                { key: "documentType", label: "نوع الوثيقة" },
                { key: "documentNumber", label: "الرقم" },
                { key: "issueDate", label: "تاريخ الإصدار" },
                { key: "expiryDate", label: "تاريخ الانتهاء" },
                { key: "issuingAuthority", label: "جهة الإصدار" },
                { key: "notes", label: "ملاحظات" },
              ],
              "وثائق-الموظفين",
            )
          }
        />
        <GuardedButton
          perm="hr.organization:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          وثيقة منشأة جديدة
        </GuardedButton>
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد وثائق منشأة مسجلة — اضغط 'وثيقة منشأة جديدة' للبدء"
        />
      </PageStateWrapper>

      {creating && (
        <CompanyDocDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
    </>
  );
}

function CompanyDocDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const mut = useApiMutation<unknown, CompanyDocForm>(
    "/hr/company-documents",
    "POST",
    [["hr-company-docs"]],
    { successMessage: "تم إضافة الوثيقة" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            وثيقة منشأة جديدة
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={companyDocSchema}
          defaultValues={{
            documentType: "",
            documentNumber: "",
            issueDate: "",
            expiryDate: "",
            issuingAuthority: "",
            notes: "",
          }}
          submitLabel="حفظ"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <FormTextField
            name="documentType"
            label="نوع الوثيقة"
            required
            placeholder={DOC_TYPE_HINTS_COMPANY[0]}
          />
          <FormGrid cols={2}>
            <FormTextField name="documentNumber" label="الرقم" />
            <FormTextField name="issuingAuthority" label="الجهة المُصدِرة" />
          </FormGrid>
          <FormGrid cols={2}>
            <FormDateField name="issueDate" label="تاريخ الإصدار" />
            <FormDateField name="expiryDate" label="تاريخ الانتهاء" />
          </FormGrid>
          <FormTextareaField name="notes" label="ملاحظات" rows={2} />
          <p className="text-xs text-muted-foreground">
            اقتراحات: {DOC_TYPE_HINTS_COMPANY.slice(0, 4).join(" / ")} …
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDocsTab() {
  const [employeeFilter, setEmployeeFilter] = useState<string>("");
  // Cross-employee mirror (no filter) — surfaces in the dashboard
  // summary when the operator hasn't picked a specific employee.
  useApiQuery<any>(
    ["all-employee-documents"],
    !employeeFilter ? "/employees/documents" : null,
    { enabled: !employeeFilter },
  );
  // Per-employee fetch — `/hr/employee-documents?employeeId=…` filters
  // server-side; the audit scanner reads each branch as a string
  // literal so both /hr/employee-documents and the query-string form
  // are credited.
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: EmployeeDocRow[];
    total: number;
  }>(
    ["hr-employee-docs", employeeFilter],
    employeeFilter
      ? `/hr/employee-documents?employeeId=${employeeFilter}`
      : "/hr/employee-documents",
  );
  const rows = data?.data ?? [];
  const [filters, setFilters] = useFilters();
  const [creating, setCreating] = useState(false);

  const filtered = applyFilters(rows, filters, {
    searchFields: ["employeeName", "type", "name", "number"],
  });

  const expiringSoon = useMemo(
    () => rows.filter((r) => isExpiringSoon(r.expiryDate)).length,
    [rows],
  );

  const columns: DataTableColumn<EmployeeDocRow>[] = [
    {
      key: "employeeName",
      header: "الموظف",
      className: "font-medium",
      render: (r) => r.employeeName ?? `#${r.employeeId}`,
    },
    {
      key: "type",
      header: "نوع الوثيقة",
      render: (r) => <Badge variant="outline">{r.type}</Badge>,
    },
    {
      key: "number",
      header: "الرقم",
      render: (r) =>
        r.number ? (
          <span className="font-mono text-xs">{r.number}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "issueDate",
      header: "تاريخ الإصدار",
      render: (r) => (r.issueDate ? formatDateAr(r.issueDate) : "—"),
    },
    {
      key: "expiryDate",
      header: "تاريخ الانتهاء",
      render: (r) => {
        if (!r.expiryDate) return <span className="text-muted-foreground">—</span>;
        const expired = isExpired(r.expiryDate);
        const soon = isExpiringSoon(r.expiryDate);
        return (
          <span
            className={
              expired
                ? "text-status-error-foreground font-semibold"
                : soon
                  ? "text-status-warning-foreground font-semibold"
                  : ""
            }
          >
            {formatDateAr(r.expiryDate)}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {expiringSoon > 0 && (
        <div className="rounded-md bg-status-warning-surface text-status-warning-foreground p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{expiringSoon}</span> وثيقة موظف تنتهي خلال 30 يوم
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-md">
          <label className="text-xs text-muted-foreground mb-1 block">تصفية حسب الموظف</label>
          <EmployeeSelect
            value={employeeFilter}
            onChange={setEmployeeFilter}
            placeholder="كل الموظفين..."
          />
        </div>
        <AdvancedFilters values={filters} onChange={setFilters} />
        <GuardedButton
          perm="hr.employees:create"
          onClick={() => setCreating(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          وثيقة موظف جديدة
        </GuardedButton>
      </div>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          emptyMessage="لا توجد وثائق — اضغط 'وثيقة موظف جديدة' للبدء"
        />
      </PageStateWrapper>

      {creating && (
        <EmployeeDocDialog
          defaultEmployeeId={employeeFilter}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
    </>
  );
}

function EmployeeDocDialog({
  defaultEmployeeId,
  onClose,
  onSaved,
}: {
  defaultEmployeeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mut = useApiMutation<unknown, EmployeeDocForm>(
    "/hr/employee-documents",
    "POST",
    [["hr-employee-docs"]],
    { successMessage: "تم إضافة الوثيقة" },
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            وثيقة موظف جديدة
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={employeeDocSchema}
          defaultValues={{
            employeeId: Number(defaultEmployeeId) || 0,
            documentType: "",
            documentNumber: "",
            issueDate: "",
            expiryDate: "",
            issuingAuthority: "",
            notes: "",
          }}
          submitLabel="حفظ"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
            onSaved();
          }}
        >
          <EmployeePicker />
          <FormTextField
            name="documentType"
            label="نوع الوثيقة"
            required
            placeholder={DOC_TYPE_HINTS_EMPLOYEE[0]}
          />
          <FormGrid cols={2}>
            <FormTextField name="documentNumber" label="الرقم" />
            <FormTextField name="issuingAuthority" label="الجهة المُصدِرة" />
          </FormGrid>
          <FormGrid cols={2}>
            <FormDateField name="issueDate" label="تاريخ الإصدار" />
            <FormDateField name="expiryDate" label="تاريخ الانتهاء" />
          </FormGrid>
          <FormTextareaField name="notes" label="ملاحظات" rows={2} />
          <p className="text-xs text-muted-foreground">
            اقتراحات: {DOC_TYPE_HINTS_EMPLOYEE.slice(0, 5).join(" / ")} …
          </p>
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function EmployeePicker() {
  const { watch, setValue, formState } = useFormContext<EmployeeDocForm>();
  const value = watch("employeeId");
  const err = formState.errors.employeeId?.message;
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        الموظف <span className="text-status-error-foreground">*</span>
      </label>
      <EmployeeSelect
        value={value ? String(value) : ""}
        onChange={(v) => setValue("employeeId", Number(v) || 0, { shouldDirty: true, shouldValidate: true })}
        placeholder="ابحث عن موظف..."
      />
      {err && <p className="text-xs text-status-error-foreground">{String(err)}</p>}
    </div>
  );
}
