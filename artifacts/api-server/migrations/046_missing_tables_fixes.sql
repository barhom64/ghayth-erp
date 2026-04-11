-- 027: Create missing tables and fix account balances

-- 1. store_order_items table
CREATE TABLE IF NOT EXISTS store_order_items (
  id SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  "productId" INTEGER REFERENCES store_products(id),
  "productName" VARCHAR(255),
  quantity INTEGER NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON store_order_items("orderId");

-- 2. notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  channel VARCHAR(50) NOT NULL DEFAULT 'in_app',
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("userId", channel, category)
);

-- 3. user_shortcuts table
CREATE TABLE IF NOT EXISTS user_shortcuts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  label VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  icon VARCHAR(100),
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("userId", path)
);

-- 4. Recalculate currentBalance for all accounts from journal_lines
UPDATE chart_of_accounts SET "currentBalance" = COALESCE(sub.balance, 0)
FROM (
  SELECT jl."accountCode",
    SUM(CASE
      WHEN coa.type IN ('asset','expense') THEN jl.debit - jl.credit
      ELSE jl.credit - jl.debit
    END) AS balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl."journalId" AND je."deletedAt" IS NULL
  JOIN chart_of_accounts coa ON coa.code = jl."accountCode"
  GROUP BY jl."accountCode"
) sub
WHERE chart_of_accounts.code = sub."accountCode";
