import {
  type ReactNode,
  type ComponentProps,
  type FormEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import {
  useForm,
  FormProvider,
  useFormContext,
  Controller,
  type DefaultValues,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError, apiFetch } from "@/lib/api";

/**
 * FormShell — P1.2 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The existing `components/ui/form.tsx` exposes the shadcn/ui primitives
 * (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`,
 * `FormMessage`). They're good, but each page still has to wire up
 * `useForm`, `zodResolver`, `handleSubmit`, submit-button state, and the
 * server-error → field-error bridge. That's why every form in the tree
 * looks slightly different — 20+ lines of boilerplate per create page,
 * each one drifting in a different direction.
 *
 * FormShell collapses that to one declarative block:
 *
 *   <FormShell
 *     schema={employeeSchema}
 *     defaultValues={{ name: "", email: "" }}
 *     onSubmit={async (values) => createEmployee.mutateAsync(values)}
 *     submitLabel="حفظ"
 *   >
 *     <FormTextField name="name" label="الاسم" required />
 *     <FormEmailField name="email" label="البريد" />
 *     <FormTextareaField name="notes" label="ملاحظات" rows={3} />
 *   </FormShell>
 *
 * What it does:
 *
 *   1. Builds `useForm` with the passed Zod schema + defaults
 *   2. Provides form context via <FormProvider> so all field
 *      components read from the same form instance
 *   3. Handles the <form onSubmit> wiring — including passing a
 *      `setFieldError` helper into onSubmit so the caller can forward
 *      ApiError field errors onto the right input
 *   4. Renders a submit bar at the bottom with a loading spinner while
 *      `isSubmitting` is true
 *   5. Exposes a `<FormActions>` slot for secondary buttons (Cancel,
 *      Save Draft, …) that live next to the primary submit
 *
 * Adoption is opt-in. Every existing form keeps working untouched.
 * Pages refactored in P3 and P4 replace their ad-hoc useForm +
 * handleSubmit + button with a single <FormShell>.
 */

export interface FormShellProps<TSchema extends FieldValues> {
  /** Zod schema describing the form shape. */
  schema: ZodType<TSchema>;
  /** Default values for the form. */
  defaultValues: DefaultValues<TSchema>;
  /**
   * Submit handler. Receives the validated values and a helper that
   * forwards server-side field errors back to the form, so VALIDATION_ERROR
   * from the API can light up the right input.
   */
  onSubmit: (
    values: TSchema,
    ctx: {
      form: UseFormReturn<TSchema>;
      /** Apply a server-side field error to the form. */
      setFieldError: (field: Path<TSchema>, message: string) => void;
      /** Reset all fields to `defaultValues`. */
      reset: () => void;
    },
  ) => Promise<void> | void;
  /** Primary submit button label. Defaults to "حفظ". */
  submitLabel?: string;
  /** Primary submit button variant. Defaults to "default". */
  submitVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  /** Secondary button slot (Cancel, Save draft, …). Rendered start-aligned. */
  secondaryActions?: ReactNode;
  /**
   * Optional side summary rendered beside the fields on wide screens (e.g. a
   * running total, the expected effect, or a completeness hint) so the
   * operator sees the consequence of their input while filling it in. On
   * narrow screens it stacks below the fields. Omit it for the default
   * single-column form (backward compatible).
   */
  aside?: ReactNode;
  /** Override disabled-state logic (e.g. disable until a dependency loads). */
  disabled?: boolean;
  /**
   * Hide the built-in submit footer entirely. Use when the form's primary
   * submit button lives outside FormShell's default footer (e.g. the page
   * header). The button still needs `type="submit"` so the form picks it
   * up — but FormShell stops rendering its own copy.
   */
  hideSubmit?: boolean;
  /** Extra className for the outer form. */
  className?: string;
  /** Form fields. Use `<FormTextField>` etc. or your own components that read from `useFormContext`. */
  children: ReactNode;
}

export function FormShell<TSchema extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  submitLabel = "حفظ",
  submitVariant = "default",
  secondaryActions,
  aside,
  disabled,
  hideSubmit = false,
  className,
  children,
}: FormShellProps<TSchema>) {
  const form = useForm<TSchema>({
    resolver: zodResolver(schema as any),
    defaultValues,
    mode: "onBlur",
  });

  const setFieldError = useCallback(
    (field: Path<TSchema>, message: string) => {
      form.setError(field, { type: "server", message });
    },
    [form],
  );

  const handleFormSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await form.handleSubmit(async (values) => {
        try {
          await onSubmit(values, {
            form,
            setFieldError,
            reset: () => form.reset(defaultValues),
          });
        } catch (err) {
          // Auto-forward ApiError field errors when the caller didn't
          // already handle them. This keeps VALIDATION_ERROR from the
          // server attached to the right input without every form
          // needing to remember to call setFieldError.
          if (err instanceof ApiError && err.code === "VALIDATION_ERROR" && err.field) {
            form.setError(err.field as Path<TSchema>, {
              type: "server",
              message: err.fix ?? err.message,
            });
          }
          // Do not re-throw — the caller's own error handling
          // (toast / boundary) already ran in onSubmit. Without this
          // return, the submit promise would reject and the form would
          // stay in `isSubmitting: true` until the next render.
        }
      })(e);
    },
    [form, onSubmit, setFieldError, defaultValues],
  );

  const submitting = form.formState.isSubmitting;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleFormSubmit}
        noValidate
        dir="rtl"
        className={cn("space-y-4", className)}
      >
        {aside ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">{children}</div>
            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">{aside}</aside>
          </div>
        ) : (
          <div className="space-y-4">{children}</div>
        )}

        {!hideSubmit && (
          <div className="flex items-center justify-between gap-2 pt-4 border-t">
            <div className="flex items-center gap-2">{secondaryActions}</div>
            <Button
              type="submit"
              variant={submitVariant}
              disabled={disabled || submitting}
              className="min-w-[7rem]"
              rateLimitAware
            >
              {submitting ? "جاري الحفظ..." : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </FormProvider>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Field primitives — thin wrappers that read from form context via
// `useFormContext`, render a label + input + error row, and inherit the
// spacing + RTL direction from FormShell. Every field follows the same
// label-above-input layout so forms look consistent at a glance.
// ──────────────────────────────────────────────────────────────────────

interface BaseFieldProps {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  className?: string;
}

function FieldWrapper({
  name,
  label,
  description,
  required,
  className,
  children,
}: BaseFieldProps & { children: ReactNode }) {
  const { formState } = useFormContext();
  const error = (formState.errors[name]?.message as string | undefined) ?? undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={name} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ms-1">*</span>}
      </Label>
      {children}
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && <p className="text-xs text-status-error-foreground">{error}</p>}
    </div>
  );
}

export interface FormTextFieldProps extends BaseFieldProps {
  placeholder?: string;
  type?: ComponentProps<typeof Input>["type"];
  autoComplete?: string;
  inputMode?: ComponentProps<typeof Input>["inputMode"];
  disabled?: boolean;
  /** Forwarded to the underlying <Input>. Useful for number/date inputs. */
  min?: string | number;
  max?: string | number;
  step?: string | number;
}

export function FormTextField({
  name,
  label,
  description,
  required,
  className,
  placeholder,
  type = "text",
  autoComplete,
  inputMode,
  disabled,
  min,
  max,
  step,
}: FormTextFieldProps) {
  const { register } = useFormContext();
  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Input
        id={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        {...register(name)}
      />
    </FieldWrapper>
  );
}

export function FormEmailField(props: Omit<FormTextFieldProps, "type" | "inputMode">) {
  return <FormTextField {...props} type="email" inputMode="email" autoComplete="email" />;
}

export function FormPhoneField(props: Omit<FormTextFieldProps, "type" | "inputMode">) {
  return <FormTextField {...props} type="tel" inputMode="tel" autoComplete="tel" />;
}

export function FormNumberField(
  props: Omit<FormTextFieldProps, "type" | "inputMode">,
) {
  return <FormTextField {...props} type="number" inputMode="numeric" />;
}

export interface FormImageFieldProps extends BaseFieldProps {
  disabled?: boolean;
  /** أقصى حجم للرفع بالميغابايت (افتراضي 5). */
  maxSizeMB?: number;
  /** مسار نقطة الرفع نسبةً إلى /api (افتراضيًا رفع صور الموقع). */
  uploadEndpoint?: string;
}

/**
 * حقل رفع صورة حقيقي — يستبدل «لصق رابط الصورة» بزر رفع ملف من الجهاز.
 * يرفع الملف المختار كـ base64 إلى نقطة رفع خادمية تُعيد رابطًا عامًا،
 * ويخزّن الرابط في قيمة الحقل داخل FormShell. يعرض معاينة + استبدال + إزالة،
 * ويقبل القيم القديمة (روابط منسوخة سابقًا) ويعرضها كما هي.
 */
export function FormImageField({
  name,
  label,
  description,
  required,
  className,
  disabled,
  maxSizeMB = 5,
  uploadEndpoint = "/site/upload-image",
}: FormImageFieldProps) {
  const { control } = useFormContext();
  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <ImageUploadControl
            value={(field.value as string) ?? ""}
            onChange={(v) => field.onChange(v)}
            disabled={disabled}
            maxSizeMB={maxSizeMB}
            uploadEndpoint={uploadEndpoint}
          />
        )}
      />
    </FieldWrapper>
  );
}

