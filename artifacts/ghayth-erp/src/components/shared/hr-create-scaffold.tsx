/**
 * HR-Wave-1 / step A — HR Create Scaffold (Canonical Layout).
 *
 * Wraps every HR create form in the doctrine-mandated section order:
 *
 *   H0  ActiveContextGate           (inherited from CreatePageLayout)
 *   H1  EmployeeSelect              (smart employee picker)
 *   H2  employee-context-card       (360° card)
 *   H3  Assignment select           (CONDITIONAL on follows="assignment")
 *   H4  Operation fields            (slotted by caller — uses AutoField)
 *   H5  Historical context          (slotted — caller pulls from hrEngine)
 *   H6  ImpactPreview               (slotted — wraps existing components)
 *   H7  Approval chain hint         (slotted — from workflowEngine)
 *   --  Save button + dirty state   (handled here)
 *   H8  After-save effects          (caller's onSuccess fires events)
 *
 * Reuse, not invent: every section is composed from existing
 * components. The scaffold contains ZERO business logic — it's pure
 * orchestration. Callers pass slot props for sections that vary
 * (the operation fields, the historical context query, the impact
 * preview payload), and the scaffold renders them in the canonical
 * order with consistent spacing + labels.
 *
 * The "follows the person" vs "follows the assignment" doctrine is
 * surfaced as a single `follows` prop:
 *   - "person" → H3 hidden, assignmentId emitted as null (leave/excuse/
 *     personal-documents — affect ALL of the employee's assignments).
 *   - "assignment" → H3 shown, the picker forces the operator to bind
 *     the record to ONE assignment (attendance/payroll/violation/
 *     overtime — per-assignment scoped).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmployeeSelect } from "@/components/shared/entity-selects";
import { EmployeeContextCard, type EmployeeContextSection } from "@/components/shared/employee-context-card";
import { PermissionGate } from "@/components/shared/permission-gate";
import { Briefcase, History, Workflow, Eye, Sparkles, AlertTriangle, User } from "lucide-react";

export type FollowsAxis = "person" | "assignment";

/**
 * Assignment row shape returned by GET /employees/:id/assignments —
 * matches the shape consumed by every HR form today, kept here so the
 * scaffold doesn't import a per-form type.
 */
export interface EmployeeAssignment {
  id: number;
  companyId: number;
  branchId: number | null;
  branchName?: string;
  role?: string;
  status?: string;
  jobTitle?: string;
}

export interface HrCreateScaffoldProps {
  /** Follows axis — controls whether H3 (assignment selector) renders. */
  follows: FollowsAxis;
  /** Current employee id (controlled). */
  employeeId: string;
  onEmployeeChange: (id: string) => void;
  /** Current assignment id (controlled). Required when follows="assignment". */
  assignmentId?: string;
  /** Optional 360-card emphasis section. */
  contextSection?: EmployeeContextSection;
  /** When set, all sensitive content + the save button hide behind a permission gate. */
  sensitivePerm?: string | string[];
  /**
   * The selected employee row (from the caller's /employees list).
   * When follows="assignment" and no custom assignmentSelectorSlot is
   * given, the scaffold renders its built-in auto-bind badge from this
   * row: «تعيين #N · فرع · مسمى — مُحدَّد تلقائياً», or a blocker card
   * when the employee has no active assignment. Single-assignment
   * shops therefore pass ONLY this prop; multi-assignment shops
   * override via assignmentSelectorSlot.
   */
  selectedEmployee?: {
    activeAssignmentId?: number | string | null;
    assignmentId?: number | string | null;
    branchName?: string | null;
    jobTitle?: string | null;
  } | null;
  /**
   * H3 — OPTIONAL custom assignment selector (multi-assignment shops
   * render a dropdown that writes into assignmentId). When omitted,
   * the scaffold's DefaultAssignmentBadge takes over using
   * selectedEmployee + assignmentId. The scaffold owns the section
   * header + the "follows requires this" gate either way.
   */
  assignmentSelectorSlot?: React.ReactNode;
  /** H4 — operation fields. The caller renders form rows here. */
  detailsSlot: React.ReactNode;
  /** H5 — historical context (balances / past records / overlap warnings). */
  historicalContextSlot?: React.ReactNode;
  /** H6 — impact preview (LiveImpactPreview / ImpactPreviewButton). */
  impactPreviewSlot?: React.ReactNode;
  /** H7 — approval chain hint (workflowEngine output). */
  approvalChainSlot?: React.ReactNode;
  /** Submit handler — caller does the actual mutation. */
  onSubmit: () => void;
  /** Saving state — disables the save button. */
  saving?: boolean;
  /** Save button label override. */
  saveLabel?: string;
  /** When the form has uncommitted edits, disables save tooltip + warns on back-nav. */
  isDirty?: boolean;
}

