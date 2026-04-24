import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  CreationDateField,
} from "@/components/create-page-layout";
import {
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";
import {
  FileDropZone,
  type Attachment,
} from "@/components/shared/file-drop-zone";
import { AlertTriangle, Shield, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol } from "@/lib/formatters";

// ─── Constants ───────────────────────────────────────────────────────────────

const violationTypes = [
  { value: "تأخر", label: "تأخر", icon: "⏰", desc: "تأخر عن موعد الحضور" },
  {
    value: "غياب",
    label: "غياب بدون عذر",
    icon: "❌",
    desc: "غياب بدون إذن مسبق",
  },
  {
    value: "سلوك",
    label: "سلوك غير لائق",
    icon: "⚠️",
    desc: "تصرف مخالف لأخلاقيات العمل",
  },
  {
    value: "إهمال",
    label: "إهمال في العمل",
    icon: "📋",
    desc: "عدم إنجاز المهام المطلوبة",
  },
  {
    value: "مخالفة_نظام",
    label: "مخالفة نظام داخلي",
    icon: "📜",
    desc: "مخالفة السياسات والإجراءات",
  },
  { value: "أخرى", label: "أخرى", icon: "📝", desc: "مخالفة غير مصنفة" },
];

const severityLevels = [
  {
    value: "low",
    label: "منخفضة",
    color: "bg-yellow-50 text-yellow-700 border-yellow-300",
    icon: "🟡",
  },
  {
    value: "medium",
    label: "متوسطة",
    color: "bg-orange-50 text-orange-700 border-orange-300",
    icon: "🟠",
  },
  {
    value: "high",
    label: "عالية",
    color: "bg-red-50 text-red-700 border-red-300",
    icon: "🔴",
  },
];

// ─── Zod schema ──────────────────────────────────────────────────────────────

const violationSchema = z.object({
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  type: z.string().min(1, "نوع المخالفة مطلوب"),
  description: z.string().min(1, "وصف المخالفة مطلوب"),
  severity: z.enum(["low", "medium", "high"]),
  deduction: z.string(),
  period: z.string(),
  witness: z.string(),
  location: z.string(),
  actionTaken: z.string(),
});

type ViolationForm = z.infer<typeof violationSchema>;

const DEFAULTS: ViolationForm = {
  assignmentId: "",
  type: "",
  description: "",
  severity: "medium",
  deduction: "",
  period: "",
  witness: "",
  location: "",
  actionTaken: "",
};

// ─── Draft persistence (FormShell-compatible) ────────────────────────────────
//
// Replaces useAutoDraft with an approach that works inside FormShell's
// FormProvider. Two pieces:
//
//   1. loadDraftDefaults() — synchronous, called once to seed defaultValues
//   2. <DraftManager /> — renderless component inside FormShell that subscribes
//      to form.watch() for debounced saves and renders the banner when a draft
//      exists.
//
// This pattern is reusable across all FormShell create pages.

const DRAFT_KEY = "hr_violations_create";
const STORAGE_KEY = `erp_draft_${DRAFT_KEY}`;

function loadDraftDefaults(): ViolationForm {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    /* corrupt draft — use defaults */
  }
  return DEFAULTS;
}

function DraftManager({ defaults }: { defaults: ViolationForm }) {
  const form = useFormContext<ViolationForm>();
  const [visible, setVisible] = useState(
    () => !!localStorage.getItem(STORAGE_KEY),
  );

  // Debounced auto-save via form.watch subscription (no extra re-renders)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sub = form.watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        } catch {
          /* quota exceeded — silent */
        }
      }, 1000);
    });
    return () => {
      sub.unsubscribe();
      clearTimeout(timer);
    };
  }, [form]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
      <span>تم استعادة مسودة محفوظة سابقاً</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-amber-600 h-7 px-2"
        onClick={() => {
          localStorage.removeItem(STORAGE_KEY);
          form.reset(defaults);
          setVisible(false);
        }}
      >
        مسح المسودة
      </Button>
    </div>
  );
}

// ─── Custom field components (read from FormProvider context) ─────────────────

