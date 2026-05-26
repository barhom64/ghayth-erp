import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, apiFetch } from "@/lib/api";
import {
  FormShell,
  FormSelectField,
  FormTextField,
  FormDateField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Gavel,
  Calculator,
  History,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * HR / Discipline — create-memo dialog.
 *
 * Phase D / HR gap. Closes 3 unused-backend endpoints in one
 * dialog the violations page never had:
 *
 *   POST /hr/discipline/memos
 *     → Create a discipline memo for an employee. The
 *       previous violations.tsx had only the "empty state
 *       hint" text but no actual create button. Memos were
 *       created exclusively via the auto-detection sweep or
 *       through manual SQL.
 *
 *   POST /hr/discipline/penalty-preview
 *     → Live preview of the penalty the regulation engine
 *       would apply, given the same inputs the create
 *       endpoint takes. Lets the manager see "this incident
 *       → 1-day deduction + final warning" BEFORE filing,
 *       which surfaces edge cases (repeat offender →
 *       termination) early.
 *
 *   GET  /hr/discipline/employee/:employeeId/summary
 *     → Sidebar in the dialog showing the employee's YTD
 *       violation count, pending memos, and the running
 *       deduction total. Critical context for the operator
 *       — a third minor violation triggers stronger
 *       penalties under the Saudi labor regulation.
 */

const INCIDENT_TYPE_OPTIONS = [
  { value: "late", label: "تأخر" },
  { value: "early_leave", label: "مغادرة مبكرة" },
  { value: "absence", label: "غياب" },
  { value: "behavior", label: "سلوك" },
  { value: "organization", label: "تنظيم" },
  { value: "gps_out_of_range", label: "خروج GPS" },
  { value: "custom", label: "مخصّص" },
];

const createMemoSchema = z.object({
  assignmentId: z.coerce.number().int().positive("اختر الموظف"),
  incidentType: z.enum([
    "late",
    "early_leave",
    "absence",
    "behavior",
    "organization",
    "gps_out_of_range",
    "custom",
  ]),
  incidentDate: z.string().min(1, "تاريخ الواقعة مطلوب"),
  incidentDurationMinutes: z.coerce.number().optional(),
  absenceDays: z.coerce.number().optional(),
  incidentDescription: z.string().optional(),
  disruptsOthers: z.boolean().optional(),
});
type CreateMemoForm = z.infer<typeof createMemoSchema>;

interface EmployeeListRow {
  id: number;
  name: string;
  activeAssignmentId: number | null;
  empNumber?: string | null;
}

interface PenaltyResolution {
  penaltyLabel: string;
  deductionAmount: number;
  extraDeduction: number;
  occurrenceCount: number;
  isTermination: boolean;
  regulationArticle?: string | null;
  reasoning?: string | null;
}

interface PenaltyPreview {
  dailyWage: number;
  resolution: PenaltyResolution;
}

interface EmployeeSummary {
  totalActive: number;
  pending: number;
  approved: number;
  ytdCount: number;
  ytdDeductions: number;
  currentEscalation: number;
  terminations: number;
}

export function CreateMemoDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const mut = useApiMutation<unknown, CreateMemoForm>(
    "/hr/discipline/memos",
    "POST",
    [["discipline-memos"], ["discipline-memos-stats"]],
    { successMessage: "تم إنشاء محضر المخالفة", onSuccess: () => onCreated() },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-4 w-4" />
            محضر مخالفة جديد
          </DialogTitle>
        </DialogHeader>
        <FormShell
          schema={createMemoSchema}
          defaultValues={{
            assignmentId: 0,
            incidentType: "late",
            incidentDate: todayLocal(),
            incidentDurationMinutes: undefined,
            absenceDays: undefined,
            incidentDescription: "",
            disruptsOthers: false,
          }}
          submitLabel="حفظ المحضر"
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await mut.mutateAsync(values);
          }}
        >
          <MemoBody />
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}

function MemoBody() {
  const { watch, setValue } = useFormContext<CreateMemoForm>();
  const assignmentId = watch("assignmentId");
  const incidentType = watch("incidentType");
  const showDuration = incidentType === "late" || incidentType === "early_leave";
  const showAbsence = incidentType === "absence";

  // Load employees to populate the picker. Same /employees endpoint
  // every other HR form uses; activeAssignmentId is the value we need.
  const { data: empData } = useApiQuery<{ data: EmployeeListRow[] }>(
    ["employees-list"],
    "/employees?limit=500",
  );
  const employees = empData?.data ?? [];

  // Resolve the selected assignmentId back to its employeeId so we can
  // fetch the per-employee violations summary card.
  const selectedEmployee = useMemo(
    () => employees.find((e) => e.activeAssignmentId === assignmentId),
    [employees, assignmentId],
  );
  const selectedEmployeeId = selectedEmployee?.id ?? null;

  return (
    <>
      <FormGrid cols={2}>
        <FormSelectField
          name="assignmentId"
          label="الموظف"
          required
          options={[
            { value: "0", label: "اختر الموظف" },
            ...employees.map((e) => ({
              value: String(e.activeAssignmentId ?? e.id),
              label: e.empNumber ? `${e.name} (${e.empNumber})` : e.name,
            })),
          ]}
        />
        <FormSelectField
          name="incidentType"
          label="نوع الواقعة"
          required
          options={INCIDENT_TYPE_OPTIONS}
        />
      </FormGrid>

      <FormGrid cols={2}>
        <FormDateField name="incidentDate" label="تاريخ الواقعة" required />
        {showDuration && (
          <FormTextField
            name="incidentDurationMinutes"
            label="المدة (دقائق)"
            type="number"
          />
        )}
        {showAbsence && (
          <FormTextField name="absenceDays" label="أيام الغياب" type="number" />
        )}
      </FormGrid>

      <FormTextareaField name="incidentDescription" label="وصف الواقعة" rows={3} />

      <DisruptsOthersSwitch />

      {selectedEmployeeId && <EmployeeViolationHistory employeeId={selectedEmployeeId} />}

      <PenaltyPreviewCard />
    </>
  );
}

