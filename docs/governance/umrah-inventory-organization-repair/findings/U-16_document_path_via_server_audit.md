# U-16 — Document path flow via server audit

**Status:** Investigation only. No code change. Read-only audit
under the autonomous-class authorisation in
`UMRAH_REMAINING_WORK_ROADMAP.md` §4 + §7.

**Backlog title:** "Document path flow via server."

**TL;DR:** Umrah attachments **were** unified into the shared
`documents` + `document_entity_links` store via migration 237.
The backend POST/DELETE writes correctly. **The FE leaks**: the
umrah attachments page links to `fileUrl` directly (cloud URL),
bypassing the server-mediated `/api/documents/:id/download` route
that carries ACL + access logging. **Compliance gap with
operator-visible blast radius.** Recovery is a focused 3-line FE
edit + a smoke pinning the contract.

---

## 1. What server-mediated flow gives us

`artifacts/api-server/src/routes/documents.ts:444-501` plus the
download/preview routes implement:

| Layer | Behaviour |
| --- | --- |
| **Existence check** | `SELECT * FROM documents WHERE id=$1 AND companyId=$2 AND deletedAt IS NULL` |
| **Per-document ACL** | `checkDocumentAcl(id, scope, "read")` — confidential docs return 404 to anyone outside the ACL (not 403, so existence doesn't leak) |
| **Compliance access log** | INSERT into `document_access_log` (companyId, documentId, userId, accessType ∈ {download, preview}, ip, userAgent) — fire-and-forget so a logging failure doesn't block download |
| **Storage access** | `objectStorageService.getObjectEntityFile(doc.storageKey)` → `downloadObject(...)` — server fetches, server pipes the stream |
| **Headers** | `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment; filename=...` |

The route serves the file from the **storage key**, not from the
`fileUrl`. This is the canonical server-mediated flow.

---

## 2. Where umrah leaks today

### 2.1 The good — backend
`artifacts/api-server/src/routes/umrah-entities.ts:2563-2678`
implements `GET /umrah/attachments`, `POST /umrah/attachments`,
`DELETE /umrah/attachments/:id`:
- Reads + writes via the **shared `documents` + `document_entity_links`** store (per migration 237 / "DOC-VIOLATION unification" comments).
- Owner is namespaced as `umrah_<entityType>` in the link table.
- Atomic INSERT (document + link in one tx).
- Audit log + event emitted.

This part is correct.

### 2.2 The leak — frontend
`artifacts/ghayth-erp/src/pages/umrah/attachments.tsx:111-126`
renders the file link as:

```tsx
{
  key: "fileUrl",
  header: "الملف",
  render: (a) =>
    a.fileUrl ? (
      <a href={a.fileUrl} target="_blank" rel="noreferrer" ...>
        <ExternalLink /> فتح
      </a>
    ) : ( <span>—</span> ),
}
```

**`a.fileUrl` is the raw cloud URL** (GCS public link, presigned
URL, or whatever the operator pasted on the create form). When
clicked, the browser opens the file **directly from storage**,
not from the server. This skips:

| Layer skipped | Operator impact |
| --- | --- |
| ACL check | A confidential umrah attachment (passport scan, visa) is visible to anyone with the URL, regardless of role |
| Access log | `document_access_log` carries 0 rows for umrah downloads — compliance reports under-report umrah access |
| companyId scope | A leaked URL from one tenant is visible from any browser (no tenant gate) |
| `nosniff` + `attachment` headers | Browser may render based on the cloud's headers, not ours — XSS via uploaded HTML/SVG possible |
| Soft-delete check | A `deletedAt IS NOT NULL` document remains downloadable as long as the cloud URL is alive |

### 2.3 Compare — the shared documents page
`artifacts/ghayth-erp/src/pages/documents-page.tsx:202-203` does
it correctly:

```ts
const res = await fetch(`${BASE}/api/documents/${docId}/download`, {
  credentials: "include",
});
```

And the preview button at line 316 opens
`/api/documents/${d.id}/preview` — both server-mediated.

The fix is to make `attachments.tsx` follow the same pattern.

---

## 3. Other path-flow concerns (smaller)

### 3.1 `storageKey` is optional on the umrah attachment INSERT
`umrah-entities.ts:2625` writes `body.storageKey || null` — a
caller can POST without a `storageKey` (or with a fake one).
There's no validation that the storage key actually points at
an uploaded file. Combined with the FE leak above, an operator
could enter a public URL as `fileUrl` and skip storage entirely.

**Recommendation:** validate at upload time that `storageKey` is
present + that an object exists at that key.

### 3.2 No fileUrl normalisation
`fileUrl` is accepted as a raw string. No URL parsing, no
allow-list of hosts. A malicious URL (`javascript:`,
`data:text/html;base64,...`) would render as a link in the FE
table.

**Recommendation:** server-side URL validation (https-only,
trusted hosts) OR drop `fileUrl` from the FE altogether and
always serve via `/api/documents/:id/download`.

### 3.3 No fileUrl deprecation marker
Migration 237 unified into `documents` + `document_entity_links`
but **kept the `fileUrl` column** on the documents store for
legacy rows. The new code path should write `storageKey` only;
`fileUrl` could be marked deprecated.

### 3.4 No coverage smoke
No `umrahAttachmentsServerFlowSmoke.test.ts` pins the FE not
linking to `fileUrl` directly. A regression that re-introduces
the direct link would slip past.

---

## 4. Recovery — phased plan (proposed)

### 4.1 U-16-P1 — FE attachments table uses `/api/documents/:id/download` (🟢 autonomous)
Replace the `fileUrl` column renderer in
`pages/umrah/attachments.tsx` with:

```tsx
{
  key: "download",
  header: "الملف",
  render: (a) => (
    <button onClick={() => window.open(`/api/documents/${a.id}/download`, "_blank")}
            disabled={!a.storageKey}>
      <Download /> تحميل
    </button>
  ),
}
```

Mirror the existing pattern from `documents-page.tsx:202-203`.
This is a **single-file FE edit**, no engine touch.

### 4.2 U-16-P2 — coverage smoke (🟢 autonomous)
New file `tests/unit/umrahAttachmentsServerFlowSmoke.test.ts`:
- Reads `pages/umrah/attachments.tsx`.
- Asserts:
  - No `href=\{a\.fileUrl\}` pattern.
  - No `target="_blank"` directly on `a.fileUrl`.
  - The download flow goes through `/api/documents/`.
- The pre-existing umrah smoke catalog (now 14+ files) grows by 1.

### 4.3 U-16-P3 — backend validation (🟢 autonomous, **borderline**)
Tighten `createAttachmentSchema` to:
- Require `storageKey` (not optional).
- Validate `fileUrl` is https-only if provided (or drop the field
  from the schema entirely; FE doesn't need it for the unified
  flow).

This is borderline because dropping `fileUrl` from the schema
breaks any legacy operator path that posts the cloud URL
directly. **Owner ratification recommended** for the drop; the
validate-only variant is fully autonomous.

### 4.4 U-16-P4 — deprecation flag on `documents.fileUrl` (🟢 autonomous)
Add a column comment / migration that marks `documents.fileUrl`
as deprecated, plus a static smoke that any NEW route writing
to `documents` MUST NOT populate `fileUrl`. This protects
against future regressions.

### 4.5 U-16-P5 — access-log coverage check (🟢 autonomous)
- Static smoke that all umrah doc-serving routes write to
  `document_access_log`.
- For the umrah attachments page, after U-16-P1 lands, downloads
  flow through `/documents/:id/download` which already logs;
  the smoke just pins the wiring.

---

## 5. Permanent hard rails preserved (U-16 will not cross)

- ❌ No engine touch (documents.ts download/preview routes
  untouched).
- ❌ No catalog edit. ❌ No migration that mutates existing rows.
- ❌ No silent linkage. ❌ No JE.
- ❌ U-16-P4's column comment / smoke is additive.
- ❌ U-16-P3 stays at validation only unless owner ratifies the
  field-drop variant.
- ❌ No exposure of new entityTypes to the documents store.

---

## 6. Out of scope for THIS PR (explicit)

- ❌ No FE edit. ❌ No smoke. ❌ No engine touch.
- ❌ FIN-P4-CONTRACT execution untouched.
- ❌ BILL-MAIN P4/P4a/P4b/P4c/P5 untouched (hard-pause).
- ❌ U-02b M6+, U-07, U-09, U-12 untouched.
- ❌ U-04 / U-05 / U-06 / U-14 — independent.

---

## 7. What this PR ships

1. This audit doc.
2. No source code change. The existing umrah smokes + the print
   engine continue to protect the surface unchanged.

---

## 8. Closure verdict

- 🟢 **U-16 closes with FLOW INVENTORIED + 1 CRITICAL LEAK + 3
  ADJACENT GAPS + 5 RECOVERY PHASES SCOPED.** The unification
  did the heavy lift (migration 237). The leak is now narrow:
  one FE column renderer using raw `fileUrl`.
- ➜ **Next autonomous step**: U-16-P1 (FE attachments table edit).
  Single file, low risk, immediate compliance benefit.
- ➜ **Borderline owner decision**: U-16-P3 (drop `fileUrl` from
  the schema entirely). Recommended but not required for the
  compliance gap to close.
- ➜ **Hard-pause queue unchanged.** FIN-P4-CONTRACT code,
  BILL-MAIN P4+/P5, U-02b M6+, U-07 stay hard-paused.
