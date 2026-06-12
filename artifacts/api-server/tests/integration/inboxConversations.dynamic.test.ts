// #2138 slice 1 — the persisted Conversation canon (migration 335 +
// routes/inboxConversations.ts). Proves over a REAL Postgres + HTTP:
//
//   - the message_log BEFORE INSERT trigger materialises one
//     conversation per (companyId, channel, peer) — the exact key the
//     legacy computed /inbox/threads groups by — and stamps
//     message_log."conversationId" on every new row
//   - an inbound message re-opens a closed / awaiting_reply conversation
//   - GET /api/inbox/conversations lists with unread/total counts +
//     last-message preview; GET /:id returns links + the full thread
//   - POST / creates (or reuses) a conversation; POST /:id/messages
//     sends through sendMessage() → message_log + outbound_queue rows
//     exist and the conversation flips to awaiting_reply
//   - assign / close / reopen / escalate lifecycle + audit/event rows
//   - link / unlink against the LINKABLE_ENTITIES contract (clients)
//   - tenant isolation: a conversation belonging to another company is
//     a 404, never a leak
//
// Activates only on the test cluster (same guard as the other
// *.dynamic.test.ts files) — skipped silently when DATABASE_URL is
// absent so the suite stays green without Postgres.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2; // Al-Diyaa — seeded by db/bootstrap.sh
const OTHER_COMPANY = 1;
const PFX = "conv2138-";
const CSRF = "test-conv2138-csrf";
const PEER_EMAIL = `${PFX}party@test.local`;

