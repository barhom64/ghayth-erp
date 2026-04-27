import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const libRoot = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const mwRoot = join(import.meta.dirname!, "../../../../artifacts/api-server/src/middlewares");
const readLib = (f: string) => readFileSync(join(libRoot, f), "utf8");
const readMw = (f: string) => readFileSync(join(mwRoot, f), "utf8");

const BH = readLib("businessHelpers.ts");
const LOGGER = readLib("logger.ts");
const PUSH_CRYPTO = readLib("pushCrypto.ts");
const RAWDB = readLib("rawdb.ts");
const SECRETS = readLib("secrets.ts");
const EVENT_BUS_MW = readMw("eventBusMiddleware.ts");

// ── businessHelpers — todayISO ────────────────────────────────────────────

describe("businessHelpers — todayISO centralized", () => {
  it("exports todayISO", () => {
    expect(BH).toContain("export function todayISO");
  });

  it("todayISO returns ISO date string", () => {
    expect(BH).toContain("toISOString");
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

// ── Event Bus Middleware ──────────────────────────────────────────────────

describe("eventBusMiddleware — exports", () => {
  it("exports eventBusMiddleware", () => {
    expect(EVENT_BUS_MW).toContain("export function eventBusMiddleware");
  });
});
