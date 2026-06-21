/**
 * Feature (البند 4) — comment scoped to a specific attachment. Pins that
 * EntityComments threads the documentId into both the list URL and the POST
 * body, and stays entity-level (no documentId) when the prop is omitted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const apiMock = vi.hoisted(() => ({ lastListUrl: "", post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  useApiQuery: (_k: string[], url: string) => {
    apiMock.lastListUrl = url;
    return { data: { data: [] } };
  },
  apiFetch: (url: string, opts: any) => apiMock.post(url, opts),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { EntityComments } from "./entity-comments";

function render2(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => { apiMock.lastListUrl = ""; apiMock.post.mockReset().mockResolvedValue({}); cleanup(); });

describe("EntityComments — attachment scope", () => {
  it("entity-level: no documentId in the list URL", () => {
    render2(<EntityComments entityType="employee" entityId={1} />);
    expect(apiMock.lastListUrl).toBe("/entity-meta/comments/employee/1");
  });

  it("attachment-scoped: threads documentId into the list URL", () => {
    render2(<EntityComments entityType="employee" entityId={1} documentId={42} />);
    expect(apiMock.lastListUrl).toBe("/entity-meta/comments/employee/1?documentId=42");
  });

  it("posts the documentId in the body when scoped", async () => {
    const user = userEvent.setup();
    render2(<EntityComments entityType="employee" entityId={1} documentId={42} />);
    await user.type(screen.getByPlaceholderText("أضف تعليقاً..."), "ملاحظة على المرفق");
    await user.click(screen.getByRole("button"));
    expect(apiMock.post).toHaveBeenCalledWith(
      "/entity-meta/comments/employee/1",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"documentId":42') }),
    );
  });
});
