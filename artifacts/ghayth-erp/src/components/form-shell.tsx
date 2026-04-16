import {
  type ReactNode,
  type ComponentProps,
  type FormEvent,
  useCallback,
} from "react";
import {
  useForm,
  FormProvider,
  useFormContext,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";

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
  /** Override disabled-state logic (e.g. disable until a dependency loads). */
  disabled?: boolean;
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
  disabled,
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
        <div className="space-y-4">{children}</div>

        <div className="flex items-center justify-between gap-2 pt-4 border-t">
          <div className="flex items-center gap-2">{secondaryActions}</div>
          <Button
            type="submit"
            variant={submitVariant}
            disabled={disabled || submitting}
            className="min-w-[7rem]"
          >
            {submitting ? "جارٍ الحفظ..." : submitLabel}
          </Button>
        </div>
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export interface FormTextFieldProps extends BaseFieldProps {
  placeholder?: string;
  type?: ComponentProps<typeof Input>["type"];
  autoComplete?: string;
  inputMode?: ComponentProps<typeof Input>["inputMode"];
  disabled?: boolean;
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

export function FormDateField(props: Omit<FormTextFieldProps, "type">) {
  return <FormTextField {...props} type="date" />;
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
  cols?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const colClass =
    cols === 3 ? "md:grid-cols-3" : cols === 2 ? "md:grid-cols-2" : "md:grid-cols-1";
  return (
    <div className={cn("grid grid-cols-1 gap-4", colClass, className)}>
      {children}
    </div>
  );
}
