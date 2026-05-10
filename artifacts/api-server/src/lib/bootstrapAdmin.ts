import { pool } from "./rawdb.js";
import { hashPassword } from "./auth.js";
import { currentYear, todayISO } from "./businessHelpers.js";
import { logger } from "./logger.js";
import type pg from "pg";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@ghayth.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123456";

const FLEET_EMAIL = "fleet@ghayth.com";
const FLEET_PASSWORD = process.env.FLEET_PASSWORD || "Fleet@123456";

if (!process.env.ADMIN_PASSWORD) {
  logger.warn("ADMIN_PASSWORD not set — using default credentials. Change immediately in production!");
}
if (!process.env.FLEET_PASSWORD) {
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

  // 1. Create employee record
  const seqRes = await client.query(
    `SELECT nextval('employee_number_seq') AS seq`,
  );
  const seq = Number(seqRes.rows[0].seq);
  const yearStr = String(currentYear());
  const empNumber = `EMP-${yearStr}-${String(seq).padStart(3, "0")}`;

  const empRes = await client.query(
    `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
     RETURNING id`,
    [user.name, user.phone, user.email, empNumber, user.nationalId, user.gender, user.nationality],
  );
  const employeeId = empRes.rows[0].id;
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

  // 4. Create user_role
  const rd = user.roleDefinition;
  await client.query(
    `INSERT INTO user_roles ("userId", "roleKey", label, level, modules, "companyId", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT ("userId", "roleKey", "companyId") DO NOTHING`,
    [userId, rd.roleKey, rd.label, rd.level, JSON.stringify(rd.modules), companyId],
  );
  logger.info({ roleKey: rd.roleKey, level: rd.level, email: user.email }, "Bootstrap assigned role to user");

  return true;
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
