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
  // Order matters only when CASCADE is missing; since we use RESTART
  // IDENTITY CASCADE, the order is irrelevant — but we list children
  // first so the SQL stays readable.
  await rawExecute(
    `TRUNCATE TABLE
       refresh_tokens,
       tasks,
       projects,
       clients,
       employee_assignments,
       users,
       employees,
       branches,
       companies
     RESTART IDENTITY CASCADE`,
    []
  );
}

async function seedCompany(name: string): Promise<{
  companyId: number;
  branchId: number;
  userId: number;
  assignmentId: number;
  employeeId: number;
} & SeededRows> {
  const [{ id: companyId }] = await rawQuery<{ id: number }>(
    `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
    [name]
  );
  const [{ id: branchId }] = await rawQuery<{ id: number }>(
    `INSERT INTO branches ("companyId", name, status) VALUES ($1, $2, 'active') RETURNING id`,
    [companyId, `${name} HQ`]
  );
  const [{ id: employeeId }] = await rawQuery<{ id: number }>(
    `INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING id`,
    [`Owner of ${name}`, `owner-${companyId}@test.local`]
  );
  const [{ id: assignmentId }] = await rawQuery<{ id: number }>(
    `INSERT INTO employee_assignments
       ("employeeId", "companyId", "branchId", "jobTitle", role, "isPrimary", status)
     VALUES ($1, $2, $3, 'Owner', 'owner', TRUE, 'active')
     RETURNING id`,
    [employeeId, companyId, branchId]
  );
  const passwordHash = await hashPassword("test-password-1234");
  const [{ id: userId }] = await rawQuery<{ id: number }>(
    `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
     VALUES ($1, $2, $3, TRUE)
     RETURNING id`,
    [employeeId, `owner-${companyId}@test.local`, passwordHash]
  );

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

  return {
    companyId,
    branchId,
    userId,
    assignmentId,
    employeeId,
    clientId,
    projectId,
    taskId,
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
    },
    tokenA,
    tokenB,
  };
}
