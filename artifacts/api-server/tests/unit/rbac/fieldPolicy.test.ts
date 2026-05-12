import { describe, it, expect } from "vitest";
import { applyFieldPolicy } from "../../../src/lib/rbac/authzEngine.js";

describe("applyFieldPolicy", () => {
  it("returns payload unchanged when policy is empty or absent", () => {
    const payload = { id: 1, salary: 5000, name: "أحمد" };
    expect(applyFieldPolicy(payload, undefined)).toEqual(payload);
    expect(applyFieldPolicy(payload, {})).toEqual(payload);
  });

  it("hides fields marked as hidden", () => {
    const payload = { id: 1, salary: 5000, name: "أحمد" };
    const out = applyFieldPolicy(payload, { salary: "hidden" }) as any;
    expect(out).not.toHaveProperty("salary");
    expect(out.name).toBe("أحمد");
    expect(out.id).toBe(1);
  });

  it("masks fields marked as masked", () => {
    const payload = { iban: "SA0380000000608010167519", name: "Public" };
    const out = applyFieldPolicy(payload, { iban: "masked" }) as any;
    expect(out.iban).not.toBe("SA0380000000608010167519");
    expect(out.iban).toMatch(/^SA.+\*.+19$/);
    expect(out.name).toBe("Public");
  });

  it("recurses into nested objects", () => {
    const payload = {
      id: 1,
      profile: { salary: 5000, address: "Riyadh" },
    };
    const out = applyFieldPolicy(payload, { salary: "hidden" }) as any;
    expect(out.profile).not.toHaveProperty("salary");
    expect(out.profile.address).toBe("Riyadh");
  });

  it("recurses into arrays of objects", () => {
    const payload = {
      data: [
        { id: 1, salary: 5000 },
        { id: 2, salary: 7000 },
      ],
    };
    const out = applyFieldPolicy(payload, { salary: "hidden" }) as any;
    expect(out.data).toHaveLength(2);
    expect(out.data[0]).not.toHaveProperty("salary");
    expect(out.data[1]).not.toHaveProperty("salary");
    expect(out.data[0].id).toBe(1);
  });

  it("masks short values as ****", () => {
    const out = applyFieldPolicy({ pin: "12" }, { pin: "masked" }) as any;
    expect(out.pin).toBe("****");
  });

  it("masks null values as ***", () => {
    const out = applyFieldPolicy({ pin: null }, { pin: "masked" }) as any;
    expect(out.pin).toBe("***");
  });

  it("does not mutate the original object", () => {
    const payload = { id: 1, salary: 5000 };
    applyFieldPolicy(payload, { salary: "hidden" });
    expect(payload).toEqual({ id: 1, salary: 5000 });
  });

  it("handles primitive payloads gracefully", () => {
    expect(applyFieldPolicy("hello", { x: "hidden" })).toBe("hello");
    expect(applyFieldPolicy(42, { x: "hidden" })).toBe(42);
    expect(applyFieldPolicy(null, { x: "hidden" })).toBe(null);
  });
});
