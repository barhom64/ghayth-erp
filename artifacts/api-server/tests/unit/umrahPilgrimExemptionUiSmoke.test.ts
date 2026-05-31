import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the pilgrim-detail page's exemption card — the UI surface
 * for PR #1482's overstay-exemption flag.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("pilgrim detail — exemption state + handler", () => {
  it("declares exemptionReason + savingExemption state slots", () => {
    expect(PAGE).toMatch(/const \[exemptionReason, setExemptionReason\] = useState\(""\)/);
    expect(PAGE).toMatch(/const \[savingExemption, setSavingExemption\] = useState\(false\)/);
  });

  it("toggleExemption handler PATCHes /umrah/pilgrims/:id with the right body", () => {
    expect(PAGE).toMatch(/const toggleExemption = async \(exempt: boolean\) =>/);
    expect(PAGE).toMatch(/apiFetch\(`\/umrah\/pilgrims\/\$\{id\}`,[\s\S]{1,200}method: "PATCH"/);
  });

  it("client-side guard rejects empty reason BEFORE hitting the server", () => {
    // Double-checking — the server enforces too (PR #1482), but a
    // client-side reject saves the round-trip and shows the toast
    // inline instead of as a server-error.
    expect(PAGE).toMatch(/const reason = exemptionReason\.trim\(\)/);
    expect(PAGE).toMatch(/if \(!reason\) \{[\s\S]{1,300}variant: "destructive",\s*title: "السبب مطلوب"/);
  });

  it("removing an exemption omits the reason from the body (matches PR #1482 contract)", () => {
    // Removing → exempt=false, no reason needed. The schema's body
    // type makes `overstayExemptReason` optional, and the if(exempt)
    // gate ensures it's only included when exempting.
    expect(PAGE).toMatch(/const body: \{ overstayExempt: boolean; overstayExemptReason\?: string \}/);
    expect(PAGE).toMatch(/if \(exempt\) \{[\s\S]{0,800}body\.overstayExemptReason = reason/);
  });
});

describe("pilgrim detail — exemption card UI", () => {
  it("card renders with stable testid + toggles visual cue on exempt rows", () => {
    expect(PAGE).toContain('data-testid="overstay-exemption-card"');
    expect(PAGE).toMatch(/data\?\.overstayExempt \? "border-status-warning-surface" : ""/);
  });

  it("active-banner shows reason + 'منذ' date from server-side timestamp", () => {
    expect(PAGE).toContain('data-testid="exemption-active-banner"');
    expect(PAGE).toContain("المعتمر مستثنى من المسح اليومي للتأخّر");
    expect(PAGE).toMatch(/formatDateAr\(data\.overstayExemptAt\)/);
  });

  it("reason input is a textarea (operator can write a sentence)", () => {
    expect(PAGE).toContain('data-testid="exemption-reason-input"');
    expect(PAGE).toMatch(/<Textarea[\s\S]{0,400}rows=\{3\}/);
  });

  it("apply button is disabled when reason is empty (prevents pointless API hit)", () => {
    expect(PAGE).toMatch(/disabled=\{!exemptionReason\.trim\(\) \|\| savingExemption\}/);
    expect(PAGE).toContain('data-testid="exemption-apply-button"');
  });

  it("remove button is GuardedButton with umrah:update perm (matches API auth)", () => {
    // Two GuardedButtons — apply + remove. Both should be gated by
    // umrah:update since that's what PATCH /pilgrims/:id requires.
    expect(PAGE).toMatch(/<GuardedButton[\s\S]{0,500}perm="umrah:update"[\s\S]{0,500}data-testid="exemption-remove-button"/);
    expect(PAGE).toMatch(/<GuardedButton[\s\S]{0,500}perm="umrah:update"[\s\S]{0,500}data-testid="exemption-apply-button"/);
  });
});