function ImageUploadControl({
  value,
  onChange,
  disabled,
  maxSizeMB,
  uploadEndpoint,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  maxSizeMB: number;
  uploadEndpoint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("الرجاء اختيار ملف صورة");
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`حجم الصورة يتجاوز ${maxSizeMB} ميغابايت`);
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذّرت قراءة الملف"));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ url: string }>(uploadEndpoint, {
        method: "POST",
        body: JSON.stringify({ dataUrl, fileName: file.name }),
      });
      onChange(res.url);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fix ?? err.message
          : err instanceof Error
            ? err.message
            : "تعذّر رفع الصورة",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt="معاينة الصورة"
            className="h-20 w-20 rounded-md border object-cover bg-muted"
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pick}
              disabled={disabled || uploading}
            >
              {uploading ? "جاري الرفع..." : "استبدال الصورة"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setError(null);
              }}
              disabled={disabled || uploading}
            >
              إزالة
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || uploading}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed py-6 text-sm text-muted-foreground transition hover:bg-accent/40 disabled:opacity-60"
        >
          <ImageIcon className="h-6 w-6" />
          <span>{uploading ? "جاري الرفع..." : "اضغط لرفع صورة"}</span>
          <span className="text-xs">
            PNG · JPG · WEBP · حتى {maxSizeMB} ميغابايت
          </span>
        </button>
      )}
      {error && <p className="text-xs text-status-error-foreground">{error}</p>}
    </div>
  );
}

