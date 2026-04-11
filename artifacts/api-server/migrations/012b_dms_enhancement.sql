DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN category VARCHAR(50);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN status VARCHAR(30) DEFAULT 'draft';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN "storageKey" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD COLUMN "currentVersion" INTEGER DEFAULT 1;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS document_versions (
  id SERIAL PRIMARY KEY,
  "documentId" INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  "versionNumber" INTEGER NOT NULL,
  "fileName" VARCHAR(500),
  "fileSize" INTEGER,
  "mimeType" VARCHAR(100),
  "storageKey" TEXT,
  "uploadedBy" INTEGER,
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_entity_links (
  id SERIAL PRIMARY KEY,
  "documentId" INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  "entityType" VARCHAR(50) NOT NULL,
  "entityId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("documentId", "entityType", "entityId")
);

CREATE INDEX IF NOT EXISTS idx_doc_entity_links_entity ON document_entity_links ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_doc_versions_docid ON document_versions ("documentId");
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents (category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
