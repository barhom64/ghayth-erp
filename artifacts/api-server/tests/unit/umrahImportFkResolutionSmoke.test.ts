import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the eradication of the "route bypasses engine" bug family.
 *
 * The original bug: POST /umrah/import/mutamers called a legacy
 * `doImport()` helper that INSERTed rows into `umrah_pilgrims` with
 * `agentId = NULL` (no groupId / subAgentId) because it never invoked
 * resolveAgent / resolveGroup / resolveSubAgent. An operator
 * confirmed a 1,363-row import that "succeeded" but produced zero
 * visible pilgrims, zero agents, and zero details.
 *
 * The family: any umrah route that writes to a core entity table
 * but skips the engine helper that resolves FKs / posts the
 * journal entries / writes the audit batch row. After audit:
 *
 *   1. POST /import/mutamers ............ doImport → confirmMutamersImport
 *   2. POST /import (legacy passthrough)  doImport → confirm{Mutamers,Vouchers}Import
 *   3. `doImport()` helper itself ........ DELETED (no callers)
 *   4. POST /nusk-invoices ............... raw INSERT → INSERT + postNuskJournalEntries
 *   5. PATCH /nusk-invoices/:id .......... raw UPDATE → UPDATE + postNuskJournalEntries
 *
 * (4) and (5) are the AP-journal-entry leg of the same family:
 * the rows landed but the DR-5201 cost / CR-2101 AP journal entry
 * never posted, so trial balance under-reported AP and finance
 * couldn't reconcile the NUSK supplier ledger.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const ENTITIES_ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);

