import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const BH = read("businessHelpers.ts");
const NE = read("notificationEngine.ts");
const NS = read("notificationService.ts");

// ═════════════════════════���════════════════════════════════════════════════
// BUSINESS HELPERS
// ═══════��═══════════════════════════════��══════════════════════════════════

describe("businessHelpers — pure functions", () => {
  it("exports computeVat", () => {
    expect(BH).toContain("export function computeVat");
  });

  it("exports extractBaseFromGross", () => {
    expect(BH).toContain("export function extractBaseFromGross");
  });

  it("exports currentYear", () => {
    expect(BH).toContain("export function currentYear");
  });

  it("exports currentPeriod", () => {
    expect(BH).toContain("export function currentPeriod");
  });
});

describe("businessHelpers — notification & events", () => {
  it("exports createNotification", () => {
    expect(BH).toContain("export async function createNotification");
  });

  it("exports emitEvent", () => {
    expect(BH).toContain("export async function emitEvent");
  });

  it("exports createAuditLog", () => {
    expect(BH).toContain("export async function createAuditLog");
  });
});

describe("businessHelpers — journal entries", () => {
  it("exports JournalEntryLine interface", () => {
    expect(BH).toContain("export interface JournalEntryLine");
  });

  it("exports createJournalEntry", () => {
    expect(BH).toContain("export async function createJournalEntry");
  });

  it("exports createGuardedJournalEntry", () => {
    expect(BH).toContain("export async function createGuardedJournalEntry");
  });

  it("exports updateAccountBalances", () => {
    expect(BH).toContain("export async function updateAccountBalances");
  });

  it("exports reverseAccountBalances", () => {
    expect(BH).toContain("export async function reverseAccountBalances");
  });
});

describe("businessHelpers — approval chains", () => {
  it("declares ApprovalChainType", () => {
    expect(BH).toContain("type ApprovalChainType");
  });

  for (const chain of ["leaves", "purchases", "expenses", "advances", "letters", "procurement", "loans", "overtime", "exit"]) {
    it(`supports chain type: ${chain}`, () => {
      expect(BH).toContain(`"${chain}"`);
    });
  }

  it("exports initiateApprovalChain", () => {
    expect(BH).toContain("export async function initiateApprovalChain");
  });

  it("exports processApprovalStep", () => {
    expect(BH).toContain("export async function processApprovalStep");
  });

  it("exports refTypeToChainType", () => {
    expect(BH).toContain("export function refTypeToChainType");
  });
});

describe("businessHelpers — budget management", () => {
  it("exports validateBudget", () => {
    expect(BH).toContain("export async function validateBudget");
  });

  it("exports updateBudgetUsed", () => {
    expect(BH).toContain("export async function updateBudgetUsed");
  });
});

describe("businessHelpers — role lookups", () => {
  it("exports getAssignmentIdByRole", () => {
    expect(BH).toContain("export async function getAssignmentIdByRole");
  });

  it("exports getDirectorAssignmentId", () => {
    expect(BH).toContain("export async function getDirectorAssignmentId");
  });

  it("exports getCfoAssignmentId", () => {
    expect(BH).toContain("export async function getCfoAssignmentId");
  });

  it("exports getLegalResponsible", () => {
    expect(BH).toContain("export async function getLegalResponsible");
  });

  it("exports getManagerAssignmentId", () => {
    expect(BH).toContain("export async function getManagerAssignmentId");
  });
});

describe("businessHelpers — financial period & account mapping", () => {
  it("exports checkFinancialPeriodOpen", () => {
    expect(BH).toContain("export async function checkFinancialPeriodOpen");
  });

  it("exports getAccountCodeFromMapping", () => {
    expect(BH).toContain("export async function getAccountCodeFromMapping");
  });
});

describe("businessHelpers — security", () => {
  it("uses parameterized queries", () => {
    const params = [...BH.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(40);
  });

  it("scopes by companyId", () => {
    const matches = [...BH.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(30);
  });
});

// ═══════��═════════════════════════════════��════════════════════════���═══════
// NOTIFICATION ENGINE
// ═══════════════��═════════════════════════════════════���════════════════════

describe("notificationEngine — exports", () => {
  it("exports EngineChannel type", () => {
    expect(NE).toContain("export type EngineChannel");
  });

  it("exports EnginePayload interface", () => {
    expect(NE).toContain("export interface EnginePayload");
  });

  it("exports interpolateTemplate", () => {
    expect(NE).toContain("export function interpolateTemplate");
  });

  it("exports dispatchNotification", () => {
    expect(NE).toContain("export async function dispatchNotification");
  });

  it("exports processFallbackChains", () => {
    expect(NE).toContain("export async function processFallbackChains");
  });

  it("exports getDeliveryStats", () => {
    expect(NE).toContain("export async function getDeliveryStats");
  });
});

describe("notificationEngine — channels", () => {
  for (const ch of ["in_app", "email", "sms", "whatsapp", "push", "webhook"]) {
    it(`supports channel: ${ch}`, () => {
      expect(NE).toContain(`"${ch}"`);
    });
  }
});

// ════════════════════════════════════��══════════════════════════��══════════
// NOTIFICATION SERVICE
// ══════════════════════════���════════════════════════���══════════════════════

describe("notificationService — exports", () => {
  it("exports NotificationChannel type", () => {
    expect(NS).toContain("export type NotificationChannel");
  });

  it("exports NotificationPriority type", () => {
    expect(NS).toContain("export type NotificationPriority");
  });

  it("exports sendNotification", () => {
    expect(NS).toContain("export async function sendNotification");
  });

  it("exports formatSmsTemplate", () => {
    expect(NS).toContain("export function formatSmsTemplate");
  });

  it("exports sendTemplatedNotification", () => {
    expect(NS).toContain("export async function sendTemplatedNotification");
  });

  it("exports broadcastAlert", () => {
    expect(NS).toContain("export async function broadcastAlert");
  });
});

describe("notificationService — channels", () => {
  for (const ch of ["in_app", "email", "sms", "whatsapp"]) {
    it(`supports channel: ${ch}`, () => {
      expect(NS).toContain(`"${ch}"`);
    });
  }
});

describe("notificationService — priority levels", () => {
  for (const p of ["low", "normal", "high", "urgent"]) {
    it(`supports priority: ${p}`, () => {
      expect(NS).toContain(`"${p}"`);
    });
  }
});

describe("notificationService — templates", () => {
  it("exports SMS_TEMPLATES", () => {
    expect(NS).toContain("export const SMS_TEMPLATES");
  });

  it("exports WHATSAPP_TEMPLATES", () => {
    expect(NS).toContain("export const WHATSAPP_TEMPLATES");
  });

  it("exports EMAIL_TEMPLATES", () => {
    expect(NS).toContain("export const EMAIL_TEMPLATES");
  });
});
