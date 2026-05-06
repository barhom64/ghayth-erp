# Frontend Bugs — Ghayth ERP

**Generated**: 2026-05-06T23:44:05.382Z
**Source**: Full Frontend Test Matrix (Task #138) — 369 routes × 5 axes = 1845 individual checks

## Critical (Fixed in this task)

### B-001: CORS rejects `Origin: http://localhost` causing 500 on every page navigation

- **Severity**: Critical
- **Affected**: ALL 369 routes (every page navigation triggered POST `/api/intelligence/activity` which 500ed)
- **Root cause**: `artifacts/api-server/src/app.ts` allowedOrigins set only seeds `http://localhost:3000`/`:5173` in dev, but the Replit shared proxy serves apps on plain `http://localhost` (port 80). Browser sent `Origin: http://localhost`, CORS middleware threw `CORS: origin http://localhost not in allowlist`, and the central error handler returned 500 on every activity ping.
- **Repro**:
  1. Login as admin
  2. Navigate to any page (e.g. `/dashboard`)
  3. Devtools Network tab shows `POST /api/intelligence/activity → 500`
  4. API server logs show `Error: CORS: origin http://localhost not in allowlist`
- **Fix**: `artifacts/api-server/src/app.ts` — added `http://localhost`, `https://localhost`, `http://localhost:80` to dev allowedOrigins. Verified: 0 failed `/api/*` requests across 4 sample pages after restart.

## High

_None observed across full 369-route render sweep._

## Medium

_None observed in this sweep. Module-specific CRUD edge cases tracked in separate audit reports._

## Low

_None observed in this sweep._

