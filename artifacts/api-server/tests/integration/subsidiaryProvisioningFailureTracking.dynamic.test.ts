// #2091 — subsidiary-account provisioning never fails SILENTLY. When
// createSubsidiaryAccountsForEntity can't open an entity's GL subsidiary
// account (no resolvable control parent on the company's chart), it records a
// trackable, reviewable failure (linked to entity / accountType / company /
// branch / actor / reason) and emits an audit event — instead of just
// logging. Retry is idempotent: it re-runs the provisioning, never duplicates
// the account or the open failure row, and self-resolves on success. Exercised
// on the live DB using company 1 (a minimal chart lacking the AR control 1130,
// so a client's receivable genuinely can't be provisioned). Activates only on
// the test cluster.
import { describe, it, expect, beforeAll, afterEach } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 1; // minimal chart — no 1130 (AR control), so client receivable can't provision
const BRANCH = 1;
const ACTOR = 7;
const PFX = "DATAFIX2091-";

d("FIN #2091 — subsidiary provisioning failures are tracked + idempotent retry (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let createSubsidiaryAccountsForEntity: typeof import("../../src/routes/accounting-engine.js").createSubsidiaryAccountsForEntity;
  let retrySubsidiaryProvisioningFailure: typeof import("../../src/routes/accounting-engine.js").retrySubsidiaryProvisioningFailure;
  let clientId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    const eng = await import("../../src/routes/accounting-engine.js");
    createSubsidiaryAccountsForEntity = eng.createSubsidiaryAccountsForEntity;
    retrySubsidiaryProvisioningFailure = eng.retrySubsidiaryProvisioningFailure;
  });

  afterEach(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    await rawExecute(`DELETE FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client' AND "entityId" IN (SELECT id FROM clients WHERE name LIKE $2)`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM subsidiary_account_provisioning_failures WHERE "companyId"=$1 AND "entityName" LIKE $2`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND (name LIKE $2 OR code IN ('1130','1130-%') AND name LIKE $2)`, [COMPANY, PFX + "%"]);
    await rawExecute(`DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND name=$2`, [COMPANY, PFX + "AR-control"]);
    await rawExecute(`DELETE FROM event_logs WHERE "companyId"=$1 AND action='finance.subsidiary_account.provisioning_failed' AND entity='subsidiary_accounts'`, [COMPANY]);
    await rawExecute(`DELETE FROM audit_logs WHERE "companyId"=$1 AND action='subsidiary_provisioning.failed'`, [COMPANY]);
    await rawExecute(`DELETE FROM clients WHERE name LIKE $1`, [PFX + "%"]);
  }

  async function freshClient() {
    const [c] = await rawQuery<{ id: number }>(`INSERT INTO clients ("companyId",name,type) VALUES ($1,$2,'individual') RETURNING id`, [COMPANY, PFX + "client"]);
    return c.id;
  }
  async function openFailure(entityId: number) {
    const [r] = await rawQuery<any>(
      `SELECT * FROM subsidiary_account_provisioning_failures WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2 AND resolved=false`, [COMPANY, entityId]);
    return r;
  }

  it("a failed provisioning is RECORDED (not silent), linked to entity/accountType/branch/actor/reason + audit event", async () => {
    clientId = await freshClient();
    await createSubsidiaryAccountsForEntity(COMPANY, "client", clientId, PFX + "client", { branchId: BRANCH, actorUserId: ACTOR });

    const f = await openFailure(clientId);
    expect(f, "an open failure row must exist — the failure must not pass silently").toBeTruthy();
    expect(f.entityType).toBe("client");
    expect(f.entityId).toBe(clientId);
    expect(f.missingAccountTypes).toEqual(["receivable"]);
    expect(f.branchId).toBe(BRANCH);
    expect(f.actorUserId).toBe(ACTOR);
    expect(String(f.reason)).toContain("receivable");
    expect(f.resolved).toBe(false);

    // a traceable, persisted audit entry was written
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM audit_logs WHERE "companyId"=$1 AND action='subsidiary_provisioning.failed' AND "entityId"=$2`,
      [COMPANY, clientId]);
    expect(n).toBeGreaterThanOrEqual(1);
    // and no chart account was created (nothing to post to)
    const [{ m }] = await rawQuery<{ m: number }>(`SELECT count(*)::int m FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2`, [COMPANY, clientId]);
    expect(m).toBe(0);
  });

  it("re-failure does NOT duplicate the open row — it bumps retryCount on the single row", async () => {
    clientId = await freshClient();
    await createSubsidiaryAccountsForEntity(COMPANY, "client", clientId, PFX + "client", { branchId: BRANCH, actorUserId: ACTOR });
    await createSubsidiaryAccountsForEntity(COMPANY, "client", clientId, PFX + "client", { branchId: BRANCH, actorUserId: ACTOR });

    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM subsidiary_account_provisioning_failures WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2 AND resolved=false`, [COMPANY, clientId]);
    expect(n, "at most one OPEN failure row per entity").toBe(1);
    const f = await openFailure(clientId);
    expect(f.retryCount).toBeGreaterThanOrEqual(1);
  });

  it("retry after the control parent is added: provisions once, resolves the row, stays idempotent", async () => {
    clientId = await freshClient();
    await createSubsidiaryAccountsForEntity(COMPANY, "client", clientId, PFX + "client", { branchId: BRANCH, actorUserId: ACTOR });
    const f = await openFailure(clientId);
    expect(f).toBeTruthy();

    // add the missing AR control parent 1130 on company 1 (test fixture)
    await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId",code,name,type,level,"allowPosting","isActive")
       VALUES ($1,'1130',$2,'asset',3,false,true) ON CONFLICT DO NOTHING`, [COMPANY, PFX + "AR-control"]);

    // retry → should provision the receivable sub-account and resolve the failure
    const r1 = await retrySubsidiaryProvisioningFailure(f.id, COMPANY);
    expect(r1?.resolved).toBe(true);
    const sub1 = await rawQuery<{ id: number }>(`SELECT id FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2 AND "accountType"='receivable'`, [COMPANY, clientId]);
    expect(sub1.length).toBe(1);
    expect(await openFailure(clientId)).toBeFalsy(); // no open failure anymore

    // retry again (or re-provision) → idempotent: still exactly one sub-account, no new open failure
    await createSubsidiaryAccountsForEntity(COMPANY, "client", clientId, PFX + "client", { branchId: BRANCH, actorUserId: ACTOR });
    const sub2 = await rawQuery<{ id: number }>(`SELECT id FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client' AND "entityId"=$2 AND "accountType"='receivable'`, [COMPANY, clientId]);
    expect(sub2.length, "no duplicate subsidiary account on re-run").toBe(1);
    expect(await openFailure(clientId)).toBeFalsy();
  });
});
