-- approval_requests is filtered by companyId on every approval-listing
-- and KPI query (see kpiEngine.ts:220, hr.ts approval handlers,
-- selfAuditEngine, etc.) but only had indexes on (refType, refId) and
-- partial (status='pending'). Add a companyId index plus a composite
-- (companyId, status) for the common pending-by-tenant scan.

CREATE INDEX IF NOT EXISTS idx_approval_requests_company
  ON approval_requests ("companyId");

CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status
  ON approval_requests ("companyId", status);
