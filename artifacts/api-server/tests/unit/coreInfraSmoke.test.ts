import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const libRoot = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const mwRoot = join(import.meta.dirname!, "../../../../artifacts/api-server/src/middlewares");
const readLib = (f: string) => readFileSync(join(libRoot, f), "utf8");
const readMw = (f: string) => readFileSync(join(mwRoot, f), "utf8");

const DATE_HELPERS = readLib("dateHelpers.ts");
const LOGGER = readLib("logger.ts");
const PUSH_CRYPTO = readLib("pushCrypto.ts");
const RAWDB = readLib("rawdb.ts");
const SECRETS = readLib("secrets.ts");
const ROLE_GUARDS = readLib("roleGuards.ts");
const EVENT_BUS_MW = readMw("eventBusMiddleware.ts");

// ── Date Helpers ──────────────────────────────────────────────────────────

describe("dateHelpers — exports", () => {
  it("exports todayISO", () => {
    expect(DATE_HELPERS).toContain("export function todayISO");
  });

  it("exports currentPeriod", () => {
    expect(DATE_HELPERS).toContain("export function currentPeriod");
  });

  it("exports periodOf", () => {
    expect(DATE_HELPERS).toContain("export function periodOf");
  });

  it("exports currentYear", () => {
    expect(DATE_HELPERS).toContain("export function currentYear");
  });

  it("exports addDays", () => {
    expect(DATE_HELPERS).toContain("export function addDays");
  });

  it("exports daysBetween", () => {
    expect(DATE_HELPERS).toContain("export function daysBetween");
  });
});

// ── Logger ────────────────────────────────────────────────────────────────

describe("logger — exports", () => {
  it("exports logger instance", () => {
    expect(LOGGER).toContain("export const logger");
  });

  it("uses pino", () => {
    expect(LOGGER).toContain("pino");
  });
});

// ── Push Crypto ───────────────────────────────────────────────────────────

describe("pushCrypto — exports", () => {
  it("exports getPushEncryptionKey", () => {
    expect(PUSH_CRYPTO).toContain("export function getPushEncryptionKey");
  });

  it("exports hashPushEndpoint", () => {
    expect(PUSH_CRYPTO).toContain("export function hashPushEndpoint");
  });

  it("exports encryptPushEndpoint", () => {
    expect(PUSH_CRYPTO).toContain("export function encryptPushEndpoint");
  });

  it("exports decryptPushEndpoint", () => {
    expect(PUSH_CRYPTO).toContain("export function decryptPushEndpoint");
  });
});

// ── Raw DB ────────────────────────────────────────────────────────────────

describe("rawdb — exports", () => {
  it("exports pool", () => {
    expect(RAWDB).toContain("export const pool");
  });

  it("exports rawQuery", () => {
    expect(RAWDB).toContain("export async function rawQuery");
  });

  it("exports rawExecute", () => {
    expect(RAWDB).toContain("export async function rawExecute");
  });

  it("exports withTransaction", () => {
    expect(RAWDB).toContain("export async function withTransaction");
  });

  it("exports emptyToNull utility", () => {
    expect(RAWDB).toContain("export function emptyToNull");
  });

  it("exports cleanParams utility", () => {
    expect(RAWDB).toContain("export function cleanParams");
  });
});

// ── Secrets ───────────────────────────────────────────────────────────────

describe("secrets — exports", () => {
  it("exports isEncrypted", () => {
    expect(SECRETS).toContain("export function isEncrypted");
  });

  it("exports encryptSecret", () => {
    expect(SECRETS).toContain("export function encryptSecret");
  });

  it("exports decryptSecret", () => {
    expect(SECRETS).toContain("export function decryptSecret");
  });
});

// ── Role Guards ───────────────────────────────────────────────────────────

describe("roleGuards — exports", () => {
  it("exports assertRole", () => {
    expect(ROLE_GUARDS).toContain("export function assertRole");
  });
});

// ── Event Bus Middleware ──────────────────────────────────────────────────

describe("eventBusMiddleware — exports", () => {
  it("exports eventBusMiddleware", () => {
    expect(EVENT_BUS_MW).toContain("export function eventBusMiddleware");
  });
});
