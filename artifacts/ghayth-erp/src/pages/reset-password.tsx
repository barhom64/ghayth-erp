import { useState, useMemo } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { z } from "zod";
import { useLocation } from "wouter";
import "@/styles/login.css";
import { GhaythLogo } from "@/components/shared/ghayth-logo";
import { notifyRateLimited } from "@/lib/rate-limit-toast";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormShell } from "@workspace/ui-core";
import {
  Loader2, Lock, AlertCircle, Eye, EyeOff,
  KeyRound, ArrowRight, CheckCircle2, Clock
} from "lucide-react";

import { API_BASE } from "@/lib/api";

const resetSchema = z.object({
  newPassword: z.string()
    .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
    .regex(/[a-z]/, "يجب أن تحتوي على حرف صغير واحد على الأقل")
    .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل")
    .regex(/[^a-zA-Z0-9]/, "يجب أن تحتوي على رمز خاص واحد على الأقل"),
  confirmPassword: z.string().min(1, "يرجى تأكيد كلمة المرور"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirmPassword"],
});
type ResetForm = z.infer<typeof resetSchema>;

function PasswordField({
  name,
  label,
  autoComplete,
}: {
  name: keyof ResetForm;
  label: string;
  autoComplete: string;
}) {
  const { control, formState } = useFormContext<ResetForm>();
  const [show, setShow] = useState(false);
  const error = formState.errors[name];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-status-neutral-foreground font-medium text-sm">{label}</Label>
      <div className="relative">
        <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Input
              id={name}
              type={show ? "text" : "password"}
              placeholder="••••••••"
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              className="ps-10 pe-10 h-11 border-border bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              autoComplete={autoComplete}
              disabled={formState.isSubmitting}
              dir="ltr"
            />
          )}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground transition-colors"
          aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <p className="text-xs text-status-error-foreground">{error.message as string}</p>
      )}
    </div>
  );
}

function ResetFields({
  isCoolingDown,
  cooldownLabel,
}: {
  isCoolingDown: boolean;
  cooldownLabel: string;
}) {
  const { formState } = useFormContext<ResetForm>();
  return (
    <>
      <PasswordField name="newPassword" label="كلمة المرور الجديدة" autoComplete="new-password" />
      <PasswordField name="confirmPassword" label="تأكيد كلمة المرور" autoComplete="new-password" />

      <button
        type="submit"
        disabled={formState.isSubmitting || isCoolingDown}
        className="w-full h-11 rounded-lg text-white font-semibold text-sm shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: (formState.isSubmitting || isCoolingDown) ? "#64748b" : "linear-gradient(135deg,#1565c0,#0d47a1)" }}
      >
        {formState.isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري الحفظ...
          </span>
        ) : isCoolingDown ? (
          <span className="flex items-center justify-center gap-2">
            <Clock className="h-4 w-4" />
            {cooldownLabel}
          </span>
        ) : (
          "تعيين كلمة المرور"
        )}
      </button>
    </>
  );
}

export default function ResetPassword() {
  const [location, setLocation] = useLocation();
  // Same form serves new-user activation/invitation (/activate) and
  // forgot-password (/reset-password); only the endpoint + copy differ.
  const isActivate = location.startsWith("/activate");
  const cooldown = useRateLimitCooldown();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const token = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("token") ?? "";
    } catch {
      return "";
    }
  }, []);

  const handleReset = async (values: ResetForm) => {
    setError("");
    try {
      // Two literal calls with INLINE options (not a templated
      // `/api/auth/${...}` and not a hoisted opts object) so the
      // frontend↔backend wiring guard resolves BOTH endpoints to real
      // routes AND infers POST: a ternary inside the path normalises to
      // `/api/auth/:param`, and hoisting the options makes the scanner
      // default the verb to GET — either one registers an orphan and
      // fails guard.
      const res = isActivate
        ? await fetch(`${API_BASE}/api/auth/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword: values.newPassword }),
          })
        : await fetch(`${API_BASE}/api/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, newPassword: values.newPassword }),
          });
      if (res.status === 429) {
        notifyRateLimited(res);
        throw new Error("تم تجاوز الحد المسموح، حاول لاحقاً");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تعذّر تعيين كلمة المرور");
      setDone(true);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تعيين كلمة المرور");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-subtle px-6 py-10" dir="rtl">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl shadow" style={{ background: "linear-gradient(135deg,#1565c0,#0d47a1)" }}>
            <GhaythLogo size={24} className="brightness-0 invert" />
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-900 text-lg leading-none">منصة غيث</p>
            <p className="text-xs text-muted-foreground mt-1">نظام إدارة الموارد المؤسسية</p>
          </div>
        </div>

        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg"
            style={{ background: "linear-gradient(135deg,#1565c0,#0d47a1)" }}
          >
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{isActivate ? "تفعيل الحساب وتعيين كلمة المرور" : "تعيين كلمة مرور جديدة"}</h2>
          <p className="text-muted-foreground text-sm mt-1">{isActivate ? "مرحباً بك في منصة غيث — اختر كلمة مرور قوية لتفعيل حسابك" : "اختر كلمة مرور قوية لحسابك"}</p>
        </div>

        {done ? (
          <div className="space-y-5">
            <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h3 className="text-lg font-semibold text-emerald-800">تم تعيين كلمة المرور بنجاح</h3>
              <p className="text-sm text-emerald-700 leading-relaxed">
                يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full h-11 rounded-lg text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all"
              style={{ background: "linear-gradient(135deg,#1565c0,#0d47a1)" }}
            >
              الذهاب لتسجيل الدخول
            </button>
          </div>
        ) : !token ? (
          <div className="space-y-5">
            <Alert className="border-status-error-surface bg-status-error-surface text-end">
              <AlertCircle className="h-4 w-4 text-status-error" />
              <AlertDescription className="text-status-error-foreground text-sm">
                {isActivate
                  ? "رابط التفعيل غير صالح أو منتهي الصلاحية. تواصل مع مدير النظام لإرسال دعوة جديدة."
                  : "رابط إعادة التعيين غير صالح. يرجى طلب رابط جديد من صفحة تسجيل الدخول."}
              </AlertDescription>
            </Alert>
            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full h-11 rounded-lg border border-border bg-white text-status-neutral-foreground font-medium text-sm hover:bg-surface-subtle transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <ArrowRight className="h-4 w-4" />
              العودة لتسجيل الدخول
            </button>
          </div>
        ) : (
          <FormShell
            schema={resetSchema}
            defaultValues={{ newPassword: "", confirmPassword: "" }}
            hideSubmit
            className="space-y-5"
            onSubmit={handleReset}
          >
            {error && (
              <Alert className="border-status-error-surface bg-status-error-surface text-end">
                <AlertCircle className="h-4 w-4 text-status-error" />
                <AlertDescription className="text-status-error-foreground text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <ResetFields isCoolingDown={cooldown.isCoolingDown} cooldownLabel={cooldown.label} />

            <button
              type="button"
              onClick={() => setLocation("/login")}
              className="w-full h-11 rounded-lg border border-border bg-white text-status-neutral-foreground font-medium text-sm hover:bg-surface-subtle transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <ArrowRight className="h-4 w-4" />
              العودة لتسجيل الدخول
            </button>
          </FormShell>
        )}
      </div>
    </div>
  );
}
