/**
 * printStorage — pluggable persistence for rendered PDFs.
 *
 * If PRIVATE_OBJECT_DIR is set we upload to GCS via the existing
 * ObjectStorageService. Otherwise we no-op so the engine still works in
 * development without object storage configured.
 *
 * Stored layout: print/{companyId}/{yyyy}/{mm}/{jobId}.{ext}
 */

import { Storage } from "@google-cloud/storage";
import { objectStorageClient } from "../objectStorage.js";
import { logger } from "../logger.js";

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const idx = path.indexOf("/", 1);
  return {
    bucketName: path.slice(1, idx === -1 ? path.length : idx),
    objectName: idx === -1 ? "" : path.slice(idx + 1),
  };
}

export async function storePrintArtifact(opts: {
  companyId: number;
  jobId: string;
  format: string;
  bytes: Buffer;
  mime: string;
}): Promise<string | null> {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) return null;
  try {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const ext = opts.format === "excel" ? "xlsx" : "pdf";
    const key = `print/${opts.companyId}/${yyyy}/${mm}/${opts.jobId}.${ext}`;
    const fullPath = `${dir.replace(/\/+$/, "")}/${key}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = (objectStorageClient as Storage).bucket(bucketName).file(objectName);
    await file.save(opts.bytes, { contentType: opts.mime, resumable: false });
    return key;
  } catch (err) {
    logger.warn(err as Error, "[print] failed to store artifact");
    return null;
  }
}

export async function fetchPrintArtifact(opts: {
  companyId: number;
  storageKey: string;
}): Promise<Buffer | null> {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) return null;
  try {
    const fullPath = `${dir.replace(/\/+$/, "")}/${opts.storageKey}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = (objectStorageClient as Storage).bucket(bucketName).file(objectName);
    const [buf] = await file.download();
    return buf;
  } catch (err) {
    logger.warn(err as Error, "[print] failed to fetch artifact");
    return null;
  }
}
