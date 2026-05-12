-- Reference EXPLAIN ANALYZE plans for the hottest read paths.
-- Run with:
--   psql "$DATABASE_URL" -f benchmarks/db/explain-hotpaths.sql > benchmarks/results/explain.txt
--
-- Use this BEFORE perf-tuning to spot:
--   * Seq scans on large tables that should hit an index.
--   * Nested loops with large outer rows (consider hash join hints).
--   * Sort spills to disk (work_mem too low).

\timing on

-- 1. Employees list (paginated) — common dashboard query.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, first_name, last_name, email, status
FROM employees
ORDER BY created_at DESC NULLS LAST
LIMIT 50 OFFSET 0;

-- 2. Employees with company join.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT e.id, e.first_name, e.last_name, c.name AS company
FROM employees e
LEFT JOIN companies c ON c.id = e.company_id
ORDER BY e.id DESC
LIMIT 100;

-- 3. Client search with ILIKE — frequently slow without trigram index.
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, status
FROM clients
WHERE name ILIKE '%a%'
ORDER BY id DESC
LIMIT 50;

-- 4. Recent audit logs (activity feed).
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, actor_id, action, entity_type, created_at
FROM audit_logs
ORDER BY created_at DESC NULLS LAST
LIMIT 50;

-- 5. Aggregate by status (chart data).
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT status, COUNT(*)::int AS n
FROM employees
GROUP BY status
ORDER BY n DESC;
