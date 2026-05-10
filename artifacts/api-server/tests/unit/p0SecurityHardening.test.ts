import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname!, "../../src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

const APP_TS = read("app.ts");
const INDEX_TS = read("routes/index.ts");
const LIFECYCLE_TS = read("lib/lifecycleEngine.ts");
const EVENT_BUS_TS = read("lib/eventBus.ts");
const UMRAH_TS = read("routes/umrah.ts");
const IMPORT_ENGINE_TS = read("lib/umrahImportEngine.ts");
const INVOICING_TS = read("lib/umrahInvoicingEngine.ts");
const FIELD_ENC_TS = read("lib/fieldEncryption.ts");
const AUTH_MW_TS = read("middlewares/authMiddleware.ts");

// ─── P0-2: umrahEntitiesRouter must have requireGuards("financial") ──────
describe("P0-2: umrahEntitiesRouter financial guard", () => {
  it("has requireGuards on umrahEntitiesRouter mount", () => {
    expect(INDEX_TS).toContain('requireGuards("financial"), umrahEntitiesRouter');
  });
});

// ─── P0-3: /_routes disabled in production ───────────────────────────────
describe("P0-3: /_routes production protection", () => {
  it("blocks /_routes in production", () => {
    expect(INDEX_TS).toContain('NODE_ENV === "production"');
    expect(INDEX_TS).toMatch(/\/_routes.*production/s);
  });
});

// ─── P0-4: Body limit reduced from 100mb ─────────────────────────────────
describe("P0-4: Body size limit", () => {
  it("default JSON limit is not 100mb", () => {
    expect(APP_TS).not.toContain('limit: "100mb"');
  });

  it("default limit is 2mb or less", () => {
    expect(APP_TS).toContain('limit: "2mb"');
  });

  it("import routes have higher limits", () => {
    expect(APP_TS).toContain("/api/umrah/import");
    expect(APP_TS).toContain('limit: "50mb"');
  });
});

// ─── P0-5: lifecycleEngine fail-closed ───────────────────────────────────
describe("P0-5: Lifecycle engine fail-closed", () => {
  it("isValidTransition returns false for unknown entities", () => {
    expect(LIFECYCLE_TS).toContain("if (!sm) return false;");
    expect(LIFECYCLE_TS).not.toContain("if (!sm) return true;");
  });
});

// ─── P0-6: Unified umrah status codes ────────────────────────────────────
describe("P0-6: Umrah status unification", () => {
  it("import engine uses 'arrived' not 'inside_kingdom'", () => {
    expect(IMPORT_ENGINE_TS).not.toMatch(/"inside_kingdom"/);
    expect(IMPORT_ENGINE_TS).toContain('"arrived"');
  });

  it("import engine uses 'overstayed' not 'overstay' for status", () => {
    const statusMapSection = IMPORT_ENGINE_TS.match(/STATUS_MAP.*?};/s)?.[0] ?? "";
    expect(statusMapSection).toContain('"overstayed"');
    expect(statusMapSection).not.toContain('"overstay"');
  });

  it("import engine uses 'departed' not 'exited'", () => {
    const statusMapSection = IMPORT_ENGINE_TS.match(/STATUS_MAP.*?};/s)?.[0] ?? "";
    expect(statusMapSection).toContain('"departed"');
    expect(statusMapSection).not.toMatch(/"exited"/);
  });

  it("invoicing engine does not use dual overstay/overstayed IN clause", () => {
    expect(INVOICING_TS).not.toContain("'overstayed','overstay'");
    expect(INVOICING_TS).not.toContain("'overstay','overstayed'");
  });
});

// ─── P0-1: Field encryption for sensitive pilgrim data ───────────────────
describe("P0-1: Sensitive pilgrim data encryption", () => {
  it("fieldEncryption module exists with AES-256-GCM", () => {
    expect(FIELD_ENC_TS).toContain("aes-256-gcm");
  });

  it("provides encryptField, decryptField, blindIndex", () => {
    expect(FIELD_ENC_TS).toContain("export function encryptField");
    expect(FIELD_ENC_TS).toContain("export function decryptField");
    expect(FIELD_ENC_TS).toContain("export function blindIndex");
  });

  it("defines SENSITIVE_PILGRIM_FIELDS with the required fields", () => {
    expect(FIELD_ENC_TS).toContain('"passportNumber"');
    expect(FIELD_ENC_TS).toContain('"visaNumber"');
    expect(FIELD_ENC_TS).toContain('"mofaNumber"');
    expect(FIELD_ENC_TS).toContain('"borderNumber"');
  });

  it("umrah routes import and use encryption", () => {
    expect(UMRAH_TS).toContain("encryptField");
    expect(UMRAH_TS).toContain("decryptPilgrimRow");
    expect(UMRAH_TS).toContain("blindIndex");
  });

  it("import engine encrypts on insert", () => {
    expect(IMPORT_ENGINE_TS).toContain("encryptField");
    expect(IMPORT_ENGINE_TS).toContain("blindIndex");
  });

  it("pilgrim search uses blind index not ILIKE on encrypted fields", () => {
    expect(UMRAH_TS).toContain("passportNumber_hash");
    expect(UMRAH_TS).not.toMatch(/passportNumber.*ILIKE/);
  });
});

// ─── P0-7: Sensitive data access audit ───────────────────────────────────
describe("P0-7: Sensitive data access audit", () => {
  it("logSensitiveAccess is exported", () => {
    expect(FIELD_ENC_TS).toContain("export function logSensitiveAccess");
  });

  it("pilgrim list logs access", () => {
    expect(UMRAH_TS).toContain("logSensitiveAccess");
  });

  it("audit writes to audit_umrah_access table", () => {
    expect(FIELD_ENC_TS).toContain("audit_umrah_access");
  });
});

// ─── P1-9: Duplicate group invoicing prevention ──────────────────────────
describe("P1-9: Duplicate group invoicing", () => {
  it("checks for already-invoiced groups before generating", () => {
    expect(INVOICING_TS).toContain("alreadyInvoiced");
    expect(INVOICING_TS).toContain("مفوترة مسبقاً");
  });
});

// ─── P1-10: entryDate pricing fallback ───────────────────────────────────
describe("P1-10: entryDate pricing fallback", () => {
  it("throws when entryDate is missing instead of using new Date()", () => {
    expect(INVOICING_TS).toContain("لا تحتوي على تاريخ دخول");
    expect(INVOICING_TS).not.toMatch(/entryDate \|\| new Date\(\)/);
  });
});

// ─── P1-11: Branch creation moved from auth ──────────────────────────────
describe("P1-11: No branch creation in auth middleware", () => {
  it("auth middleware does not INSERT INTO branches", () => {
    expect(AUTH_MW_TS).not.toContain("INSERT INTO branches");
  });
});

// ─── P1-12: Event catalog enforcement ────────────────────────────────────
describe("P1-12: Event catalog enforcement", () => {
  it("safeEmitEvent checks isKnownEvent", () => {
    expect(EVENT_BUS_TS).toContain("isKnownEvent");
  });

  it("uncatalogued events go to DLQ", () => {
    expect(EVENT_BUS_TS).toContain("Uncatalogued event");
    expect(EVENT_BUS_TS).toContain("pushToDLQ");
  });
});
