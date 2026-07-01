import { describe, it, expect, vi, beforeAll } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom lacks the pointer-capture + scroll + ResizeObserver APIs that
// Radix/cmdk call when the listbox opens — same shims as product-select.
beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  (globalThis as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// #2134 fixture — the preloaded window (think: first 500 clients by name)
// does NOT contain the target client; only the server-side search returns it.
const BASE_CLIENTS = [
  { id: 1, name: "أحمد التجريبي", phone: "0500000001" },
  { id: 2, name: "بدر التجريبي", phone: "0500000002" },
];
const SEARCH_ONLY_CLIENT = { id: 777, name: "زبون خارج النافذة", phone: "0500000777" };

const mutateSpy = vi.fn();

vi.mock("@/lib/api", () => ({
  useApiQuery: (key: string[], path: string | null, options?: any) => {
    const enabled = !(options && options.enabled === false) && !!path;
    if (String(key[0]).endsWith("-search")) {
      // server-search companion query — only answers when active and the
      // request actually carries the typed term.
      if (enabled && /[?&]search=/.test(String(path))) {
        return { data: { data: [SEARCH_ONLY_CLIENT] }, refetch: vi.fn() };
      }
      return { data: undefined, refetch: vi.fn() };
    }
    return { data: { data: BASE_CLIENTS }, refetch: vi.fn() };
  },
  useApiMutation: () => ({ mutate: mutateSpy, isPending: false }),
}));

import { ClientSelect, UmrahAgentSelect, mergeEntityOptions, decideOwnBranch } from "./entity-selects";

function Harness() {
  const [clientId, setClientId] = useState("");
  return (
    <div>
      <ClientSelect value={clientId} onChange={setClientId} label="العميل" />
      <div data-testid="selected">{clientId}</div>
    </div>
  );
}

const hasText = (needle: string) => (content: string) => content.includes(needle);

describe("mergeEntityOptions (#2134)", () => {
  it("dedupes by value with created-first priority", () => {
    const merged = mergeEntityOptions(
      [{ value: "9", label: "جديد" }],
      [{ value: "1", label: "قديم" }, { value: "9", label: "نسخة قائمة" }],
      [{ value: "1", label: "نسخة بحث" }, { value: "5", label: "نتيجة بحث" }],
    );
    expect(merged.map((o) => o.value)).toEqual(["9", "1", "5"]);
    expect(merged[0].label).toBe("جديد"); // the created entry wins the duplicate
  });

  it("ignores empty values", () => {
    expect(mergeEntityOptions([], [{ value: "", label: "x" }], [])).toEqual([]);
  });
});

describe("ClientSelect (#2134)", () => {
  it("shows the preloaded window's clients", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByText(hasText("أحمد التجريبي"))).toBeInTheDocument();
  });

  it("finds a client OUTSIDE the preloaded window via server-side search and selects it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox"));

    // not in the preloaded list before typing
    expect(screen.queryByText(hasText("زبون خارج النافذة"))).not.toBeInTheDocument();

    // typing (≥2 chars, after the 250ms debounce) triggers the &search= query
    await user.type(screen.getByPlaceholderText("ابحث عن عميل..."), "زبون");
    expect(await screen.findByText(hasText("زبون خارج النافذة"), undefined, { timeout: 2000 })).toBeInTheDocument();

    await user.click(screen.getByText(hasText("زبون خارج النافذة")));
    expect(screen.getByTestId("selected")).toHaveTextContent("777");
  });

  // NOTE: ClientSelect's inline-create opens the registered full-form drawer
  // (createEntityKind: "client"). The quick-create payload-strip case below
  // uses UmrahAgentSelect, still a generic field-driven form (name + optional
  // phone/country). SupplierSelect was moved onto the full vendor form
  // (createEntityKind: "vendor"), so it no longer exercises the generic path.
});

function AgentHarness() {
  const [agentId, setAgentId] = useState("");
  return (
    <div>
      <UmrahAgentSelect value={agentId} onChange={setAgentId} label="الوكيل" />
      <div data-testid="selected">{agentId}</div>
    </div>
  );
}

describe("generic field-driven quick-create via unified drawer (#2134)", () => {
  it("strips empty optional fields and the new entity appears + is selected immediately", async () => {
    const user = userEvent.setup();
    mutateSpy.mockImplementation((_payload: any, opts: any) => {
      opts?.onSuccess?.({ id: 901, name: "وكيل لحظي", phone: null, country: null });
    });
    render(<AgentHarness />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText(hasText("+ وكيل جديد")));

    await user.type(await screen.findByPlaceholderText("اسم الوكيل"), "وكيل لحظي");
    await user.click(screen.getByRole("button", { name: "إنشاء" }));

    // payload: only the typed field — phone/country left blank are OMITTED,
    // not sent as "" (#2134 — an empty "" used to 422 on backend validators).
    const payload = mutateSpy.mock.calls.at(-1)?.[0];
    expect(payload).toEqual({ name: "وكيل لحظي" });

    // selected instantly (before any refetch): the form holds the id AND the
    // trigger renders the new label; reopening lists it too (≥ 2 matches).
    expect(screen.getByTestId("selected")).toHaveTextContent("901");
    await user.click(screen.getByRole("combobox"));
    const matches = await screen.findAllByText(hasText("وكيل لحظي"));
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * decideOwnBranch — B2 (توجيه إبراهيم): «الفرع مقفل يختار فرعي تلقائيًا، فرع
 * الإدخال تلقائي». القرار النقي خلف BranchSelect.autoSelectOwnBranch: يُهيّئ
 * الحقل الفارغ بفرع المستخدم الفعّال، ويقفله متى كان له فرع واحد فقط.
 */
describe("decideOwnBranch (B2)", () => {
  const B1 = { id: 1 }, B2 = { id: 2 };

  it("disabled when not enabled — no auto-select, no lock (filters/cross-branch screens)", () => {
    expect(decideOwnBranch({ enabled: false, value: "", selectedBranchId: 1, branches: [B1] }))
      .toEqual({ autoSelectTo: null, locked: false });
  });

  it("auto-selects the active branch into an empty field (فرع الإدخال تلقائي)", () => {
    expect(decideOwnBranch({ enabled: true, value: "", selectedBranchId: 2, branches: [B1, B2] }))
      .toEqual({ autoSelectTo: "2", locked: false });
  });

  it("locks to the only branch a single-branch user has (مقفل) once the value is set", () => {
    expect(decideOwnBranch({ enabled: true, value: "1", selectedBranchId: 1, branches: [B1] }))
      .toEqual({ autoSelectTo: null, locked: true });
  });

  it("single-branch + empty field: auto-selects that branch (lock follows once value lands)", () => {
    expect(decideOwnBranch({ enabled: true, value: "", selectedBranchId: null, branches: [B1] }))
      .toEqual({ autoSelectTo: "1", locked: false });
  });

  it("never overrides an existing value (نسخ فاتورة / تعديل) — only fills when empty", () => {
    expect(decideOwnBranch({ enabled: true, value: "2", selectedBranchId: 1, branches: [B1, B2] }))
      .toEqual({ autoSelectTo: null, locked: false });
  });

  it("multi-branch with no active selection: no auto-select and no lock (ambiguous → leave to user)", () => {
    expect(decideOwnBranch({ enabled: true, value: "", selectedBranchId: null, branches: [B1, B2] }))
      .toEqual({ autoSelectTo: null, locked: false });
  });

  it("no branches at all: safe no-op", () => {
    expect(decideOwnBranch({ enabled: true, value: "", selectedBranchId: null, branches: [] }))
      .toEqual({ autoSelectTo: null, locked: false });
  });
});
