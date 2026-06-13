/**
 * #2138 slice 2 — conversation-first /inbox page tests.
 *
 * Proves the slice-2 acceptance items that are testable at the unit
 * level (the cross-tenant RBAC proof lives server-side in
 * artifacts/api-server/tests/integration/inboxConversations.dynamic.test.ts —
 * GET /:id for another company's conversation is a 404 and the list
 * never leaks, enforced by buildScopedWhere, not by this page):
 *
 *   1. the conversation list reads from the Canon endpoint
 *      GET /inbox/conversations (not the legacy /inbox/threads)
 *   2. selecting a conversation loads GET /inbox/conversations/:id and
 *      renders the thread + the context panel with conversation_links
 *   3. replying POSTs ONLY to /inbox/conversations/:id/messages —
 *      never /inbox/send or /inbox/threads/:id/reply
 *   4. the reply appears in the thread after a successful send
 *   5. empty / no-selection / DLP-blocked / failed-send states render
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { useReducer } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom lacks the pointer-capture + scroll + ResizeObserver APIs that
// Radix calls — same shims as entity-selects.test.tsx.
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

// ── fixtures + mock plumbing ──────────────────────────────────────────
//
// vi.mock factories are hoisted above normal const declarations —
// everything they close over must come from vi.hoisted().
const { apiFetchSpy, toastSpy, MockApiError, store, CONVERSATIONS, DETAIL_MESSAGES, DETAIL_LINKS } = vi.hoisted(() => {
  class MockApiError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(message: string, opts: { code: string; meta?: Record<string, unknown> }) {
      super(message);
      this.code = opts.code;
      this.meta = opts.meta;
    }
  }

  const CONVERSATIONS: any[] = [
    {
      id: 11,
      channelPrimary: "email",
      title: "سؤال عن الفاتورة",
      participantType: "clients",
      participantId: 7,
      participantName: "عميل الاختبار",
      participantAddress: "client@test.local",
      status: "open",
      priority: "normal",
      assignedTo: null,
      lastMessageAt: "2026-06-12T10:00:00Z",
      slaStatus: null,
      riskLevel: null,
      lastMessagePreview: "مرحبا، أين الفاتورة؟",
      lastDirection: "inbound",
      lastMessageStatus: "sent",
      totalMessages: 2,
      unreadCount: 1,
    },
  ];

  const DETAIL_MESSAGES: any[] = [
    {
      id: 101, channel: "email", direction: "inbound",
      fromAddress: "client@test.local", toAddress: "rep@door.sa",
      subject: "سؤال عن الفاتورة", body: "مرحبا، أين الفاتورة؟",
      status: "sent", createdAt: "2026-06-12T10:00:00Z", isRead: true,
    },
  ];

  const DETAIL_LINKS: any[] = [
    { id: 1, relatedType: "clients", relatedId: 7, linkedBy: 2, createdAt: "2026-06-12T09:00:00Z" },
  ];

  // Mutable store the mocked useApiQuery reads on every render —
  // pushing into store.messages then calling refetch re-renders with
  // the new message, mirroring React Query's refetch-after-mutation.
  const store = {
    list: [...CONVERSATIONS],
    messages: [...DETAIL_MESSAGES],
    links: [...DETAIL_LINKS],
  };

  return {
    apiFetchSpy: vi.fn(),
    toastSpy: vi.fn(),
    MockApiError,
    store,
    CONVERSATIONS,
    DETAIL_MESSAGES,
    DETAIL_LINKS,
  };
});

vi.mock("@/lib/api", () => ({
  ApiError: MockApiError,
  apiFetch: (...args: any[]) => apiFetchSpy(...args),
  useApiQuery: (_key: string[], path: string | null, options?: any) => {
    const [, force] = useReducer((x: number) => x + 1, 0);
    const enabled = !(options && options.enabled === false) && !!path;
    const refetch = () => force();
    if (!enabled) return { data: undefined, isLoading: false, isError: false, refetch };
    const p = String(path);
    if (/^\/inbox\/conversations\/\d+$/.test(p)) {
      return {
        data: { data: { ...store.list[0], links: store.links, messages: store.messages } },
        isLoading: false,
        isError: false,
        refetch,
      };
    }
    if (p.startsWith("/inbox/conversations")) {
      return { data: { data: store.list }, isLoading: false, isError: false, refetch };
    }
    return { data: undefined, isLoading: false, isError: false, refetch };
  },
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: any[]) => toastSpy(...args),
}));

// PageShell / PageStatusBadge are kit components with their own
// providers — pass them through so the test exercises page logic, not
// the kit internals (the kit import path itself is ratchet-enforced).
vi.mock("@workspace/ui-core", () => ({
  PageShell: ({ title, subtitle, actions, children }: any) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div>{actions}</div>
      {children}
    </div>
  ),
  PageStatusBadge: ({ status, children }: any) => (
    <span data-status={status}>{children ?? status}</span>
  ),
}));

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Inbox from "./inbox";

function renderInbox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Inbox />
    </QueryClientProvider>,
  );
}

const hasText = (needle: string) => (content: string) => content.includes(needle);

beforeEach(() => {
  store.list = [...CONVERSATIONS];
  store.messages = [...DETAIL_MESSAGES];
  store.links = [...DETAIL_LINKS];
  apiFetchSpy.mockReset();
  apiFetchSpy.mockResolvedValue({});
  toastSpy.mockReset();
});

describe("#2138 slice 2 — conversation-first /inbox", () => {
  it("renders the conversation list from the Canon endpoint", () => {
    renderInbox();
    // The row renders canon fields: participant name + unread + status.
    expect(screen.getByTestId("conversation-row-11")).toBeTruthy();
    expect(screen.getAllByText(hasText("عميل الاختبار")).length).toBeGreaterThan(0);
    // The row's status badge carries the conversation status from the API.
    expect(screen.getByTestId("conversation-row-11").querySelector('[data-status="open"]')).toBeTruthy();
    // No-selection placeholder shows until a conversation is picked.
    expect(screen.getByTestId("inbox-no-selection")).toBeTruthy();
  });

  it("shows the empty state when the canon list is empty", () => {
    store.list = [];
    renderInbox();
    expect(screen.getByTestId("inbox-list-empty")).toBeTruthy();
  });

  it("opens a conversation: renders the thread and the context panel links", async () => {
    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByTestId("conversation-row-11"));
    // Thread message body visible (also appears as the list preview —
    // hence findAllByText).
    expect((await screen.findAllByText(hasText("مرحبا، أين الفاتورة؟"))).length).toBeGreaterThan(0);
    // Context panel shows the conversation_links entry (clients #7).
    expect(screen.getByTestId("inbox-context-panel")).toBeTruthy();
    expect(screen.getByTestId("inbox-links-list").textContent).toContain("#7");
    expect(screen.getByTestId("inbox-links-list").textContent).toContain("عميل");
  });

  it("replies ONLY through the canon conversations endpoint and shows the reply after send", async () => {
    apiFetchSpy.mockImplementation((path: string, options?: any) => {
      if (path === "/inbox/conversations/11/messages") {
        store.messages = [
          ...store.messages,
          {
            id: 102, channel: "email", direction: "outbound",
            fromAddress: null, toAddress: "client@test.local",
            subject: null, body: JSON.parse(options.body).body,
            status: "queued", createdAt: "2026-06-12T11:00:00Z", isRead: true,
          },
        ];
        return Promise.resolve({ logId: 500, queued: true, blocked: false, dlpMatches: [] });
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByTestId("conversation-row-11"));
    await user.type(screen.getByTestId("inbox-reply-input"), "تم إرسال الفاتورة لكم");
    await user.click(screen.getByTestId("inbox-reply-send"));

    // The reply rendered in the thread after the refetch.
    expect(await screen.findByText(hasText("تم إرسال الفاتورة لكم"))).toBeTruthy();

    // Every write went to the canon surface — never the legacy send paths.
    const calledPaths = apiFetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calledPaths).toContain("/inbox/conversations/11/messages");
    expect(calledPaths.some((p) => p.includes("/inbox/send"))).toBe(false);
    expect(calledPaths.some((p) => p.includes("/reply"))).toBe(false);
  });

  it("renders the DLP-blocked state when the canon endpoint blocks the send", async () => {
    apiFetchSpy.mockImplementation((path: string) => {
      if (path === "/inbox/conversations/11/messages") {
        return Promise.reject(
          new MockApiError("حُجبت الرسالة بواسطة قواعد حماية البيانات (DLP)", {
            code: "DLP_BLOCKED",
            meta: { reason: "رقم هوية داخل النص", dlpMatches: [{ rule: "national-id" }] },
          }),
        );
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByTestId("conversation-row-11"));
    await user.type(screen.getByTestId("inbox-reply-input"), "هوية 1234567890");
    await user.click(screen.getByTestId("inbox-reply-send"));

    const notice = await screen.findByTestId("inbox-dlp-blocked");
    expect(notice.textContent).toContain("رقم هوية داخل النص");
    expect(notice.textContent).toContain("national-id");
  });

  it("surfaces a failed send as a destructive toast (and never as silence)", async () => {
    apiFetchSpy.mockImplementation((path: string) => {
      if (path === "/inbox/conversations/11/messages") {
        return Promise.reject(new Error("انقطع الاتصال بالخادم"));
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderInbox();
    await user.click(screen.getByTestId("conversation-row-11"));
    await user.type(screen.getByTestId("inbox-reply-input"), "رسالة");
    await user.click(screen.getByTestId("inbox-reply-send"));

    await waitFor(() => {
      expect(toastSpy.mock.calls.some((c) => String(c[0]?.title).includes("فشل الإرسال"))).toBe(true);
    });
  });
});
