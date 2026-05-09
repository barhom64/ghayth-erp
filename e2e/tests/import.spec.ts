// Import-engine API round-trip test.
//
// Calls the new /api/import endpoints directly (no UI wiring yet) to prove
// the engine works end-to-end against a real DB. Using `request` rather than
// `page` means we don't need a browser, so this runs even without the
// frontend being up.

import { test, expect, request as apiRequest } from "@playwright/test";
import { TEST_API_URL } from "../playwright.config.js";

const EMAIL = process.env.E2E_USER_EMAIL ?? "owner@local.test";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "Test1234!";

async function authedContext() {
  const ctx = await apiRequest.newContext({ baseURL: TEST_API_URL });
  const login = await ctx.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!login.ok()) {
    throw new Error(`Login failed: ${login.status()} ${await login.text()}`);
  }
  return ctx;
}

test.describe("Generic Import Engine API", () => {
  test("lists supported entities", async () => {
    const ctx = await authedContext();
    const res = await ctx.get("/api/import/entities");
    expect(res.ok(), `status=${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "clients" }),
        expect.objectContaining({ entity: "suppliers" }),
        expect.objectContaining({ entity: "products" }),
        expect.objectContaining({ entity: "employees" }),
        expect.objectContaining({ entity: "expenses" }),
        expect.objectContaining({ entity: "invoices" }),
      ]),
    );
  });

  test("returns a clients template", async () => {
    const ctx = await authedContext();
    const res = await ctx.get("/api/import/template/clients");
    expect(res.ok(), `status=${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.entity).toBe("clients");
    expect(body.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "name", required: true }),
      ]),
    );
  });

  test("preview accepts pre-parsed rows and returns a diff", async () => {
    const ctx = await authedContext();
    const res = await ctx.post("/api/import/preview", {
      data: {
        entity: "clients",
        rows: [
          { name: "E2E Test Client A", phone: "0500000001", type: "individual" },
          { name: "E2E Test Client B", phone: "0500000002", type: "company" },
        ],
      },
    });
    expect(res.ok(), `status=${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body.entityKey).toBe("clients");
    expect(body.totalRows).toBe(2);
    expect(Array.isArray(body.newRows)).toBeTruthy();
  });

  test("rejects unknown entity", async () => {
    const ctx = await authedContext();
    const res = await ctx.post("/api/import/preview", {
      data: { entity: "ghosts", rows: [{ name: "x" }] },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
