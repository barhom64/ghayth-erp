-- Migration 444 — finish the numbering issueTiming realignment that #441 left
-- incomplete, plus remove a duplicate legal scheme that confuses the settings UI.
--
-- ── Part 1: communications/incoming_letter + outgoing_letter → on_draft ──
--
-- #441 realigned scheme issueTiming to the code's real issuance timing for every
-- entity it believed had a route, but it EXPLICITLY excluded incoming_letter /
-- outgoing_letter (its header comment lists them as "no issuing route, left
-- on_submit"). That assumption was wrong: routes/correspondence.ts issues BOTH
-- at creation time via issueCorrespondenceNumber():
--
--     const entityKey = direction === "outgoing" ? "outgoing_letter" : "incoming_letter";
--     return issueNumber({ moduleKey: "communications", entityKey, expectedTiming: "on_draft", ... });
--
-- The entityKey is a runtime ternary (not a string literal), which is why a
-- literal grep for `entityKey: "incoming_letter"` found nothing and the entities
-- looked route-less. Because #440 re-seeded both schemes as 'on_submit',
-- numberingService.issueNumber() throws a 422 timing-mismatch on EVERY
-- correspondence create (POST /api/communications/correspondence) — i.e. no
-- incoming or outgoing letter can be created at all (prod `correspondence` table
-- is empty, consistent with this being blocked since #440).
--
-- Fix: realign both to 'on_draft' to match the only code path that issues them.
-- Idempotent (WHERE issueTiming <> 'on_draft').
--
-- ── Part 2: drop the orphan legal/legal_case duplicate scheme ──
--
-- #440 seeds the legal "case" numbering TWICE: once as ('legal','legal_case', …,
-- 'on_submit') with no entityTable (a legacy/duplicate row) and once as
-- ('legal','case', …, entityTable 'legal_cases', refColumn 'caseNumber') — the
-- canonical one the code actually uses (routes/legal.ts, routes/requests.ts,
-- routes/properties.ts, cronScheduler.ts all issue entityKey "case"). #441
-- flipped 'case' to on_draft, leaving 'legal_case' as a dead duplicate that
-- still surfaces in the Numbering Settings UI as a second "قضية قانونية" entry —
-- editing it has no effect (nothing issues it), which is exactly the "numbering
-- settings don't apply" class of confusion. Remove it.
--
-- Guarded by NOT EXISTS against numbering_assignments (the non-cascading FK) so
-- the DELETE is a no-op for any tenant that somehow did issue against it;
-- numbering_counters cascades (ON DELETE CASCADE) so unused counters clear too.
--
-- @rollback:
--   -- No safe automatic rollback. Part 1 realigns timing to the code's real
--   -- issuance path; reverting would re-break correspondence creation. Part 2
--   -- removes an unused duplicate; to restore it, re-insert from the #440
--   -- catalog. To override a specific scheme's timing, edit that row from the
--   -- Numbering Settings UI.

UPDATE numbering_schemes ns
SET "issueTiming" = 'on_draft',
    "updatedAt" = now()
FROM (VALUES
  ('communications','incoming_letter'),
  ('communications','outgoing_letter')
) AS code_paths("moduleKey","entityKey")
WHERE ns."moduleKey" = code_paths."moduleKey"
  AND ns."entityKey" = code_paths."entityKey"
  AND ns."issueTiming" <> 'on_draft';

DELETE FROM numbering_schemes ns
WHERE ns."moduleKey" = 'legal'
  AND ns."entityKey" = 'legal_case'
  AND NOT EXISTS (
    SELECT 1 FROM numbering_assignments na WHERE na."schemeId" = ns.id
  );
