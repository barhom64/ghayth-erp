import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const SCOPED = read("scopedQuery.ts");
const INTEGRATION = read("integrationService.ts");
const STORAGE = read("objectStorage.ts");
const ACL = read("objectAcl.ts");
const ACTIVITY = read("activityTracker.ts");
const SCHEDULE = read("scheduleBuilder.ts");
const DOMAIN = read("domainRegistry.ts");

// ══════════════════════════════════════════════════════════════════════════
// SCOPED QUERY
// ══════════════════════════════════════════════════════════════════════════

describe("scopedQuery — exports", () => {
  it("exports parseScopeFilters", () => {
    expect(SCOPED).toContain("export function parseScopeFilters");
  });

  it("exports ScopeFilters interface", () => {
    expect(SCOPED).toContain("export interface ScopeFilters");
  });

  it("exports ScopedQueryOptions interface", () => {
    expect(SCOPED).toContain("export interface ScopedQueryOptions");
  });

  it("exports buildScopedWhere", () => {
    expect(SCOPED).toContain("export function buildScopedWhere");
  });

  it("exports scopedQuery", () => {
    expect(SCOPED).toContain("export async function scopedQuery");
  });

  it("exports scopedCount", () => {
    expect(SCOPED).toContain("export async function scopedCount");
  });
});

describe("scopedQuery — security", () => {
  it("builds parameterized queries dynamically", () => {
    expect(SCOPED).toContain("paramIdx");
  });

  it("scopes by companyId", () => {
    expect(SCOPED).toContain("companyId");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// INTEGRATION SERVICE
// ══════════════════════════════════════════════════════════════════════════

describe("integrationService — exports", () => {
  it("exports SendOptions interface", () => {
    expect(INTEGRATION).toContain("export interface SendOptions");
  });

  it("exports sendViaIntegration", () => {
    expect(INTEGRATION).toContain("export async function sendViaIntegration");
  });

  it("exports retryFailedMessages", () => {
    expect(INTEGRATION).toContain("export async function retryFailedMessages");
  });

  it("exports integrationService facade", () => {
    expect(INTEGRATION).toContain("export const integrationService");
  });
});

describe("integrationService — channels", () => {
  it("supports email sending", () => {
    expect(INTEGRATION).toContain("sendEmail");
  });

  it("supports webhook sending", () => {
    expect(INTEGRATION).toContain("sendWebhook");
  });

  it("logs integration attempts", () => {
    expect(INTEGRATION).toContain("logIntegrationAttempt");
  });
});

describe("integrationService — security", () => {
  it("uses parameterized queries", () => {
    const params = [...INTEGRATION.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OBJECT STORAGE
// ══════════════════════════════════════════════════════════════════════════

describe("objectStorage — exports", () => {
  it("exports objectStorageClient", () => {
    expect(STORAGE).toContain("export const objectStorageClient");
  });

  it("exports ObjectNotFoundError", () => {
    expect(STORAGE).toContain("export class ObjectNotFoundError");
  });

  it("exports ObjectStorageService", () => {
    expect(STORAGE).toContain("export class ObjectStorageService");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// OBJECT ACL
// ══════════════════════════════════════════════════════════════════════════

describe("objectAcl — exports", () => {
  it("exports setObjectAclPolicy", () => {
    expect(ACL).toContain("export async function setObjectAclPolicy");
  });

  it("exports getObjectAclPolicy", () => {
    expect(ACL).toContain("export async function getObjectAclPolicy");
  });

  it("exports canAccessObject", () => {
    expect(ACL).toContain("export async function canAccessObject");
  });

  it("exports ObjectAccessGroupType enum", () => {
    expect(ACL).toContain("export enum ObjectAccessGroupType");
  });

  it("exports ObjectPermission enum", () => {
    expect(ACL).toContain("export enum ObjectPermission");
  });

  it("exports ObjectAclPolicy interface", () => {
    expect(ACL).toContain("export interface ObjectAclPolicy");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ACTIVITY TRACKER
// ══════════════════════════════════════════════════════════════════════════

describe("activityTracker — exports", () => {
  it("exports activityTrackerMiddleware", () => {
    expect(ACTIVITY).toContain("export function activityTrackerMiddleware");
  });

  it("exports logPageView", () => {
    expect(ACTIVITY).toContain("export async function logPageView");
  });

  it("exports getUsageStats", () => {
    expect(ACTIVITY).toContain("export async function getUsageStats");
  });
});

describe("activityTracker — entity extraction", () => {
  it("has extractEntity helper", () => {
    expect(ACTIVITY).toContain("function extractEntity");
  });
});

describe("activityTracker — security", () => {
  it("uses parameterized queries", () => {
    const params = [...ACTIVITY.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(3);
  });

  it("scopes by companyId", () => {
    expect(ACTIVITY).toContain("companyId");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SCHEDULE BUILDER
// ══════════════════════════════════════════════════════════════════════════

describe("scheduleBuilder — exports", () => {
  it("exports ScheduleItem interface", () => {
    expect(SCHEDULE).toContain("export interface ScheduleItem");
  });

  it("exports EmployeeSchedule interface", () => {
    expect(SCHEDULE).toContain("export interface EmployeeSchedule");
  });

  it("exports buildEmployeeSchedule", () => {
    expect(SCHEDULE).toContain("export async function buildEmployeeSchedule");
  });

  it("exports buildAllSchedules", () => {
    expect(SCHEDULE).toContain("export async function buildAllSchedules");
  });
});

describe("scheduleBuilder — security", () => {
  it("uses parameterized queries", () => {
    const params = [...SCHEDULE.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(3);
  });

  it("scopes by companyId", () => {
    expect(SCHEDULE).toContain("companyId");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DOMAIN REGISTRY
// ══════════════════════════════════════════════════════════════════════════

describe("domainRegistry — exports", () => {
  it("exports DomainDefinition interface", () => {
    expect(DOMAIN).toContain("export interface DomainDefinition");
  });

  it("exports DOMAIN_REGISTRY array", () => {
    expect(DOMAIN).toContain("export const DOMAIN_REGISTRY");
  });

  it("exports getDomain", () => {
    expect(DOMAIN).toContain("export function getDomain");
  });

  it("exports getDomainsWithGL", () => {
    expect(DOMAIN).toContain("export function getDomainsWithGL");
  });

  it("exports getDomainsUsingEngine", () => {
    expect(DOMAIN).toContain("export function getDomainsUsingEngine");
  });

  it("exports getAllTables", () => {
    expect(DOMAIN).toContain("export function getAllTables");
  });

  it("exports findDomainByTable", () => {
    expect(DOMAIN).toContain("export function findDomainByTable");
  });

  it("exports getSystemStats", () => {
    expect(DOMAIN).toContain("export function getSystemStats");
  });
});
