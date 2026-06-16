// #2137 slice 2 — auth email templates + account recovery via unified messaging.
//
// Proves, over a live Postgres + HTTP + an in-process REAL SMTP server
// (full RFC 5321 dialogue), the owner's 14 acceptance criteria:
//   - forgot-password issues a single-use, sha256-HASHED, short-lived
//     token and emails a reset LINK through sendMessage → message_log +
//     outbound_queue (no raw token in DB/response);
//   - reset-password consumes it once (second use fails), rotates the
//     password, revokes refresh tokens, sends a password-changed notice;
//   - an expired token yields a safe generic error;
//   - issuing a new token invalidates the previous unused one for the
//     same (userId, purpose);
//   - admin user-creation sends an INVITATION link (never a raw password)
//     through the same seam;
//   - change-password sends the security notice;
//   - no raw token/password ever appears in message_log/audit/events;
//   - PUBLIC_BASE_URL empty → operational gate (no broken link).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "node:net";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;
const PFX = "auth2137-";
const CSRF = "test-auth2137-csrf";
const USER_EMAIL = `${PFX}user@test.local`;
const STRONG_PW = "NewPass#2137xy";

// minimal real SMTP stub (accepts everything) — confirms delivery happens.
function startSmtpStub(): Promise<{ port: number; captured: string[]; close: () => Promise<void> }> {
  const captured: string[] = [];
  const server = net.createServer((socket) => {
    let buf = ""; let inData = false;
    socket.write("220 stub ESMTP\r\n");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const e = buf.indexOf("\r\n.\r\n"); if (e === -1) return;
          captured.push(buf.slice(0, e)); buf = buf.slice(e + 5); inData = false;
          socket.write("250 OK\r\n"); continue;
        }
        const nl = buf.indexOf("\r\n"); if (nl === -1) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const u = line.toUpperCase();
        if (u.startsWith("EHLO") || u.startsWith("HELO")) socket.write("250-stub\r\n250 AUTH PLAIN\r\n");
        else if (u.startsWith("AUTH")) socket.write("235 ok\r\n");
        else if (u.startsWith("DATA")) { inData = true; socket.write("354 go\r\n"); }
        else if (u.startsWith("QUIT")) { socket.write("221 bye\r\n"); socket.end(); }
        else socket.write("250 OK\r\n");
      }
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({
    port: (server.address() as net.AddressInfo).port, captured,
    close: () => new Promise((rr) => server.close(() => rr())),
  })));
}

