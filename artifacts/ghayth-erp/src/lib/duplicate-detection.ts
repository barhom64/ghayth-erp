/**
 * Attachment duplicate detection — two tiers, derived (no extra fetch):
 *   - "exact":  same `contentHash` (SHA-256 of file content) → identical file
 *               even if renamed. Hash is set client-side at upload (migration
 *               410 stores it); older files without a hash fall back to…
 *   - "likely": same `fileName` + `fileSize` (the original heuristic).
 *
 * Pure + deterministic so it's unit-tested; the UI maps the mark to a badge.
 */
export type DuplicateKind = "exact" | "likely";

interface DupDoc {
  id: number | string;
  contentHash?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

export function computeDuplicateMarks(docs: DupDoc[]): Map<number | string, DuplicateKind> {
  const byHash = new Map<string, DupDoc[]>();
  const byNameSize = new Map<string, DupDoc[]>();
  for (const d of docs) {
    if (d.contentHash) {
      const arr = byHash.get(d.contentHash) ?? [];
      arr.push(d);
      byHash.set(d.contentHash, arr);
    }
    if (d.fileName && d.fileSize) {
      const k = `${d.fileName}::${d.fileSize}`;
      const arr = byNameSize.get(k) ?? [];
      arr.push(d);
      byNameSize.set(k, arr);
    }
  }
  const marks = new Map<number | string, DuplicateKind>();
  for (const group of byHash.values()) {
    if (group.length > 1) for (const d of group) marks.set(d.id, "exact");
  }
  for (const group of byNameSize.values()) {
    if (group.length > 1) for (const d of group) if (!marks.has(d.id)) marks.set(d.id, "likely");
  }
  return marks;
}

/**
 * SHA-256 hex of a file's content via Web Crypto. Returns null if the platform
 * lacks `crypto.subtle` (older/insecure contexts) — callers treat it as
 * best-effort and upload without a hash.
 */
export async function computeFileSha256(file: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const buf = await file.arrayBuffer();
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
