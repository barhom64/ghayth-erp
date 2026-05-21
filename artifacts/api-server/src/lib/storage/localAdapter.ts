/**
 * Local-filesystem object-storage adapter.
 *
 * A single-node backend for environments without a cloud object store
 * (development, on-prem, CI). Objects are plain files under a configured root
 * directory; `objectKey` is a POSIX-style path relative to that root.
 *
 * Has no `createUploadUrl` — the filesystem has no presigned-URL concept, so
 * callers upload via `write` instead (the interface marks it optional).
 */
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type StorageAdapter,
  type StorageReadResult,
  type StorageWriteOptions,
  StorageObjectNotFoundError,
} from "./types.js";

/** Minimal extension → MIME map for read responses. */
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
}

export class LocalFsStorageAdapter implements StorageAdapter {
  readonly id = "local";
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /**
   * Resolve `objectKey` to an absolute path, refusing any key that escapes
   * the root directory (path-traversal guard).
   */
  private resolve(objectKey: string): string {
    const normalised = objectKey.replace(/^\/+/, "");
    const full = path.resolve(this.root, normalised);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error(
        `LocalFsStorageAdapter: objectKey "${objectKey}" escapes the storage root`,
      );
    }
    return full;
  }

  async write(
    objectKey: string,
    data: Buffer,
    _opts: StorageWriteOptions = {},
  ): Promise<void> {
    const full = this.resolve(objectKey);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async read(objectKey: string): Promise<StorageReadResult> {
    const full = this.resolve(objectKey);
    let size: number;
    try {
      const st = await stat(full);
      if (!st.isFile()) throw new StorageObjectNotFoundError(objectKey);
      size = st.size;
    } catch (err) {
      if (err instanceof StorageObjectNotFoundError) throw err;
      throw new StorageObjectNotFoundError(objectKey);
    }
    return {
      stream: createReadStream(full),
      info: { contentType: contentTypeFor(full), size },
    };
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      const st = await stat(this.resolve(objectKey));
      return st.isFile();
    } catch {
      return false;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await rm(this.resolve(objectKey), { force: true });
  }
}