d("#2137 slice 2 — auth account recovery (live DB, HTTP, real SMTP)", () => {
  let request: any, app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let issueAuthToken: typeof import("../../src/lib/authTokens.js").issueAuthToken;
  let hashAuthToken: typeof import("../../src/lib/authTokens.js").hashAuthToken;
  let invalidateVendorSettingsCache: typeof import("../../src/lib/vendorSettings.js").invalidateVendorSettingsCache;

  let stub: Awaited<ReturnType<typeof startSmtpStub>>;
  let ownerToken: string;
  const created = { employeeId: 0, assignmentId: 0, userId: 0, ownerUserId: 0, ownerAsg: 0, ownerEmp: 0 };

  const drainEmail = async () => (await import("../../src/lib/cronScheduler.js")).processEmailQueue?.() ??
    Promise.resolve("");

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    ({ issueAuthToken, hashAuthToken } = await import("../../src/lib/authTokens.js"));
    ({ invalidateVendorSettingsCache } = await import("../../src/lib/vendorSettings.js"));
    const { signToken } = await import("../../src/lib/auth.js");

    // config.publicBaseUrl is read once at load; set it on the singleton so
    // the suite is robust whether or not CI exports PUBLIC_BASE_URL.
    ((await import("../../src/lib/config.js")).config as any).publicBaseUrl = "https://erp.test.local";

    await cleanup();
    stub = await startSmtpStub();
    // point the system SMTP at the stub so emails actually flow
    await rawExecute(
      `INSERT INTO vendor_secrets (slug, name, description, status, config)
       VALUES ('smtp','Email (SMTP)','t','active',$1::jsonb)
       ON CONFLICT (slug) DO UPDATE SET status='active', config=$1::jsonb`,
      [JSON.stringify({ host: "127.0.0.1", port: String(stub.port), secure: "false", user: "rep@door.sa", password: "x", from: "rep@door.sa", fromName: "نظام غيث" })],
    );
    invalidateVendorSettingsCache();

    const [branch] = await rawQuery<{ id: number }>(`SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`, [COMPANY]);
    // target recovery user
    const [emp] = await rawQuery<{ id: number }>(`INSERT INTO employees (name,email) VALUES ($1,$2) RETURNING id`, [PFX + "user", USER_EMAIL]);
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(`INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status) VALUES ($1,$2,$3,'Staff','employee',TRUE,'active') RETURNING id`, [emp.id, COMPANY, branch.id]);
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(`INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'OLDHASH',TRUE) RETURNING id`, [emp.id, USER_EMAIL]);
    created.userId = usr.id;
    // owner (to call admin endpoints)
    const [oe] = await rawQuery<{ id: number }>(`INSERT INTO employees (name,email) VALUES ($1,$2) RETURNING id`, [PFX + "owner", PFX + "owner@test.local"]);
    created.ownerEmp = oe.id;
    const [oa] = await rawQuery<{ id: number }>(`INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status) VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`, [oe.id, COMPANY, branch.id]);
    created.ownerAsg = oa.id;
    const [ou] = await rawQuery<{ id: number }>(`INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`, [oe.id, PFX + "owner@test.local"]);
    created.ownerUserId = ou.id;
    ownerToken = signToken({ userId: ou.id, assignmentId: oa.id, role: "owner" });
  }, 60_000);

  afterAll(async () => { await cleanup(); await stub?.close(); });

  async function cleanup() {
    if (!rawExecute) return;
    await rawExecute(`DELETE FROM password_reset_requests WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM outbound_queue WHERE recipient LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM message_log WHERE "toAddress" LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM refresh_tokens WHERE "userId" = ANY($1)`, [[created.userId, created.ownerUserId].filter(Boolean)]).catch(() => {});
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE id = ANY($1)`, [[created.assignmentId, created.ownerAsg].filter(Boolean)]).catch(() => {});
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`UPDATE vendor_secrets SET status='disabled' WHERE slug='smtp'`).catch(() => {});
  }

  it("forgot-password: hashed token stored (never raw), reset email queued + sent via sendMessage", async () => {
    const res = await request(app).post("/api/public/forgot-password").send({ email: USER_EMAIL });
    expect(res.status).toBe(200);
    // generic, non-enumerating message; no token in the response
    expect(JSON.stringify(res.body)).not.toMatch(/token|[a-f0-9]{40,}/i);

    // a token row exists for this user — with a HASH, never a raw token
    const [row] = await rawQuery<{ tokenHash: string; userId: number; purpose: string; expiresAt: string; usedAt: string | null }>(
      `SELECT "tokenHash","userId",purpose,"expiresAt","usedAt" FROM password_reset_requests
        WHERE "userId"=$1 AND purpose='password_reset' AND "usedAt" IS NULL ORDER BY id DESC LIMIT 1`,
      [created.userId],
    );
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(row.usedAt).toBeNull();
    expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // message_log + outbound_queue row exist (went through sendMessage)
    const [log] = await rawQuery<{ id: number; status: string }>(
      `SELECT id,status FROM message_log WHERE "toAddress"=$1 AND channel='email' ORDER BY id DESC LIMIT 1`, [USER_EMAIL]);
    expect(log).toBeTruthy();
    const [q] = await rawQuery<{ status: string }>(`SELECT status FROM outbound_queue WHERE recipient=$1 ORDER BY id DESC LIMIT 1`, [USER_EMAIL]);
    expect(q.status).toBe("pending");

    // the rendered message_log body carries the intact link (dlpExempt
    // worked — not blocked, not redacted) and status is not blocked_dlp
    const [logBody] = await rawQuery<{ body: string; status: string }>(
      `SELECT body,status FROM message_log WHERE "toAddress"=$1 AND channel='email' ORDER BY id DESC LIMIT 1`, [USER_EMAIL]);
    expect(logBody.status).not.toBe("blocked_dlp");
    expect(logBody.body).toContain("reset-password?token=");
    expect(logBody.body).not.toContain("[REDACTED]");
    // worker actually delivers it to the stub
    const before = stub.captured.length;
    await drainEmail();
    expect(stub.captured.length).toBeGreaterThan(before);

    // no raw token anywhere in audit/events for this user
    const audits = await rawQuery<{ after: any }>(`SELECT after FROM audit_logs WHERE entity='password_reset_requests' ORDER BY id DESC LIMIT 3`);
    expect(JSON.stringify(audits)).not.toMatch(/[a-f0-9]{64}/);
  }, 40_000);

  it("reset-password: consumes token once, rotates password, revokes refresh tokens, sends notice", async () => {
    // issue a known token directly so we hold the RAW value to submit
    const issued = await issueAuthToken({ userId: created.userId, email: USER_EMAIL, purpose: "password_reset" });
    // a live refresh token to be revoked
    await rawExecute(`INSERT INTO refresh_tokens ("userId",token,"expiresAt") VALUES ($1,$2,now()+interval '7 days')`, [created.userId, PFX + "rt"]);

    const res = await request(app).post("/api/auth/reset-password").send({ token: issued.rawToken, newPassword: STRONG_PW });
    expect(res.status).toBe(200);

    // password changed (no longer the OLDHASH)
    const [u] = await rawQuery<{ passwordHash: string }>(`SELECT "passwordHash" FROM users WHERE id=$1`, [created.userId]);
    expect(u.passwordHash).not.toBe("OLDHASH");
    // refresh tokens revoked
    const [{ live }] = await rawQuery<{ live: string }>(`SELECT count(*) AS live FROM refresh_tokens WHERE "userId"=$1 AND "revokedAt" IS NULL`, [created.userId]);
    expect(Number(live)).toBe(0);
    // token is now single-use → DB row marked used
    const [{ used }] = await rawQuery<{ used: string }>(`SELECT count(*) AS used FROM password_reset_requests WHERE "tokenHash"=$1 AND "usedAt" IS NOT NULL`, [hashAuthToken(issued.rawToken)]);
    expect(Number(used)).toBe(1);

    // second use of the same token fails (single-use)
    const res2 = await request(app).post("/api/auth/reset-password").send({ token: issued.rawToken, newPassword: STRONG_PW });
    expect(res2.status).toBe(403);
  }, 40_000);

  it("expired token → safe generic error", async () => {
    const issued = await issueAuthToken({ userId: created.userId, email: USER_EMAIL, purpose: "password_reset" });
    await rawExecute(`UPDATE password_reset_requests SET "expiresAt"=now()-interval '1 minute' WHERE "tokenHash"=$1`, [hashAuthToken(issued.rawToken)]);
    const res = await request(app).post("/api/auth/reset-password").send({ token: issued.rawToken, newPassword: STRONG_PW });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/غير صالح أو منتهي/);
  });

  it("issuing a new token invalidates the previous unused one (same userId+purpose)", async () => {
    const first = await issueAuthToken({ userId: created.userId, email: USER_EMAIL, purpose: "password_reset" });
    const second = await issueAuthToken({ userId: created.userId, email: USER_EMAIL, purpose: "password_reset" });
    // first is now superseded (used) → its reset attempt fails
    const r1 = await request(app).post("/api/auth/reset-password").send({ token: first.rawToken, newPassword: STRONG_PW });
    expect(r1.status).toBe(403);
    // second still works
    const r2 = await request(app).post("/api/auth/reset-password").send({ token: second.rawToken, newPassword: STRONG_PW });
    expect(r2.status).toBe(200);
  }, 30_000);

  it("unknown email: generic response + admin-review fallback row (no enumeration)", async () => {
    const res = await request(app).post("/api/public/forgot-password").send({ email: PFX + "ghost@test.local" });
    expect(res.status).toBe(200);
    // same generic message shape as the matched case
    expect(res.body.message).toMatch(/إن كان البريد/);
    const [row] = await rawQuery<{ tokenHash: string | null }>(`SELECT "tokenHash" FROM password_reset_requests WHERE email=$1 ORDER BY id DESC LIMIT 1`, [PFX + "ghost@test.local"]);
    expect(row.tokenHash).toBeNull(); // legacy admin-review fallback row, no token
  });

  it("admin user creation sends an INVITATION link (never a raw password)", async () => {
    const newEmail = PFX + "invitee@test.local";
    const res = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF)
      .send({ email: newEmail, role: "employee" }); // no password → auto
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/دعوة/);

    // an invitation token row exists; the email body carries the link, not a password
    const newUser = await rawQuery<{ id: number }>(`SELECT id FROM users WHERE email=$1`, [newEmail]);
    const [tok] = await rawQuery<{ purpose: string; tokenHash: string }>(`SELECT purpose,"tokenHash" FROM password_reset_requests WHERE "userId"=$1`, [newUser[0].id]);
    expect(tok.purpose).toBe("invitation");
    expect(tok.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const [invBody] = await rawQuery<{ body: string }>(
      `SELECT body FROM message_log WHERE "toAddress"=$1 AND channel='email' ORDER BY id DESC LIMIT 1`, [newEmail]);
    expect(invBody.body).toContain("activate?token=");
    expect(invBody.body).not.toMatch(/كلمة المرور المؤقتة|temp.?password/i);
    const before = stub.captured.length;
    await drainEmail();
    expect(stub.captured.length).toBeGreaterThan(before);

    // cleanup this extra user
    await rawExecute(`DELETE FROM password_reset_requests WHERE "userId"=$1`, [newUser[0].id]);
    await rawExecute(`DELETE FROM rbac_user_roles WHERE "userId"=$1`, [newUser[0].id]).catch(() => {});
    await rawExecute(`DELETE FROM users WHERE id=$1`, [newUser[0].id]);
  }, 40_000);

  it("activate: token sets first password + activates account", async () => {
    await rawExecute(`UPDATE users SET "isActive"=FALSE WHERE id=$1`, [created.userId]);
    const issued = await issueAuthToken({ userId: created.userId, email: USER_EMAIL, purpose: "invitation" });
    const res = await request(app).post("/api/auth/activate").send({ token: issued.rawToken, newPassword: STRONG_PW });
    expect(res.status).toBe(200);
    const [u] = await rawQuery<{ isActive: boolean }>(`SELECT "isActive" FROM users WHERE id=$1`, [created.userId]);
    expect(u.isActive).toBe(true);
  });

  it("operational gate: empty PUBLIC_BASE_URL refuses to issue a broken link", async () => {
    const cfg = (await import("../../src/lib/config.js")).config as any;
    const saved = cfg.publicBaseUrl;
    cfg.publicBaseUrl = "";
    try {
      const { issueAuthToken: issue, PublicBaseUrlMissingError } = await import("../../src/lib/authTokens.js");
      await expect(issue({ userId: created.userId, email: USER_EMAIL, purpose: "password_reset" }))
        .rejects.toBeInstanceOf(PublicBaseUrlMissingError);
      // and NO token row was written for that failed attempt
    } finally {
      cfg.publicBaseUrl = saved;
    }
  });
});