function ViolationTypeSelector() {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ViolationForm>();
  const currentType = watch("type");
  const error = errors.type?.message;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> نوع المخالفة{" "}
        <span className="text-red-500">*</span>
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {violationTypes.map((vt) => (
          <button
            key={vt.value}
            type="button"
            onClick={() =>
              setValue("type", vt.value, { shouldValidate: true })
            }
            className={cn(
              "p-3 rounded-xl border-2 text-right transition-all",
              currentType === vt.value
                ? "border-red-300 bg-red-50 ring-2 ring-red-200 ring-offset-1"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{vt.icon}</span>
              <span className="text-sm font-medium">{vt.label}</span>
            </div>
            <p className="text-xs text-gray-500">{vt.desc}</p>
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function SeveritySelector() {
  const { watch, setValue } = useFormContext<ViolationForm>();
  const currentSeverity = watch("severity");

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4" /> مستوى الخطورة
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {severityLevels.map((sl) => (
          <button
            key={sl.value}
            type="button"
            onClick={() =>
              setValue("severity", sl.value as ViolationForm["severity"], {
                shouldValidate: true,
              })
            }
            className={cn(
              "p-4 rounded-xl border-2 text-center transition-all",
              currentSeverity === sl.value
                ? sl.color + " ring-2 ring-offset-1"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <span className="text-2xl block mb-1">{sl.icon}</span>
            <span className="text-sm font-medium">{sl.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectedEmployeeCard({ employees }: { employees: any[] }) {
  const { watch } = useFormContext<ViolationForm>();
  const assignmentId = watch("assignmentId");
  const emp = employees.find(
    (e: any) => String(e.assignmentId || e.id) === assignmentId,
  );
  if (!emp) return null;

  return (
    <div className="p-3 bg-gray-50 rounded-lg border flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
        {(emp.name || "؟").charAt(0)}
      </div>
      <div>
        <p className="font-medium text-sm">{emp.name}</p>
        <p className="text-xs text-gray-500">
          {emp.jobTitle || emp.departmentName || "—"}
        </p>
      </div>
    </div>
  );
}

function ViolationSummary({ employees }: { employees: any[] }) {
  const { watch } = useFormContext<ViolationForm>();
  const [type, severity, assignmentId, deduction] = watch([
    "type",
    "severity",
    "assignmentId",
    "deduction",
  ]);
  const emp = employees.find(
    (e: any) => String(e.assignmentId || e.id) === assignmentId,
  );

  if ((!type && !severity) || !assignmentId) return null;

  return (
    <div
      className={cn(
        "p-4 rounded-xl border",
        severity === "high"
          ? "bg-red-50 border-red-200"
          : severity === "medium"
            ? "bg-orange-50 border-orange-200"
            : "bg-yellow-50 border-yellow-200",
      )}
    >
      <h4 className="text-sm font-semibold mb-2">ملخص المخالفة</h4>
      <div className="flex flex-wrap gap-2">
        {emp && <Badge variant="outline">{emp.name}</Badge>}
        {type && <Badge variant="outline">{type}</Badge>}
        <Badge variant="outline">
          {severityLevels.find((s) => s.value === severity)?.label ||
            "متوسطة"}
        </Badge>
        {deduction && (
          <Badge variant="outline">
            خصم: {deduction} {getCurrencySymbol()}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Page component ──────────────────────────────────────────────────────────

export default function ViolationsCreate() {
  const [, setLocation] = useLocation();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const createMut = useApiMutation("/hr/violations", "POST", [["violations"]], {
    successMessage: "تم إضافة المخالفة بنجاح",
  });

  const { data: empData } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const employees = empData?.data || [];

  const draftDefaults = loadDraftDefaults();

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <CreatePageLayout title="تسجيل مخالفة" backPath="/hr/violations">
      <FormGrid cols={1}>
        <CreationDateField />
      </FormGrid>

      <FormShell
        schema={violationSchema}
        defaultValues={draftDefaults}
        submitLabel="تسجيل المخالفة"
        submitVariant="destructive"
        secondaryActions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/hr/violations")}
          >
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            assignmentId: Number(values.assignmentId),
            type: values.type,
            description: values.description,
            severity: values.severity,
            deduction: values.deduction ? Number(values.deduction) : 0,
            period: values.period || undefined,
            witness: values.witness || undefined,
            location: values.location || undefined,
            actionTaken: values.actionTaken || undefined,
            ...(attachments.length > 0 ? { attachments } : {}),
          });
          clearDraft();
          setLocation("/hr/violations");
        }}
      >
        <DraftManager defaults={DEFAULTS} />

        <div className="space-y-6">
          <FormGrid cols={2}>
            <FormSelectField
              name="assignmentId"
              label="الموظف"
              required
              placeholder="اختر الموظف"
              options={employees.map((emp: any) => ({
                value: String(emp.assignmentId || emp.id),
                label: `${emp.name} ${emp.empNumber ? `(${emp.empNumber})` : ""}`,
              }))}
            />
            <SelectedEmployeeCard employees={employees} />
          </FormGrid>

          <ViolationTypeSelector />

          <SeveritySelector />

          <FormTextareaField
            name="description"
            label="وصف المخالفة"
            required
            placeholder="وصف تفصيلي للمخالفة وظروفها..."
          />

          <FormGrid cols={3}>
            <FormTextField
              name="deduction"
              label={`مبلغ الخصم (${getCurrencySymbol()})`}
              type="number"
              placeholder="0"
            />
            <FormTextField name="period" label="الفترة" type="month" />
            <FormTextField
              name="location"
              label="مكان المخالفة"
              placeholder="الموقع أو القسم"
            />
            <FormTextField
              name="witness"
              label="الشاهد"
              placeholder="اسم الشاهد (اختياري)"
            />
            <FormTextField
              name="actionTaken"
              label="الإجراء المتخذ"
              placeholder="إنذار شفهي، إنذار كتابي، خصم..."
              className="md:col-span-2"
            />
          </FormGrid>

          <ViolationSummary employees={employees} />
        </div>

        <FileDropZone
          files={attachments}
          onFilesChange={setAttachments}
          label="مرفقات المخالفة (صور، مستندات)"
        />
      </FormShell>
    </CreatePageLayout>
  );
}
