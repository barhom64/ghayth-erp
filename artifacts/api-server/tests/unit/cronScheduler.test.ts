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

describe("Rate-limit fallback alerter (Task #176)", () => {
  it("registers a rate_limit_fallback_alert cron job", () => {
    expect(cronJobNames).toContain("rate_limit_fallback_alert");
  });

  it("runs the alerter at least every few minutes", () => {
    // Schedule must include the rate_limit_fallback_alert job and use a
    // sub-hourly cadence (e.g. */2 * * * *) so we don't sit on a degraded
    // status for an hour before paging an admin.
    expect(source).toMatch(/name:\s*"rate_limit_fallback_alert"[\s\S]{0,200}schedule:\s*"\*\/[0-9]+ \* \* \* \*"/);
  });

  it("reads the live Redis rate-limit status from rateLimitStore", () => {
    expect(source).toContain("getRedisRateLimitStatus");
    expect(source).toContain('from "./rateLimitStore.js"');
  });

  it("tracks last-seen status across ticks for transition detection", () => {
    expect(source).toContain("lastSeenStatus");
    expect(source).toContain("isTransition");
  });

  it("persists alerter state in shared storage so cross-replica behavior is consistent", () => {
    expect(source).toContain("RATE_LIMIT_STATE_KEY");
    expect(source).toContain("rate_limit_alerter_state");
    expect(source).toContain("loadRateLimitAlerterState");
    expect(source).toContain("saveRateLimitAlerterState");
  });

  it("applies a re-alert cooldown to prevent alert storms", () => {
    expect(source).toMatch(/RATE_LIMIT_REALERT_COOLDOWN_MS\s*=\s*\d+\s*\*\s*60_000/);
    expect(source).toContain("within cooldown");
  });

  it("sends a recovery notification when the status returns to connected", () => {
    expect(source).toContain('type: "rate_limit_recovered"');
  });

  it("uses the in-app + email channels so overnight degradations reach an admin", () => {
    expect(source).toMatch(/channels:\s*admin\.email\s*\?\s*\["in_app",\s*"email"\]\s*:\s*\["in_app"\]/);
  });

  it("treats REDIS_URL=unset (disabled) as intentional and does not alert", () => {
    expect(source).toContain('skipped (REDIS_URL not configured)');
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
