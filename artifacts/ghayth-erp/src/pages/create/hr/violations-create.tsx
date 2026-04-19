import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { toast } from "@/hooks/use-toast";
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
  FormNumberField,
  FormDateField,
  FormGrid,
} from "@/components/form-shell";
import {
  FileDropZone,
  type Attachment,
} from "@/components/shared/file-drop-zone";
import {
  Autocomplete,
  type AutocompleteOption,
} from "@/components/ui/autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmployeeContextCard } from "@/components/shared/employee-context-card";
import { EmployeeDisciplineSummary } from "@/components/shared/employee-discipline-summary";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  DoorOpen,
  FileText,
  Gavel,
  Loader2,
  MapPin,
  Pencil,
  PenLine,
  Plus,
  ScrollText,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrencySymbol, formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

// ─── Types ──────────────────────────────────────────────────────────────────

type IncidentType =
  | "late"
  | "early_leave"
  | "absence"
  | "behavior"
  | "organization"
  | "gps_out_of_range"
  | "custom";

interface RegulationRow {
  id: number;
  section: string;
  articleNumber: number;
  title: string;
  penalty1: string;
  penalty2: string;
  penalty3: string;
  penalty4: string;
  extraDeduction: string | null;
  severity: string;
  isTermination: boolean;
  legalReference: string | null;
}

interface PenaltyResolution {
  regulation: RegulationRow;
  occurrenceCount: number;
  penaltyLabel: string;
  baseDeductionAmount: number;
  extraDeductionAmount: number;
  totalDeductionAmount: number;
  isTermination: boolean;
  terminationType?: "with_benefits" | "without_benefits";
  warningOnly: boolean;
  reason: string;
}

interface PenaltyPreviewResponse {
  dailyWage: number;
  resolution: PenaltyResolution | null;
}

interface WitnessEntry {
  type: "employee" | "external";
  employeeId?: string;
  employeeName?: string;
  name?: string;
  role?: string;
}

interface RelatedPartyEntry {
  type: "employee" | "external";
  employeeId?: string;
  employeeName?: string;
  name?: string;
  role?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INCIDENT_TYPES: {
  value: IncidentType;
  label: string;
  Icon: LucideIcon;
  desc: string;
  color: string;          // tailwind color prefix, e.g. "amber"
  bgSelected: string;     // bg when selected
  borderSelected: string; // border when selected
  iconBg: string;         // icon circle bg
  iconColor: string;      // icon stroke color
}[] = [
  {
    value: "late", label: "تأخر", Icon: Clock,
    desc: "تأخر عن موعد الحضور",
    color: "amber", bgSelected: "bg-amber-50", borderSelected: "border-amber-400",
    iconBg: "bg-amber-100", iconColor: "text-amber-600",
  },
  {
    value: "early_leave", label: "مغادرة مبكرة", Icon: DoorOpen,
    desc: "مغادرة قبل نهاية الدوام",
    color: "orange", bgSelected: "bg-orange-50", borderSelected: "border-orange-400",
    iconBg: "bg-orange-100", iconColor: "text-orange-600",
  },
  {
    value: "absence", label: "غياب", Icon: Ban,
    desc: "غياب بدون إذن مسبق",
    color: "red", bgSelected: "bg-red-50", borderSelected: "border-red-400",
    iconBg: "bg-red-100", iconColor: "text-red-600",
  },
  {
    value: "behavior", label: "سلوك", Icon: Gavel,
    desc: "تصرف مخالف لأخلاقيات العمل",
    color: "purple", bgSelected: "bg-purple-50", borderSelected: "border-purple-400",
    iconBg: "bg-purple-100", iconColor: "text-purple-600",
  },
  {
    value: "organization", label: "تنظيم", Icon: ScrollText,
    desc: "مخالفة السياسات والإجراءات",
    color: "blue", bgSelected: "bg-blue-50", borderSelected: "border-blue-400",
    iconBg: "bg-blue-100", iconColor: "text-blue-600",
  },
  {
    value: "gps_out_of_range", label: "خروج عن النطاق", Icon: MapPin,
    desc: "خروج عن النطاق الجغرافي المحدد",
    color: "emerald", bgSelected: "bg-emerald-50", borderSelected: "border-emerald-400",
    iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
  },
  {
    value: "custom", label: "مخصّص", Icon: PenLine,
    desc: "مخالفة غير مصنفة",
    color: "slate", bgSelected: "bg-slate-50", borderSelected: "border-slate-400",
    iconBg: "bg-slate-100", iconColor: "text-slate-600",
  },
];

const TIME_BASED_TYPES: IncidentType[] = ["late", "early_leave", "absence"];

const STEP_LABELS = [
  { key: "incident", label: "الواقعة", icon: AlertTriangle },
  { key: "employee", label: "الموظف", icon: User },
  { key: "penalty", label: "اللائحة والجزاء", icon: Shield },
  { key: "docs", label: "التوثيق", icon: FileText },
] as const;

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const violationSchema = z.object({
  incidentDate: z.string().min(1, "تاريخ الواقعة مطلوب").refine(
    (val) => !val || val <= todayLocal(),
    "لا يمكن اختيار تاريخ مستقبلي",
  ),
  incidentType: z.string().min(1, "نوع الواقعة مطلوب"),
  durationMinutes: z.coerce.number().optional(),
  absenceDays: z.coerce.number().optional(),
  disruptsOthers: z.boolean().optional(),
  description: z.string().min(1, "وصف المخالفة مطلوب"),
  assignmentId: z.string().min(1, "يرجى اختيار الموظف"),
  regulationId: z.coerce.number().optional(),
  manualOverrideAmount: z.coerce.number().optional(),
  manualOverrideReason: z.string().optional(),
});

type ViolationForm = z.infer<typeof violationSchema>;

const DEFAULTS: ViolationForm = {
  incidentDate: "",
  incidentType: "",
  durationMinutes: undefined,
  absenceDays: undefined,
  disruptsOthers: false,
  description: "",
  assignmentId: "",
  regulationId: undefined,
  manualOverrideAmount: undefined,
  manualOverrideReason: "",
};

// ─── Draft persistence ──────────────────────────────────────────────────────

const DRAFT_KEY = "hr_violations_create";
const STORAGE_KEY = `erp_draft_${DRAFT_KEY}`;
const EXTRA_STORAGE_KEY = `erp_draft_${DRAFT_KEY}_extra`;

interface DraftExtra {
  witnesses?: WitnessEntry[];
  reasons?: string[];
  relatedParties?: RelatedPartyEntry[];
  openStep?: number;
  savedAt?: string;
}

function loadDraftDefaults(): ViolationForm {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {
    /* corrupt draft */
  }
  return DEFAULTS;
}

function loadDraftExtra(): DraftExtra {
  try {
    const stored = localStorage.getItem(EXTRA_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* corrupt */ }
  return {};
}

function saveDraftExtra(extra: DraftExtra) {
  try {
    localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify({
      ...extra,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* quota */ }
}

function clearAllDrafts() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXTRA_STORAGE_KEY);
  } catch {}
}

function DraftManager({
  defaults,
  witnesses,
  reasons,
  relatedParties,
  openStep,
}: {
  defaults: ViolationForm;
  witnesses: WitnessEntry[];
  reasons: string[];
  relatedParties: RelatedPartyEntry[];
  openStep: number;
}) {
  const form = useFormContext<ViolationForm>();
  const hasDraft = !!localStorage.getItem(STORAGE_KEY);
  const [visible, setVisible] = useState(() => hasDraft);

  // Save form fields (debounced 1s)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sub = form.watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        } catch { /* quota exceeded */ }
      }, 1000);
    });
    return () => {
      sub.unsubscribe();
      clearTimeout(timer);
    };
  }, [form]);

  // Save extra state (witnesses, reasons, relatedParties, openStep) — debounced 1.5s
  const extraTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(extraTimer.current);
    extraTimer.current = setTimeout(() => {
      saveDraftExtra({ witnesses, reasons, relatedParties, openStep });
    }, 1500);
    return () => clearTimeout(extraTimer.current);
  }, [witnesses, reasons, relatedParties, openStep]);

  if (!visible) return null;

  const extra = loadDraftExtra();
  const savedAt = extra.savedAt ? formatDateAr(extra.savedAt) : null;

  return (
    <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-amber-500" />
        <span>تم استعادة مسودة محفوظة{savedAt ? ` (${savedAt})` : ""}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-amber-600 h-7 px-2"
        onClick={() => {
          clearAllDrafts();
          form.reset(defaults);
          setVisible(false);
        }}
      >
        <X className="h-3 w-3 ml-1" />
        مسح المسودة
      </Button>
    </div>
  );
}

