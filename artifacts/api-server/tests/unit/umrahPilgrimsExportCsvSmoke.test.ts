import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the pilgrim CSV export endpoint:
 *
 *   - GET /umrah/pilgrims/export.csv mirrors EVERY filter the list
 *     endpoint accepts (search, season, group, agent, status, flight,
 *     arrival/departure date, nationality) so what the operator sees
 *     and what they download stay 1:1.
 *
 *   - Returns the full filtered result (no pagination) so a manifest
 *     handed to MOFA / hotels / bus drivers actually contains every
 *     pilgrim on the flight.
 *
 *   - Defence-in-depth: every JOIN matches BOTH id AND companyId AND
 *     deletedAt IS NULL so a mistyped FK can't lift another tenant's
 *     name onto an exported row (same pattern PR #1425 added).
 *
 *   - UTF-8 BOM so Excel detects Arabic. RFC 4180 escaping for cells
 *     with commas / quotes / newlines.
 *
 *   - Filename uses todayISO() (Riyadh) so a download at ~21:00 Riyadh
 *     on a month boundary doesn't get tomorrow's UTC date.
 *
 *   - The pilgrims-list page swaps the old client-side exportToCSV
 *     (which only grabbed the current 20-row page) for a
 *     window.location.href to the new endpoint with the active
 *     filters.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("GET /umrah/pilgrims/export.csv — endpoint shape", () => {
  it("registers under feature: umrah, action: list", () => {
    expect(ROUTE).toMatch(/router\.get\("\/pilgrims\/export\.csv",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("destructures the full filter set from req.query", () => {
    // Scope to JUST the export handler. Each filter must be picked
    // off the query object so the CSV honors them.
    const m = ROUTE.match(/router\.get\("\/pilgrims\/export\.csv"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    for (const f of ["seasonId", "status", "agentId", "groupId", "nationality", "flight", "arrivalDate", "departureDate", "search"]) {
      expect(handler.includes(f)).toBe(true);
    }
  });

  it("every JOIN in the export query matches companyId + filters deletedAt (defence-in-depth)", () => {
    const m = ROUTE.match(/router\.get\("\/pilgrims\/export\.csv"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const joins = m![0].match(/LEFT JOIN umrah_\w+\s+\w+\s+ON[^\n]+/g) ?? [];
    // 5 joins — agents, packages, seasons, groups, sub_agents.
    expect(joins.length).toBe(5);
    for (const j of joins) {
      expect(j).toMatch(/"companyId"/);
      expect(j).toMatch(/"deletedAt" IS NULL/);
    }
  });

  it("emits a UTF-8 BOM so Excel detects Arabic encoding", () => {
    expect(ROUTE).toMatch(/const BOM = "[﻿]"/);
    expect(ROUTE).toMatch(/res\.setHeader\("Content-Type",\s*"text\/csv; charset=utf-8"\)/);
  });

  it("filename uses todayISO() (Riyadh-aware) — not new Date().toISOString().slice(0,10)", () => {
    expect(ROUTE).toMatch(/filename="umrah-pilgrims-\$\{todayISO\(\)\}\.csv"/);
  });

  it("RFC 4180 escape — quotes cells with delimiters or newlines", () => {
    expect(ROUTE).toMatch(/csvEscape = \(v: unknown\)/);
    expect(ROUTE).toMatch(/\/\[",\\n\\r\]\//);
    expect(ROUTE).toMatch(/replace\(\/"\/g,\s*'""'\)/);
  });

  it("manifest header order — NUSK first, then identity, then trip, then flight", () => {
    // The column order matters operationally — MOFA / hotel handouts
    // expect NUSK first. Pin the first three columns so a future
    // re-ordering needs a deliberate change. U-18-P4 made the labels
    // bilingual (`Arabic (English)`) so we no longer pin the exact
    // label literal — only the field-key order is structural.
    expect(ROUTE).toMatch(/\["nuskNumber",\s*"[^"]+"\][\s\S]{0,300}\["fullName",\s*"[^"]+"\][\s\S]{0,300}\["passportNumber",\s*"[^"]+"\]/);
  });

  it("audits the export — sensitive identifying info leaving the system", () => {
    expect(ROUTE).toMatch(/logSensitiveAccess\(\{[\s\S]{0,400}action:\s*"export_csv"/);
  });
});

describe("pilgrims page — uses the new export endpoint, not the old current-page export", () => {
  it("removed the client-side exportToCSV import (no longer needed)", () => {
    expect(PAGE).not.toMatch(/import \{[^}]*\bexportToCSV\b/);
  });

  it("onExportCSV builds a query string carrying every active filter", () => {
    // Critical: if any filter is missing from the QS, the operator
    // downloads a manifest different from what's on screen — silent
    // bug, hard to spot until MOFA notices missing pilgrims.
    const m = PAGE.match(/onExportCSV=\{\(\) => \{[\s\S]{1,800}\}\}/);
    expect(m).not.toBeNull();
    const handler = m![0];
    for (const f of ["search", "status", "seasonId", "groupId", "flight", "arrivalDate", "departureDate"]) {
      expect(handler).toContain(f);
    }
    expect(handler).toContain("/api/umrah/pilgrims/export.csv");
  });
});
