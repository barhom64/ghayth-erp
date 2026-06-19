import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const CONTRACTS_ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr-contracts.ts"),
  "utf8"
);

// ─── HR Contracts Smoke Tests ───────────────────────────────────────────────
// Validates the full contract lifecycle: draft → submit → approve → sign → activate
// plus rejection, termination, and renewal flows.

describe("Contract route structure", () => {
  it("exports a router as default", () => {
    expect(CONTRACTS_ROUTE).toContain("export default contractsRouter");
  });

  it("uses authMiddleware on all routes", () => {
    expect(CONTRACTS_ROUTE).toContain("contractsRouter.use(authMiddleware)");
  });

  it("has all 10 CRUD + lifecycle endpoints", () => {
    const endpoints = [
      'contractsRouter.get("/"',
      'contractsRouter.get("/:id"',
      'contractsRouter.post("/"',
      'contractsRouter.patch("/:id"',
      'contractsRouter.post("/:id/submit"',
      'contractsRouter.post("/:id/approve"',
      'contractsRouter.post("/:id/reject"',
      'contractsRouter.post("/:id/sign-company"',
      'contractsRouter.post("/:id/sign-employee"',
      'contractsRouter.post("/:id/activate"',
      'contractsRouter.post("/:id/terminate"',
      'contractsRouter.post("/:id/renew"',
    ];
    for (const ep of endpoints) {
      expect(CONTRACTS_ROUTE).toContain(ep);
    }
  });
});

describe("Contract creation", () => {
  it("validates input with Zod createContractSchema", () => {
    expect(CONTRACTS_ROUTE).toContain("createContractSchema.safeParse(req.body)");
  });

  it("requires hr:create permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.post("/",');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("verifies employee belongs to company before creating", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.post("/",');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("الموظف غير موجود");
    expect(section).toContain("companyId");
  });

  it("auto-resolves assignment if not provided", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.post("/",');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("isPrimary");
    expect(section).toContain("لا يوجد تعيين فعّال لهذا الموظف");
  });

  it("generates contract reference number via the unified numbering center (Issue #1141)", () => {
    // The legacy `nextval('contract_number_seq')` call was removed in
    // favour of `numberingService.issueNumber` so the audit, per-branch
    // counter and policy enforcement all apply.
    expect(CONTRACTS_ROUTE).not.toMatch(/nextval\s*\(\s*['"`]contract_number_seq/);
    expect(CONTRACTS_ROUTE).toContain('issueNumber({');
    expect(CONTRACTS_ROUTE).toContain('moduleKey: "hr"');
    expect(CONTRACTS_ROUTE).toContain('entityKey: "employee_contract"');
  });

  it("creates contract with draft status", () => {
    expect(CONTRACTS_ROUTE).toContain("'draft','draft'");
  });

  it("creates audit log on creation", () => {
    // Window widened to 4500 chars: the numbering center prelude
    // (issueNumber call + assignment linkback) pushed the createAuditLog
    // line past the original 3000-char slice.
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.post("/",');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 4500);
    expect(section).toContain("contract_created");
    expect(section).toContain("createAuditLog");
  });
});

describe("Contract update (draft only)", () => {
  it("requires hr:update permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.patch("/:id"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("blocks update if not in draft status", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.patch("/:id"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('approvalStatus !== "draft"');
    expect(section).toContain("لا يمكن تعديل العقد بعد إرساله للاعتماد");
  });

  it("only allows whitelisted fields to be updated", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.patch("/:id"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("contractType");
    expect(section).toContain("salary");
    expect(section).toContain("housingAllowance");
    expect(section).toContain("transportAllowance");
  });

  it("scopes update by companyId", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.patch("/:id"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain('"companyId"');
  });
});

describe("Contract submission flow", () => {
  it("submit requires hr:create permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/submit"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("submit only allowed from draft state", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/submit"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('approvalStatus !== "draft"');
    expect(section).toContain("العقد ليس في حالة مسودة");
  });

  it("submit transitions to pending_approval", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/submit"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("pending_approval");
  });

  it("submit creates audit log", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/submit"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1200);
    expect(section).toContain("contract_submitted");
  });
});

describe("Contract approval flow", () => {
  it("approve requires hr:approve permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/approve"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("approve only allowed from pending_approval state", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/approve"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain('approvalStatus !== "pending_approval"');
  });

  it("approve records who approved and when", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/approve"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain('"approvedBy"');
    expect(section).toContain('"approvedAt"');
  });

  it("approve sends notification to employee", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/approve"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
    expect(section).toContain("createNotification");
    expect(section).toContain("contract_approved");
    expect(section).toContain("تم اعتماد العقد");
  });
});

