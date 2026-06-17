// Branch-isolation fixture — extends the two-company model with:
//
//   Company A: two branches (branchA1, branchA2)
//     - Owner assignment → branchA1 (but gets all branches via buildScope)
//     - branch_manager assignment → branchA1 only
//   Company B: one branch (branchB1)
//     - Owner assignment
//
// Tokens:
//   ownerTokenA   — owner of company A, sees all branches
//   branchMgrToken — branch_manager of company A, scoped to branchA1
//   ownerTokenB   — owner of company B
//
// Seeded rows:
//   - Tasks in branchA1 and branchA2 (to test branch isolation)
//   - Client + employee per company (to test cross-tenant writes)

import { rawQuery, rawExecute } from "../../../src/lib/rawdb.js";
import { signToken, hashPassword } from "../../../src/lib/auth.js";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];

function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL must be set");
  if (!TEST_URL_MARKERS.some((m) => url.includes(m))) {
    throw new Error(
      `Refusing to seed: DATABASE_URL does not look like a test DB.`
    );
  }
}

export interface BranchIsolationFixture {
  companyA: { id: number; employeeId: number; assignmentId: number; clientId: number };
  companyB: { id: number; employeeId: number; assignmentId: number; clientId: number };
  branchA1: { id: number };
  branchA2: { id: number };
  branchB1: { id: number };
  branchMgr: { employeeId: number; assignmentId: number; userId: number };
  ownerTokenA: string;
  ownerTokenB: string;
  branchMgrToken: string;
}

