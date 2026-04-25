import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMAIN_REGISTRY } from "../../src/lib/domainRegistry.js";

const API_SRC = join(import.meta.dirname!, "../../src");
const source = readFileSync(join(API_SRC, "lib/cronScheduler.ts"), "utf8");

const jobNameMatches = [...source.matchAll(/{\s*name:\s*"([^"]+)"/g)];
const cronJobNames = jobNameMatches.map((m) => m[1]);

describe("Cron scheduler structure", () => {
  it("exports startCronScheduler", () => {
    expect(source).toContain("export async function startCronScheduler");
  });

  it("exports stopCronScheduler", () => {
    expect(source).toContain("export function stopCronScheduler");
  });

  it("exports reloadCronScheduler", () => {
    expect(source).toContain("export async function reloadCronScheduler");
  });

  it("has at least 20 cron jobs defined", () => {
    expect(cronJobNames.length).toBeGreaterThanOrEqual(20);
  });

  it("no duplicate cron job names", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const name of cronJobNames) {
      if (seen.has(name)) dupes.push(name);
      seen.add(name);
    }
    expect(dupes, `Duplicate cron jobs: ${dupes.join(", ")}`).toEqual([]);
  });

  it("all cron jobs use snake_case naming", () => {
    const invalid = cronJobNames.filter(
      (n) => !/^[a-z][a-z0-9_]*$/.test(n)
    );
    expect(invalid).toEqual([]);
  });
});

describe("Cron lock mechanism", () => {
  it("uses PostgreSQL-based advisory locking", () => {
    expect(source).toContain("cron_locks");
  });

  it("acquires lock before running a job", () => {
    expect(source).toContain("acquireCronLock");
  });

  it("releases lock after job completion", () => {
    expect(source).toContain("releaseCronLock");
  });

  it("has a lock TTL to prevent stale locks", () => {
    expect(source).toMatch(/LOCK_TTL_MINUTES\s*=\s*\d+/);
  });

  it("skips jobs when lock cannot be acquired", () => {
    expect(source).toContain("already running on another instance");
  });
});

describe("Cron logging", () => {
  it("logs to cron_logs table", () => {
    expect(source).toContain("INSERT INTO cron_logs");
  });

  it("records job duration", () => {
    expect(source).toContain("duration");
  });

  it("records both success and failure status", () => {
    expect(source).toContain('"success"');
    expect(source).toContain('"failed"');
  });

  it("updates lastRunAt and lastStatus on cron_jobs table", () => {
    expect(source).toContain('"lastRunAt"');
    expect(source).toContain('"lastStatus"');
  });
});

describe("Cron jobs check isActive flag", () => {
  it("queries cron_jobs.isActive before running", () => {
    expect(source).toContain('"isActive"');
    expect(source).toContain("isActive");
  });
});

describe("Domain registry cron coverage", () => {
  const registryCronJobs = DOMAIN_REGISTRY.flatMap((d) => d.cronJobs);

  it("domain registry declares cron job expectations", () => {
    expect(registryCronJobs.length).toBeGreaterThan(10);
  });

  it("cron job names in registry use snake_case", () => {
    const invalid = registryCronJobs.filter(
      (n) => !/^[a-z][a-z0-9_]*$/.test(n)
    );
    expect(invalid).toEqual([]);
  });
});

describe("Timezone handling", () => {
  it("reads timezone from system_settings", () => {
    expect(source).toContain("getSystemTimezone");
    expect(source).toContain("timezone");
  });

  it("defaults to Asia/Riyadh", () => {
    expect(source).toContain("Asia/Riyadh");
  });
});
