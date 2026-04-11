DO $$ BEGIN
  ALTER TABLE governance_policies ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE governance_risks ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE governance_audits ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE governance_compliance ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300),
  description TEXT,
  "fileName" VARCHAR(500),
  "fileUrl" TEXT,
  "fileSize" INTEGER,
  "mimeType" VARCHAR(100),
  "folderId" INTEGER,
  tags TEXT,
  "uploadedBy" INTEGER,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  "parentId" INTEGER,
  color VARCHAR(20),
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  description TEXT,
  content TEXT,
  category VARCHAR(100),
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_folders ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS requests (
  id SERIAL PRIMARY KEY,
  "typeId" INTEGER,
  "requesterId" INTEGER,
  "requesterName" VARCHAR(200),
  title VARCHAR(300),
  description TEXT,
  status VARCHAR(30) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'normal',
  data JSONB,
  "currentApprover" INTEGER,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  description TEXT,
  category VARCHAR(100),
  "requiredFields" JSONB,
  "approvalFlow" JSONB,
  "isActive" BOOLEAN DEFAULT true,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  description TEXT,
  steps JSONB,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE requests ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE request_types ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE workflows ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS job_postings (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300),
  department VARCHAR(200),
  location VARCHAR(200),
  type VARCHAR(50),
  description TEXT,
  requirements TEXT,
  "salaryMin" NUMERIC(15,2),
  "salaryMax" NUMERIC(15,2),
  status VARCHAR(30) DEFAULT 'open',
  "closingDate" DATE,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
  id SERIAL PRIMARY KEY,
  "postingId" INTEGER REFERENCES job_postings(id),
  "applicantName" VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(30),
  "resumeUrl" TEXT,
  status VARCHAR(30) DEFAULT 'new',
  notes TEXT,
  rating INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE job_postings ADD COLUMN "companyId" INTEGER REFERENCES companies(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
