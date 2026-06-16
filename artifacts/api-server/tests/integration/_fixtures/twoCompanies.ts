// Two-company fixture for the Day 12-13 dynamic tenant-isolation
// harness. Inserts a minimal schema-compatible dataset:
//
//   - Company A and Company B (rows in `companies`)
//   - One branch per company (`branches`)
//   - One employee + one active assignment per company (`employees`,
//     `employee_assignments`, `users`)
//   - One bcrypt-hashed password per user
//   - JWT tokens minted with the same `signToken` used in production
//
// The exported `setupTwoCompanyFixture()` is idempotent — repeated
// calls truncate the four tables (using `RESTART IDENTITY CASCADE`)
// and re-seed. This keeps tests independent and reproducible.
//
// IMPORTANT: this module only runs against a **disposable** test
// Postgres. Importing it into a process that points at a real
// database would TRUNCATE production data. The `assertTestDatabase()`
// helper checks the URL and throws if it doesn't include a clear
// test marker (`_test`, `localhost:54329`, or `127.0.0.1:54329`).

import { rawQuery, rawExecute } from "../../../src/lib/rawdb.js";
import { signToken, hashPassword } from "../../../src/lib/auth.js";

export interface SeededRows {
  clientId: number;
  projectId: number;
  taskId: number;
  documentId: number;
  requestId: number;
}

export interface TenantFixture {
  companyA: {
    id: number;
    branchId: number;
    userId: number;
    assignmentId: number;
    employeeId: number;
  } & SeededRows;
  companyB: {
    id: number;
    branchId: number;
    userId: number;
    assignmentId: number;
    employeeId: number;
  } & SeededRows;
  tokenA: string;
  tokenB: string;
}

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];

export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL must be set for the dynamic tenant-isolation harness");
  const looksTesty = TEST_URL_MARKERS.some((m) => url.includes(m));
  if (!looksTesty) {
    throw new Error(
      `Refusing to seed the two-company fixture: DATABASE_URL does not look like a test DB.\n` +
        `Expected one of: ${TEST_URL_MARKERS.join(", ")} in the connection string.\n` +
        `Got: ${url.replace(/:[^:@]+@/, ":***@")}`
    );
  }
}

async function truncateAll(): Promise<void> {
  // 2026-06-15 — SCOPED cleanup of ONLY this fixture's own data.
  //
  // The previous implementation did `TRUNCATE TABLE … companies …
  // RESTART IDENTITY CASCADE`, which wiped EVERY company's rows — incl.
  // the provisioned finance baseline (the Al-Diyaa company + its full
  // chart of accounts). Any finance dynamic test (which targets
  // COMPANY=2 and assumes a seeded COA) scheduled AFTER a tenant-
  // isolation test in the same vitest process then saw a bare company 2
  // and failed en masse. That cross-test contamination is exactly what
  // a clean-slate fixture is supposed to PREVENT.
  //
  // The fixture only ever writes to the 11 tables below, all for its
  // own two companies ('Test Company A' / 'Test Company B'). So we
  // delete just those rows, child-first (companies has no ON DELETE
  // CASCADE — verified — so order matters), scoped by the company-name
  // marker. The Al-Diyaa finance company (a different name) and its
  // COA survive untouched. Repeated calls stay idempotent.
  const FIXTURE_COMPANY_NAMES = ["Test Company A", "Test Company B"];
  const inFixtureCompanies = `"companyId" IN (SELECT id FROM companies WHERE name = ANY($1))`;
  // refresh_tokens → users → employees.companyId
  await rawExecute(
    `DELETE FROM refresh_tokens WHERE "userId" IN (
       SELECT u.id FROM users u JOIN employees e ON e.id = u."employeeId"
        WHERE e.${inFixtureCompanies})`,
    [FIXTURE_COMPANY_NAMES],
  );
  for (const tbl of ["requests", "documents", "tasks", "projects", "clients", "employee_assignments"]) {
    await rawExecute(`DELETE FROM ${tbl} WHERE ${inFixtureCompanies}`, [FIXTURE_COMPANY_NAMES]);
  }
  // 2026-06-16 — DO NOT DELETE users/employees/branches/companies.
  // Hundreds of FK constraints target each (journal_entries.postedBy,
  // user_activity_log.userId, …) and ON DELETE CASCADE isn't
  // universal. Leave the rows; `seedCompany` is find-or-create for
  // each of these now, returning the existing id when present. Child
  // rows (clients/tasks/projects/etc.) are wiped above, so each test
  // run still starts from a known data seed without disturbing
  // anything else in the live DB.
}

