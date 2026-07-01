/**
 * bulk-actions — behavioral tests. Batch 5 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * Multi-select + bulk act is a distinct interaction used across list pages.
 *   • useBulkSelection — the pure selection-state hook (toggle / toggleAll /
 *     clear). toggleAll is a toggle: select-all when not all are selected,
 *     clear when they already are.
 *   • BulkActionsBar — the floating bar: hidden at zero selection, shows the
 *     «تم تحديد N سجل» count otherwise, and «إلغاء التحديد» clears.
 *
 * The destructive bulk endpoints (apiFetch POST) are deliberately not invoked
 * here — only the selection state and the bar's render/clear contract, which
 * need no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { useBulkSelection, BulkActionsBar } from "@/components/shared/bulk-actions";

afterEach(() => cleanup());

describe("useBulkSelection — selection state", () => {
  it("toggle adds an id, then removes it on the second call", () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.selectedIds.size).toBe(0);

    act(() => result.current.toggle(5));
    expect([...result.current.selectedIds]).toEqual([5]);

    act(() => result.current.toggle(5));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("toggle accumulates distinct ids", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggle(1));
    act(() => result.current.toggle(2));
    expect([...result.current.selectedIds].sort()).toEqual([1, 2]);
  });

  it("toggleAll selects all, then clears when all are already selected", () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(3);

    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("toggleAll from a partial selection selects all", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggle(1));
    act(() => result.current.toggleAll([1, 2, 3]));
    expect(result.current.selectedIds.size).toBe(3);
  });

  it("clear empties the selection", () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => result.current.toggleAll([1, 2]));
    act(() => result.current.clear());
    expect(result.current.selectedIds.size).toBe(0);
  });
});

const baseProps = {
  entityType: "test",
  items: [{ id: 1 }, { id: 2 }, { id: 3 }],
  onToggle: () => {},
  onToggleAll: () => {},
  onClear: () => {},
};

function renderBar(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BulkActionsBar — render + clear", () => {
  it("renders nothing when no rows are selected", () => {
    renderBar(<BulkActionsBar {...baseProps} selectedIds={new Set()} />);
    expect(screen.queryByText(/تم تحديد/)).not.toBeInTheDocument();
  });

  it("shows the selected-count chip when rows are selected", () => {
    renderBar(<BulkActionsBar {...baseProps} selectedIds={new Set([1, 2])} />);
    expect(screen.getByText(/تم تحديد 2 سجل/)).toBeInTheDocument();
  });

  it("«إلغاء التحديد» calls onClear", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderBar(<BulkActionsBar {...baseProps} selectedIds={new Set([1])} onClear={onClear} />);
    await user.click(screen.getByRole("button", { name: "إلغاء التحديد" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