function DisruptsOthersSwitch() {
  const { watch, setValue } = useFormContext<CreateMemoForm>();
  const value = watch("disruptsOthers");
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <Label className="text-sm font-medium">الواقعة أعاقت موظفين آخرين</Label>
        <p className="text-xs text-muted-foreground">
          يرفع شدة الجزاء حسب اللائحة (مادة تنظيم العمل)
        </p>
      </div>
      <Switch
        checked={!!value}
        onCheckedChange={(v) => setValue("disruptsOthers", v, { shouldDirty: true })}
      />
    </div>
  );
}

function EmployeeViolationHistory({ employeeId }: { employeeId: number }) {
  const { data, isLoading, error } = useApiQuery<{
    stats: EmployeeSummary;
    recent: Array<{ id: number; memoNumber: string; incidentType: string; status: string; createdAt: string }>;
  }>(
    ["discipline-employee-summary", String(employeeId)],
    `/hr/discipline/employee/${employeeId}/summary`,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-3 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline me-2" />
          تحميل سجل المخالفات...
        </CardContent>
      </Card>
    );
  }
  if (error || !data) return null;

  const stats = data.stats;
  const isRepeatOffender = stats.ytdCount >= 2;

  return (
    <Card className={isRepeatOffender ? "border-status-warning-surface" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4" />
          سجل الموظف خلال السنة الحالية
          {isRepeatOffender && (
            <Badge variant="destructive" className="ms-2 text-xs">
              مخالف متكرر
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Stat label="عدد المحاضر" value={String(stats.ytdCount ?? 0)} />
          <Stat label="بانتظار البت" value={String(stats.pending ?? 0)} />
          <Stat label="معتمدة" value={String(stats.approved ?? 0)} />
          <Stat
            label="خصومات السنة"
            value={formatCurrency(Number(stats.ytdDeductions ?? 0))}
          />
        </div>
        {stats.currentEscalation > 0 && (
          <p className="text-xs text-status-warning-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            مستوى التصعيد الحالي: {stats.currentEscalation} — قد يستحق المحضر التالي عقوبة أشد
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-surface-subtle p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
    </div>
  );
}

function PenaltyPreviewCard() {
  const { watch } = useFormContext<CreateMemoForm>();
  const values = watch();
  const [preview, setPreview] = useState<PenaltyPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Debounced auto-preview whenever the four key fields fill in.
  // Avoids hammering the endpoint on every keystroke — fires 600 ms
  // after the last edit.
  const previewKey = useMemo(
    () =>
      `${values.assignmentId}|${values.incidentType}|${values.incidentDate}|${
        values.incidentDurationMinutes ?? ""
      }|${values.absenceDays ?? ""}|${values.disruptsOthers ?? false}`,
    [values],
  );

  useEffect(() => {
    if (!values.assignmentId || !values.incidentType || !values.incidentDate) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await apiFetch<PenaltyPreview>(
          "/hr/discipline/penalty-preview",
          {
            method: "POST",
            body: JSON.stringify({
              assignmentId: values.assignmentId,
              incidentType: values.incidentType,
              incidentDate: values.incidentDate,
              durationMinutes: values.incidentDurationMinutes,
              absenceDays: values.absenceDays,
              disruptsOthers: values.disruptsOthers,
            }),
          },
        );
        if (!cancelled) setPreview(result);
      } catch (e: any) {
        if (!cancelled) {
          toast({ title: "تعذر معاينة الجزاء", description: e.message, variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  if (!values.assignmentId || !values.incidentType || !values.incidentDate) return null;

  return (
    <Card className={preview?.resolution.isTermination ? "border-status-error-surface" : ""}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calculator className="h-4 w-4" />
          معاينة الجزاء المتوقع
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        {preview && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">العقوبة:</span>
              <Badge variant={preview.resolution.isTermination ? "destructive" : "default"}>
                {preview.resolution.penaltyLabel}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الأجر اليومي:</span>
              <span className="font-mono">{formatCurrency(Number(preview.dailyWage))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">الخصم:</span>
              <span className="font-semibold">
                {formatCurrency(Number(preview.resolution.deductionAmount))}
              </span>
            </div>
            {Number(preview.resolution.extraDeduction) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">خصم إضافي:</span>
                <span className="text-status-error-foreground font-semibold">
                  {formatCurrency(Number(preview.resolution.extraDeduction))}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">رقم التكرار للسنة:</span>
              <Badge variant="outline">{preview.resolution.occurrenceCount}</Badge>
            </div>
            {preview.resolution.isTermination && (
              <p className="text-xs text-status-error-foreground flex items-center gap-1 pt-1 border-t">
                <AlertTriangle className="h-3 w-3" />
                هذا المحضر يستحق إنهاء خدمة بحسب اللائحة. الحفظ سيرفع للاعتماد الرسمي.
              </p>
            )}
            {preview.resolution.regulationArticle && (
              <p className="text-xs text-muted-foreground pt-1 border-t">
                المرجع: {preview.resolution.regulationArticle}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
