import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Badge } from "@/components/ui/badge";
import { Link2, X, Users, Crown } from "lucide-react";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { TextField, TextAreaField, DateField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "— بدون ربط —" },
  { value: "maintenance_request", label: "طلب صيانة" },
  { value: "property_unit", label: "وحدة عقارية" },
  { value: "vehicle", label: "مركبة" },
  { value: "client", label: "عميل" },
  { value: "contract", label: "عقد" },
  { value: "project", label: "مشروع" },
  { value: "legal_case", label: "قضية قانونية" },
];

interface TeamMember {
  /** employee_assignments.id */
  assignmentId: number;
  /** Display name resolved from the picker */
  name: string;
}

export default function TasksCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createMut = useApiMutation("/tasks", "POST", [["tasks"]]);
  const { data: clientsData, isLoading, isError } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const clients = clientsData?.data || [];
  // Active employee assignments — the picker resolves names to assignmentIds
  // so the API payload can use the canonical primary key instead of name
  // strings. `?limit=500` matches the convention used by other HR create
  // pages (loans, overtime, exit).
  const { data: employeesData } = useApiQuery<{ data: any[] }>(
    ["employees-list-for-task"],
    "/employees?limit=500",
  );
  const employees = employeesData?.data || [];
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const [entitySearch, setEntitySearch] = useState("");
  // The assignee team — first row is the "accountable owner" (primary),
  // rest are members. Empty array = self-assign fallback on the server.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [pickerValue, setPickerValue] = useState<string>("");

  const getInitial = () => {
    const copy = searchParams.get("copy");
    if (copy) {
      try {
        const data = JSON.parse(copy);
        return { title: data.title || "", description: data.description || "", type: data.type || "task", priority: data.priority || "medium", scheduledStart: "", scheduledEnd: "", clientName: data.clientName || "", notes: data.notes || "", linkedEntityType: "", linkedEntityId: "" };
      } catch { /* ignore */ }
    }
    return {
      title: searchParams.get("title") || "",
      description: "",
      type: searchParams.get("type") || "task",
      priority: searchParams.get("priority") || "medium",
      scheduledStart: "",
      scheduledEnd: "",
      clientName: "",
      notes: "",
      linkedEntityType: searchParams.get("linkedEntityType") || "",
      linkedEntityId: searchParams.get("linkedEntityId") || "",
    };
  };

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("tasks_create", getInitial());

  const { data: entityResults, isLoading: entityLoading } = useApiQuery<any>(
    ["entity-search", form.linkedEntityType, entitySearch],
    `/tasks/entity-search?type=${form.linkedEntityType}&q=${encodeURIComponent(entitySearch)}`,
    !!form.linkedEntityType
  );
  const entityOptions: AutocompleteOption[] = (Array.isArray(entityResults) ? entityResults : []).map((item: any) => ({
    value: String(item.id),
    label: item.name || item.unitNumber || item.title || item.plateNumber || item.ref || item.description || `#${item.id}`,
    subtitle: item.category || item.email || item.phone || undefined,
  }));

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      title: form.title.trim() ? null : "يرجى إدخال عنوان المهمة",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    // Build the canonical multi-assignee payload. If the user picked a
    // team, send the new `assignees: [assignmentId,...]` array (first
    // element becomes primary). If they didn't pick anyone, omit both
    // fields and let the server default to self-assign.
    const payload: any = { ...form };
    if (team.length > 0) {
      payload.assignees = team.map((m) => m.assignmentId);
      // Don't send the legacy `assignedTo` — the server gives precedence
      // to `assignees` anyway, but omitting prevents server-side warnings.
      delete payload.assignedTo;
    }
    if (!payload.linkedEntityType) {
      delete payload.linkedEntityType;
      delete payload.linkedEntityId;
    } else if (payload.linkedEntityId) {
      payload.linkedEntityId = Number(payload.linkedEntityId);
      if (!Number.isFinite(payload.linkedEntityId) || payload.linkedEntityId <= 0) {
        toast({ variant: "destructive", title: "يرجى اختيار الكيان المرتبط" });
        return;
      }
    } else {
      toast({ variant: "destructive", title: "يرجى اختيار الكيان المرتبط أو إزالة نوع الربط" });
      return;
    }
    try {
      await createMut.mutateAsync(payload);
      clearDraft();
      toast({ title: "تم إنشاء المهمة بنجاح" });
      setLocation("/tasks");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء المهمة", description: err?.fix ?? err?.message });
    }
  };

  return (
    <CreatePageLayout title="مهمة جديدة" backPath="/tasks">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المنشئ" value={user?.name || "-"} />
        <CreationDateField />
      </div>

      {/* Team picker — empty team falls back to self-assign on the server. */}
      <div className="border rounded-lg p-4 mb-6 bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-semibold">المكلَّفون (فريق المهمة)</Label>
          <Badge variant="secondary" className="text-xs">
            {team.length === 0
              ? "بدون تكليف (سيُسند للمنشئ)"
              : `${team.length} ${team.length === 1 ? "موظف" : "أعضاء"}`}
          </Badge>
        </div>
        {team.length > 0 && (
          <ul className="space-y-2 mb-3">
            {team.map((member, idx) => (
              <li
                key={member.assignmentId}
                className="flex items-center justify-between gap-2 bg-background border rounded px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  {idx === 0 ? (
                    <Badge variant="default" className="gap-1">
                      <Crown className="h-3 w-3" />
                      رئيسي
                    </Badge>
                  ) : (
                    <Badge variant="outline">عضو</Badge>
                  )}
                  <span>{member.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`إزالة ${member.name} من الفريق`}
                  onClick={() =>
                    setTeam((t) => t.filter((m) => m.assignmentId !== member.assignmentId))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FormFieldWrapper label={team.length === 0 ? "اختر المكلَّف الرئيسي" : "أضف عضواً للفريق"}>
          <Autocomplete
            options={employees
              .filter((e: any) => !team.some((m) => m.assignmentId === e.activeAssignmentId))
              .map((e: any) => ({
                value: String(e.activeAssignmentId ?? e.id),
                label: e.name,
                subtitle: e.jobTitle ?? e.email ?? undefined,
              }))}
            value={pickerValue}
            onChange={(val) => {
              if (!val) return;
              const id = Number(val);
              const emp = employees.find(
                (e: any) => Number(e.activeAssignmentId ?? e.id) === id,
              );
              if (!emp) return;
              setTeam((t) => [...t, { assignmentId: id, name: emp.name }]);
              setPickerValue("");
            }}
            placeholder="ابحث باسم الموظف..."
            emptyMessage="لا يوجد موظفون مطابقون"
          />
        </FormFieldWrapper>
        <p className="text-xs text-muted-foreground mt-2">
          الموظف الأول في القائمة هو المسؤول الرئيسي. باقي الأعضاء يستلمون
          المهمة كأعضاء فريق ويمكنهم متابعتها.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField label="العنوان" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} error={fieldErrors.title} />
        <FormFieldWrapper label="النوع">
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="task">مهمة عامة</SelectItem>
              <SelectItem value="meeting">اجتماع</SelectItem>
              <SelectItem value="call">مكالمة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="الأولوية">
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">منخفضة</SelectItem>
              <SelectItem value="medium">متوسطة</SelectItem>
              <SelectItem value="high">عالية</SelectItem>
              {/* "critical" mirrors the backend createTaskSchema enum
                  (low|medium|high|critical). Without this option the
                  UI couldn't ever raise a task to the highest urgency
                  the engine understands. */}
              <SelectItem value="critical">حرجة</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <DateField label="موعد البداية" mode="datetime" value={form.scheduledStart} onChange={(v) => setForm((f) => ({ ...f, scheduledStart: v }))} />
        {/* scheduledEnd lets the operator define a window (e.g. SLA
            deadline) instead of just a start point. The backend
            already accepts the field; the form just exposes it. */}
        <DateField label="موعد النهاية" mode="datetime" value={form.scheduledEnd} onChange={(v) => setForm((f) => ({ ...f, scheduledEnd: v }))} />
        <FormFieldWrapper label="العميل">
          <Select value={form.clientName || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientName: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— بدون عميل —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— بدون عميل —</SelectItem>
              {clients.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <TextAreaField label="الوصف" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} rows={3} className="md:col-span-2" />
        {/* notes is the operator's private follow-up scratchpad —
            distinct from the description (which is shared with the
            assignee). The backend already persists it; the form just
            surfaces it so operators don't lose context after creation. */}
        <TextAreaField label="ملاحظات داخلية" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} rows={2} className="md:col-span-2" />

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base font-semibold">ربط بكيان (اختياري)</Label>
            {form.linkedEntityType && (
              <Badge variant="secondary" className="text-xs">
                {ENTITY_TYPE_OPTIONS.find(o => o.value === form.linkedEntityType)?.label}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormFieldWrapper label="نوع الكيان">
              <Select value={form.linkedEntityType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, linkedEntityType: v === "_none" ? "" : v, linkedEntityId: "" }))}>
                <SelectTrigger><SelectValue placeholder="— بدون ربط —" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value || "_none"} value={opt.value || "_none"}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
            {form.linkedEntityType && (
              <FormFieldWrapper label="اختر الكيان">
                <Autocomplete
                  options={entityOptions}
                  value={form.linkedEntityId}
                  onChange={(val) => setForm((f) => ({ ...f, linkedEntityId: String(val || "") }))}
                  placeholder="ابحث عن الكيان..."
                  loading={entityLoading}
                  emptyMessage={entityLoading ? "جاري التحميل..." : "لا توجد نتائج — تأكد من إضافة كيانات من هذا النوع أولاً"}
                  className="mt-1"
                />
              </FormFieldWrapper>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/tasks")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
