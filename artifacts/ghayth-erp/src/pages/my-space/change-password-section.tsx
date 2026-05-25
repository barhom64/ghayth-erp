import { useState } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { apiFetch, isRateLimitedError } from "@/lib/api";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Eye, EyeOff, Lock } from "lucide-react";
import { FormShell } from "@workspace/ui-core";

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
    newPw: z.string().min(6, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"),
    confirmPw: z.string().min(1, "تأكيد كلمة المرور مطلوب"),
  })
  .refine((v) => v.newPw === v.confirmPw, {
    message: "كلمة المرور الجديدة وتأكيدها غير متطابقتين",
    path: ["confirmPw"],
  });
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

// Inline password field with toggleable eye icon. FormPasswordField from
// ui-core doesn't ship a show/hide toggle, so this component wraps a
// Controller + raw Input + button to keep the legacy UX intact.
function PasswordFieldWithToggle({
  name,
  label,
}: {
  name: "current" | "newPw" | "confirmPw";
  label: string;
}) {
  const { control, formState } = useFormContext<ChangePasswordForm>();
  const [show, setShow] = useState(false);
  const error = formState.errors[name]?.message as string | undefined;
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
      <div className="relative">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Input
              type={show ? "text" : "password"}
              dir="ltr"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <button
          type="button"
          className="absolute end-2 top-1/2 -translate-y-1/2"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
        </button>
      </div>
      {error && <p className="text-xs text-status-error-foreground mt-1">{error}</p>}
    </div>
  );
}

// Submit button reads form state + rate-limit cooldown to render the
// existing "loading / cooldown / idle" tri-state label. Lives inside
// FormShell as a custom footer instead of FormShell's default submit so
// the legacy disabled-when-empty + cooldown text + full-width style
// survive.
function SubmitButton({ cooldownLabel, isCoolingDown }: { cooldownLabel: string; isCoolingDown: boolean }) {
  const { formState, watch } = useFormContext<ChangePasswordForm>();
  const v = watch();
  const allFilled = !!v.current && !!v.newPw && !!v.confirmPw;
  return (
    <Button
      type="submit"
      className="w-full"
      disabled={formState.isSubmitting || isCoolingDown || !allFilled}
      rateLimitAware
    >
      {formState.isSubmitting
        ? "جاري التغيير..."
        : isCoolingDown
          ? cooldownLabel
          : "تغيير كلمة المرور"}
    </Button>
  );
}

export function ChangePasswordSection() {
  const { toast } = useToast();
  const cooldown = useRateLimitCooldown();
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (values: ChangePasswordForm) => {
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: values.current, newPassword: values.newPw }),
      });
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      setSuccess(true);
    } catch (e: any) {
      // The shared apiFetch already shows a debounced rate-limit toast on
      // 429, so swallow it here to avoid a duplicate generic error toast.
      if (isRateLimitedError(e)) return;
      toast({ variant: "destructive", title: e.message || "فشل في تغيير كلمة المرور" });
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lock className="w-5 h-5 text-purple-500" />
          تغيير كلمة المرور
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {success ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-status-success-surface text-status-success-foreground">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">تم تغيير كلمة المرور بنجاح</p>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSuccess(false)}>تغيير مجدداً</Button>
          </div>
        ) : (
          <FormShell
            schema={changePasswordSchema}
            defaultValues={{ current: "", newPw: "", confirmPw: "" }}
            hideSubmit
            onSubmit={handleSubmit}
          >
            <PasswordFieldWithToggle name="current" label="كلمة المرور الحالية" />
            <PasswordFieldWithToggle name="newPw" label="كلمة المرور الجديدة" />
            <PasswordFieldWithToggle name="confirmPw" label="تأكيد كلمة المرور الجديدة" />
            <SubmitButton cooldownLabel={cooldown.label} isCoolingDown={cooldown.isCoolingDown} />
          </FormShell>
        )}
      </CardContent>
    </Card>
  );
}
