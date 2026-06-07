/**
 * Inbox classifier v2 tests — pure-function pieces of the
 * inbox.message.received listener. The listener itself wires DB lookups
 * and the task insert; here we lock down the regex table + VIP lift +
 * SLA window math so future tweaks can't silently regress.
 */
import { describe, it, expect } from "vitest";
import {
  classifyInboxMessage,
  liftPriorityForClassification,
  SLA_HOURS_BY_PRIORITY,
  INBOX_RULES,
} from "../../src/lib/inboxClassifier.js";

describe("classifyInboxMessage", () => {
  it("matches Arabic complaint anywhere in the haystack (subject or body)", () => {
    expect(classifyInboxMessage("استفسار عام\n\nشكوى بخصوص الخدمة")?.type).toBe("complaint");
  });

  it("matches English complaint", () => {
    expect(classifyInboxMessage("Complaint about my last order")?.type).toBe("complaint");
  });

  it("urgent beats subset matches (regression: 'request' in urgent body)", () => {
    // 'urgent request' contains both 'urgent' AND 'request' — urgent must win
    // because it's the second rule and has more weight, but complaint comes first.
    expect(classifyInboxMessage("urgent: please process my request")?.type).toBe("urgent");
  });

  it("billing matches Arabic فاتورة and English invoice", () => {
    expect(classifyInboxMessage("سؤال عن الفاتورة الأخيرة")?.type).toBe("billing");
    expect(classifyInboxMessage("question about invoice #123")?.type).toBe("billing");
  });

  it("request fallback", () => {
    expect(classifyInboxMessage("apply for the position")?.type).toBe("request");
  });

  it("inquiry fallback", () => {
    expect(classifyInboxMessage("just an inquiry about your services")?.type).toBe("inquiry");
  });

  it("returns null for empty / whitespace-only input", () => {
    expect(classifyInboxMessage("")).toBeNull();
    expect(classifyInboxMessage("    \n\n   ")).toBeNull();
  });

  it("returns null when no rule matches", () => {
    expect(classifyInboxMessage("hello, how are you?")).toBeNull();
  });

  it("complaint priority is high, urgent is urgent (sanity)", () => {
    expect(INBOX_RULES.find(r => r.type === "complaint")?.priority).toBe("high");
    expect(INBOX_RULES.find(r => r.type === "urgent")?.priority).toBe("urgent");
  });
});

describe("liftPriorityForClassification", () => {
  it("vip + normal → high", () => {
    expect(liftPriorityForClassification("normal", "vip")).toBe("high");
  });

  it("premium + normal → high", () => {
    expect(liftPriorityForClassification("normal", "premium")).toBe("high");
  });

  it("vip + high → urgent (one notch up)", () => {
    expect(liftPriorityForClassification("high", "vip")).toBe("urgent");
  });

  it("vip + urgent stays urgent (cap)", () => {
    expect(liftPriorityForClassification("urgent", "vip")).toBe("urgent");
  });

  it("vip + low stays low (only normal/high are lifted)", () => {
    // Design choice — low-priority inquiries from a vip stay 'low'
    // because the keyword already said it's not urgent.
    expect(liftPriorityForClassification("low", "vip")).toBe("low");
  });

  it("regular client does NOT lift priority", () => {
    expect(liftPriorityForClassification("normal", "regular")).toBe("normal");
  });

  it("null classification → no lift", () => {
    expect(liftPriorityForClassification("normal", null)).toBe("normal");
  });

  it("prospect / churned do NOT lift", () => {
    expect(liftPriorityForClassification("normal", "prospect")).toBe("normal");
    expect(liftPriorityForClassification("normal", "churned")).toBe("normal");
  });
});

describe("SLA_HOURS_BY_PRIORITY", () => {
  it("decreasing windows: urgent < high < normal < low", () => {
    expect(SLA_HOURS_BY_PRIORITY.urgent).toBeLessThan(SLA_HOURS_BY_PRIORITY.high);
    expect(SLA_HOURS_BY_PRIORITY.high).toBeLessThan(SLA_HOURS_BY_PRIORITY.normal);
    expect(SLA_HOURS_BY_PRIORITY.normal).toBeLessThan(SLA_HOURS_BY_PRIORITY.low);
  });

  it("urgent fires within hours, low can wait days", () => {
    expect(SLA_HOURS_BY_PRIORITY.urgent).toBeLessThanOrEqual(4);
    expect(SLA_HOURS_BY_PRIORITY.low).toBeGreaterThanOrEqual(48);
  });
});