async function seedCompany(name: string): Promise<{
  companyId: number;
  branchId: number;
  userId: number;
  assignmentId: number;
  employeeId: number;
} & SeededRows> {
  // 2026-06-16 — find-or-create. truncateAll() above wipes child rows
  // but not the companies row itself (FK wall + cross-test safety),
  // so reuse the existing 'Test Company A/B' row on a repeat call.
  let companyId: number;
  const [existing] = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE name = $1 LIMIT 1`, [name],
  );
  if (existing) {
    companyId = existing.id;
  } else {
    const [created] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`, [name],
    );
    companyId = created.id;
  }
  // find-or-create branch — keyed on (companyId, branch name).
  let branchId: number;
  const branchName = `${name} HQ`;
  const [existingBranch] = await rawQuery<{ id: number }>(
    `SELECT id FROM branches WHERE "companyId" = $1 AND name = $2 LIMIT 1`,
    [companyId, branchName],
  );
  if (existingBranch) {
    branchId = existingBranch.id;
  } else {
    const [createdBranch] = await rawQuery<{ id: number }>(
      `INSERT INTO branches ("companyId", name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [companyId, branchName],
    );
    branchId = createdBranch.id;
  }
  // find-or-create employee — keyed on (companyId, email).
  let employeeId: number;
  const ownerEmail = `owner-co${companyId}@test.local`;
  const [existingEmp] = await rawQuery<{ id: number }>(
    `SELECT id FROM employees WHERE "companyId" = $1 AND email = $2 LIMIT 1`,
    [companyId, ownerEmail],
  );
  if (existingEmp) {
    employeeId = existingEmp.id;
  } else {
    const [createdEmp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, "companyId", email, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [`Owner of ${name}`, companyId, ownerEmail],
    );
    employeeId = createdEmp.id;
  }
  // find-or-create assignment — keyed on (employeeId, companyId, branchId).
  let assignmentId: number;
  const [existingAsg] = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_assignments
      WHERE "employeeId" = $1 AND "companyId" = $2 AND "branchId" = $3 AND status = 'active'
      LIMIT 1`,
    [employeeId, companyId, branchId],
  );
  if (existingAsg) {
    assignmentId = existingAsg.id;
  } else {
    const [createdAsg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
       VALUES ($1, $2, $3, 'Owner', 'owner', TRUE, 'active')
       RETURNING id`,
      [employeeId, companyId, branchId],
    );
    assignmentId = createdAsg.id;
  }
  // find-or-create user — keyed on employeeId (1:1 in this fixture).
  let userId: number;
  const [existingUser] = await rawQuery<{ id: number }>(
    `SELECT id FROM users WHERE "employeeId" = $1 LIMIT 1`, [employeeId],
  );
  if (existingUser) {
    userId = existingUser.id;
  } else {
    const passwordHash = await hashPassword("test-password-1234");
    const [createdUser] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [employeeId, ownerEmail, passwordHash],
    );
    userId = createdUser.id;
  }

  // Seed one row per company in three common write-target tables so the
  // dynamic harness can exercise DELETE/PATCH/GET-by-id paths against
  // both same-tenant and cross-tenant ids.
  const [{ id: clientId }] = await rawQuery<{ id: number }>(
    `INSERT INTO clients ("companyId", name, type) VALUES ($1, $2, 'individual') RETURNING id`,
    [companyId, `Client of ${name}`]
  );
  const [{ id: projectId }] = await rawQuery<{ id: number }>(
    `INSERT INTO projects ("companyId", name) VALUES ($1, $2) RETURNING id`,
    [companyId, `Project of ${name}`]
  );
  const [{ id: taskId }] = await rawQuery<{ id: number }>(
    `INSERT INTO tasks ("companyId", "branchId", type, title)
     VALUES ($1, $2, 'manual', $3) RETURNING id`,
    [companyId, branchId, `Task of ${name}`]
  );
  const [{ id: documentId }] = await rawQuery<{ id: number }>(
    `INSERT INTO documents ("companyId", title) VALUES ($1, $2) RETURNING id`,
    [companyId, `Document of ${name}`]
  );
  const [{ id: requestId }] = await rawQuery<{ id: number }>(
    `INSERT INTO requests ("companyId", title) VALUES ($1, $2) RETURNING id`,
    [companyId, `Request of ${name}`]
  );

  return {
    companyId,
    branchId,
    userId,
    assignmentId,
    employeeId,
    clientId,
    projectId,
    taskId,
    documentId,
    requestId,
  };
}

export async function setupTwoCompanyFixture(): Promise<TenantFixture> {
  assertTestDatabase();
  await truncateAll();

  const a = await seedCompany("Test Company A");
  const b = await seedCompany("Test Company B");

  const tokenA = signToken({ userId: a.userId, assignmentId: a.assignmentId, role: "owner" });
  const tokenB = signToken({ userId: b.userId, assignmentId: b.assignmentId, role: "owner" });

  return {
    companyA: {
      id: a.companyId,
      branchId: a.branchId,
      userId: a.userId,
      assignmentId: a.assignmentId,
      employeeId: a.employeeId,
      clientId: a.clientId,
      projectId: a.projectId,
      taskId: a.taskId,
      documentId: a.documentId,
      requestId: a.requestId,
    },
    companyB: {
      id: b.companyId,
      branchId: b.branchId,
      userId: b.userId,
      assignmentId: b.assignmentId,
      employeeId: b.employeeId,
      clientId: b.clientId,
      projectId: b.projectId,
      taskId: b.taskId,
      documentId: b.documentId,
      requestId: b.requestId,
    },
    tokenA,
    tokenB,
  };
}
