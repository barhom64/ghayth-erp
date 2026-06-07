/**
 * Smoke tests for the centralized recipient resolver.
 *
 * The resolver doesn't send. It only computes addresses. These tests
 * use a vi.mock'd rawdb so they exercise the channel × entity matrix
 * without touching Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRows: { value: Record<string, unknown>[] } = { value: [] };
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => mockRows.value),
  rawExecute: vi.fn(),
  assertInsert: vi.fn(),
}));

import { resolveRecipient, shouldCcPersonalEmail } from "../../src/lib/recipientResolver.js";

beforeEach(() => {
  mockRows.value = [];
});

describe("resolveRecipient — employee", () => {
  it("returns null when the entity does not exist", async () => {
    mockRows.value = [];
    const r = await resolveRecipient("employee", 999, "email", { companyId: 1 });
    expect(r).toBeNull();
  });

  it("prefers internalEmail over the legacy email column", async () => {
    mockRows.value = [{
      id: 5, name: "أحمد",
      phone: "+966500000000",
      email: "old@example.com",
      personalEmail: "ahmed.personal@gmail.com",
      internalEmail: "ahmed@ghayth.app",
      companyId: 1, userId: 10, preferredLocale: "ar",
    }];
    const r = await resolveRecipient("employee", 5, "email", { companyId: 1 });
    expect(r?.primary).toBe("ahmed@ghayth.app");
    expect(r?.displayName).toBe("أحمد");
    expect(r?.language).toBe("ar");
  });

  it("CCs personalEmail only when the policy is enabled", async () => {
    mockRows.value = [{
      id: 5, name: "Ahmed",
      phone: null, email: null,
      personalEmail: "ahmed@gmail.com",
      internalEmail: "ahmed@ghayth.app",
      companyId: 1, userId: 10, preferredLocale: "en",
    }];
    const withCc = await resolveRecipient("employee", 5, "email", { companyId: 1, ccPersonalEmail: true });
    expect(withCc?.cc).toBe("ahmed@gmail.com");

    mockRows.value = [{
      id: 5, name: "Ahmed",
      phone: null, email: null,
      personalEmail: "ahmed@gmail.com",
      internalEmail: "ahmed@ghayth.app",
      companyId: 1, userId: 10, preferredLocale: "en",
    }];
    const withoutCc = await resolveRecipient("employee", 5, "email", { companyId: 1, ccPersonalEmail: false });
    expect(withoutCc?.cc).toBeNull();
  });

  it("returns phone for SMS and WhatsApp", async () => {
    const row = {
      id: 5, name: "أحمد",
      phone: "+966500000000",
      email: "x@y", personalEmail: null, internalEmail: null,
      companyId: 1, userId: null, preferredLocale: null,
    };
    mockRows.value = [row];
    const sms = await resolveRecipient("employee", 5, "sms", { companyId: 1 });
    expect(sms?.primary).toBe("+966500000000");

    mockRows.value = [row];
    const wa = await resolveRecipient("employee", 5, "whatsapp", { companyId: 1 });
    expect(wa?.primary).toBe("+966500000000");
  });

  it("returns 'en' language when preferredLocale='en'", async () => {
    mockRows.value = [{
      id: 5, name: "John",
      phone: "+1", email: "j@x", personalEmail: null, internalEmail: "j@x",
      companyId: 1, userId: 10, preferredLocale: "en",
    }];
    const r = await resolveRecipient("employee", 5, "email", { companyId: 1 });
    expect(r?.language).toBe("en");
  });

  it("defaults to 'ar' when preferredLocale is unset", async () => {
    mockRows.value = [{
      id: 5, name: "X",
      phone: "+1", email: "x@y", personalEmail: null, internalEmail: "x@y",
      companyId: 1, userId: null, preferredLocale: null,
    }];
    const r = await resolveRecipient("employee", 5, "email", { companyId: 1 });
    expect(r?.language).toBe("ar");
  });
});

describe("resolveRecipient — client", () => {
  it("returns email for email channel and phone for sms/whatsapp", async () => {
    const row = { id: 1, name: "العميل", phone: "+1", email: "c@x", companyId: 1 };
    mockRows.value = [row];
    const email = await resolveRecipient("client", 1, "email", { companyId: 1 });
    expect(email?.primary).toBe("c@x");
    expect(email?.cc).toBeNull();

    mockRows.value = [row];
    const sms = await resolveRecipient("client", 1, "sms", { companyId: 1 });
    expect(sms?.primary).toBe("+1");
  });

  it("never CCs the client's email (no personal-email concept)", async () => {
    mockRows.value = [{ id: 1, name: "X", phone: null, email: "x@y", companyId: 1 }];
    const r = await resolveRecipient("client", 1, "email", { companyId: 1, ccPersonalEmail: true });
    expect(r?.cc).toBeNull();
  });
});

describe("resolveRecipient — supplier", () => {
  it("returns email + phone correctly per channel", async () => {
    const row = { id: 9, name: "مورد", phone: "+9", email: "s@x", companyId: 1 };
    mockRows.value = [row];
    const e = await resolveRecipient("supplier", 9, "email", { companyId: 1 });
    expect(e?.primary).toBe("s@x");
    expect(e?.displayName).toBe("مورد");

    mockRows.value = [row];
    const w = await resolveRecipient("supplier", 9, "whatsapp", { companyId: 1 });
    expect(w?.primary).toBe("+9");
  });
});

describe("resolveRecipient — user", () => {
  it("rejects when the user's linked employee belongs to another company", async () => {
    mockRows.value = [{
      id: 1, email: "u@x", preferredLocale: "ar", employeeId: 7,
      empPhone: null, empName: null, empPersonalEmail: null,
      empCompanyId: 999, // different tenant
    }];
    const r = await resolveRecipient("user", 1, "email", { companyId: 1 });
    expect(r).toBeNull();
  });

  it("returns user email + employee CC if policy enabled", async () => {
    mockRows.value = [{
      id: 1, email: "u@org", preferredLocale: "en", employeeId: 7,
      empPhone: "+5", empName: "John", empPersonalEmail: "j@gmail",
      empCompanyId: 1,
    }];
    const r = await resolveRecipient("user", 1, "email", { companyId: 1, ccPersonalEmail: true });
    expect(r?.primary).toBe("u@org");
    expect(r?.cc).toBe("j@gmail");
    expect(r?.language).toBe("en");
  });
});

describe("shouldCcPersonalEmail", () => {
  it("returns false when no setting row exists", async () => {
    mockRows.value = [];
    expect(await shouldCcPersonalEmail(1)).toBe(false);
  });

  it("returns true when setting value is JSON true", async () => {
    mockRows.value = [{ value: true }];
    expect(await shouldCcPersonalEmail(1)).toBe(true);
  });

  it("returns false when value is anything other than literal true", async () => {
    mockRows.value = [{ value: "true" }]; // string, not boolean
    expect(await shouldCcPersonalEmail(1)).toBe(false);
  });
});
