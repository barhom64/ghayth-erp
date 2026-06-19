import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted يرفع تعريف الـmocks فوق vi.mock (المرفوع تلقائيًا) فلا يقع خطأ TDZ.
const { rawQuery, rawExecute, getActiveIntegration, emitEvent } = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  rawExecute: vi.fn(),
  getActiveIntegration: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({ rawQuery, rawExecute }));
vi.mock("../../src/lib/integrationService.js", () => ({ getActiveIntegration }));
vi.mock("../../src/lib/businessHelpers.js", () => ({ emitEvent }));
vi.mock("../../src/lib/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  shouldSyncCategory,
  resolveSyncCategories,
  buildIssueBody,
  createGithubIssue,
  syncTicketToGithub,
} from "../../src/lib/integrations/githubSupportSync.js";

const TECH_TICKET = {
  id: 42,
  companyId: 7,
  branchId: 1,
  ref: "SUP-2026-0042",
  title: "خطأ في حفظ القيد",
  description: "تفاصيل العطل التقني",
  category: "technical",
  priority: "high",
  status: "open",
  clientId: 9,
  slaDeadline: "2026-06-20T10:00:00Z",
  githubIssueNumber: null,
};

const ACTIVE_GH = {
  config: { token: "tok", repo: "barhom64/ghayth-erp", ghaythBaseUrl: "https://hr.door.sa" },
};

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ number: 101, html_url: "https://github.com/barhom64/ghayth-erp/issues/101" }),
    text: async () => "",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  emitEvent.mockResolvedValue(undefined);
  // @ts-expect-error — حقن fetch في بيئة الاختبار
  global.fetch = okFetch();
});

describe("githubSupportSync — المُصنِّف حسب الفئة المُهيّأة", () => {
  it("shouldSyncCategory: ضمن المجموعة → true · خارجها/null → false", () => {
    expect(shouldSyncCategory("technical", ["technical"])).toBe(true);
    expect(shouldSyncCategory("maintenance", ["technical", "maintenance"])).toBe(true);
    expect(shouldSyncCategory("financial", ["technical"])).toBe(false);
    expect(shouldSyncCategory(null, ["technical"])).toBe(false);
  });

  it("resolveSyncCategories: الافتراضي technical عند الغياب · يحترم المُهيّأ", () => {
    expect(resolveSyncCategories({})).toEqual(["technical"]);
    expect(resolveSyncCategories({ categories: [] })).toEqual(["technical"]);
    expect(resolveSyncCategories({ categories: ["technical", "maintenance"] })).toEqual([
      "technical",
      "maintenance",
    ]);
  });
});

describe("githubSupportSync — جسم الـIssue", () => {
  it("يحوي المرجع + الفئة + مقدّم الشكوى + الوصف + رابطًا عميقًا للنظام", () => {
    const body = buildIssueBody(TECH_TICKET, "أحمد · 0500000000", "https://hr.door.sa");
    expect(body).toContain("SUP-2026-0042");
    expect(body).toContain("technical");
    expect(body).toContain("أحمد · 0500000000");
    expect(body).toContain("تفاصيل العطل التقني");
    expect(body).toContain("https://hr.door.sa/support/42");
  });
});

describe("githubSupportSync — createGithubIssue", () => {
  it("يستدعي GitHub API ويعيد الرقم والرابط", async () => {
    const issue = await createGithubIssue("barhom64/ghayth-erp", "tok", "t", "b", ["support"]);
    expect(issue.number).toBe(101);
    expect(issue.html_url).toContain("/issues/101");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/barhom64/ghayth-erp/issues",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("يرمي عند فشل الاستجابة (يُغذّي الإعادة/DLQ)", async () => {
    // @ts-expect-error — fetch اختبار
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(createGithubIssue("r", "t", "x", "y", [])).rejects.toThrow(/403/);
  });
});

describe("githubSupportSync — المُعالِج (نطاق + idempotency + fail-safe)", () => {
  const payload = { companyId: 7, entityId: 42 } as never;

  it("فئة technical (الافتراضي) → ينشئ Issue ويربطه عكسيًا + يسجّل حدثًا", async () => {
    rawQuery
      .mockResolvedValueOnce([TECH_TICKET]) // SELECT support_tickets
      .mockResolvedValueOnce([{ name: "أحمد", phone: "0500000000", email: null }]); // SELECT clients
    getActiveIntegration.mockResolvedValue(ACTIVE_GH);

    await syncTicketToGithub(payload);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(rawExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE support_tickets SET "githubIssueNumber"'),
      [101, "https://github.com/barhom64/ghayth-erp/issues/101", 42, 7],
    );
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support.ticket.github_synced", entityId: 42, companyId: 7 }),
    );
  });

  it("فئة maintenance مع config.categories=[technical,maintenance] → تُزامَن", async () => {
    rawQuery.mockResolvedValueOnce([{ ...TECH_TICKET, category: "maintenance" }]).mockResolvedValueOnce([]);
    getActiveIntegration.mockResolvedValue({
      config: { ...ACTIVE_GH.config, categories: ["technical", "maintenance"] },
    });

    await syncTicketToGithub(payload);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("فئة خارج النطاق (financial، الافتراضي technical) → تخطٍّ بلا نداء/كتابة", async () => {
    rawQuery.mockResolvedValueOnce([{ ...TECH_TICKET, category: "financial" }]);
    getActiveIntegration.mockResolvedValue(ACTIVE_GH);

    await syncTicketToGithub(payload);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(rawExecute).not.toHaveBeenCalled();
  });

  it("مُزامَنة سابقًا (githubIssueNumber موجود) → تخطٍّ (idempotency)", async () => {
    rawQuery.mockResolvedValueOnce([{ ...TECH_TICKET, githubIssueNumber: 55 }]);

    await syncTicketToGithub(payload);

    expect(getActiveIntegration).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("لا تكامل github للشركة → تخطٍّ بهدوء (التذكرة غير متأثرة)", async () => {
    rawQuery.mockResolvedValueOnce([TECH_TICKET]);
    getActiveIntegration.mockResolvedValue(null);

    await syncTicketToGithub(payload);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(rawExecute).not.toHaveBeenCalled();
  });
});