export function FormDateField({
  name,
  label,
  description,
  required,
  className,
  disabled,
}: Omit<FormTextFieldProps, "type" | "placeholder" | "autoComplete" | "inputMode">) {
  const { control } = useFormContext();
  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <UnifiedDateInput
            value={field.value ?? ""}
            onChange={field.onChange}
            disabled={disabled}
            required={required}
            showDualCalendar
            showPresets
          />
        )}
      />
    </FieldWrapper>
  );
}

export interface FormTextareaFieldProps extends BaseFieldProps {
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function FormTextareaField({
  name,
  label,
  description,
  required,
  className,
  placeholder,
  rows = 4,
  disabled,
}: FormTextareaFieldProps) {
  const { register } = useFormContext();
  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <Textarea
        id={name}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        {...register(name)}
      />
    </FieldWrapper>
  );
}

export interface FormSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface FormSelectFieldProps extends BaseFieldProps {
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Native select — intentionally not a Radix combobox. Native picks up
 * RTL, screen-reader support, and mobile picker UX for free, which is
 * the right trade-off for forms that don't need autocomplete.
 */
export function FormSelectField({
  name,
  label,
  description,
  required,
  className,
  options,
  placeholder,
  disabled,
}: FormSelectFieldProps) {
  const { register } = useFormContext();
  return (
    <FieldWrapper
      name={name}
      label={label}
      description={description}
      required={required}
      className={className}
    >
      <select
        id={name}
        disabled={disabled}
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        {...register(name)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export interface FormCheckboxFieldProps extends Omit<BaseFieldProps, "label"> {
  /** Label shown to the right of the checkbox, not above it. */
  label: string;
  disabled?: boolean;
}

/**
 * Inline checkbox + label. Unlike the other field primitives the label
 * sits next to the box rather than above it, since that's the visual
 * convention for booleans across the app.
 */
export function FormCheckboxField({
  name,
  label,
  description,
  className,
  disabled,
}: FormCheckboxFieldProps) {
  const { control, formState } = useFormContext();
  const error = (formState.errors[name]?.message as string | undefined) ?? undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-2">
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <Checkbox
              id={name}
              disabled={disabled}
              checked={Boolean(field.value)}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
        <Label htmlFor={name} className="text-sm font-medium">
          {label}
        </Label>
      </div>
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && <p className="text-xs text-status-error-foreground">{error}</p>}
    </div>
  );
}

export interface FormSwitchFieldProps extends Omit<BaseFieldProps, "label"> {
  label: string;
  disabled?: boolean;
}

export function FormSwitchField({
  name,
  label,
  description,
  className,
  disabled,
}: FormSwitchFieldProps) {
  const { control, formState } = useFormContext();
  const error = (formState.errors[name]?.message as string | undefined) ?? undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-2">
        <Controller
          name={name}
          control={control}
          render={({ field }) => (
            <Switch
              id={name}
              disabled={disabled}
              checked={Boolean(field.value)}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
        <Label htmlFor={name} className="text-sm font-medium">
          {label}
        </Label>
      </div>
      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && <p className="text-xs text-status-error-foreground">{error}</p>}
    </div>
  );
}

export interface FormEntitySelectProps extends BaseFieldProps {
  /**
   * Existing entity-select component (VehicleSelect, DriverSelect, …)
   * that exposes a `value`/`onChange` pair returning string ids.
   */
  select: React.ComponentType<{
    value: string;
    onChange: (v: string) => void;
    label?: string;
    required?: boolean;
    error?: string;
    placeholder?: string;
    disabled?: boolean;
  }>;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Bridges an existing app-specific entity picker (VehicleSelect,
 * EmployeeSelect, …) into FormShell. The wrapped picker keeps its
 * label/error chrome, so the field reads identical to the original
 * page after migration.
 */
export function FormEntitySelect({
  name,
  label,
  description: _description,
  required,
  className,
  select: SelectComponent,
  placeholder,
  disabled,
}: FormEntitySelectProps) {
  const { control, formState } = useFormContext();
  const error = (formState.errors[name]?.message as string | undefined) ?? undefined;
  return (
    <div className={cn(className)}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <SelectComponent
            value={(field.value as string) ?? ""}
            onChange={field.onChange}
            label={label}
            required={required}
            error={error}
            placeholder={placeholder}
            disabled={disabled}
          />
        )}
      />
    </div>
  );
}

/**
 * Grid wrapper for two-column layouts inside FormShell. Pages can use
 * this instead of inline `<div className="grid grid-cols-2 gap-4">`
 * so column counts are consistent.
 */
export function FormGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: 1 | 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const colClass =
    cols === 4
      ? "md:grid-cols-4"
      : cols === 3
        ? "md:grid-cols-3"
        : cols === 2
          ? "md:grid-cols-2"
          : "md:grid-cols-1";
  return (
    <div className={cn("grid grid-cols-1 gap-4", colClass, className)}>
      {children}
    </div>
  );
}

/**
 * FormSection — a collapsible, titled group of fields inside a FormShell.
 * Long forms split into sections (e.g. «البيانات الأساسية» / «البيانات المالية»
 * / «المرفقات») so the operator isn't faced with one wall of inputs. Optional
 * fields can live in a section that defaults to collapsed («تفاصيل إضافية»).
 *
 * Pure layout: it does not touch form state, so validation/submit are
 * unaffected whether a section is open or closed (collapsed content stays
 * mounted). Built on the shared Collapsible primitive.
 */
export function FormSection({
  title,
  description,
  defaultOpen = true,
  badge,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Start expanded (default true). Set false for optional «تفاصيل إضافية». */
  defaultOpen?: boolean;
  /** Optional trailing hint next to the title (e.g. «ناقص» / عدد الحقول). */
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("rounded-xl border bg-card", className)}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {badge}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
