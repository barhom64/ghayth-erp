CREATE TABLE IF NOT EXISTS applicant_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  "passwordHash" VARCHAR(255) NOT NULL,
  "nationalId" VARCHAR(20),
  gender VARCHAR(10),
  "dateOfBirth" DATE,
  city VARCHAR(100),
  education VARCHAR(200),
  "experienceYears" INTEGER DEFAULT 0,
  "resumeUrl" TEXT,
  "photoUrl" TEXT,
  skills TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applicant_accounts_email ON applicant_accounts (email);

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "applicantAccountId" INTEGER REFERENCES applicant_accounts(id);
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS "coverLetter" TEXT;

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN DEFAULT true;
