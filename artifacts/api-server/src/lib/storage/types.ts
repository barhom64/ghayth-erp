/**
 * Storage abstraction — the vendor-neutral seam for the API server's object
 * storage (document uploads, attachments, OCR inputs, signatures, HR files).
 *
 * Track A of the Foundation roadmap: decouple the codebase from the Replit
 * object-storage sidecar so the system is deployable outside Replit without
 * guessing. The rest of the codebase depends on `StorageAdapter` — never on a
 * concrete provider. The day a real S3/MinIO adapter is added, it implements
 * this interface and nothing else changes.
 *
 * Adapter selection is config-driven (`config.objectStorage.driver`):
 *   - "replit" — the Replit GCS sidecar (default; current production behaviour)
 *   - "local"  — a local-filesystem adapter (single-node fallback / dev)
 *
 * Key semantics are adapter-defined and documented per adapter:
 *   - ReplitStorageAdapter: objectKey = "<bucket>/<objectName>"
 *   - LocalFsStorageAdapter: objectKey = a POSIX-style path relative to the
 *     configured local root
 */
import type { Readable } from "node:stream";

export interface StorageObjectInfo {
  /** MIME type; falls back to application/octet-stream when unknown. */
  readonly contentType: string;
  /** Size in bytes when the adapter can report it. */
  readonly size: number | undefined;
}

export interface StorageReadResult {
  readonly stream: Readable;
  readonly info: StorageObjectInfo;
}

export interface StorageWriteOptions {
  readonly contentType?: string;
}

/**
 * The contract every storage backend implements. `write` / `read` / `exists`
 * / `delete` are mandatory and genuinely functional on every adapter.
 * `createUploadUrl` is optional — only cloud backends that support presigned
 * URLs implement it; callers must fall back to `write` when it is absent.
 */
export interface StorageAdapter {
  /** Stable backend id — "replit", "local", … */
  readonly id: string;

  /** Persist `data` at `objectKey`, creating any intermediate structure. */
  write(objectKey: string, data: Buffer, opts?: StorageWriteOptions): Promise<void>;

  /** Open a read stream + metadata. Throws StorageObjectNotFoundError if absent. */
  read(objectKey: string): Promise<StorageReadResult>;

  /** True when an object exists at `objectKey`. */
  exists(objectKey: string): Promise<boolean>;

  /** Remove the object. A no-op when it does not exist. */
  delete(objectKey: string): Promise<void>;

  /**
   * Optional — a time-limited presigned URL the client can PUT to directly.
   * Cloud adapters implement it; the local adapter omits it (filesystem
   * storage has no presigned-URL concept — callers use `write` instead).
   */
  createUploadUrl?(objectKey: string, ttlSec: number): Promise<string>;
}

/** Thrown by `read` when the requested object does not exist. */
export class StorageObjectNotFoundError extends Error {
  constructor(objectKey: string) {
    super(`Storage object not found: ${objectKey}`);
    this.name = "StorageObjectNotFoundError";
    Object.setPrototypeOf(this, StorageObjectNotFoundError.prototype);
  }
}
