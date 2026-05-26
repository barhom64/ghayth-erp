-- @rollback: UPDATE numbering_schemes SET "issueTiming" = 'on_submit' WHERE
--            "issueTiming" = 'on_draft'; ALTER TABLE numbering_schemes ALTER
--            COLUMN "issueTiming" SET DEFAULT 'on_submit';
--            Note: this rollback is lossy if any tenant explicitly chose
--            on_draft after this migration, since we can't tell their
--            intentional setting from the bulk-migrated one. Operators who
--            need a specific historical timing per scheme should restore
--            from backup instead.
-- Align numbering_schemes.issueTiming to match the actual route behaviour.
--
-- Lawyer's review nit #6 ("issueTiming field exists but is ignored") —
-- migration 213 seeded most schemes with `on_submit`/`on_approval`/
-- `on_posting`, but every route in fact calls `issueNumber` from the
-- CREATE handler (i.e. at draft time). The field was aspirational and
-- silently ignored.
--
-- Companion code change in `lib/numberingService.ts` adds an
-- `expectedTiming` parameter that the service now enforces — routes pass
-- `"on_draft"` and the service refuses to issue if the scheme says
-- something else. To prevent existing tenants from breaking at deploy
-- time, this migration aligns the seeded values with reality. Operators
-- can then change the timing in the settings UI knowingly — if they
-- pick a value the route doesn't support, the route will surface the
-- mismatch with a clear Arabic message instead of issuing silently.

UPDATE numbering_schemes
   SET "issueTiming" = 'on_draft',
       "updatedAt"   = NOW()
 WHERE "issueTiming" <> 'on_draft';

-- Also relax the column default to `on_draft` so newly-inserted schemes
-- match the route behaviour by default. Tenants that intentionally want
-- a deferred timing can still set it explicitly.
ALTER TABLE numbering_schemes
  ALTER COLUMN "issueTiming" SET DEFAULT 'on_draft';