// ─── Step Indicator ─────────────────────────────────────────────────────────

type StepStatus = "active" | "completed" | "locked";

function StepIndicator({
  steps,
  statuses,
  onStepClick,
}: {
  steps: typeof STEP_LABELS;
  statuses: StepStatus[];
  onStepClick: (idx: number) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6 px-2">
      {steps.map((step, i) => {
        const status = statuses[i];
        const Icon = step.icon;
        const isClickable = status === "completed";
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-0">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(i)}
              className={cn(
                "flex items-center gap-2 transition-all duration-200",
                isClickable && "cursor-pointer hover:opacity-80",
                !isClickable && status !== "active" && "cursor-default",
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                  status === "active" &&
                    "bg-blue-600 text-white ring-2 ring-blue-200 ring-offset-2",
                  status === "completed" && "bg-green-500 text-white",
                  status === "locked" && "bg-gray-200 text-gray-400",
                )}
              >
                {status === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-sm hidden sm:inline transition-all duration-200",
                  status === "active" && "font-bold text-blue-700",
                  status === "completed" && "text-green-700",
                  status === "locked" && "text-gray-400",
                )}
              >
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3 transition-all duration-300",
                  statuses[i + 1] !== "locked"
                    ? "bg-blue-300"
                    : "bg-gray-200 border-dashed border-t border-gray-300 h-0",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Wizard Section (collapsible accordion) ─────────────────────────────────

function WizardSection({
  title,
  summary,
  status,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  status: StepStatus;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && ref.current) {
      setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [isOpen]);

  if (status === "locked") {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 opacity-50">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs mr-auto">ينتظر اكتمال المرحلة السابقة</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border transition-all duration-300",
        isOpen
          ? "border-blue-200 bg-white shadow-sm"
          : "border-gray-200 bg-gray-50/30",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-right"
      >
        <div className="flex items-center gap-3">
          {status === "completed" && !isOpen ? (
            <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
              <Check className="h-3.5 w-3.5" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Pencil className="h-3 w-3" />
            </div>
          )}
          <div>
            <span className="text-sm font-semibold">{title}</span>
            {!isOpen && summary && (
              <span className="text-xs text-gray-500 mr-2">{summary}</span>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Incident Type Selector ─────────────────────────────────────────────────

function IncidentTypeSelector() {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ViolationForm>();
  const current = watch("incidentType") as IncidentType;
  const error = errors.incidentType?.message;

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-2 block">
        نوع الواقعة <span className="text-red-500">*</span>
      </label>
      <p className="text-xs text-gray-500 mb-3">
        اختر نوع الواقعة — المادة تُحدَّد تلقائياً للأنواع الزمنية
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {INCIDENT_TYPES.map((it) => {
          const selected = current === it.value;
          return (
            <button
              key={it.value}
              type="button"
              onClick={() =>
                setValue("incidentType", it.value, { shouldValidate: true })
              }
              className={cn(
                "relative p-4 rounded-xl border-2 text-right transition-all duration-200 group",
                selected
                  ? `${it.borderSelected} ${it.bgSelected} shadow-sm`
                  : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white",
              )}
            >
              {selected && (
                <span className="absolute top-2 left-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center mb-3",
                selected ? it.iconBg : "bg-gray-100 group-hover:bg-gray-200",
              )}>
                <it.Icon className={cn(
                  "h-5 w-5",
                  selected ? it.iconColor : "text-gray-500 group-hover:text-gray-700",
                )} />
              </div>
              <span className={cn(
                "text-sm font-semibold block mb-0.5",
                selected ? "text-gray-900" : "text-gray-700",
              )}>
                {it.label}
              </span>
              <p className={cn(
                "text-xs leading-relaxed",
                selected ? "text-gray-600" : "text-gray-400",
              )}>
                {it.desc}
              </p>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-2 animate-in fade-in duration-200">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Step 1: Incident Details ────────────────────────────────────────────────

function StepIncident() {
  const { watch, setValue, formState: { errors } } = useFormContext<ViolationForm>();
  const incidentDate = watch("incidentDate");
  const incidentType = watch("incidentType") as IncidentType;
  const showDuration = incidentType === "late" || incidentType === "early_leave";
  const showAbsence = incidentType === "absence";
  const showDisrupts = incidentType === "late";

  return (
    <div className="space-y-5">
      <FormGrid cols={2}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            تاريخ الواقعة <span className="text-red-500">*</span>
          </label>
          <DatePicker
            value={incidentDate}
            onChange={(val) => setValue("incidentDate", val, { shouldValidate: true })}
            maxDate={new Date()}
            placeholder="اختر تاريخ الواقعة"
            calendarMode="both"
          />
          {errors.incidentDate?.message && (
            <p className="text-xs text-red-600">{errors.incidentDate.message as string}</p>
          )}
          <p className="text-xs text-gray-500">
            حدد تاريخ وقوع المخالفة الفعلي، وليس تاريخ اليوم
          </p>
        </div>
        <CreationDateField />
      </FormGrid>

      <IncidentTypeSelector />

      {/* Dynamic fields based on incident type */}
      {showDuration && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <FormGrid cols={showDisrupts ? 2 : 1}>
            <div>
              <FormNumberField
                name="durationMinutes"
                label="مدة التأخر (دقائق)"
                placeholder="15"
              />
              <p className="text-xs text-gray-500 mt-1">
                المدة تحدد المادة المطبّقة تلقائياً
              </p>
            </div>
            {showDisrupts && (
              <DisruptsOthersCheckbox />
            )}
          </FormGrid>
        </div>
      )}

      {showAbsence && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <FormNumberField
            name="absenceDays"
            label="عدد أيام الغياب"
            placeholder="1"
          />
        </div>
      )}

      <FormTextareaField
        name="description"
        label="وصف الواقعة"
        required
        placeholder="وصف تفصيلي للواقعة وظروفها..."
      />
    </div>
  );
}

function DisruptsOthersCheckbox() {
  const { watch, setValue } = useFormContext<ViolationForm>();
  const checked = watch("disruptsOthers") || false;

  return (
    <div className="flex flex-col justify-end">
      <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) =>
            setValue("disruptsOthers", v === true, {
              shouldValidate: true,
            })
          }
        />
        <div>
          <span className="text-sm font-medium">هل عطّل عمالاً آخرين؟</span>
          <p className="text-xs text-gray-500">
            يرفع درجة المادة المطبّقة
          </p>
        </div>
      </label>
    </div>
  );
}

// ─── Step 2: Employee Selection ──────────────────────────────────────────────

function StepEmployee({
  employees,
  priorMemos,
  priorMemosLoading,
}: {
  employees: any[];
  priorMemos: any[] | null;
  priorMemosLoading: boolean;
}) {
  const { watch, setValue } = useFormContext<ViolationForm>();
  const assignmentId = watch("assignmentId");

  const empOptions: AutocompleteOption[] = useMemo(
    () =>
      employees.map((emp: any) => ({
        value: String(emp.assignmentId || emp.id),
        label: emp.name || "—",
        subtitle: [emp.jobTitle, emp.departmentName, emp.empNumber ? `#${emp.empNumber}` : ""]
          .filter(Boolean)
          .join(" — "),
        metadata: emp,
      })),
    [employees],
  );

  const selectedEmp = useMemo(
    () =>
      employees.find(
        (e: any) => String(e.assignmentId || e.id) === assignmentId,
      ),
    [employees, assignmentId],
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          بحث الموظف <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-2">
          ابحث بالاسم أو الرقم الوظيفي أو رقم الهوية
        </p>
        <Autocomplete
          options={empOptions}
          value={assignmentId}
          onChange={(val) =>
            setValue("assignmentId", String(val), { shouldValidate: true })
          }
          placeholder="ابحث عن الموظف..."
        />
      </div>

      {/* Employee card after selection */}
      {selectedEmp && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200 p-4 bg-gradient-to-l from-blue-50 to-white rounded-xl border border-blue-100">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
              {(selectedEmp.name || "؟").charAt(0)}
            </div>
            <div className="flex-1 space-y-1">
              <p className="font-semibold text-base">{selectedEmp.name}</p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {selectedEmp.empNumber && (
                  <Badge variant="outline">#{selectedEmp.empNumber}</Badge>
                )}
                {selectedEmp.jobTitle && (
                  <Badge variant="outline">{selectedEmp.jobTitle}</Badge>
                )}
                {selectedEmp.departmentName && (
                  <Badge variant="outline">{selectedEmp.departmentName}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Prior memos summary */}
          <div className="mt-3 pt-3 border-t border-blue-100">
            {priorMemosLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                جارٍ جلب سجل المخالفات...
              </div>
            ) : priorMemos && priorMemos.length > 0 ? (
              <div className="text-xs text-gray-600">
                <span className="font-medium">
                  {priorMemos.length} مخالفة سابقة
                </span>
                {" — آخرها: "}
                {formatDateAr(priorMemos[0]?.createdAt)}
              </div>
            ) : (
              <div className="text-xs text-green-600">
                لا توجد مخالفات سابقة مسجّلة
              </div>
            )}
          </div>
        </div>
      )}

      {/* Employee context card */}
      {assignmentId && selectedEmp && (
        <div className="mt-3 space-y-3">
          <EmployeeContextCard employeeId={selectedEmp.id} section="violations" />
          <EmployeeDisciplineSummary
            employeeId={selectedEmp.id}
            employeeName={selectedEmp.name}
            title="ملف الانضباط — لقطة مباشرة"
            hideCreateButton
            compact
          />
        </div>
      )}
    </div>
  );
}

// ─── Penalty Scale Card ─────────────────────────────────────────────────────

function PenaltyScaleCard({
  regulation,
  occurrenceCount,
}: {
  regulation: RegulationRow;
  occurrenceCount: number;
}) {
  const penalties = [
    { label: "المرة 1", value: regulation.penalty1 },
    { label: "المرة 2", value: regulation.penalty2 },
    { label: "المرة 3", value: regulation.penalty3 },
    { label: "المرة 4", value: regulation.penalty4 },
  ];

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold">
          مادة #{regulation.articleNumber} — {regulation.title}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        قسم: {regulation.section}
        {regulation.legalReference && ` — ${regulation.legalReference}`}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {penalties.map((p, i) => {
          const isCurrent = i + 1 === occurrenceCount;
          const isPast = i + 1 < occurrenceCount;
          const isFuture = i + 1 > occurrenceCount;
          return (
            <div
              key={i}
              className={cn(
                "p-2 rounded-lg border text-center text-xs transition-all",
                isCurrent &&
                  "border-blue-400 bg-blue-50 ring-2 ring-blue-200 font-bold",
                isPast && "border-green-200 bg-green-50 text-green-700",
                isFuture && "border-gray-200 bg-white text-gray-400",
              )}
            >
              <div className="font-medium mb-1">{p.label}</div>
              <div className="leading-tight">{p.value || "—"}</div>
              {isPast && (
                <Check className="h-3 w-3 text-green-500 mx-auto mt-1" />
              )}
              {isCurrent && (
                <div className="text-[10px] text-blue-600 mt-1">
                  ← أنت هنا
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Regulation & Penalty ───────────────────────────────────────────

function StepPenalty({
  preview,
  previewLoading,
  priorMemos,
  employees,
}: {
  preview: PenaltyPreviewResponse | null;
  previewLoading: boolean;
  priorMemos: any[] | null;
  employees: any[];
}) {
  const { watch, setValue } = useFormContext<ViolationForm>();
  const incidentType = watch("incidentType") as IncidentType;
  const manualOverrideAmount = watch("manualOverrideAmount");
  const manualOverrideReason = watch("manualOverrideReason");
  const [showManualOverride, setShowManualOverride] = useState(false);

  const isTimeBased = TIME_BASED_TYPES.includes(incidentType);
  const isBehavioral = !isTimeBased && !!incidentType;

  // For behavioral types — manual regulation selection
  const regulationSection =
    incidentType === "behavior" ? "conduct" : "work_organization";
  const { data: regulationsData } = useApiQuery<{ data: RegulationRow[] }>(
    ["regulations", regulationSection],
    `/hr/discipline/regulation?section=${regulationSection}`,
    { enabled: isBehavioral },
  );
  const regulations = regulationsData?.data || [];

  const regulationOptions: AutocompleteOption[] = useMemo(
    () =>
      regulations.map((r) => ({
        value: r.id,
        label: `مادة #${r.articleNumber} — ${r.title}`,
        subtitle: r.section,
      })),
    [regulations],
  );

  if (previewLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ تحليل المخالفة...
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-4 bg-gray-200 rounded animate-pulse"
              style={{ width: `${70 + i * 10}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const resolution = preview?.resolution;
  const dailyWage = preview?.dailyWage || 0;

  return (
    <div className="space-y-5">
      {/* Manual regulation picker for behavioral types */}
      {isBehavioral && (
        <div className="animate-in fade-in duration-200">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            اختر المادة المطبّقة
          </label>
          <Autocomplete
            options={regulationOptions}
            value={watch("regulationId") || ""}
            onChange={(val) =>
              setValue("regulationId", Number(val), { shouldValidate: true })
            }
            placeholder="ابحث عن المادة بالعنوان أو الرقم..."
          />
        </div>
      )}

      {/* Regulation article card */}
      {resolution && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
          <PenaltyScaleCard
            regulation={resolution.regulation}
            occurrenceCount={resolution.occurrenceCount}
          />

          {/* Occurrence warning */}
          {resolution.occurrenceCount > 1 && (
            <div
              className={cn(
                "p-4 rounded-xl border animate-in fade-in duration-300",
                resolution.occurrenceCount >= 4 || resolution.isTermination
                  ? "bg-red-50 border-red-300 text-red-800"
                  : resolution.occurrenceCount >= 3
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-800",
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    هذه المخالفة هي التكرار رقم {resolution.occurrenceCount}{" "}
                    لنفس المادة خلال السنة العقدية
                  </p>
                  {/* Show prior memos filtered by same regulation */}
                  {priorMemos && priorMemos.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {priorMemos
                        .filter(
                          (m: any) =>
                            m.regulationId === resolution.regulation.id,
                        )
                        .slice(0, 5)
                        .map((m: any, i: number) => (
                          <li key={i}>
                            •{" "}
                            {m.createdAt
                              ? new Date(m.createdAt).toLocaleDateString(
                                  "ar-SA",
                                )
                              : "—"}{" "}
                            — {m.penaltyLabel || m.status || "—"}
                            {m.memoNumber && ` (${m.memoNumber})`}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Penalty details */}
          <div className="p-4 rounded-xl border border-gray-200 bg-white">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              تفاصيل الجزاء المحسوب
            </h4>

            {/* Warning only badge */}
            {resolution.warningOnly && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                هذا الجزاء إنذار كتابي فقط — لا خصم مالي
              </div>
            )}

            {/* Termination alert */}
            {resolution.isTermination && (
              <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800 font-semibold">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  هذا الجزاء يستوجب إنهاء الخدمة
                </div>
                {resolution.terminationType && (
                  <p className="text-xs mt-1 font-normal">
                    النوع:{" "}
                    {resolution.terminationType === "with_benefits"
                      ? "فصل مع المكافأة"
                      : "فصل بدون مكافأة"}
                    {" — يتطلب موافقة المدير العام"}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">نص الجزاء</span>
                <span className="font-medium">{resolution.penaltyLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">الأجر اليومي</span>
                <span>
                  {formatCurrency(dailyWage)}
                </span>
              </div>
              {!resolution.warningOnly && (
                <>
                  <hr className="border-gray-100" />
                  <div className="flex justify-between">
                    <span className="text-gray-600">الخصم الأساسي</span>
                    <span>
                      {formatCurrency(resolution.baseDeductionAmount)}
                    </span>
                  </div>
                  {resolution.extraDeductionAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">الخصم الإضافي</span>
                      <span>
                        {formatCurrency(resolution.extraDeductionAmount)}
                      </span>
                    </div>
                  )}
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold text-base">
                    <span>الإجمالي</span>
                    <span className="text-red-600">
                      {formatCurrency(resolution.totalDeductionAmount)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Manual override */}
            {!resolution.warningOnly && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={showManualOverride}
                    onCheckedChange={(v) => {
                      const checked = v === true;
                      setShowManualOverride(checked);
                      if (!checked) {
                        setValue("manualOverrideAmount", undefined);
                        setValue("manualOverrideReason", "");
                      }
                    }}
                  />
                  <span className="text-sm text-gray-700">
                    تعديل يدوي للمبلغ
                  </span>
                </label>
                {showManualOverride && (
                  <div className="mt-3 space-y-3 animate-in fade-in duration-200">
                    <FormGrid cols={2}>
                      <FormNumberField
                        name="manualOverrideAmount"
                        label={`المبلغ (${getCurrencySymbol()})`}
                        placeholder="0"
                      />
                      <FormTextField
                        name="manualOverrideReason"
                        label="سبب التعديل"
                        required={showManualOverride}
                        placeholder="سبب التعديل اليدوي (مطلوب)"
                      />
                    </FormGrid>
                    <p className="text-xs text-gray-500">
                      التعديل اليدوي يُسجَّل في سجل المراجعة
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* No resolution found */}
      {!previewLoading && !resolution && isTimeBased && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 inline ml-1" />
          لم يتم العثور على مادة مطابقة — تأكد من بيانات الواقعة
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Documentation ──────────────────────────────────────────────────

function StepDocumentation({
  witnesses,
  setWitnesses,
  reasons,
  setReasons,
  relatedParties,
  setRelatedParties,
  attachments,
  setAttachments,
  employees,
}: {
  witnesses: WitnessEntry[];
  setWitnesses: (w: WitnessEntry[]) => void;
  reasons: string[];
  setReasons: (r: string[]) => void;
  relatedParties: RelatedPartyEntry[];
  setRelatedParties: (p: RelatedPartyEntry[]) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  employees: any[];
}) {
  const empOptions: AutocompleteOption[] = useMemo(
    () =>
      employees.map((emp: any) => ({
        value: String(emp.assignmentId || emp.id),
        label: emp.name || "—",
        subtitle: emp.jobTitle || "",
      })),
    [employees],
  );

  return (
    <div className="space-y-6">
      {/* Witnesses */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          الشهود
        </label>
        <p className="text-xs text-gray-500 mb-3">
          أضف شهوداً على الواقعة — موظفين أو من خارج المنشأة
        </p>
        <div className="space-y-3">
          {witnesses.map((w, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50/50 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name={`witness-type-${i}`}
                      checked={w.type === "employee"}
                      onChange={() => {
                        const next = [...witnesses];
                        next[i] = { type: "employee" };
                        setWitnesses(next);
                      }}
                      className="h-3 w-3"
                    />
                    موظف
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name={`witness-type-${i}`}
                      checked={w.type === "external"}
                      onChange={() => {
                        const next = [...witnesses];
                        next[i] = { type: "external" };
                        setWitnesses(next);
                      }}
                      className="h-3 w-3"
                    />
                    خارجي
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setWitnesses(witnesses.filter((_, j) => j !== i))
                  }
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {w.type === "employee" ? (
                <Autocomplete
                  options={empOptions}
                  value={w.employeeId || ""}
                  onChange={(val, opt) => {
                    const next = [...witnesses];
                    next[i] = {
                      ...next[i],
                      employeeId: String(val),
                      employeeName: opt?.label,
                    };
                    setWitnesses(next);
                  }}
                  placeholder="ابحث عن الموظف..."
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={w.name || ""}
                    onChange={(e) => {
                      const next = [...witnesses];
                      next[i] = { ...next[i], name: e.target.value };
                      setWitnesses(next);
                    }}
                    placeholder="الاسم"
                  />
                  <Input
                    value={w.role || ""}
                    onChange={(e) => {
                      const next = [...witnesses];
                      next[i] = { ...next[i], role: e.target.value };
                      setWitnesses(next);
                    }}
                    placeholder="الصفة"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() =>
            setWitnesses([...witnesses, { type: "employee" }])
          }
        >
          <Plus className="h-3 w-3 ml-1" />
          أضف شاهداً
        </Button>
      </div>

      {/* Additional reasons */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          أسباب إضافية
        </label>
        <p className="text-xs text-gray-500 mb-3">
          أضف أسباباً توضيحية إن وجدت
        </p>
        <div className="space-y-2">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={r}
                onChange={(e) => {
                  const next = [...reasons];
                  next[i] = e.target.value;
                  setReasons(next);
                }}
                placeholder={`سبب ${i + 1}`}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setReasons(reasons.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setReasons([...reasons, ""])}
        >
          <Plus className="h-3 w-3 ml-1" />
          أضف سبباً
        </Button>
      </div>

      {/* Related parties */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1 block">
          أطراف مرتبطة
        </label>
        <p className="text-xs text-gray-500 mb-3">
          أشخاص لهم علاقة بالواقعة (غير الشهود)
        </p>
        <div className="space-y-3">
          {relatedParties.map((p, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50/50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name={`party-type-${i}`}
                      checked={p.type === "employee"}
                      onChange={() => {
                        const next = [...relatedParties];
                        next[i] = { type: "employee" };
                        setRelatedParties(next);
                      }}
                      className="h-3 w-3"
                    />
                    موظف
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="radio"
                      name={`party-type-${i}`}
                      checked={p.type === "external"}
                      onChange={() => {
                        const next = [...relatedParties];
                        next[i] = { type: "external" };
                        setRelatedParties(next);
                      }}
                      className="h-3 w-3"
                    />
                    خارجي
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRelatedParties(
                      relatedParties.filter((_, j) => j !== i),
                    )
                  }
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {p.type === "employee" ? (
                <Autocomplete
                  options={empOptions}
                  value={p.employeeId || ""}
                  onChange={(val, opt) => {
                    const next = [...relatedParties];
                    next[i] = {
                      ...next[i],
                      employeeId: String(val),
                      employeeName: opt?.label,
                    };
                    setRelatedParties(next);
                  }}
                  placeholder="ابحث عن الموظف..."
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={p.name || ""}
                    onChange={(e) => {
                      const next = [...relatedParties];
                      next[i] = { ...next[i], name: e.target.value };
                      setRelatedParties(next);
                    }}
                    placeholder="الاسم"
                  />
                  <Input
                    value={p.role || ""}
                    onChange={(e) => {
                      const next = [...relatedParties];
                      next[i] = { ...next[i], role: e.target.value };
                      setRelatedParties(next);
                    }}
                    placeholder="الدور"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() =>
            setRelatedParties([...relatedParties, { type: "employee" }])
          }
        >
          <Plus className="h-3 w-3 ml-1" />
          أضف طرفاً
        </Button>
      </div>

      {/* Attachments */}
      <FileDropZone
        files={attachments}
        onFilesChange={setAttachments}
        label="مرفقات المخالفة (صور، مستندات، تسجيلات)"
      />
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function ViolationsCreate() {
  const [, setLocation] = useLocation();

  // Load saved extra draft state (witnesses, reasons, relatedParties, openStep)
  const [draftExtra] = useState(() => loadDraftExtra());
  const { fieldErrors, validate } = useFieldErrors();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [witnesses, setWitnesses] = useState<WitnessEntry[]>(draftExtra.witnesses || []);
  const [reasons, setReasons] = useState<string[]>(draftExtra.reasons || []);
  const [relatedParties, setRelatedParties] = useState<RelatedPartyEntry[]>(draftExtra.relatedParties || []);
  const [openStep, setOpenStep] = useState(draftExtra.openStep || 0);

  // Employee data
  const { data: empData } = useApiQuery<{ data: any[] }>(
    ["employees-list"],
    "/employees",
  );
  const employees = empData?.data || [];

  // Draft defaults
  const draftDefaults = loadDraftDefaults();

  // Memo creation mutation — successMessage: false so we show the memo number ourselves
  const createMemo = useApiMutation<
    { id: number; memoNumber: string; regulationId?: number; penaltyPreview?: any },
    any
  >(
    "/hr/discipline/memos",
    "POST",
    [["discipline-memos"], ["violations"]],
    { successMessage: false },
  );

  return (
    <CreatePageLayout title="تسجيل مخالفة" backPath="/hr/violations">
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
          const firstError = validate({
            assignmentId: values.assignmentId ? null : "يرجى اختيار الموظف",
            incidentType: values.incidentType ? null : "نوع الواقعة مطلوب",
            manualOverrideAmount: values.manualOverrideAmount !== undefined && values.manualOverrideAmount < 0
              ? "مبلغ الخصم يجب أن يكون صفر أو أكثر"
              : null,
          });
          if (firstError) {
            toast({ variant: "destructive", title: firstError });
            return;
          }
          const result = await createMemo.mutateAsync({
            assignmentId: Number(values.assignmentId),
            incidentType: values.incidentType,
            incidentDate: values.incidentDate,
            incidentDurationMinutes: values.durationMinutes || undefined,
            absenceDays: values.absenceDays || undefined,
            incidentDescription: values.description,
            regulationId: values.regulationId || undefined,
            disruptsOthers: values.disruptsOthers || false,
            ...(witnesses.length > 0 ? { witnesses } : {}),
            ...(relatedParties.length > 0 ? { relatedParties } : {}),
            ...(reasons.filter(Boolean).length > 0
              ? { reasons: reasons.filter(Boolean) }
              : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(values.manualOverrideAmount
              ? {
                  manualOverrideAmount: values.manualOverrideAmount,
                  manualOverrideReason: values.manualOverrideReason,
                }
              : {}),
          });
          toast({
            title: "تم تسجيل المخالفة بنجاح",
            description: `رقم المحضر: ${result.memoNumber}`,
          });
          clearAllDrafts();
          setLocation("/hr/violations");
        }}
      >
        <DraftManager
          defaults={DEFAULTS}
          witnesses={witnesses}
          reasons={reasons}
          relatedParties={relatedParties}
          openStep={openStep}
        />
        <WizardFormContent
          employees={employees}
          openStep={openStep}
          setOpenStep={setOpenStep}
          attachments={attachments}
          setAttachments={setAttachments}
          witnesses={witnesses}
          setWitnesses={setWitnesses}
          reasons={reasons}
          setReasons={setReasons}
          relatedParties={relatedParties}
          setRelatedParties={setRelatedParties}
        />
      </FormShell>
    </CreatePageLayout>
  );
}

// Inner component that has access to FormProvider context
function WizardFormContent({
  employees,
  openStep,
  setOpenStep,
  attachments,
  setAttachments,
  witnesses,
  setWitnesses,
  reasons,
  setReasons,
  relatedParties,
  setRelatedParties,
}: {
  employees: any[];
  openStep: number;
  setOpenStep: (s: number) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  witnesses: WitnessEntry[];
  setWitnesses: (w: WitnessEntry[]) => void;
  reasons: string[];
  setReasons: (r: string[]) => void;
  relatedParties: RelatedPartyEntry[];
  setRelatedParties: (p: RelatedPartyEntry[]) => void;
}) {
  const { watch, formState: { errors, submitCount } } = useFormContext<ViolationForm>();
  const [
    incidentDate, incidentType, assignmentId, description,
    durationMinutes, absenceDays, disruptsOthers, regulationId,
  ] = watch([
    "incidentDate", "incidentType", "assignmentId", "description",
    "durationMinutes", "absenceDays", "disruptsOthers", "regulationId",
  ]);

  // ─── Auto-open first step with errors after failed submit ─────────────
  const STEP_FIELDS: Record<number, (keyof ViolationForm)[]> = {
    0: ["incidentDate", "incidentType", "description", "durationMinutes", "absenceDays"],
    1: ["assignmentId"],
    2: ["regulationId", "manualOverrideAmount", "manualOverrideReason"],
  };

  const prevSubmitCount = useRef(submitCount);
  useEffect(() => {
    if (submitCount > prevSubmitCount.current) {
      const errorKeys = Object.keys(errors) as (keyof ViolationForm)[];
      if (errorKeys.length > 0) {
        for (const [stepIdx, fields] of Object.entries(STEP_FIELDS)) {
          if (fields.some((f) => errorKeys.includes(f))) {
            setOpenStep(Number(stepIdx));
            break;
          }
        }
      }
    }
    prevSubmitCount.current = submitCount;
  }, [submitCount, errors, setOpenStep]);

  // Step completion logic — step 1 requires date + type + description
  const step1Complete = !!incidentDate && !!incidentType && !!description;
  const step2Complete = step1Complete && !!assignmentId;
  const isTimeBased = TIME_BASED_TYPES.includes(incidentType as IncidentType);

  // Penalty preview query — fires when step 1+2 are complete
  // Re-triggers on any relevant field change (debounced 500ms)
  const previewBody = useMemo(() => {
    if (!step2Complete) return null;
    return {
      assignmentId: Number(assignmentId),
      incidentType,
      incidentDate,
      ...(durationMinutes ? { durationMinutes: Number(durationMinutes) } : {}),
      ...(absenceDays ? { absenceDays: Number(absenceDays) } : {}),
      ...(disruptsOthers ? { disruptsOthers: true } : {}),
      ...(regulationId ? { regulationId: Number(regulationId) } : {}),
    };
  }, [step2Complete, assignmentId, incidentType, incidentDate, durationMinutes, absenceDays, disruptsOthers, regulationId]);

  // Use a debounced mutation for penalty preview
  const [preview, setPreview] = useState<PenaltyPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!previewBody) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/hr/discipline/penalty-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(previewBody),
        });
        if (res.ok) {
          const data = await res.json();
          setPreview(data);
        }
      } catch {
        // silent
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(previewTimer.current);
  }, [previewBody]);

  // Prior memos for the selected employee
  const { data: memosData, isLoading: memosLoading } = useApiQuery<{
    data: any[];
  }>(
    ["prior-memos", assignmentId],
    assignmentId
      ? `/hr/discipline/memos?assignmentId=${assignmentId}&status=approved`
      : null,
    { enabled: !!assignmentId },
  );
  const priorMemos = memosData?.data || null;

  // Step statuses
  const step3Complete = step2Complete && (!!preview?.resolution || !isTimeBased);
  const statuses: StepStatus[] = [
    step1Complete ? (openStep === 0 ? "active" : "completed") : "active",
    !step1Complete
      ? "locked"
      : step2Complete
        ? openStep === 1
          ? "active"
          : "completed"
        : openStep === 1
          ? "active"
          : "locked",
    !step2Complete ? "locked" : openStep === 2 ? "active" : step3Complete ? "completed" : "active",
    "active", // docs always accessible
  ];

  // No auto-advance — user navigates manually via "التالي" buttons

  // Build step 1 summary
  const incidentLabel =
    INCIDENT_TYPES.find((t) => t.value === incidentType)?.label || "";
  const step1Summary = step1Complete
    ? `${incidentLabel} — ${incidentDate}`
    : undefined;

  // Build step 2 summary
  const selectedEmp = employees.find(
    (e: any) => String(e.assignmentId || e.id) === assignmentId,
  );
  const step2Summary = selectedEmp ? selectedEmp.name : undefined;

  return (
    <div className="space-y-4">
      <StepIndicator
        steps={STEP_LABELS}
        statuses={statuses}
        onStepClick={(i) => {
          // Don't allow clicking locked steps
          if (statuses[i] === "locked") return;
          setOpenStep(i);
        }}
      />

      {/* Step 1: Incident */}
      <WizardSection
        title="الواقعة"
        summary={step1Summary}
        status={statuses[0]}
        isOpen={openStep === 0}
        onToggle={() => setOpenStep(openStep === 0 ? -1 : 0)}
      >
        <StepIncident />
        <div className="flex justify-start pt-4 mt-4 border-t">
          <Button
            type="button"
            disabled={!step1Complete}
            onClick={() => setOpenStep(1)}
            className="gap-1.5"
          >
            التالي: اختيار الموظف
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </Button>
          {!step1Complete && (
            <p className="text-xs text-gray-400 self-center mr-3">
              أكمل جميع الحقول المطلوبة أولاً
            </p>
          )}
        </div>
      </WizardSection>

      {/* Step 2: Employee */}
      <WizardSection
        title="الموظف"
        summary={step2Summary}
        status={statuses[1]}
        isOpen={openStep === 1}
        onToggle={() => statuses[1] !== "locked" && setOpenStep(openStep === 1 ? -1 : 1)}
      >
        <StepEmployee
          employees={employees}
          priorMemos={priorMemos}
          priorMemosLoading={memosLoading}
        />
        <div className="flex justify-between pt-4 mt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpenStep(0)}
            className="gap-1.5"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
            السابق
          </Button>
          <Button
            type="button"
            disabled={!step2Complete}
            onClick={() => setOpenStep(2)}
            className="gap-1.5"
          >
            التالي: اللائحة والجزاء
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </Button>
        </div>
      </WizardSection>

      {/* Step 3: Regulation & Penalty */}
      <WizardSection
        title="اللائحة والجزاء"
        summary={
          preview?.resolution
            ? preview.resolution.penaltyLabel
            : undefined
        }
        status={statuses[2]}
        isOpen={openStep === 2}
        onToggle={() => statuses[2] !== "locked" && setOpenStep(openStep === 2 ? -1 : 2)}
      >
        <StepPenalty
          preview={preview}
          previewLoading={previewLoading}
          priorMemos={priorMemos}
          employees={employees}
        />
        <div className="flex justify-between pt-4 mt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpenStep(1)}
            className="gap-1.5"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
            السابق
          </Button>
          <Button
            type="button"
            onClick={() => setOpenStep(3)}
            className="gap-1.5"
          >
            التالي: التوثيق
            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
          </Button>
        </div>
      </WizardSection>

      {/* Step 4: Documentation */}
      <WizardSection
        title="التوثيق"
        status={statuses[3]}
        isOpen={openStep === 3}
        onToggle={() => setOpenStep(openStep === 3 ? -1 : 3)}
      >
        <StepDocumentation
          witnesses={witnesses}
          setWitnesses={setWitnesses}
          reasons={reasons}
          setReasons={setReasons}
          relatedParties={relatedParties}
          setRelatedParties={setRelatedParties}
          attachments={attachments}
          setAttachments={setAttachments}
          employees={employees}
        />
      </WizardSection>

      {/* Validation error banner */}
      {submitCount > 0 && Object.keys(errors).length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700">
            <p className="font-medium">يرجى تصحيح الأخطاء التالية:</p>
            <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
              {Object.values(errors).map((err, i) => (
                <li key={i}>{(err?.message as string) || "حقل مطلوب"}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Submit hint */}
      <p className="text-xs text-gray-500 text-center">
        سيتم إنشاء محضر تحقيق تلقائياً بعد التسجيل
      </p>
    </div>
  );
}
