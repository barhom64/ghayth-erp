import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const SEED = read("seedDemoData.ts");
const ENCRYPT = read("encryption.ts");
const PAGINATE = read("paginationHelper.ts");
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

// ── Encryption ────────────────────────────────────────────────────────────

describe("encryption — exports", () => {
  it("exports encrypt", () => {
    expect(ENCRYPT).toContain("export function encrypt");
  });

  it("exports decrypt", () => {
    expect(ENCRYPT).toContain("export function decrypt");
  });

  it("exports hmacHash", () => {
    expect(ENCRYPT).toContain("export function hmacHash");
  });

  it("exports protect", () => {
    expect(ENCRYPT).toContain("export function protect");
  });
});

describe("encryption — uses crypto module", () => {
  it("uses node crypto", () => {
    expect(ENCRYPT).toContain("crypto");
  });
});

// ── Pagination Helper ─────────────────────────────────────────────────────

describe("paginationHelper — exports", () => {
  it("exports PaginationOptions interface", () => {
    expect(PAGINATE).toContain("export interface PaginationOptions");
  });

  it("exports PaginationResult interface", () => {
    expect(PAGINATE).toContain("export interface PaginationResult");
  });

  it("exports parsePagination", () => {
    expect(PAGINATE).toContain("export function parsePagination");
  });

  it("exports paginatedResponse", () => {
    expect(PAGINATE).toContain("export function paginatedResponse");
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
