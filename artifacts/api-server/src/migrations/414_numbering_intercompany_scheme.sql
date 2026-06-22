-- Migration 414 — intercompany numbering scheme + idempotency column
-- (#1141 cleanup, intercompany side)
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_intercompany_transactions_source_key;
--   ALTER TABLE intercompany_transactions DROP COLUMN IF EXISTS "sourceKey";
--   DELETE FROM numbering_schemes
--     WHERE ("moduleKey", "entityKey") = ('finance', 'intercompany');
--
-- Closes the last inline tech-ref offender on the intercompany side.
-- routes/finance-hardening.ts (POST /finance/intercompany) was building
-- the document ref inline as `IC-${idempotencyToken}` and stamping that
-- SAME value on BOTH company legs' journal entries and on the parent
-- intercompany_transactions row. That is a tech ref leaking onto a
-- ledger-visible document, and it also coupled the displayed number to
-- the idempotency key.
--
-- Owner decision ("each leg its own number"): an intercompany transaction
-- posts TWO journal entries — a FROM-company leg (DR ar / CR revenue) and
-- a TO-company leg (DR expense / CR ap). Each leg now gets its OWN
-- center-issued number from ITS OWN company's `finance.intercompany`
-- counter. The from-company JE ref comes from the FROM company's IC
-- counter; the to-company JE ref from the TO company's IC counter. The
-- two numbers differ; the pair stays linkable via a NON-displayed
-- correlation (the idempotency token, stored on the parent `sourceKey`).
--
-- After this seed lands the route can call (once per company scope):
--   issueNumber({ companyId: <fromCompany>, moduleKey: "finance",
--                 entityKey: "intercompany",
--                 entityTable: "intercompany_transactions",
--                 expectedTiming: "on_draft" })
--   issueNumber({ companyId: <toCompany>,   moduleKey: "finance",
--                 entityKey: "intercompany",
--                 entityTable: "intercompany_transactions",
--                 expectedTiming: "on_draft" })
-- and get a real per-company yearly sequence (IC-2026-00001) with a full
-- audit trail per leg.
--
-- Design notes (mirrors migration 413 / 231 standalone-INSERT shape):
--   • prefix 'IC'||companyId, pattern {PREFIX}-{YYYY}-{SEQ}, padLength 5 —
--     yields IC2-2026-00001 for company 2, IC1-2026-00001 for company 1.
--     The companyId is baked into the PREFIX (not a separate token —
--     numberingService.formatNumber supports {PREFIX}/{BRANCH}/{YYYY}/{YY}/
--     {MM}/{SEASON}/{SEQ} but has NO {COMPANY} token). This is REQUIRED by
--     the owner's "the two numbers differ" rule: with scopePolicy=company
--     each company keeps an INDEPENDENT counter, but two counters that
--     start aligned would render the SAME IC-YYYY-SEQ string for a paired
--     transaction. The per-company prefix makes the from-leg and to-leg
--     numbers deterministically distinct while each stays sourced from its
--     OWN company's counter.
--   • scopePolicy 'company' — the counter is addressed per company (each
--     company's IC counter is independent), which is exactly the
--     "each leg its own company's counter" requirement.
--   • resetPolicy 'yearly' — one counter per company per fiscal year,
--     mirroring finance.customer_advance / finance.vendor_advance.
--   • issueTiming 'on_draft' — the route issues the number at creation
--     time (the JE legs + the parent row are written in the same request),
--     matching THIS caller. Verified against routes/finance-hardening.ts:
--     the handler posts both legs and INSERTs the parent row inline; it
--     does not reserve on a separate lifecycle. 'on_draft' is the matching
--     timing (same as vendor_advance in migration 413).
--   • manualEditPolicy 'disabled' — an intercompany number is system
--     issued only; there is no legacy-import body field on this route (no
--     `reference` input), so manual numbering is never accepted.
--   • lockAfterStatuses — the posted/cancelled lifecycle of
--     intercompany_transactions; once 'posted' the number is locked
--     against void/override (a reversal must be a new transaction).
--
-- Idempotency column:
--   • intercompany_transactions gained a "sourceKey" column + a partial
--     UNIQUE (companyId, sourceKey) index — the SAME shape vendor_advances
--     got in migration 232. The route stores the STABLE retry tuple there
--     so concurrent races collide on the index, and a sequential retry is
--     short-circuited BEFORE any number is issued (mirrors the vendor-AP
--     fix). The displayed numbers stay INDEPENDENT of the idempotency key.

ALTER TABLE intercompany_transactions
  ADD COLUMN IF NOT EXISTS "sourceKey" VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercompany_transactions_source_key
  ON intercompany_transactions ("fromCompanyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;

INSERT INTO numbering_schemes (
    "companyId", "moduleKey", "entityKey",
    "displayNameAr", prefix, pattern, "padLength",
    "resetPolicy", "scopePolicy", "issueTiming",
    "manualEditPolicy", "lockAfterStatuses",
    "defaultEntityTable", "defaultRefColumn"
)
SELECT c.id, 'finance', 'intercompany',
       'معاملة بين الشركات', 'IC' || c.id::text, '{PREFIX}-{YYYY}-{SEQ}', 5,
       'yearly', 'company', 'on_draft',
       'disabled', '["posted","cancelled"]'::jsonb,
       'intercompany_transactions', 'ref'
FROM companies c
WHERE COALESCE(c.status, 'active') <> 'deleted'
ON CONFLICT ("companyId","moduleKey","entityKey") DO NOTHING;
