/**
 * Smoke tests for notifyBusinessEvent — the wrapper used by event
 * listeners to fan-out a business event into in-app + email + sms +
 * whatsapp through templates + the recipient resolver.
 *
 * Validates: the wrapper passes the right shape into
 * dispatchNotification, including the recipient lookups (email + cc +
 * phone + whatsapp + language), and that it survives a missing
 * recipientUser by simply omitting those fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/notificationDispatch.js", () => ({
  dispatchNotification: vi.fn(async () => ({ deliveryIds: [] })),
}));
vi.mock("../../src/lib/recipientResolver.js", () => ({
  resolveRecipient: vi.fn(),
  shouldCcPersonalEmail: vi.fn(async () => false),
}));

import { notifyBusinessEvent } from "../../src/lib/notifyBusinessEvent.js";
import { dispatchNotification } from "../../src/lib/notificationDispatch.js";
import { resolveRecipient, shouldCcPersonalEmail } from "../../src/lib/recipientResolver.js";

const dispatchSpy = vi.mocked(dispatchNotification);
const resolveSpy = vi.mocked(resolveRecipient);
const policySpy = vi.mocked(shouldCcPersonalEmail);

beforeEach(() => {
  dispatchSpy.mockClear();
  resolveSpy.mockReset();
  policySpy.mockReset().mockResolvedValue(false);
});

describe("notifyBusinessEvent — happy path", () => {
  it("dispatches with templateKey + vars + assignment without recipient", async () => {
    await notifyBusinessEvent({
      companyId: 1,
      templateKey: "invoice.created",
      templateVars: { invoiceRef: "INV-1", customerName: "X", amount: "100" },
      fallbackTitle: "fb-title",
      fallbackBody: "fb-body",
      assignmentId: 99,
      priority: "high",
      refType: "invoice",
      refId: 42,
      actionUrl: "/finance/invoices/42",
    });
    expect(dispatchSpy).toHaveBeenCalledOnce();
    const call = dispatchSpy.mock.calls[0]![0] as { templateKey: string; templateVars: Record<string, string>; eventCategory: string; assignmentId: number; priority: string };
    expect(call.templateKey).toBe("invoice.created");
    expect(call.templateVars.invoiceRef).toBe("INV-1");
    expect(call.eventCategory).toBe("invoice.created");
    expect(call.assignmentId).toBe(99);
    expect(call.priority).toBe("high");
  });

  it("resolves recipient email + phone + whatsapp for the same entity", async () => {
    // Three calls — email, sms, whatsapp — each returning a different shape.
    resolveSpy
      .mockResolvedValueOnce({ primary: "x@y", cc: null, displayName: "X", language: "en", entityId: 5, companyId: 1 })
      .mockResolvedValueOnce({ primary: "+1", cc: null, displayName: "X", language: "en", entityId: 5, companyId: 1 })
      .mockResolvedValueOnce({ primary: "+1", cc: null, displayName: "X", language: "en", entityId: 5, companyId: 1 });
    await notifyBusinessEvent({
      companyId: 1,
      templateKey: "leave.request.created",
      templateVars: {},
      fallbackTitle: "t", fallbackBody: "b",
      recipientUser: { type: "employee", id: 5 },
    });
    expect(resolveSpy).toHaveBeenCalledTimes(3);
    const call = dispatchSpy.mock.calls[0]![0] as { recipientEmail: string; recipientPhone: string; recipientWhatsApp: string; language: "ar" | "en" };
    expect(call.recipientEmail).toBe("x@y");
    expect(call.recipientPhone).toBe("+1");
    expect(call.recipientWhatsApp).toBe("+1");
    expect(call.language).toBe("en");
  });

  it("forwards CC into metadata when shouldCcPersonalEmail=true and resolver returns cc", async () => {
    policySpy.mockResolvedValue(true);
    resolveSpy
      .mockResolvedValueOnce({ primary: "work@org", cc: "personal@gmail", displayName: "X", language: "ar", entityId: 5, companyId: 1 })
      .mockResolvedValueOnce({ primary: "+1", cc: null, displayName: "X", language: "ar", entityId: 5, companyId: 1 })
      .mockResolvedValueOnce({ primary: "+1", cc: null, displayName: "X", language: "ar", entityId: 5, companyId: 1 });
    await notifyBusinessEvent({
      companyId: 1,
      templateKey: "payroll.ready",
      templateVars: {},
      fallbackTitle: "t", fallbackBody: "b",
      recipientUser: { type: "user", id: 5 },
    });
    const call = dispatchSpy.mock.calls[0]![0] as { metadata: { cc: string } };
    expect(call.metadata.cc).toBe("personal@gmail");
  });

  it("never throws on dispatch failure", async () => {
    dispatchSpy.mockRejectedValueOnce(new Error("boom"));
    await expect(notifyBusinessEvent({
      companyId: 1, templateKey: "x", templateVars: {},
      fallbackTitle: "t", fallbackBody: "b",
    })).resolves.toBeUndefined();
  });
});
