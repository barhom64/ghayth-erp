import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Shared form field wrappers — unify the 30+ custom Label/Input/FieldHint
 * variations across create pages.
 *
 * Usage:
 *   <FormFieldWrapper label="الاسم" required error={fieldErrors.name}>
 *     <Input value={form.name} onChange={...} />
 *   </FormFieldWrapper>
 *
 * For quick cases:
 *   <TextField label="الهاتف" dir="ltr" value={form.phone} onChange={...}
 *              error={fieldErrors.phone} required />
 */

interface FormFieldWrapperProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function FormFieldWrapper({
  label,
  required,
  error,
  hint,
  children,
  className,
  htmlFor,
}: FormFieldWrapperProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

export function fieldErrorClass(hasError: boolean | string | undefined): string {
  return hasError ? "border-red-500 ring-1 ring-red-300 focus-visible:ring-red-400" : "";
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  dir?: "ltr" | "rtl";
  type?: string;
  disabled?: boolean;
  hint?: ReactNode;
  className?: string;
  id?: string;
  autoComplete?: string;
}

export function TextField({
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  dir,
  type = "text",
  disabled,
  hint,
  className,
  id,
  autoComplete,
}: TextFieldProps) {
  return (
    <FormFieldWrapper
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      htmlFor={id}
    >
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        disabled={disabled}
        autoComplete={autoComplete}
        className={fieldErrorClass(error)}
      />
    </FormFieldWrapper>
  );
}

interface TextAreaFieldProps extends Omit<TextFieldProps, "type" | "dir"> {
  rows?: number;
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  disabled,
  hint,
  className,
  id,
  rows = 3,
}: TextAreaFieldProps) {
  return (
    <FormFieldWrapper
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      htmlFor={id}
    >
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={fieldErrorClass(error)}
      />
    </FormFieldWrapper>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  hint?: ReactNode;
  className?: string;
  id?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  error,
  required,
  placeholder,
  min,
  max,
  step,
  disabled,
  hint,
  className,
  id,
}: NumberFieldProps) {
  return (
    <FormFieldWrapper
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={className}
      htmlFor={id}
    >
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={fieldErrorClass(error)}
      />
    </FormFieldWrapper>
  );
}
