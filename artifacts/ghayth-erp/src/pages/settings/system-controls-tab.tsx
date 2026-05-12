import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SlidersHorizontal, CheckCircle, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FormShell } from "@/components/form-shell";

// The server stores controls under dotted keys (e.g.
// "approval.require_notes_on_reject"). react-hook-form treats dots
// in field names as nested paths, so we map dots → underscores for
// the form and back on submit. The schema mirrors the server's
// types: booleans for toggles, non-negative integers for numerics.
const systemControlsSchema = z.object({
  approval_require_notes_on_reject: z.boolean(),
  approval_require_notes_on_return: z.boolean(),
  approval_max_return_count: z.coerce.number().int().nonnegative(),
  approval_auto_escalate_hours: z.coerce.number().int().nonnegative(),
  system_allow_self_approval: z.boolean(),
  system_notifications_enabled: z.boolean(),
  system_attachment_max_size_mb: z.coerce.number().int().nonnegative(),
  system_attachment_max_count: z.coerce.number().int().nonnegative(),
});
type SystemControlsForm = z.infer<typeof systemControlsSchema>;

// Reverse map used both for default seeding and for submission.
const KEY_MAP: Record<keyof SystemControlsForm, string> = {
  approval_require_notes_on_reject: "approval.require_notes_on_reject",
  approval_require_notes_on_return: "approval.require_notes_on_return",
  approval_max_return_count: "approval.max_return_count",
  approval_auto_escalate_hours: "approval.auto_escalate_hours",
  system_allow_self_approval: "system.allow_self_approval",
  system_notifications_enabled: "system.notifications_enabled",
  system_attachment_max_size_mb: "system.attachment_max_size_mb",
  system_attachment_max_count: "system.attachment_max_count",
};

const SETTINGS_GROUPS = [
  {
    title: "إعدادات الموافقات",
    icon: CheckCircle,
    items: [
      { name: "approval_require_notes_on_reject" as const, label: "إلزام كتابة سبب عند الرفض", type: "toggle" as const },
      { name: "approval_require_notes_on_return" as const, label: "إلزام كتابة سبب عند الإرجاع", type: "toggle" as const },
      { name: "approval_max_return_count" as const, label: "الحد الأقصى لعدد مرات الإرجاع", type: "number" as const },
      { name: "approval_auto_escalate_hours" as const, label: "التصعيد التلقائي بعد (ساعة)", type: "number" as const },
      { name: "system_allow_self_approval" as const, label: "السماح بالموافقة الذاتية", type: "toggle" as const },
    ],
  },
  {
    title: "إعدادات النظام",
    icon: Settings2,
    items: [
      { name: "system_notifications_enabled" as const, label: "تفعيل الإشعارات", type: "toggle" as const },
      { name: "system_attachment_max_size_mb" as const, label: "حجم الملف الأقصى (ميجابايت)", type: "number" as const },
      { name: "system_attachment_max_count" as const, label: "عدد الملفات الأقصى لكل طلب", type: "number" as const },
    ],
  },
];

export function SystemControlsTab() {
  const { data, refetch, isLoading, isError, error } = useApiQuery<any>(["system-controls"], "/settings/system-controls");
  const { toast } = useToast();
  const controls = (data?.data || {}) as Record<string, unknown>;

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  // Hardcoded fallbacks match the previous useState defaults — if
  // the server hasn't seeded a row yet, the UI still shows sensible
  // values.
  const defaults: SystemControlsForm = {
    approval_require_notes_on_reject: (controls["approval.require_notes_on_reject"] as boolean) ?? true,
    approval_require_notes_on_return: (controls["approval.require_notes_on_return"] as boolean) ?? true,
    approval_max_return_count: Number(controls["approval.max_return_count"] ?? 3),
    approval_auto_escalate_hours: Number(controls["approval.auto_escalate_hours"] ?? 48),
    system_allow_self_approval: (controls["system.allow_self_approval"] as boolean) ?? false,
    system_notifications_enabled: (controls["system.notifications_enabled"] as boolean) ?? true,
    system_attachment_max_size_mb: Number(controls["system.attachment_max_size_mb"] ?? 5),
    system_attachment_max_count: Number(controls["system.attachment_max_count"] ?? 10),
  };
  const remountKey = JSON.stringify(defaults);

  const handleSave = async (values: SystemControlsForm) => {
    // Map underscored form keys back to the server's dotted keys.
    const payload: Record<string, unknown> = {};
    for (const [formKey, value] of Object.entries(values)) {
      payload[KEY_MAP[formKey as keyof SystemControlsForm]] = value;
    }
    try {
      await apiFetch("/settings/system-controls", { method: "PUT", body: JSON.stringify(payload) });
      toast({ title: "تم حفظ الإعدادات" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5" />
        التحكم بالنظام
      </h3>
      <FormShell
        key={remountKey}
        schema={systemControlsSchema}
        defaultValues={defaults}
        submitLabel="حفظ الإعدادات"
        onSubmit={async (values) => {
          await handleSave(values);
        }}
      >
        {SETTINGS_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <group.icon className="h-4 w-4" />
                {group.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm">{item.label}</span>
                  {item.type === "toggle" ? (
                    <ToggleControl name={item.name} />
                  ) : (
                    <NumberControl name={item.name} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </FormShell>
    </div>
  );
}

// Inline toggle bound to a boolean form field. Lives next to its
// label inside the per-row flex container, so the form-grid layout
// from FormShell doesn't apply — we drive it via useFormContext.
function ToggleControl({ name }: { name: keyof SystemControlsForm }) {
  const { setValue } = useFormContext<SystemControlsForm>();
  const value = useWatch<SystemControlsForm>({ name }) as boolean;
  return (
    <button
      type="button"
      onClick={() => setValue(name, !value, { shouldDirty: true })}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors",
        value ? "bg-green-500" : "bg-gray-300",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
          value ? "start-0.5" : "start-[22px]",
        )}
      />
    </button>
  );
}

// Inline number input bound to a numeric form field. Same reason as
// ToggleControl — same-row layout instead of the standard
// FormGrid → FormNumberField.
function NumberControl({ name }: { name: keyof SystemControlsForm }) {
  const { register } = useFormContext<SystemControlsForm>();
  return (
    <Input
      type="number"
      className="w-24 text-center"
      min={0}
      {...register(name, { valueAsNumber: true })}
    />
  );
}
