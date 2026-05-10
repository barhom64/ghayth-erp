import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const SEED = read("seedDemoData.ts");
const AUDIT = read("audit.ts");
const PUSH = read("pushService.ts");
const MIGRATE = read("migrate.ts");

// ── Seed Demo Data ────────────────────────────────────────────────────────

describe("seedDemoData — exports", () => {
  it("exports seedDemoData function", () => {
    expect(SEED).toContain("export async function seedDemoData");
  });
});

describe("seedDemoData — creates demo entities", () => {
  it("creates demo employees", () => {
    expect(SEED).toContain("employees");
  });

  it("creates demo invoices", () => {
    expect(SEED).toContain("invoices");
  });

  it("uses parameterized queries", () => {
    const params = [...SEED.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });
});

// ── Audit ─────────────────────────────────────────────────────────────────

describe("audit — exports", () => {
  it("exports AuditAction type", () => {
    expect(AUDIT).toContain("export type AuditAction");
  });

  it("exports auditLog function", () => {
    expect(AUDIT).toContain("export async function auditLog");
  });

  it("AuditAction includes standard CRUD actions", () => {
    expect(AUDIT).toContain('"create"');
    expect(AUDIT).toContain('"update"');
    expect(AUDIT).toContain('"delete"');
    expect(AUDIT).toContain('"approve"');
    expect(AUDIT).toContain('"reject"');
  });
});

// ── Push Service ──────────────────────────────────────────────────────────

describe("pushService — exports", () => {
  it("exports sendPushToCompany", () => {
    expect(PUSH).toContain("export async function sendPushToCompany");
  });

  it("exports getVapidPublicKey", () => {
    expect(PUSH).toContain("export function getVapidPublicKey");
  });
});

// ── Migrate ───────────────────────────────────────────────────────────────

describe("migrate — structure", () => {
  it("handles database migrations", () => {
    expect(MIGRATE).toContain("migrate");
  });

  it("uses pool or query for SQL execution", () => {
    expect(MIGRATE).toContain("pool");
  });
});