describe("Contract rejection flow", () => {
  it("reject requires hr:approve permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/reject"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("reject only from pending_approval", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/reject"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('approvalStatus !== "pending_approval"');
  });

  it("reject appends reason to notes", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/reject"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 900);
    expect(section).toContain("سبب الرفض");
  });

  it("reject creates audit log with reason", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/reject"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2400);
    expect(section).toContain("contract_rejected");
    expect(section).toContain("reason");
  });
});

describe("Contract signing flow", () => {
  it("company sign requires hr:approve permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/sign-company"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("signing requires approved status first", () => {
    const companySignIdx = CONTRACTS_ROUTE.indexOf('/:id/sign-company"');
    const section = CONTRACTS_ROUTE.slice(companySignIdx, companySignIdx + 1000);
    expect(section).toContain("يجب اعتماد العقد أولاً قبل التوقيع");
  });

  it("company sign sets signedByCompany flag", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/sign-company"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain('"signedByCompany" = TRUE');
    expect(section).toContain('"companySignedAt"');
  });

  it("employee sign validates ownership via scope.employeeId", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/sign-employee"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("scope.employeeId");
    expect(section).toContain("العقد غير موجود أو ليس لك");
  });

  it("both signatures trigger signed status", () => {
    expect(CONTRACTS_ROUTE).toMatch(
      /CASE WHEN "signedByEmployee" = TRUE THEN 'signed'/
    );
    expect(CONTRACTS_ROUTE).toMatch(
      /CASE WHEN "signedByCompany" = TRUE THEN 'signed'/
    );
  });
});

describe("Contract activation flow", () => {
  it("activate requires hr:update permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/activate"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("activate only from signed state", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/activate"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('approvalStatus !== "signed"');
    expect(section).toContain("يجب توقيع العقد من الطرفين أولاً");
  });

  it("activate sets both approvalStatus and status to active", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/activate"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain("'active', status = 'active'");
  });
});

describe("Contract termination flow", () => {
  it("terminate requires hr:update permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/terminate"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("terminate only from active state", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/terminate"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 800);
    expect(section).toContain('status !== "active"');
    expect(section).toContain("لا يمكن إنهاء عقد غير نشط");
  });

  it("terminate records who, when, and reason", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/terminate"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1000);
    expect(section).toContain("status = 'terminated'");
    expect(section).toContain('"updatedBy"');
    expect(section).toContain("COALESCE($3, notes)");
  });
});

describe("Contract renewal flow", () => {
  it("renew requires hr:create permission", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/renew"');
    const line = CONTRACTS_ROUTE.slice(idx, CONTRACTS_ROUTE.indexOf("\n", idx));
    expect(line).toContain('authorize(');
  });

  it("renew creates a new contract row in draft", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/renew"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("INSERT INTO employee_contracts");
    expect(section).toContain("'draft','draft'");
  });

  it("renew links back to old contract via notes", () => {
    // Window widened to 3500 chars: the atomic-tx wrapper around
    // issueNumber + INSERT + linkback pushed the linkback note string
    // past the original 2000-char slice. Same reason as the renewalDate
    // assertion below.
    const idx = CONTRACTS_ROUTE.indexOf('/:id/renew"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 3500);
    expect(section).toContain("تجديد للعقد رقم");
  });

  it("renew updates old contract's renewalDate", () => {
    // Window widened to 3500 chars: the numbering center prelude
    // pushed the renewalDate UPDATE past the original 2000-char slice.
    const idx = CONTRACTS_ROUTE.indexOf('/:id/renew"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 3500);
    expect(section).toContain('"renewalDate"');
  });

  it("renew can inherit or override salary", () => {
    const idx = CONTRACTS_ROUTE.indexOf('/:id/renew"');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2000);
    expect(section).toContain("newSalary || contract.salary");
  });
});

describe("Contract security", () => {
  it("all state-changing queries pre-verify companyId ownership", () => {
    const stateChanges = [
      'contractsRouter.post("/:id/approve"',
      'contractsRouter.post("/:id/reject"',
      'contractsRouter.post("/:id/terminate"',
      'contractsRouter.post("/:id/activate"',
    ];
    for (const ep of stateChanges) {
      const idx = CONTRACTS_ROUTE.indexOf(ep);
      const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
      expect(section).toContain('"companyId"');
    }
  });

  it("list endpoint has a LIMIT to prevent unbounded queries", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.get("/",');
    // Window widened from 1500 → 2200 after the buildScopedWhere refactor
    // (which introduces a multi-line helper-call block before the SQL
    // template). The `LIMIT 200` is still in the same handler — just
    // further past the new helper call.
    const section = CONTRACTS_ROUTE.slice(idx, idx + 2200);
    expect(section).toContain("LIMIT");
  });

  it("uses parameterized queries for search (no SQL injection)", () => {
    const idx = CONTRACTS_ROUTE.indexOf('contractsRouter.get("/",');
    const section = CONTRACTS_ROUTE.slice(idx, idx + 1500);
    expect(section).not.toContain("${search}");
    expect(section).toContain("ILIKE $");
  });
});
