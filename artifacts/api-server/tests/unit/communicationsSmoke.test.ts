import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const COMM_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/communications.ts"),
  "utf8",
);

// ─── Communications Routes Smoke Tests ──────────────────────────────────────
// Static code analysis covering: endpoints, permissions, companyId scoping,
// parameterized SQL, validation, soft delete, and pagination.

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Communications endpoints exist", () => {
  it("WhatsApp webhook endpoints (GET + POST) exist", () => {
    expect(COMM_ROUTE).toContain('router.get("/whatsapp/webhook"');
    expect(COMM_ROUTE).toContain('router.post("/whatsapp/webhook"');
  });

  it("PBX endpoints (incoming, completed, status) exist", () => {
    expect(COMM_ROUTE).toContain('router.post("/pbx/incoming"');
    expect(COMM_ROUTE).toContain('router.post("/pbx/completed"');
    expect(COMM_ROUTE).toContain('router.post("/pbx/status"');
  });

  it("Communications log CRUD endpoints exist", () => {
    expect(COMM_ROUTE).toContain('router.get("/log"');
    expect(COMM_ROUTE).toContain('router.post("/send"');
    expect(COMM_ROUTE).toContain('router.patch("/log/:id"');
    expect(COMM_ROUTE).toContain('router.delete("/log/:id"');
    expect(COMM_ROUTE).toContain('router.post("/log/:id/convert"');
  });

  it("Queue listing endpoints exist (whatsapp, sms, pbx)", () => {
    expect(COMM_ROUTE).toContain('router.get("/whatsapp"');
    expect(COMM_ROUTE).toContain('router.get("/sms"');
    expect(COMM_ROUTE).toContain('router.get("/pbx"');
  });

  it("Stats endpoints exist", () => {
    expect(COMM_ROUTE).toContain('router.get("/stats"');
    expect(COMM_ROUTE).toContain('router.get("/queue-stats"');
  });

  it("Push notification endpoints exist", () => {
    expect(COMM_ROUTE).toContain('router.get("/push/vapid-key"');
    expect(COMM_ROUTE).toContain('router.post("/push/subscribe"');
    expect(COMM_ROUTE).toContain('router.delete("/push/unsubscribe"');
    expect(COMM_ROUTE).toContain('router.post("/push/test"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Communications permissions", () => {
  it("authMiddleware is applied and webhook routes come before it", () => {
    const authIdx = COMM_ROUTE.indexOf("router.use(authMiddleware)");
    expect(authIdx).toBeGreaterThan(-1);
    const whatsappWebhookIdx = COMM_ROUTE.indexOf('router.get("/whatsapp/webhook"');
    const pbxIncomingIdx = COMM_ROUTE.indexOf('router.post("/pbx/incoming"');
    expect(whatsappWebhookIdx).toBeLessThan(authIdx);
    expect(pbxIncomingIdx).toBeLessThan(authIdx);
  });

  it("GET /log requires communications:read", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/log"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:read")');
  });

  it("POST /send requires communications:write", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/send"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:write")');
  });

  it("PATCH /log/:id requires communications:write", () => {
    const idx = COMM_ROUTE.indexOf('router.patch("/log/:id"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:write")');
  });

  it("DELETE /log/:id requires communications:write", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:write")');
  });

  it("GET /stats requires communications:read", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/stats"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:read")');
  });

  it("POST /push/subscribe requires communications:write", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/push/subscribe"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:write")');
  });

  it("POST /push/test requires communications:write", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/push/test"');
    const line = COMM_ROUTE.slice(idx, idx + 200);
    expect(line).toContain('requirePermission("communications:write")');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPANY-ID SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

describe("CompanyId scoping", () => {
  it("GET /log scopes queries by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/log"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });

  it("POST /send inserts with companyId from scope", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/send"');
    const section = COMM_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId"');
  });

  it("GET /whatsapp scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/whatsapp"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });

  it("GET /sms scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/sms"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = $1');
    expect(section).toContain("scope.companyId");
  });

  it("GET /pbx scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/pbx"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId"=$1');
    expect(section).toContain("scope.companyId");
  });

  it("DELETE /log/:id scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"companyId" = $2');
    expect(section).toContain("scope.companyId");
  });

  it("PATCH /log/:id scopes by companyId in WHERE clause", () => {
    const idx = COMM_ROUTE.indexOf('router.patch("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId"');
    expect(section).toContain("scope.companyId");
  });

  it("GET /stats scopes all stat queries by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/stats"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId"=$1');
    expect(section).toContain("scope.companyId");
  });

  it("POST /push/subscribe scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/push/subscribe"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId"');
  });

  it("DELETE /push/unsubscribe scopes by companyId", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/push/unsubscribe"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("scope.companyId");
    expect(section).toContain('"companyId" = $1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMETERIZED SQL
// ═══════════════════════════════════════════════════════════════════════════════

describe("Parameterized SQL (no string interpolation in queries)", () => {
  it("GET /log uses parameterized conditions for channel filter", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/log"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("params.push(channel)");
    expect(section).toContain("`channel = $${params.length}`");
  });

  it("POST /send uses parameterized INSERT with positional placeholders", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/send"');
    const section = COMM_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("$1,$2");
    expect(section).toContain("scope.companyId");
    expect(section).not.toMatch(/VALUES\s*\(\s*'\$\{/);
  });

  it("DELETE /log/:id uses $1 and $2 parameters", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("$1");
    expect(section).toContain("$2");
  });

  it("POST /push/subscribe uses parameterized upsert with ON CONFLICT", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/push/subscribe"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("ON CONFLICT");
    expect(section).toContain("$1");
    expect(section).toContain("$2");
  });

  it("matchSenderToEntity uses parameterized queries for clients and employees", () => {
    const idx = COMM_ROUTE.indexOf("async function matchSenderToEntity");
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain('"companyId"=$1');
    expect(section).toContain("$2");
    expect(section).toContain("[companyId,");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Validation schemas and checks", () => {
  it("sendCommunicationSchema requires channel and body", () => {
    const idx = COMM_ROUTE.indexOf("sendCommunicationSchema");
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("channel");
    expect(section).toContain("قناة المراسلة مطلوبة");
    expect(section).toContain("body");
    expect(section).toContain("محتوى الرسالة مطلوب");
  });

  it("POST /send validates channel against allowed list of 5 channels", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/send"');
    const section = COMM_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("validChannels");
    expect(section).toContain('"whatsapp"');
    expect(section).toContain('"sms"');
    expect(section).toContain('"email"');
    expect(section).toContain('"call"');
    expect(section).toContain('"push"');
  });

  it("POST /send requires either toNumber or toEmail", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/send"');
    const section = COMM_ROUTE.slice(idx, idx + 5000);
    expect(section).toContain("!b.toNumber && !b.toEmail");
    expect(section).toContain("المستلم مطلوب");
  });

  it("convertLogSchema restricts targetType via z.enum", () => {
    const idx = COMM_ROUTE.indexOf("convertLogSchema");
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("z.enum");
    expect(section).toContain('"task"');
    expect(section).toContain('"ticket"');
    expect(section).toContain('"request"');
  });

  it("pushSubscribeSchema requires endpoint and nested keys", () => {
    const idx = COMM_ROUTE.indexOf("pushSubscribeSchema");
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("endpoint");
    expect(section).toContain("p256dh");
    expect(section).toContain("auth");
    expect(section).toContain("رابط الاشتراك مطلوب");
  });

  it("POST /pbx/status validates callId is present", () => {
    const idx = COMM_ROUTE.indexOf('router.post("/pbx/status"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("!callId");
    expect(section).toContain("ValidationError");
    expect(section).toContain("callId مطلوب");
  });

  it("PATCH /log/:id throws when no updatable fields are provided", () => {
    const idx = COMM_ROUTE.indexOf('router.patch("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("sets.length === 0");
    expect(section).toContain("لا توجد بيانات");
  });

  it("DELETE /push/unsubscribe validates endpoint is present", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/push/unsubscribe"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("!endpoint");
    expect(section).toContain("ValidationError");
    expect(section).toContain("endpoint مطلوب");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOFT DELETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Soft delete", () => {
  it("DELETE /log/:id sets deletedAt instead of hard deleting", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"deletedAt" = NOW()');
    expect(section).not.toContain("DELETE FROM communications_log");
  });

  it("DELETE /log/:id filters by deletedAt IS NULL to prevent double-delete", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain('"deletedAt" IS NULL');
  });

  it("DELETE /log/:id returns NotFoundError when record is already deleted", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("NotFoundError");
    expect(section).toContain("السجل غير موجود");
  });

  it("DELETE /log/:id captures before-state for audit trail", () => {
    const idx = COMM_ROUTE.indexOf('router.delete("/log/:id"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("[before]");
    expect(section).toContain("createAuditLog");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pagination", () => {
  it("GET /log defaults limit to 50 and caps at 200", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/log"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("Math.min(Number(lim) || 50, 200)");
  });

  it("GET /log returns total count alongside data, limit, and offset", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/log"');
    const section = COMM_ROUTE.slice(idx, idx + 4000);
    expect(section).toContain("COUNT(*) AS total");
    expect(section).toContain("total:");
    expect(section).toContain("limit:");
    expect(section).toContain("offset:");
  });

  it("GET /whatsapp paginates with LIMIT and OFFSET capped at 200", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/whatsapp"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("LIMIT");
    expect(section).toContain("OFFSET");
    expect(section).toContain("Math.min(Number(lim) || 50, 200)");
  });

  it("GET /sms paginates with LIMIT and OFFSET", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/sms"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("LIMIT");
    expect(section).toContain("OFFSET");
  });

  it("GET /pbx paginates with positional LIMIT $2 OFFSET $3", () => {
    const idx = COMM_ROUTE.indexOf('router.get("/pbx"');
    const section = COMM_ROUTE.slice(idx, idx + 3000);
    expect(section).toContain("LIMIT $2 OFFSET $3");
    expect(section).toContain("pageLimit");
    expect(section).toContain("pageOffset");
  });
});