export async function setupBranchIsolationFixture(): Promise<BranchIsolationFixture> {
  assertTestDatabase();

  // 2026-06-16 — find-or-create for the fixture's own companies, then
  // SCOPED cleanup of child rows only. The previous TRUNCATE …
  // companies … RESTART IDENTITY CASCADE wiped EVERY company's rows
  // (incl. the provisioned Al-Diyaa finance company id=2 + full COA),
  // making finance dynamic tests scheduled after this fixture fail
  // with "1111 غير موجود". Switching to DELETE companies isn't
  // viable either: hundreds of FK constraints target `companies` and
  // not all carry ON DELETE CASCADE (e.g. user_activity_log).
  //
  // The robust solution is find-or-create: each call reuses the
  // fixture's own 'BranchIso A/B' company rows if they already exist
  // (from a prior call in the same vitest process), and wipes only
  // their child data so each test starts with a known seed. The
  // companies themselves stay put, so FK-protected siblings
  // (user_activity_log, audit, accounting_mappings, …) are never
  // disturbed.
  const FIXTURE_COMPANY_NAMES = ["BranchIso A", "BranchIso B"];
  // upsert companies first — INSERT ON CONFLICT requires a unique
  // index on `name`, which doesn't exist; use the find-or-create
  // pattern explicitly.
  async function findOrCreateCompany(name: string): Promise<number> {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM companies WHERE name = $1 LIMIT 1`, [name],
    );
    if (row) return row.id;
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`, [name],
    );
    return created.id;
  }
  const companyAId = await findOrCreateCompany("BranchIso A");
  const companyBId = await findOrCreateCompany("BranchIso B");

  // Wipe child rows ONLY for these two companies. companies + branches
  // tied to other tenants (the Al-Diyaa finance baseline, the
  // twoCompanies fixture, …) are untouched.
  const FIXTURE_COMPANY_IDS = [companyAId, companyBId];
  const inFix = `"companyId" = ANY($1)`;
  await rawExecute(
    `DELETE FROM refresh_tokens WHERE "userId" IN (
       SELECT u.id FROM users u JOIN employees e ON e.id = u."employeeId"
        WHERE e."companyId" = ANY($1))`,
    [FIXTURE_COMPANY_IDS],
  );
  for (const tbl of ["requests", "documents", "tasks", "projects", "clients", "employee_assignments"]) {
    await rawExecute(`DELETE FROM ${tbl} WHERE ${inFix}`, [FIXTURE_COMPANY_IDS]);
  }
  // 2026-06-16 — DO NOT DELETE users/employees/branches. FK
  // constraints (journal_entries.postedBy, user_activity_log.userId,
  // etc.) block. Each INSERT below switches to find-or-create.

  const passwordHash = await hashPassword("test-password-1234");

  // find-or-create helpers — keyed on uniqueness markers so repeat
  // in-process calls reuse the rows and avoid FK collisions.
  async function fcBranch(companyId: number, branchName: string): Promise<number> {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = $1 AND name = $2 LIMIT 1`,
      [companyId, branchName],
    );
    if (row) return row.id;
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO branches ("companyId", name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [companyId, branchName],
    );
    return created.id;
  }
  async function fcEmployee(empName: string, email: string): Promise<number> {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM employees WHERE email = $1 LIMIT 1`, [email],
    );
    if (row) return row.id;
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING id`, [empName, email],
    );
    return created.id;
  }
  async function fcAssignment(employeeId: number, companyId: number, branchId: number, jobTitle: string, role: string): Promise<number> {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments
        WHERE "employeeId" = $1 AND "companyId" = $2 AND "branchId" = $3 AND status = 'active'
        LIMIT 1`,
      [employeeId, companyId, branchId],
    );
    if (row) return row.id;
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
       VALUES ($1, $2, $3, $4, $5, TRUE, 'active') RETURNING id`,
      [employeeId, companyId, branchId, jobTitle, role],
    );
    return created.id;
  }
  async function fcUser(employeeId: number, email: string): Promise<number> {
    const [row] = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE "employeeId" = $1 LIMIT 1`, [employeeId],
    );
    if (row) return row.id;
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [employeeId, email, passwordHash],
    );
    return created.id;
  }

  // ── Company A with two branches ──
  const branchA1Id = await fcBranch(companyAId, "Branch A1");
  const branchA2Id = await fcBranch(companyAId, "Branch A2");

  // Owner of Company A
  const ownerEmpA = await fcEmployee("Owner A", "owner-a@test.local");
  const ownerAssignA = await fcAssignment(ownerEmpA, companyAId, branchA1Id, "Owner", "owner");
  const ownerUserA = await fcUser(ownerEmpA, "owner-a@test.local");

  // Branch manager of Company A, scoped to branchA1 only
  const mgrEmpId = await fcEmployee("BranchMgr A1", "mgr-a1@test.local");
  const mgrAssignId = await fcAssignment(mgrEmpId, companyAId, branchA1Id, "Branch Manager", "branch_manager");
  const mgrUserId = await fcUser(mgrEmpId, "mgr-a1@test.local");

  // ── Company B with one branch (companyBId is reused from
  //    find-or-create above; no new INSERT needed) ──
  const branchB1Id = await fcBranch(companyBId, "Branch B1");
  const ownerEmpB = await fcEmployee("Owner B", "owner-b@test.local");
  const ownerAssignB = await fcAssignment(ownerEmpB, companyBId, branchB1Id, "Owner", "owner");
  const ownerUserB = await fcUser(ownerEmpB, "owner-b@test.local");

  // ── Seed rows for isolation tests ──
  // Clients (one per company)
  const [{ id: clientAId }] = await rawQuery<{ id: number }>(
    `INSERT INTO clients ("companyId", name, type) VALUES ($1, 'Client A', 'individual') RETURNING id`,
    [companyAId]
  );
  const [{ id: clientBId }] = await rawQuery<{ id: number }>(
    `INSERT INTO clients ("companyId", name, type) VALUES ($1, 'Client B', 'individual') RETURNING id`,
    [companyBId]
  );

  // Tasks in both branches of company A (to test branch isolation)
  await rawExecute(
    `INSERT INTO tasks ("companyId", "branchId", type, title)
     VALUES ($1, $2, 'manual', 'Task in Branch A1')`,
    [companyAId, branchA1Id]
  );
  await rawExecute(
    `INSERT INTO tasks ("companyId", "branchId", type, title)
     VALUES ($1, $2, 'manual', 'Task in Branch A2')`,
    [companyAId, branchA2Id]
  );
  await rawExecute(
    `INSERT INTO tasks ("companyId", "branchId", type, title)
     VALUES ($1, $2, 'manual', 'Task in Branch B1')`,
    [companyBId, branchB1Id]
  );

  // Tokens
  const ownerTokenA = signToken({ userId: ownerUserA, assignmentId: ownerAssignA, role: "owner" });
  const ownerTokenB = signToken({ userId: ownerUserB, assignmentId: ownerAssignB, role: "owner" });
  const branchMgrToken = signToken({ userId: mgrUserId, assignmentId: mgrAssignId, role: "branch_manager" });

  return {
    companyA: { id: companyAId, employeeId: ownerEmpA, assignmentId: ownerAssignA, clientId: clientAId },
    companyB: { id: companyBId, employeeId: ownerEmpB, assignmentId: ownerAssignB, clientId: clientBId },
    branchA1: { id: branchA1Id },
    branchA2: { id: branchA2Id },
    branchB1: { id: branchB1Id },
    branchMgr: { employeeId: mgrEmpId, assignmentId: mgrAssignId, userId: mgrUserId },
    ownerTokenA,
    ownerTokenB,
    branchMgrToken,
  };
}
