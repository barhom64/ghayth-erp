CREATE TABLE IF NOT EXISTS performance_reviews (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "assignmentId" INTEGER NOT NULL,
  period VARCHAR(20),
  "overallScore" NUMERIC DEFAULT 0,
  categories JSONB DEFAULT '{}',
  notes TEXT,
  status VARCHAR DEFAULT 'draft',
  "reviewerId" INTEGER,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_components (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR DEFAULT 'fixed',
  category VARCHAR DEFAULT 'allowance',
  value NUMERIC DEFAULT 0,
  taxable BOOLEAN DEFAULT true,
  status VARCHAR DEFAULT 'active',
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS official_letters (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER,
  type VARCHAR DEFAULT 'general',
  subject VARCHAR(500),
  content TEXT,
  status VARCHAR DEFAULT 'draft',
  "createdAt" TIMESTAMP DEFAULT now()
);
