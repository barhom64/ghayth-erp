import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CreatePageLayout } from "@/components/create-page-layout";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";
import { getCurrencySymbol } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Check, ChevronDown, AlertTriangle, Pencil, Plus, Trash2, User, UserCheck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type IncidentType = "late" | "early_leave" | "absence" | "behavior" | "organization" | "gps" | "custom";

interface Employee {
  id: number;
  name: string;
  employeeNumber: string;
  jobTitle: string;
  branch: string;
  assignmentId: number;
}

interface PenaltyPreview {
  dailyWage: number;
  penaltyLabel: string;
  baseDeductionAmount: number;
  extraDeductionAmount: number;
  totalDeductionAmount: number;
  warningOnly: boolean;
  isTermination: boolean;
  terminationType?: string;
  occurrenceCount: number;
  regulationId: number;
  regulationTitle: string;
  regulationSection: string;
}

interface Regulation {
  id: number;
  title: string;
  section: string;
}

interface Witness {
  type: "employee" | "external";
  search: string;
  selectedEmployee: Employee | null;
  externalName: string;
  externalTitle: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];

const INCIDENT_TYPES: { value: IncidentType; label: string; icon: string }[] = [
  { value: "late", label: "تأخر", icon: "⏰" },
  { value: "early_leave", label: "مغادرة مبكرة", icon: "🚪" },
  { value: "absence", label: "غياب", icon: "❌" },
  { value: "behavior", label: "سلوك", icon: "⚠️" },
  { value: "organization", label: "تنظيم", icon: "📋" },
  { value: "gps", label: "GPS", icon: "📍" },
  { value: "custom", label: "مخصّص", icon: "📝" },
];

