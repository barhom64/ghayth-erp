/**
 * useFieldErrors — hook tests. Batch 17 of the FE behavioral-coverage effort
 * (ghayth-review documented gap).
 *
 * The shared field-error primitive behind 60+ create/edit forms. Two methods
 * carry the load, and they behave DIFFERENTLY on purpose:
 *
 *  - validate(checks): falsy message = "field valid", non-empty string =
 *    error. It REPLACES the whole error set (so re-validating clears errors
 *    that now pass) and returns the FIRST error message in insertion order
 *    (the one the caller toasts), or null when everything passes.
 *  - setApiError(err): for a thrown typed error it MERGES one field error in
 *    (keeping the errors already on screen), choosing the message by
 *    precedence fix > message > "خطأ", and returns the error for chaining.
 *    An error with no `.field` is a no-op.
 *
 * validate = replace, setApiError = merge — that contrast is the easy thing
 * to get wrong, so each side is pinned. Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFieldErrors } from "./use-field-errors";

describe("useFieldErrors — validate", () => {
  it("starts with no errors", () => {
    const { result } = renderHook(() => useFieldErrors());
    expect(result.current.fieldErrors).toEqual({});
  });

  it("keeps only the truthy messages and returns the first error", () => {
    const { result } = renderHook(() => useFieldErrors());
    let first: string | null = "";
    act(() => {
      first = result.current.validate({ a: null, b: "ب مطلوب", c: undefined, d: "د خطأ", e: false });
    });
    expect(first).toBe("ب مطلوب"); // first failing field in insertion order
    expect(result.current.fieldErrors).toEqual({ b: "ب مطلوب", d: "د خطأ" });
  });

  it("returns null and clears errors when every field passes", () => {
    const { result } = renderHook(() => useFieldErrors());
    act(() => void result.current.validate({ a: "ناقص" })); // seed an error
    expect(result.current.fieldErrors).toEqual({ a: "ناقص" });

    let second: string | null = "x";
    act(() => {
      second = result.current.validate({ a: null, b: undefined }); // all valid now
    });
    expect(second).toBeNull();
    expect(result.current.fieldErrors).toEqual({}); // REPLACED, not merged — stale error gone
  });

  it("returns the first error by insertion order, not by key sort", () => {
    const { result } = renderHook(() => useFieldErrors());
    let first: string | null = "";
    act(() => {
      first = result.current.validate({ z: "زاي", a: "ألف" }); // z inserted first
    });
    expect(first).toBe("زاي");
  });
});

describe("useFieldErrors — setApiError", () => {
  it("highlights the error's field and returns the error for chaining", () => {
    const { result } = renderHook(() => useFieldErrors());
    let returned: unknown;
    act(() => {
      returned = result.current.setApiError({ field: "iban", message: "آيبان غير صالح" });
    });
    expect(result.current.fieldErrors).toEqual({ iban: "آيبان غير صالح" });
    expect(returned).toEqual({ field: "iban", message: "آيبان غير صالح" });
  });

  it("prefers fix over message over the generic fallback", () => {
    const fix = renderHook(() => useFieldErrors());
    act(() => void fix.result.current.setApiError({ field: "x", fix: "الإصلاح", message: "الرسالة" }));
    expect(fix.result.current.fieldErrors.x).toBe("الإصلاح");

    const msg = renderHook(() => useFieldErrors());
    act(() => void msg.result.current.setApiError({ field: "x", message: "الرسالة" }));
    expect(msg.result.current.fieldErrors.x).toBe("الرسالة");

    const fallback = renderHook(() => useFieldErrors());
    act(() => void fallback.result.current.setApiError({ field: "x" }));
    expect(fallback.result.current.fieldErrors.x).toBe("خطأ");
  });

  it("MERGES into the existing errors instead of replacing them", () => {
    const { result } = renderHook(() => useFieldErrors());
    act(() => result.current.setErrors({ name: "الاسم مطلوب" }));
    act(() => void result.current.setApiError({ field: "iban", message: "آيبان غير صالح" }));
    expect(result.current.fieldErrors).toEqual({ name: "الاسم مطلوب", iban: "آيبان غير صالح" });
  });

  it("is a no-op for an error without a field", () => {
    const { result } = renderHook(() => useFieldErrors());
    act(() => result.current.setErrors({ name: "الاسم مطلوب" }));
    act(() => void result.current.setApiError({ message: "خطأ عام بلا حقل" }));
    expect(result.current.fieldErrors).toEqual({ name: "الاسم مطلوب" }); // unchanged
  });

  it("clearErrors empties the whole set", () => {
    const { result } = renderHook(() => useFieldErrors());
    act(() => result.current.setErrors({ a: "خطأ", b: "خطأ" }));
    act(() => result.current.clearErrors());
    expect(result.current.fieldErrors).toEqual({});
  });
});
