import { useState, useCallback } from "react";

/**
 * Shared field-error state for create/edit forms.
 *
 * Replaces the boilerplate that was repeated in 60+ create pages:
 *
 *   const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
 *   ...
 *   setFieldErrors({});
 *   const localErrors: Record<string, string> = {};
 *   if (!form.x) localErrors.x = "X مطلوب";
 *   if (Object.keys(localErrors).length > 0) {
 *     setFieldErrors(localErrors);
 *     toast({ variant: "destructive", title: localErrors[Object.keys(localErrors)[0]] });
 *     return;
 *   }
 *   ...
 *   } catch (err) {
 *     if (err?.field) setFieldErrors(prev => ({ ...prev, [err.field]: err.message ?? "خطأ" }));
 *   }
 *
 * Becomes:
 *
 *   const errors = useFieldErrors();
 *   ...
 *   const firstError = errors.validate({
 *     x: form.x ? null : "X مطلوب",
 *   });
 *   if (firstError) {
 *     toast({ variant: "destructive", title: firstError });
 *     return;
 *   }
 *   ...
 *   } catch (err) {
 *     errors.setApiError(err);
 *   }
 *
 * Use `errors.fieldErrors` to feed `error={errors.fieldErrors.x}` to TextField/etc.
 */
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErrors = useCallback(() => setFieldErrors({}), []);

  const setErrors = useCallback((errs: Record<string, string>) => {
    setFieldErrors(errs);
  }, []);

  /**
   * Run client-side validation. Pass a record of `field: errorMessage | null | undefined`.
   * Falsy values mean "field is valid". Non-empty strings become errors.
   *
   * Returns the first error message (so the caller can toast it), or `null`
   * if every field passed.
   */
  const validate = useCallback((checks: Record<string, string | null | undefined | false>) => {
    const errs: Record<string, string> = {};
    for (const [key, msg] of Object.entries(checks)) {
      if (msg) errs[key] = msg;
    }
    setFieldErrors(errs);
    const firstKey = Object.keys(errs)[0];
    return firstKey ? errs[firstKey] : null;
  }, []);

  /**
   * Handle a thrown API error in a catch block. If the error has a `field`
   * attached (typed-error pipeline), highlight that field. Returns the
   * error so callers can chain a toast.
   */
  const setApiError = useCallback((err: any) => {
    if (err?.field) {
      setFieldErrors((prev) => ({
        ...prev,
        [err.field]: err.fix ?? err.message ?? "خطأ",
      }));
    }
    return err;
  }, []);

  return {
    fieldErrors,
    setFieldErrors,
    clearErrors,
    setErrors,
    validate,
    setApiError,
  };
}
