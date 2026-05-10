import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const ALERTS = read("smartAlerts.ts");
const PROACTIVE = read("proactiveEngine.ts");
const RECOMMEND = read("smartRecommendations.ts");
const AI = read("aiEngine.ts");
const ANALYTICS = read("clientAnalytics.ts");
const KPI = read("kpiEngine.ts");

// ══════════════════════════════════════════════════════════════════════════
// SMART ALERTS
// ════════════════════════════════════════════════════════════════════��═════

describe("smartAlerts — exports", () => {
  it("exports AlertResult interface", () => {
    expect(ALERTS).toContain("export interface AlertResult");
  });

  it("exports runSmartAlerts", () => {
    expect(ALERTS).toContain("export async function runSmartAlerts");
  });

  it("exports runSmartAlertsAllCompanies", () => {
    expect(ALERTS).toContain("export async function runSmartAlertsAllCompanies");
  });
});

describe("smartAlerts — security", () => {
  it("uses parameterized queries", () => {
    const params = [...ALERTS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...ALERTS.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PROACTIVE ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("proactiveEngine — exports", () => {
  it("exports proactiveEmployeeContractExpiry", () => {
    expect(PROACTIVE).toContain("export async function proactiveEmployeeContractExpiry");
  });

  it("exports proactiveInvoiceOverdueCollection", () => {
    expect(PROACTIVE).toContain("export async function proactiveInvoiceOverdueCollection");
  });

  it("exports proactiveUnauthorizedAbsence", () => {
    expect(PROACTIVE).toContain("export async function proactiveUnauthorizedAbsence");
  });

  it("exports proactiveVehicleInsuranceExpiry", () => {
    expect(PROACTIVE).toContain("export async function proactiveVehicleInsuranceExpiry");
  });

  it("exports proactiveRentalContractExpiry", () => {
    expect(PROACTIVE).toContain("export async function proactiveRentalContractExpiry");
  });

  it("exports proactiveAnnualPerformanceReview", () => {
    expect(PROACTIVE).toContain("export async function proactiveAnnualPerformanceReview");
  });

  it("exports proactiveProbationCompletion", () => {
    expect(PROACTIVE).toContain("export async function proactiveProbationCompletion");
  });

  it("exports proactiveVehicleBreakdown", () => {
    expect(PROACTIVE).toContain("export async function proactiveVehicleBreakdown");
  });

  it("exports registerProactiveEventListeners", () => {
    expect(PROACTIVE).toContain("export function registerProactiveEventListeners");
  });

  it("exports runAllProactiveChecks", () => {
    expect(PROACTIVE).toContain("export async function runAllProactiveChecks");
  });
});

describe("proactiveEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...PROACTIVE.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...PROACTIVE.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SMART RECOMMENDATIONS
// ══════════════════════════════════════════════════════════════════════════

describe("smartRecommendations — exports", () => {
  it("exports SmartRecommendation interface", () => {
    expect(RECOMMEND).toContain("export interface SmartRecommendation");
  });

  it("exports getPersonalizedRecommendations", () => {
    expect(RECOMMEND).toContain("export async function getPersonalizedRecommendations");
  });

  it("exports saveRecommendationsForUser", () => {
    expect(RECOMMEND).toContain("export async function saveRecommendationsForUser");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AI ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("aiEngine — exports", () => {
  it("exports receptionCategorize", () => {
    expect(AI).toContain("export async function receptionCategorize");
  });

  it("exports responderDraft", () => {
    expect(AI).toContain("export async function responderDraft");
  });

  it("exports translatorTranslate", () => {
    expect(AI).toContain("export async function translatorTranslate");
  });

  it("exports summarizerSummarize", () => {
    expect(AI).toContain("export async function summarizerSummarize");
  });

  it("exports rulesEngineEvaluate", () => {
    expect(AI).toContain("export async function rulesEngineEvaluate");
  });

  it("exports predictorForecast", () => {
    expect(AI).toContain("export async function predictorForecast");
  });

  it("exports aiEngine facade object", () => {
    expect(AI).toContain("export const aiEngine");
  });
});

describe("aiEngine — interfaces", () => {
  it("exports CategorizeResult", () => {
    expect(AI).toContain("export interface CategorizeResult");
  });

  it("exports RulesEngineInput", () => {
    expect(AI).toContain("export interface RulesEngineInput");
  });

  it("exports RulesEngineResult", () => {
    expect(AI).toContain("export interface RulesEngineResult");
  });

  it("exports PredictorInput", () => {
    expect(AI).toContain("export interface PredictorInput");
  });

  it("exports PredictorResult", () => {
    expect(AI).toContain("export interface PredictorResult");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CLIENT ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

describe("clientAnalytics — exports", () => {
  it("exports ClientRFM interface", () => {
    expect(ANALYTICS).toContain("export interface ClientRFM");
  });

  it("exports calculateClientRFM", () => {
    expect(ANALYTICS).toContain("export async function calculateClientRFM");
  });

  it("exports calculateAllClientsRFM", () => {
    expect(ANALYTICS).toContain("export async function calculateAllClientsRFM");
  });

  it("exports getClientAnalyticsSummary", () => {
    expect(ANALYTICS).toContain("export async function getClientAnalyticsSummary");
  });

  it("exports getBestContactTime", () => {
    expect(ANALYTICS).toContain("export async function getBestContactTime");
  });

  it("exports detectSeasonalPatterns", () => {
    expect(ANALYTICS).toContain("export async function detectSeasonalPatterns");
  });
});

describe("clientAnalytics — security", () => {
  it("uses parameterized queries", () => {
    const params = [...ANALYTICS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });

  it("scopes by companyId", () => {
    const matches = [...ANALYTICS.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// KPI ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("kpiEngine — exports", () => {
  it("exports KPISnapshot interface", () => {
    expect(KPI).toContain("export interface KPISnapshot");
  });

  it("exports getCompanyKPIs", () => {
    expect(KPI).toContain("export async function getCompanyKPIs");
  });

  it("exports calculateEmployeeKPIs", () => {
    expect(KPI).toContain("export async function calculateEmployeeKPIs");
  });

  it("exports saveKPISnapshots", () => {
    expect(KPI).toContain("export async function saveKPISnapshots");
  });

  it("exports saveAllCompaniesKPISnapshots", () => {
    expect(KPI).toContain("export async function saveAllCompaniesKPISnapshots");
  });
});

describe("kpiEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...KPI.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...KPI.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});
