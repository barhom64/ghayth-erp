/**
 * inline-actions — behavioral tests. Batch 6 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * Inline edit/delete inside a table row is a common, mutation-bearing flow.
 *   • useRowActions   — the pure edit/delete state machine. Edit and delete are
 *     mutually exclusive: opening one closes the other; cancel/reset clear it.
 *   • useInlineActions — adds handleSave (PATCH endpoint/:id) and handleDelete
 *     (DELETE endpoint/:id), each invalidating queries, calling onSuccess and
 *     resetting the row state. The API layer is mocked so no network runs.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { apiPatch, apiDelete } = vi.hoisted(() => ({ apiPatch: vi.fn(), apiDelete: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiPatch, apiDelete }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { useRowActions, useInlineActions } from "@/components/inline-actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useRowActions — edit/delete state machine", () => {
  it("startEdit opens the editing row + form and closes any pending delete", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startDelete(9));
    expect(result.current.deletingId).toBe(9);

    act(() => result.current.startEdit(3, { name: "أحمد" }));
    expect(result.current.editingId).toBe(3);
    expect(result.current.editForm).toEqual({ name: "أحمد" });
    expect(result.current.deletingId).toBeNull();
  });

  it("startDelete opens the deleting row and closes any pending edit", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startEdit(3, { name: "x" }));

    act(() => result.current.startDelete(7));
    expect(result.current.deletingId).toBe(7);
    expect(result.current.editingId).toBeNull();
  });

  it("cancelEdit clears the editing row and form", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startEdit(3, { name: "x" }));
    act(() => result.current.cancelEdit());
    expect(result.current.editingId).toBeNull();
    expect(result.current.editForm).toEqual({});
  });

  it("cancelDelete clears the deleting row", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startDelete(4));
    act(() => result.current.cancelDelete());
    expect(result.current.deletingId).toBeNull();
  });

  it("setEditForm updates the edit form", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startEdit(1, { name: "a" }));
    act(() => result.current.setEditForm({ name: "b", role: "admin" }));
    expect(result.current.editForm).toEqual({ name: "b", role: "admin" });
  });

  it("reset clears editing, deleting and the form", () => {
    const { result } = renderHook(() => useRowActions());
    act(() => result.current.startEdit(1, { name: "a" }));
    act(() => result.current.reset());
    expect(result.current.editingId).toBeNull();
    expect(result.current.deletingId).toBeNull();
    expect(result.current.editForm).toEqual({});
  });
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useInlineActions — save/delete hit the API then reset", () => {
  const opts = { endpoint: "/fleet/vehicles", queryKeys: [["fleet-vehicles"]], onSuccess: vi.fn() };

  it("handleSave PATCHes endpoint/:id with the body, resets, and calls onSuccess", async () => {
    apiPatch.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useInlineActions({ ...opts, onSuccess }), { wrapper });

    act(() => result.current.startEdit(12, { color: "أحمر" }));
    await act(async () => {
      await result.current.handleSave(12, { color: "أزرق" });
    });

    expect(apiPatch).toHaveBeenCalledWith("/fleet/vehicles/12", { color: "أزرق" });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.editingId).toBeNull();
  });

  it("handleDelete DELETEs endpoint/:id, resets, and calls onSuccess", async () => {
    apiDelete.mockResolvedValueOnce({});
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useInlineActions({ ...opts, onSuccess }), { wrapper });

    act(() => result.current.startDelete(5));
    await act(async () => {
      await result.current.handleDelete(5);
    });

    expect(apiDelete).toHaveBeenCalledWith("/fleet/vehicles/5");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.deletingId).toBeNull();
  });
});