const MANUAL_TYPES: IncidentType[] = ["behavior", "organization", "custom"];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, completed }: { current: number; completed: boolean[] }) {
  const labels = ["الواقعة", "الموظف", "اللائحة", "التوثيق"];
  return (
    <div className="flex items-center justify-center gap-2 mb-6" dir="rtl">
      {labels.map((label, i) => {
        const done = completed[i];
        const active = current === i;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
            {i < 3 && <div className={cn("w-8 h-0.5 mb-4", done ? "bg-green-400" : "bg-gray-200")} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Accordion Panel ──────────────────────────────────────────────────────────

function AccordionPanel({
  open, locked, title, summary, onEdit, children,
}: {
  open: boolean; locked: boolean; title: string; summary?: string; onEdit?: () => void; children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-all duration-300",
      locked ? "border-gray-200 opacity-60" : open ? "border-blue-300 shadow-sm" : "border-gray-300",
    )}>
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        open ? "bg-blue-50" : locked ? "bg-gray-50" : "bg-white",
      )}>
        <div className="flex items-center gap-2">
          {!open && !locked && summary && (
            <Check className="h-4 w-4 text-green-500" />
          )}
          <span className="font-semibold text-sm">{title}</span>
          {!open && summary && (
            <span className="text-xs text-gray-500 truncate max-w-xs">{summary}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!open && !locked && onEdit && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={onEdit}>
              <Pencil className="h-3 w-3" /> تعديل
            </Button>
          )}
          {locked && <span className="text-xs text-gray-400">مقفل</span>}
          {!locked && <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")} />}
        </div>
      </div>
      {open && !locked && (
        <div className="p-4 space-y-4 border-t border-blue-100">{children}</div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-muted rounded h-4", className)} />;
}

// ─── Employee Search ──────────────────────────────────────────────────────────

function EmployeeSearch({
  value, onSelect, placeholder = "ابحث باسم الموظف أو الرقم",
}: {
  value: string; onSelect: (emp: Employee) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedQ, setDebouncedQ] = useState("");

  const { data, isFetching } = useApiQuery<{ data: Employee[] }>(
    ["emp-search", debouncedQ],
    `/hr/employees?search=${encodeURIComponent(debouncedQ)}`,
    { enabled: debouncedQ.length >= 1 },
  );
  const results = data?.data || [];

  const handleChange = useCallback((q: string) => {
    setQuery(q);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(q), 300);
  }, []);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-right"
      />
      {open && (isFetching || results.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
          {isFetching && <div className="p-3 text-sm text-gray-500">جاري البحث…</div>}
          {results.map((emp) => (
            <button
              key={emp.id}
              type="button"
              className="w-full text-right px-3 py-2 hover:bg-blue-50 text-sm"
              onMouseDown={() => { onSelect(emp); setQuery(emp.name); setOpen(false); }}
            >
              <span className="font-medium">{emp.name}</span>
              <span className="text-gray-400 mr-2 text-xs">#{emp.employeeNumber}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ViolationsCreate() {
  const [, setLocation] = useLocation();

  // Step open state (0=incident,1=employee,2=regulation,3=docs)
  const [openStep, setOpenStep] = useState(0);

  // Step 1 — Incident
  const [incidentDate, setIncidentDate] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType | "">("");
  const [description, setDescription] = useState("");
  const [minutesDuration, setMinutesDuration] = useState("");
  const [disruptedOthers, setDisruptedOthers] = useState(false);
  const [daysAbsent, setDaysAbsent] = useState("");

  // Step 2 — Employee
  const [employee, setEmployee] = useState<Employee | null>(null);

  // Step 3 — Regulation
  const [preview, setPreview] = useState<PenaltyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualRegId, setManualRegId] = useState<number | null>(null);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Step 4 — Docs (always open logic handled separately)
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [additionalReasons, setAdditionalReasons] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Step completion flags
  const step1Done = !!incidentDate && !!incidentType && description.trim().length > 0;
  const step2Done = !!employee;
  const step3Done = !!preview;

  const completed = [step1Done, step2Done, step3Done, false];

  // Fetch regulations for manual types
  const isManual = MANUAL_TYPES.includes(incidentType as IncidentType);
  const { data: regData } = useApiQuery<{ data: Regulation[] }>(
    ["regulations-conduct"],
    "/hr/discipline/regulation?section=conduct",
    { enabled: isManual && openStep === 2 },
  );
  const regulations = regData?.data || [];

  // Auto-fire penalty-preview when step 3 opens
  const penaltyMut = useApiMutation("/hr/discipline/penalty-preview", "POST", []);
  useEffect(() => {
    if (openStep !== 2 || !step1Done || !step2Done || !employee) return;
    setPreviewLoading(true);
    setPreview(null);
    const body: Record<string, unknown> = {
      assignmentId: employee.assignmentId,
      incidentType,
      ...(minutesDuration ? { minutesDuration: Number(minutesDuration) } : {}),
      ...(daysAbsent ? { daysAbsent: Number(daysAbsent) } : {}),
      ...(incidentType === "late" ? { disruptedOthers } : {}),
      ...(manualRegId ? { regulationId: manualRegId } : {}),
    };
    penaltyMut.mutateAsync(body)
      .then((res: unknown) => { setPreview(res as PenaltyPreview); })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStep]);

  // Submit
  const createMut = useApiMutation("/hr/violations", "POST", [["violations"]], {
    successMessage: "تم تسجيل المخالفة بنجاح",
  });

  const canSubmit = step1Done && step2Done && step3Done;

  async function handleSubmit(draft = false) {
    if (!employee || !incidentType) return;
    await createMut.mutateAsync({
      assignmentId: employee.assignmentId,
      incidentDate,
      incidentType,
      description,
      ...(minutesDuration ? { minutesDuration: Number(minutesDuration) } : {}),
      ...(daysAbsent ? { daysAbsent: Number(daysAbsent) } : {}),
      ...(incidentType === "late" ? { disruptedOthers } : {}),
      ...(manualRegId ? { regulationId: manualRegId } : {}),
      ...(overrideAmount ? { overrideAmount: Number(overrideAmount), overrideReason } : {}),
      witnesses: witnesses.map((w) =>
        w.type === "employee"
          ? { type: "employee", employeeId: w.selectedEmployee?.id }
          : { type: "external", name: w.externalName, title: w.externalTitle },
      ),
      additionalReasons: additionalReasons.filter(Boolean),
      attachments,
      draft,
    });
    setLocation("/hr/discipline-memos");
  }

  // Witness helpers
  function addWitness() {
    setWitnesses((prev) => [...prev, { type: "employee", search: "", selectedEmployee: null, externalName: "", externalTitle: "" }]);
  }
  function removeWitness(i: number) {
    setWitnesses((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateWitness(i: number, patch: Partial<Witness>) {
    setWitnesses((prev) => prev.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }

  return (
    <CreatePageLayout title="تسجيل مخالفة" backPath="/hr/violations">
      <div className="max-w-2xl mx-auto space-y-4 pb-24" dir="rtl">
        <StepIndicator current={openStep} completed={completed} />

        {/* ── Step 1: Incident ── */}
        <AccordionPanel
          open={openStep === 0}
          locked={false}
          title="الواقعة"
          summary={step1Done ? `${incidentDate} · ${INCIDENT_TYPES.find((t) => t.value === incidentType)?.label}` : undefined}
          onEdit={() => setOpenStep(0)}
        >
          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>تاريخ الواقعة <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                max={today}
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="text-right"
              />
            </div>
            <div className="space-y-1">
              <Label>تاريخ الإنشاء</Label>
              <Input value={today} readOnly className="bg-gray-50 text-right" />
            </div>
          </div>

          {/* Incident type cards */}
          <div className="space-y-2">
            <Label>نوع الحادثة <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-4 gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setIncidentType(t.value)}
                  className={cn(
                    "p-2 rounded-lg border-2 text-center text-xs transition-all",
                    incidentType === t.value
                      ? "border-blue-500 bg-blue-50 font-semibold"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <div className="text-lg mb-1">{t.icon}</div>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic fields */}
          {(incidentType === "late" || incidentType === "early_leave") && (
            <div className="space-y-1">
              <Label>مدة التأخر / المغادرة (دقيقة)</Label>
              <Input
                type="number"
                min={1}
                value={minutesDuration}
                onChange={(e) => setMinutesDuration(e.target.value)}
                className="text-right w-40"
              />
            </div>
          )}
          {incidentType === "late" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="disrupted"
                checked={disruptedOthers}
                onCheckedChange={(v) => setDisruptedOthers(!!v)}
              />
              <Label htmlFor="disrupted">هل عطّل عمالاً آخرين؟</Label>
            </div>
          )}
          {incidentType === "absence" && (
            <div className="space-y-1">
              <Label>عدد أيام الغياب</Label>
              <Input
                type="number"
                min={1}
                value={daysAbsent}
                onChange={(e) => setDaysAbsent(e.target.value)}
                className="text-right w-40"
              />
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <Label>الوصف <span className="text-red-500">*</span></Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 text-right"
              placeholder="وصف تفصيلي للواقعة…"
            />
          </div>

          <Button
            type="button"
            disabled={!step1Done}
            onClick={() => { if (step1Done) setOpenStep(1); }}
            className="w-full"
          >
            التالي — الموظف
          </Button>
        </AccordionPanel>

        {/* ── Step 2: Employee ── */}
        <AccordionPanel
          open={openStep === 1}
          locked={!step1Done}
          title="الموظف"
          summary={employee ? `${employee.name} · ${employee.jobTitle}` : undefined}
          onEdit={() => step1Done && setOpenStep(1)}
        >
          <div className="space-y-1">
            <Label>بحث عن موظف <span className="text-red-500">*</span></Label>
            <EmployeeSearch
              value={employee?.name || ""}
              onSelect={(emp) => setEmployee(emp)}
            />
          </div>

          {employee && (
            <div className="p-3 bg-gray-50 rounded-lg border space-y-1 text-sm">
              <div className="font-semibold text-base">{employee.name}</div>
              <div className="text-gray-500">#{employee.employeeNumber} · {employee.jobTitle}</div>
              <div className="text-gray-500">{employee.branch}</div>
            </div>
          )}

          <Button
            type="button"
            disabled={!step2Done}
            onClick={() => { if (step2Done) setOpenStep(2); }}
            className="w-full"
          >
            التالي — اللائحة والجزاء
          </Button>
        </AccordionPanel>

        {/* ── Step 3: Regulation & Penalty ── */}
        <AccordionPanel
          open={openStep === 2}
          locked={!step2Done}
          title="اللائحة والجزاء"
          summary={preview ? preview.regulationTitle : undefined}
          onEdit={() => step2Done && setOpenStep(2)}
        >
          {previewLoading && (
            <div className="space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-4 gap-2">
                {[0,1,2,3].map((i) => <Skeleton key={i} className="h-16" />)}
              </div>
              <Skeleton className="h-20" />
            </div>
          )}

          {!previewLoading && isManual && regulations.length > 0 && !preview && (
            <div className="space-y-2">
              <Label>اختر مادة اللائحة</Label>
              <div className="space-y-2">
                {regulations.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setManualRegId(r.id)}
                    className={cn(
                      "w-full text-right px-3 py-2 rounded-lg border text-sm transition-all",
                      manualRegId === r.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
              {manualRegId && (
                <Button type="button" className="w-full" onClick={() => {
                  setPreviewLoading(true);
                  setPreview(null);
                  penaltyMut.mutateAsync({
                    assignmentId: employee!.assignmentId,
                    incidentType,
                    regulationId: manualRegId,
                    ...(minutesDuration ? { minutesDuration: Number(minutesDuration) } : {}),
                  }).then((res: unknown) => setPreview(res as PenaltyPreview))
                    .catch(() => {})
                    .finally(() => setPreviewLoading(false));
                }}>
                  عرض الجزاء
                </Button>
              )}
            </div>
          )}

          {!previewLoading && preview && (
            <div className="space-y-4">
              {/* Regulation info */}
              <div className="p-3 bg-gray-50 rounded-lg border text-sm">
                <div className="font-semibold">{preview.regulationTitle}</div>
                <div className="text-gray-500 text-xs">{preview.regulationSection}</div>
              </div>

              {/* Occurrence warning */}
              {preview.occurrenceCount >= 2 && (
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-lg text-sm font-medium",
                  preview.occurrenceCount >= 3 ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200",
                )}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {preview.occurrenceCount >= 3 ? `مخالفة متكررة — المرة ${preview.occurrenceCount}` : "مخالفة سابقة مسجلة — المرة الثانية"}
                </div>
              )}

              {/* Warning / Termination badges */}
              {preview.warningOnly && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                  إنذار فقط — لا يوجد خصم مالي
                </Badge>
              )}
              {preview.isTermination && (
                <div className="p-3 bg-red-50 border border-red-400 rounded-lg text-red-700 font-semibold text-sm">
                  ⚠️ هذه المخالفة تستوجب الفصل من العمل ({preview.terminationType})
                </div>
              )}

              {/* Penalty breakdown */}
              {!preview.warningOnly && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "الأجر اليومي", val: preview.dailyWage },
                    { label: "الخصم الأساسي", val: preview.baseDeductionAmount },
                    { label: "الخصم الإضافي", val: preview.extraDeductionAmount },
                    { label: "إجمالي الخصم", val: preview.totalDeductionAmount, bold: true },
                  ].map((row) => (
                    <div key={row.label} className={cn("p-3 bg-gray-50 rounded-lg border", row.bold && "border-blue-300 bg-blue-50")}>
                      <div className="text-gray-500 text-xs">{row.label}</div>
                      <div className={cn("font-semibold", row.bold && "text-blue-700")}>
                        {row.val?.toLocaleString("ar")} {getCurrencySymbol()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual override */}
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">تعديل مبلغ الخصم يدوياً</summary>
                <div className="mt-2 space-y-2">
                  <Input
                    type="number"
                    placeholder="المبلغ البديل"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    className="text-right"
                  />
                  {overrideAmount && (
                    <Input
                      placeholder="سبب التعديل (مطلوب)"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-right"
                    />
                  )}
                </div>
              </details>
            </div>
          )}

          {!previewLoading && preview && (
            <Button type="button" className="w-full" onClick={() => setOpenStep(3)}>
              التالي — التوثيق
            </Button>
          )}
        </AccordionPanel>

        {/* ── Step 4: Documentation (always accessible once step3 unlocked) ── */}
        <AccordionPanel
          open={openStep === 3}
          locked={!step3Done}
          title="التوثيق"
          onEdit={() => step3Done && setOpenStep(3)}
        >
          {/* Witnesses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>الشهود</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addWitness}>
                <Plus className="h-3 w-3" /> إضافة شاهد
              </Button>
            </div>
            {witnesses.map((w, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateWitness(i, { type: "employee", selectedEmployee: null, search: "" })}
                      className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded border", w.type === "employee" ? "border-blue-400 bg-blue-50" : "border-gray-200")}
                    >
                      <UserCheck className="h-3 w-3" /> موظف
                    </button>
                    <button
                      type="button"
                      onClick={() => updateWitness(i, { type: "external" })}
                      className={cn("flex items-center gap-1 text-xs px-2 py-1 rounded border", w.type === "external" ? "border-blue-400 bg-blue-50" : "border-gray-200")}
                    >
                      <User className="h-3 w-3" /> خارجي
                    </button>
                  </div>
                  <button type="button" onClick={() => removeWitness(i)}>
                    <Trash2 className="h-4 w-4 text-red-400 hover:text-red-600" />
                  </button>
                </div>
                {w.type === "employee" ? (
                  <EmployeeSearch
                    value={w.selectedEmployee?.name || ""}
                    onSelect={(emp) => updateWitness(i, { selectedEmployee: emp, search: emp.name })}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="الاسم" value={w.externalName} onChange={(e) => updateWitness(i, { externalName: e.target.value })} className="text-right" />
                    <Input placeholder="المسمى الوظيفي" value={w.externalTitle} onChange={(e) => updateWitness(i, { externalTitle: e.target.value })} className="text-right" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Additional reasons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>أسباب إضافية</Label>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setAdditionalReasons((p) => [...p, ""])}>
                <Plus className="h-3 w-3" /> إضافة سبب
              </Button>
            </div>
            {additionalReasons.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={r}
                  onChange={(e) => setAdditionalReasons((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))}
                  placeholder={`السبب ${i + 1}`}
                  className="text-right"
                />
                <button type="button" onClick={() => setAdditionalReasons((p) => p.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>

          {/* File attachments */}
          <FileDropZone files={attachments} onFilesChange={setAttachments} label="مرفقات المخالفة (صور، مستندات)" />
        </AccordionPanel>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div className="fixed bottom-0 right-0 left-0 z-50 bg-white border-t shadow-lg px-6 py-3 flex justify-between items-center" dir="rtl">
        <Button type="button" variant="outline" onClick={() => setLocation("/hr/violations")}>إلغاء</Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!step1Done || createMut.isPending}
            onClick={() => handleSubmit(true)}
          >
            حفظ كمسودة
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || createMut.isPending || (!!overrideAmount && !overrideReason)}
            onClick={() => handleSubmit(false)}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {createMut.isPending ? "جاري التسجيل…" : "تسجيل المخالفة"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
