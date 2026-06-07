import { pool } from "./rawdb.js";
import { hashPassword } from "./auth.js";
import { todayISO } from "./businessHelpers.js";
import { issueNumber } from "./numberingService.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import type pg from "pg";

const ADMIN_EMAIL = config.admin.email || "admin@ghayth.com";
const ADMIN_PASSWORD = config.admin.password || "Admin@123456";

const FLEET_EMAIL = "fleet@ghayth.com";
const FLEET_PASSWORD = config.admin.fleetPassword || "Fleet@123456";

if (!config.admin.password) {
  logger.warn("ADMIN_PASSWORD not set — using default credentials. Change immediately in production!");
}
if (!config.admin.fleetPassword) {
  logger.warn("FLEET_PASSWORD not set — using default credentials. Change immediately in production!");
}

interface BootstrapUser {
  email: string;
  password: string;
  name: string;
  phone: string;
  nationalId: string;
  gender: string;
  nationality: string;
  jobTitle: string;
  assignmentRole: string;
  userRole: string;
  roleDefinition: {
    roleKey: string;
    label: string;
    modules: string[];
    level: number;
  };
}

const ADMIN_USER: BootstrapUser = {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  name: "مدير النظام",
  phone: "0500000001",
  nationalId: "0000000001",
  gender: "male",
  nationality: "سعودي",
  jobTitle: "مالك النظام",
  assignmentRole: "owner",
  userRole: "owner",
  roleDefinition: {
    roleKey: "owner",
    label: "مالك النظام",
    modules: [
      "home", "hr", "finance", "fleet", "property", "operations",
      "warehouse", "governance", "bi", "requests", "documents",
      "reports", "admin", "comms", "legal", "crm", "marketing",
      "store", "support", "settings",
    ],
    level: 100,
  },
};

const FLEET_USER: BootstrapUser = {
  email: FLEET_EMAIL,
  password: FLEET_PASSWORD,
  name: "موظف أسطول",
  phone: "0500000002",
  nationalId: "0000000002",
  gender: "male",
  nationality: "سعودي",
  jobTitle: "موظف أسطول",
  assignmentRole: "employee",
  userRole: "employee",
  roleDefinition: {
    roleKey: "employee",
    label: "موظف أسطول",
    modules: ["home", "fleet", "requests", "documents", "comms"],
    level: 10,
  },
};

