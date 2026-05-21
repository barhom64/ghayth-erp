/**
 * Storage layer entry point — selects and returns the configured
 * `StorageAdapter` (see `config.objectStorage.driver`).
 *
 * The rest of the codebase imports `getStorageAdapter()` from here and never
 * constructs an adapter directly, so swapping the backend is a config change.
 */
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { StorageAdapter } from "./types.js";
import { ReplitStorageAdapter } from "./replitAdapter.js";
import { LocalFsStorageAdapter } from "./localAdapter.js";

let cached: StorageAdapter | undefined;

/**
 * The process-wide storage adapter, constructed once on first use from
 * `config.objectStorage`. "replit" is the default (current production
 * behaviour); "local" requires `STORAGE_LOCAL_DIR`.
 */
export function getStorageAdapter(): StorageAdapter {
  if (cached) return cached;
  if (config.objectStorage.driver === "local") {
    const dir = config.objectStorage.localDir;
    if (!dir) {
      // Should be unreachable — config validation flags this at startup —
      // but guard anyway so the failure is explicit, not a confusing crash.
      throw new Error(
        "STORAGE_DRIVER=local requires STORAGE_LOCAL_DIR to be set",
      );
    }
    logger.info({ driver: "local", dir }, "storage adapter selected");
    cached = new LocalFsStorageAdapter(dir);
  } else {
    logger.info({ driver: "replit" }, "storage adapter selected");
    cached = new ReplitStorageAdapter();
  }
  return cached;
}

/** Reset the cached adapter. Intended for tests only. */
export function resetStorageAdapter(): void {
  cached = undefined;
}

export {
  type StorageAdapter,
  type StorageReadResult,
  type StorageObjectInfo,
  type StorageWriteOptions,
  StorageObjectNotFoundError,
} from "./types.js";
