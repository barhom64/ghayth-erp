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

  await rawExecute(
    `TRUNCATE TABLE
       refresh_tokens, requests, documents, tasks, projects, clients,
       employee_assignments, users, employees, branches, companies
     RESTART IDENTITY CASCADE`,
    []
  );

  const passwordHash = await hashPassword("test-password-1234");

  // ── Company A with two branches ──
  const [{ id: companyAId }] = await rawQuery<{ id: number }>(
    `INSERT INTO companies (name, status) VALUES ('Company A', 'active') RETURNING id`,
    []
  );
  const [{ id: branchA1Id }] = await rawQuery<{ id: number }>(
    `INSERT INTO branches ("companyId", name, status) VALUES ($1, 'Branch A1', 'active') RETURNING id`,
    [companyAId]
  );
  const [{ id: branchA2Id }] = await rawQuery<{ id: number }>(
    `INSERT INTO branches ("companyId", name, status) VALUES ($1, 'Branch A2', 'active') RETURNING id`,
    [companyAId]
  );

  // Owner of Company A
  const [{ id: ownerEmpA }] = await rawQuery<{ id: number }>(
    `INSERT INTO employees (name, email) VALUES ('Owner A', 'owner-a@test.local') RETURNING id`,
    []
  );
  const [{ id: ownerAssignA }] = await rawQuery<{ id: number }>(
    `INSERT INTO employee_assignments
       ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
     VALUES ($1, $2, $3, 'Owner', 'owner', TRUE, 'active') RETURNING id`,
    [ownerEmpA, companyAId, branchA1Id]
  );
  const [{ id: ownerUserA }] = await rawQuery<{ id: number }>(
    `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
     VALUES ($1, 'owner-a@test.local', $2, TRUE) RETURNING id`,
    [ownerEmpA, passwordHash]
  );

  // Branch manager of Company A, scoped to branchA1 only
  const [{ id: mgrEmpId }] = await rawQuery<{ id: number }>(
    `INSERT INTO employees (name, email) VALUES ('BranchMgr A1', 'mgr-a1@test.local') RETURNING id`,
    []
  );
  const [{ id: mgrAssignId }] = await rawQuery<{ id: number }>(
    `INSERT INTO employee_assignments
       ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
     VALUES ($1, $2, $3, 'Branch Manager', 'branch_manager', TRUE, 'active') RETURNING id`,
    [mgrEmpId, companyAId, branchA1Id]
  );
  const [{ id: mgrUserId }] = await rawQuery<{ id: number }>(
    `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
     VALUES ($1, 'mgr-a1@test.local', $2, TRUE) RETURNING id`,
    [mgrEmpId, passwordHash]
  );

  // ── Company B with one branch ──
  const [{ id: companyBId }] = await rawQuery<{ id: number }>(
    `INSERT INTO companies (name, status) VALUES ('Company B', 'active') RETURNING id`,
    []
  );
  const [{ id: branchB1Id }] = await rawQuery<{ id: number }>(
    `INSERT INTO branches ("companyId", name, status) VALUES ($1, 'Branch B1', 'active') RETURNING id`,
    [companyBId]
  );
  const [{ id: ownerEmpB }] = await rawQuery<{ id: number }>(
    `INSERT INTO employees (name, email) VALUES ('Owner B', 'owner-b@test.local') RETURNING id`,
    []
  );
  const [{ id: ownerAssignB }] = await rawQuery<{ id: number }>(
    `INSERT INTO employee_assignments
       ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
     VALUES ($1, $2, $3, 'Owner', 'owner', TRUE, 'active') RETURNING id`,
    [ownerEmpB, companyBId, branchB1Id]
  );
  const [{ id: ownerUserB }] = await rawQuery<{ id: number }>(
    `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
     VALUES ($1, 'owner-b@test.local', $2, TRUE) RETURNING id`,
    [ownerEmpB, passwordHash]
  );

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