export function HrCreateScaffold({
  follows,
  employeeId,
  onEmployeeChange,
  assignmentId,
  contextSection,
  sensitivePerm,
  selectedEmployee,
  assignmentSelectorSlot,
  detailsSlot,
  historicalContextSlot,
  impactPreviewSlot,
  approvalChainSlot,
  onSubmit,
  saving = false,
  saveLabel = "حفظ",
  isDirty = false,
}: HrCreateScaffoldProps) {
  // Single source of truth for the «follows the assignment» branch.
  // Every H3-conditional render below derives from this — avoids the
  // bug class where two copies of the condition drift apart.
  const needAssignments = follows === "assignment";

  const canSubmit =
    !!employeeId &&
    (follows === "person" || !!assignmentId) &&
    !saving;

  const body = (
    <div className="space-y-4">
      {/* H1 — اختيار الموظف */}
      <SectionHeader icon={<User className="w-4 h-4" />} label="١. الموظف" />
      <EmployeeSelect
        value={employeeId}
        onChange={onEmployeeChange}
        required
        label="اختر الموظف"
      />

      {/* H2 — بطاقة سياق ٣٦٠ */}
      {employeeId && (
        <>
          <SectionHeader icon={<User className="w-4 h-4" />} label="٢. سياق الموظف" />
          <EmployeeContextCard
            employeeId={employeeId}
            section={contextSection}
          />
        </>
      )}

      {/* H3 — اختيار التعيين (مشروط على follows="assignment").
          Default: the scaffold's own auto-bind badge (single-assignment
          shops); multi-assignment shops override via the slot. */}
      {employeeId && needAssignments && (
        <>
          <SectionHeader icon={<Briefcase className="w-4 h-4" />} label="٣. التعيين" />
          {assignmentSelectorSlot ?? (
            <DefaultAssignmentBadge
              employee={selectedEmployee}
              assignmentId={assignmentId}
            />
          )}
        </>
      )}

      {/* H4 — تفاصيل العملية (slot) */}
      {employeeId && (follows === "person" || assignmentId) && (
        <>
          <SectionHeader icon={<Sparkles className="w-4 h-4" />} label="٤. التفاصيل" />
          <div>{detailsSlot}</div>
        </>
      )}

      {/* H5 — السياق التاريخي (slot, optional) */}
      {historicalContextSlot && (
        <>
          <SectionHeader icon={<History className="w-4 h-4" />} label="٥. السياق التاريخي" />
          {historicalContextSlot}
        </>
      )}

      {/* H6 — معاينة الأثر (slot, optional) */}
      {impactPreviewSlot && (
        <>
          <SectionHeader icon={<Eye className="w-4 h-4" />} label="٦. معاينة الأثر قبل الحفظ" />
          {impactPreviewSlot}
        </>
      )}

      {/* H7 — سلسلة الاعتماد (slot, optional) */}
      {approvalChainSlot && (
        <>
          <SectionHeader icon={<Workflow className="w-4 h-4" />} label="٧. سلسلة الاعتماد" />
          {approvalChainSlot}
        </>
      )}

      {/* Save */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        {isDirty && (
          <Badge variant="outline" className="bg-amber-50 text-amber-700">
            تغييرات غير محفوظة
          </Badge>
        )}
        <Button onClick={onSubmit} disabled={!canSubmit}>
          {saving ? "جارٍ الحفظ..." : saveLabel}
        </Button>
      </div>
    </div>
  );

  // When the form deals with sensitive surfaces (payroll, discipline,
  // termination), the whole scaffold sits behind a permission gate so
  // a UI bug can't even render the controls to an unauthorized user.
  // Backend authorize() still enforces — the gate is belt-and-braces.
  if (sensitivePerm) {
    return (
      <PermissionGate
        perm={sensitivePerm}
        fallback={<RestrictedFallback />}
      >
        {body}
      </PermissionGate>
    );
  }
  return body;
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90 pt-2">
      {icon}
      <span>{label}</span>
    </div>
  );
}

/**
 * Built-in H3 body for single-assignment shops (the default — Wave-1/B
 * group 2 moved this here from the per-form copies in group 1). Shows
 * which assignment the record will bind to, or a blocker card when the
 * selected employee has no active assignment. Multi-assignment shops
 * override via assignmentSelectorSlot with a real dropdown.
 */
function DefaultAssignmentBadge({
  employee,
  assignmentId,
}: {
  employee?: HrCreateScaffoldProps["selectedEmployee"];
  assignmentId?: string;
}) {
  const id = assignmentId || employee?.activeAssignmentId || employee?.assignmentId;
  if (!id) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 p-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <div>
            <p className="font-medium">لا يوجد تعيين فعّال لهذا الموظف.</p>
            <p className="text-xs text-muted-foreground mt-1">
              هذه العملية تتبع التعيين — لا يمكن تسجيلها بدون تعيين قائم.
              راجع ملف الموظف لإضافة تعيين أو ابدأ بإجراء «نقل/تكليف» أولاً.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
      <span>تعيين #{String(id)}</span>
      {employee?.branchName && <span>· فرع: {employee.branchName}</span>}
      {employee?.jobTitle && <span>· {employee.jobTitle}</span>}
      <span className="ms-auto text-emerald-600">مُحدَّد تلقائياً</span>
    </div>
  );
}

function RestrictedFallback() {
  return (
    <Card>
      <CardContent className="flex items-start gap-2 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" />
        <div>
          <p className="font-medium">هذه الشاشة تتطلب صلاحية إضافية.</p>
          <p className="text-xs mt-1">
            تواصل مع مدير النظام إذا كنت تحتاج الوصول إلى هذه العملية.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