async function createUserIfNotExists(
  client: pg.PoolClient,
  user: BootstrapUser,
  companyId: number,
  branchId: number,
): Promise<boolean> {
  // Check if a user with this email already exists
  const { rows: existing } = await client.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [user.email],
  );
  if (existing.length > 0) {
    logger.info({ email: user.email }, "Bootstrap user already exists — skipping");
    return false;
  }

  // 1. Create employee record.
  // The legacy `employee_number_seq` sequence was dropped (migration 218);
  // employee codes are now issued through numberingService.issueNumber
  // (scheme hr/employee_code, seeded by migrations 214/216 which run before
  // this bootstrap). Mirrors the production path in routes/employees.ts.
  const issued = await issueNumber({
    companyId,
    branchId,
    moduleKey: "hr",
    entityKey: "employee_code",
    entityTable: "employees",
    actorId: null,
    expectedTiming: "on_draft",
  });
  const empNumber = issued.number;

  const empRes = await client.query(
    `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     RETURNING id`,
    [user.name, user.phone, user.email, empNumber, user.nationalId, user.gender, user.nationality],
  );
  const employeeId = empRes.rows[0].id;

  // Link the numbering assignment to the new employee row.
  await client.query(
    `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
    [employeeId, issued.assignmentId],
  );
  logger.info({ name: user.name, employeeId, empNumber }, "Bootstrap created employee");

  // 2. Create employee_assignment
  const hireDate = todayISO();
  const assignRes = await client.query(
    `INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "jobTitle", role, salary, "hireDate", "isPrimary", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'active')
     RETURNING id`,
    [employeeId, companyId, branchId, user.jobTitle, user.assignmentRole, 0, hireDate],
  );
  const assignmentId = assignRes.rows[0].id;
  logger.info({ assignmentId, email: user.email }, "Bootstrap created employee_assignment");

  // 3. Create user with hashed password
  const passwordHash = await hashPassword(user.password);
  const userRes = await client.query(
    `INSERT INTO users (email, "passwordHash", "isActive", "employeeId", role)
     VALUES ($1, $2, true, $3, $4)
     RETURNING id`,
    [user.email, passwordHash, employeeId, user.userRole],
  );
  const userId = userRes.rows[0].id;
  logger.info({ userId, email: user.email }, "Bootstrap created user");

  // 4. Create user_role (best-effort). Legacy user_roles was dropped in
  //    migration 261; RBAC v2 is the authority. Wrap in a SAVEPOINT so a
  //    missing table does not poison the bootstrap transaction.
  const rd = user.roleDefinition;
  await client.query(`SAVEPOINT sp_bootstrap_user_role`);
  try {
    await client.query(
      `INSERT INTO user_roles ("userId", "roleKey", label, level, modules, "companyId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT ("userId", "roleKey", "companyId") DO NOTHING`,
      [userId, rd.roleKey, rd.label, rd.level, JSON.stringify(rd.modules), companyId],
    );
    await client.query(`RELEASE SAVEPOINT sp_bootstrap_user_role`);
    logger.info({ roleKey: rd.roleKey, level: rd.level, email: user.email }, "Bootstrap assigned role to user");
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT sp_bootstrap_user_role`);
  }

  return true;
}

// Give the bootstrap admin a self-service "driver" (سائق) capability: a
// legacy user_roles entry so "سائق" shows up in the role picker (الصفة), and a
// fleet_drivers record bound to the admin's employee so /api/fleet/me resolves
// and /me/driver works end-to-end. The admin keeps owner ("*") access, so the
// fleet.driver.me authorize() check passes; the driver record is the only
// missing piece. Idempotent — runs on every boot so existing (dev/prod) DBs and
// fresh installs all converge to the same state.
async function ensureAdminDriverCapability(
  client: pg.PoolClient,
  companyId: number,
): Promise<void> {
  const { rows: adminRows } = await client.query(
    `SELECT id, "employeeId" FROM users WHERE email = $1 LIMIT 1`,
    [ADMIN_EMAIL],
  );
  if (adminRows.length === 0) return;
  const adminUserId: number = adminRows[0].id;
  const adminEmployeeId: number | null = adminRows[0].employeeId;

  // 1. Driver role in the picker. The role picker (الصفة) is fed by the login
  //    `userRoles` union, whose legacy half reads user_roles. Selecting "driver"
  //    makes dashboard.tsx redirect the admin to /me/driver.
  //    Best-effort: legacy user_roles was dropped in migration 261; RBAC v2 is
  //    the authority. Wrap in a SAVEPOINT so a missing table does not poison
  //    the bootstrap transaction.
  await client.query(`SAVEPOINT sp_admin_driver_role`);
  try {
    const { rows: existingRole } = await client.query(
      `SELECT id FROM user_roles WHERE "userId" = $1 AND "roleKey" = 'driver' AND "companyId" = $2 LIMIT 1`,
      [adminUserId, companyId],
    );
    if (existingRole.length === 0) {
      // ON CONFLICT (matches unique user_roles_userId_roleKey_companyId_key) keeps
      // this race-safe under concurrent boots in addition to the check above.
      const { rowCount } = await client.query(
        `INSERT INTO user_roles ("userId", "roleKey", label, level, modules, "companyId", "createdAt")
         VALUES ($1, 'driver', $2, 10, $3, $4, NOW())
         ON CONFLICT ("userId", "roleKey", "companyId") DO NOTHING`,
        [adminUserId, "سائق", JSON.stringify(["home", "fleet"]), companyId],
      );
      if (rowCount && rowCount > 0) {
        logger.info({ userId: adminUserId }, "Bootstrap granted admin the driver (سائق) role");
      }
    }
    await client.query(`RELEASE SAVEPOINT sp_admin_driver_role`);
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT sp_admin_driver_role`);
  }

  // 2. fleet_drivers record bound to the admin's employee. Driver self-service
  //    (resolveDriverFromScope) looks up fleet_drivers by req.scope.employeeId
  //    + companyId, so without this row /api/fleet/me returns 404.
  if (adminEmployeeId != null) {
    const { rows: existingDriver } = await client.query(
      `SELECT id FROM fleet_drivers WHERE "employeeId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [adminEmployeeId, companyId],
    );
    if (existingDriver.length === 0) {
      const licenseExpiry = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await client.query(
        `INSERT INTO fleet_drivers ("companyId", "employeeId", name, phone, "licenseNumber", "licenseType", "licenseExpiry", status)
         VALUES ($1, $2, $3, $4, $5, 'private', $6, 'available')`,
        [companyId, adminEmployeeId, ADMIN_USER.name, ADMIN_USER.phone, "ADMIN-DRV-0001", licenseExpiry],
      );
      logger.info({ employeeId: adminEmployeeId }, "Bootstrap linked a fleet_drivers record to admin");
    }
  }
}

export async function bootstrapAdminUser(): Promise<void> {
  // Check if company with id=1 exists
  const { rows: companies } = await pool.query(
    `SELECT id FROM companies WHERE id = 1 LIMIT 1`,
  );
  if (companies.length === 0) {
    logger.info("Company id=1 does not exist — skipping admin bootstrap (company bootstrap creates the company first)");
    return;
  }
  const companyId = companies[0].id;

  // Find the first branch for this company
  const { rows: branches } = await pool.query(
    `SELECT id FROM branches WHERE "companyId" = $1 ORDER BY id LIMIT 1`,
    [companyId],
  );
  if (branches.length === 0) {
    logger.info("No branch found for company id=1 — skipping admin bootstrap");
    return;
  }
  const branchId = branches[0].id;

  const client = await pool.connect();
  await client.query("BEGIN");

  try {
    const adminCreated = await createUserIfNotExists(client, ADMIN_USER, companyId, branchId);
    const fleetCreated = await createUserIfNotExists(client, FLEET_USER, companyId, branchId);

    // Idempotently enable the driver (سائق) role for the admin (role picker +
    // linked fleet_drivers record) — applies to existing and fresh DBs alike.
    await ensureAdminDriverCapability(client, companyId);

    await client.query("COMMIT");

    if (adminCreated || fleetCreated) {
      logger.info("Admin bootstrap completed successfully");
    } else {
      logger.info("All bootstrap users already exist — nothing to do");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(err as Error, "[Bootstrap] Failed to bootstrap admin users");
    throw err;
  } finally {
    client.release();
  }
}