d("#2138 slice 1 — conversation canon (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;

  let token: string;
  const created = { employeeId: 0, assignmentId: 0, userId: 0, clientId: 0 };

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const { signToken } = await import("../../src/lib/auth.js");

    await cleanup();

    // Branch ids drift between bootstraps depending on seed order —
    // resolve the company's first branch instead of hard-coding it.
    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId" = $1 ORDER BY id LIMIT 1`,
      [COMPANY],
    );

    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"],
    );
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, COMPANY, branch.id],
    );
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"],
    );
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });

    const [client] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId", name, email) VALUES ($1,$2,$3) RETURNING id`,
      [COMPANY, PFX + "client", PFX + "client@test.local"],
    );
    created.clientId = client.id;
  }, 60_000);

  afterAll(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    await rawExecute(
      `DELETE FROM conversation_links WHERE "conversationId" IN
         (SELECT id FROM conversations WHERE "participantAddress" LIKE $1)`,
      [PFX + "%"],
    );
    await rawExecute(`DELETE FROM outbound_queue WHERE recipient LIKE $1`, [PFX + "%"]);
    await rawExecute(
      `DELETE FROM message_log WHERE "fromAddress" LIKE $1 OR "toAddress" LIKE $1`,
      [PFX + "%"],
    );
    await rawExecute(`DELETE FROM conversations WHERE "participantAddress" LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM clients WHERE name = $1`, [PFX + "client"]);
    if (created.userId) await rawExecute(`DELETE FROM users WHERE id = $1`, [created.userId]);
    if (created.assignmentId)
      await rawExecute(`DELETE FROM employee_assignments WHERE id = $1`, [created.assignmentId]);
    if (created.employeeId)
      await rawExecute(`DELETE FROM employees WHERE id = $1`, [created.employeeId]);
  }

  // ── trigger: message_log INSERT materialises the conversation ──────────

  it("materialises one conversation per (company, channel, peer) and stamps conversationId", async () => {
    const [m1] = await rawQuery<{ id: number; conversationId: number | null }>(
      `INSERT INTO message_log ("companyId", channel, direction, "fromAddress", "toAddress", subject, body, status, folder)
       VALUES ($1,'email','inbound',$2,'system@ghayth.local','سؤال عن الفاتورة','مرحبا','sent','inbox')
       RETURNING id, "conversationId"`,
      [COMPANY, PEER_EMAIL],
    );
    expect(m1.conversationId).toBeGreaterThan(0);

    const [m2] = await rawQuery<{ id: number; conversationId: number | null }>(
      `INSERT INTO message_log ("companyId", channel, direction, "fromAddress", "toAddress", body, status, folder)
       VALUES ($1,'email','outbound',NULL,$2,'الرد','sent','sent')
       RETURNING id, "conversationId"`,
      [COMPANY, PEER_EMAIL],
    );
    // outbound peer = toAddress = same address → same conversation
    expect(m2.conversationId).toBe(m1.conversationId);

    const [conv] = await rawQuery<{ title: string; lastMessageAt: string }>(
      `SELECT title, "lastMessageAt" FROM conversations WHERE id = $1`,
      [m1.conversationId],
    );
    expect(conv.title).toBe("سؤال عن الفاتورة");
    expect(conv.lastMessageAt).toBeTruthy();
  });

  it("re-opens a closed conversation when an inbound message arrives", async () => {
    const [{ conversationId }] = await rawQuery<{ conversationId: number }>(
      `SELECT "conversationId" FROM message_log
        WHERE "companyId" = $1 AND "fromAddress" = $2 LIMIT 1`,
      [COMPANY, PEER_EMAIL],
    );
    await rawExecute(`UPDATE conversations SET status = 'closed' WHERE id = $1`, [conversationId]);

    await rawExecute(
      `INSERT INTO message_log ("companyId", channel, direction, "fromAddress", "toAddress", body, status, folder)
       VALUES ($1,'email','inbound',$2,'system@ghayth.local','رسالة جديدة','sent','inbox')`,
      [COMPANY, PEER_EMAIL],
    );
    const [conv] = await rawQuery<{ status: string }>(
      `SELECT status FROM conversations WHERE id = $1`,
      [conversationId],
    );
    expect(conv.status).toBe("open");
  });

  // ── HTTP surface ────────────────────────────────────────────────────────

  it("GET /api/inbox/conversations lists the conversation with counts + preview", async () => {
    const res = await request(app)
      .get("/api/inbox/conversations?channel=email")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: any) => r.participantAddress === PEER_EMAIL);
    expect(row).toBeTruthy();
    expect(row.totalMessages).toBeGreaterThanOrEqual(3);
    expect(row.unreadCount).toBeGreaterThanOrEqual(2); // two unread inbound
    expect(row.lastMessagePreview).toBe("رسالة جديدة");
    expect(row.status).toBe("open");
  });

  it("POST / reuses the existing conversation for the same peer", async () => {
    const res = await request(app)
      .post("/api/inbox/conversations")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ channel: "email", participantAddress: PEER_EMAIL, participantName: "طرف الاختبار" });
    expect(res.status).toBe(201);
    expect(res.body.existing).toBe(true);
  });

  it("POST /:id/messages sends through sendMessage → queue + log + awaiting_reply", async () => {
    const list = await request(app)
      .get(`/api/inbox/conversations?q=${PFX}party`)
      .set("Authorization", `Bearer ${token}`);
    const convId = list.body.data[0].id;

    const res = await request(app)
      .post(`/api/inbox/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ subject: "رد رسمي", body: "تم استلام طلبكم" });
    expect(res.status).toBe(201);
    expect(res.body.queued).toBe(true);
    expect(res.body.logId).toBeGreaterThan(0);

    // message_log row carries the conversation id
    const [logRow] = await rawQuery<{ conversationId: number }>(
      `SELECT "conversationId" FROM message_log WHERE id = $1`,
      [res.body.logId],
    );
    expect(logRow.conversationId).toBe(convId);

    // outbound_queue row exists (pending lifecycle start)
    const [queueRow] = await rawQuery<{ status: string }>(
      `SELECT status FROM outbound_queue WHERE "messageLogId" = $1`,
      [res.body.logId],
    );
    expect(queueRow.status).toBe("pending");

    // we sent — ball in the other court
    const detail = await request(app)
      .get(`/api/inbox/conversations/${convId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe("awaiting_reply");
    expect(detail.body.data.messages.length).toBeGreaterThanOrEqual(4);
  });

  it("assign / close / reopen / escalate lifecycle with audit + events", async () => {
    const list = await request(app)
      .get(`/api/inbox/conversations?q=${PFX}party`)
      .set("Authorization", `Bearer ${token}`);
    const convId = list.body.data[0].id;

    const assign = await request(app)
      .post(`/api/inbox/conversations/${convId}/assign`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ assignedTo: created.userId });
    expect(assign.status).toBe(200);

    const close = await request(app)
      .post(`/api/inbox/conversations/${convId}/close`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ reason: "انتهى الموضوع" });
    expect(close.status).toBe(200);
    expect(close.body.status).toBe("closed");

    // closing twice is a validation error, not a silent no-op
    const closeAgain = await request(app)
      .post(`/api/inbox/conversations/${convId}/close`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({});
    expect(closeAgain.status).toBe(422);

    const reopen = await request(app)
      .post(`/api/inbox/conversations/${convId}/reopen`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({});
    expect(reopen.status).toBe(200);

    const escalate = await request(app)
      .post(`/api/inbox/conversations/${convId}/escalate`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ reason: "تأخر الرد", priority: "urgent" });
    expect(escalate.status).toBe(200);
    expect(escalate.body.priority).toBe("urgent");

    // Audit writes are fire-and-forget (void createAuditLog(...).catch)
    // — poll briefly so the last row has a chance to land.
    let auditCount = 0;
    for (let i = 0; i < 20 && auditCount < 4; i++) {
      const audits = await rawQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM audit_logs
          WHERE "companyId" = $1 AND entity = 'conversations' AND "entityId" = $2`,
        [COMPANY, convId],
      );
      auditCount = Number(audits[0].count);
      if (auditCount < 4) await new Promise((r) => setTimeout(r, 100));
    }
    expect(auditCount).toBeGreaterThanOrEqual(4);
  });

  it("link / unlink a client through the entity contract", async () => {
    const list = await request(app)
      .get(`/api/inbox/conversations?q=${PFX}party`)
      .set("Authorization", `Bearer ${token}`);
    const convId = list.body.data[0].id;

    const link = await request(app)
      .post(`/api/inbox/conversations/${convId}/link`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ relatedType: "clients", relatedId: created.clientId });
    expect(link.status).toBe(200);

    // party link fills the unmatched participant identity
    const detail = await request(app)
      .get(`/api/inbox/conversations/${convId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.body.data.participantType).toBe("clients");
    expect(detail.body.data.participantId).toBe(created.clientId);
    expect(detail.body.data.links).toHaveLength(1);

    // entity filter finds it
    const filtered = await request(app)
      .get(`/api/inbox/conversations?relatedType=clients&relatedId=${created.clientId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(filtered.body.data.some((r: any) => r.id === convId)).toBe(true);

    // linking a non-existent entity is a 404
    const badLink = await request(app)
      .post(`/api/inbox/conversations/${convId}/link`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ relatedType: "clients", relatedId: 99999999 });
    expect(badLink.status).toBe(404);

    const unlink = await request(app)
      .post(`/api/inbox/conversations/${convId}/unlink`)
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ relatedType: "clients", relatedId: created.clientId });
    expect(unlink.status).toBe(200);

    const after = await request(app)
      .get(`/api/inbox/conversations/${convId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.body.data.links).toHaveLength(0);
  });

  it("never leaks another company's conversation", async () => {
    const [foreign] = await rawQuery<{ id: number }>(
      `INSERT INTO conversations ("companyId","channelPrimary","participantAddress")
       VALUES ($1,'email',$2) RETURNING id`,
      [OTHER_COMPANY, PFX + "foreign@test.local"],
    );
    const res = await request(app)
      .get(`/api/inbox/conversations/${foreign.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);

    const list = await request(app)
      .get(`/api/inbox/conversations?q=${PFX}foreign`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data).toHaveLength(0);
  });
});