describe("umrah — /import/mutamers calls the engine, not legacy doImport", () => {
  it("imports confirmMutamersImport from the engine module", () => {
    expect(ROUTE).toMatch(/confirmMutamersImport,\s*[\r\n]/);
    expect(ROUTE).toMatch(/from "\.\.\/lib\/umrahImportEngine\.js"/);
  });

  it("the route hands normalized rows to confirmMutamersImport", () => {
    expect(ROUTE).toMatch(
      /confirmMutamersImport\(\s*importScope,\s*normalizedRows,\s*fileName \?\? "import-mutamers"\s*\)/,
    );
  });

  it("importScope carries the four fields ImportScope expects", () => {
    expect(ROUTE).toMatch(
      /const importScope = \{\s*companyId: scope\.companyId,\s*branchId: scope\.branchId,\s*userId: scope\.userId,\s*seasonId,\s*\};/,
    );
  });

  it("requires an open season — same guard /import/vouchers uses", () => {
    const mutamersHandler = ROUTE.match(
      /router\.post\(["']\/import\/mutamers["'][\s\S]*?\n\}\);\n/,
    );
    expect(mutamersHandler).not.toBeNull();
    expect(mutamersHandler![0]).toMatch(/await requireOpenSeason\(seasonId, scope\.companyId\)/);
  });

  it("schema accepts optional fileName for audit + batch tracking", () => {
    expect(ROUTE).toMatch(
      /importMutamersSchema = z\.object\(\{[\s\S]{0,400}fileName: z\.string\(\)\.trim\(\)\.optional\(\)/,
    );
  });

  it("event entityId is the engine batchId on umrah_import_batches", () => {
    expect(ROUTE).toMatch(/entity: "umrah_import_batches",\s*entityId: result\.batchId \?\? 0/);
  });
});

describe("umrah — legacy /import passthrough also routes through the engine", () => {
  it("calls confirmMutamersImport or confirmVouchersImport based on fileType", () => {
    const handler = ROUTE.match(
      /router\.post\(["']\/import["'](?!\/)[\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/confirmMutamersImport\(importScope, normalizedRows,/);
    expect(handler![0]).toMatch(/confirmVouchersImport\(importScope, normalizedRows,/);
  });

  it("the passthrough requires an open season too", () => {
    const handler = ROUTE.match(
      /router\.post\(["']\/import["'](?!\/)[\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/await requireOpenSeason\(body\.seasonId, scope\.companyId\)/);
  });
});

describe("umrah — the legacy doImport helper is gone", () => {
  it("no async function doImport definition remains", () => {
    expect(ROUTE).not.toMatch(/async function doImport\b/);
  });

  it("no caller invokes doImport()", () => {
    // Comments referencing the old name as historical context are
    // fine; only `doImport(` followed by an argument list is the
    // pattern we want to forbid.
    expect(ROUTE).not.toMatch(/\bdoImport\(\s*\w/);
  });
});

describe("engine — confirmMutamersImport DOES resolve the FK fields", () => {
  it("calls resolveGroup before INSERT", () => {
    expect(ENGINE).toMatch(/const groupId = await resolveGroup\(client, scope, row, agentId, subAgentId\)/);
  });

  it("calls resolveAgent before INSERT", () => {
    expect(ENGINE).toMatch(/const agentId = await resolveAgent\(client, scope, row\)/);
  });

  it("calls resolveSubAgent before INSERT", () => {
    expect(ENGINE).toMatch(/const subAgentId = await resolveSubAgent\(client, scope, row, agentId\)/);
  });

  it("the INSERT into umrah_pilgrims wires groupId / subAgentId / agentId", () => {
    expect(ENGINE).toMatch(/"groupId","subAgentId","agentId"/);
    expect(ENGINE).toMatch(/groupId, subAgentId, agentId,/);
  });
});

describe("umrah-entities — POST /nusk-invoices posts the AP journal entry", () => {
  it("imports postNuskJournalEntries from the engine", () => {
    expect(ENTITIES_ROUTE).toMatch(
      /import \{ postNuskJournalEntries \} from "\.\.\/lib\/umrahImportEngine\.js"/,
    );
  });

  it("the engine exports postNuskJournalEntries", () => {
    expect(ENGINE).toMatch(/^export async function postNuskJournalEntries\(/m);
  });

  it("the create handler wraps INSERT + JE in a single transaction", () => {
    const handler = ENTITIES_ROUTE.match(
      /router\.post\(["']\/nusk-invoices["'][\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await withTransaction\(async \(client\) =>/);
    expect(handler![0]).toMatch(/await postNuskJournalEntries\(\s*client,/);
  });

  it("the create handler passes the new invoice id + totalAmount", () => {
    const handler = ENTITIES_ROUTE.match(
      /router\.post\(["']\/nusk-invoices["'][\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/nuskId: row\.id/);
    expect(handler![0]).toMatch(/totalAmount: Number\(b\.totalAmount \?\? 0\)/);
    expect(handler![0]).toMatch(/existingApJeId: null/);
    expect(handler![0]).toMatch(/existingRefundJeId: null/);
  });
});

describe("umrah-entities — PATCH /nusk-invoices/:id re-evaluates journal entries", () => {
  it("PATCH handler wraps UPDATE + JE in a single transaction", () => {
    const handler = ENTITIES_ROUTE.match(
      /router\.patch\(["']\/nusk-invoices\/:id["'][\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/await withTransaction\(async \(client\) =>/);
    expect(handler![0]).toMatch(/await postNuskJournalEntries\(\s*client,/);
  });

  it("PATCH handler reads existing JE ids so the engine can stay idempotent", () => {
    // Without these, every PATCH would try to post a duplicate AP JE
    // — postNuskJournalEntries needs the existing-id guards to know
    // whether to skip or post.
    const handler = ENTITIES_ROUTE.match(
      /router\.patch\(["']\/nusk-invoices\/:id["'][\s\S]*?\n\}\);\n/,
    );
    expect(handler![0]).toMatch(/"purchaseInvoiceId"/);
    expect(handler![0]).toMatch(/"journalEntryId"/);
    expect(handler![0]).toMatch(/existingApJeId: row\.purchaseInvoiceId \?\? null/);
    expect(handler![0]).toMatch(/existingRefundJeId: row\.journalEntryId \?\? null/);
  });

  it("PATCH schema accepts refundAmount so refund-reversal JEs can post", () => {
    expect(ENTITIES_ROUTE).toMatch(
      /updateNuskInvoiceSchema = z\.object\(\{[\s\S]{0,500}refundAmount: z\.coerce\.number\(\)\.optional\(\)/,
    );
  });
});
