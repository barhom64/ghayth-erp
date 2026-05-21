/**
 * Replit object-storage adapter — the default backend.
 *
 * Talks to the Replit storage sidecar (a local credentials/signing proxy) and
 * the Google Cloud Storage API the sidecar fronts. This is the existing
 * production behaviour, now expressed behind the `StorageAdapter` interface so
 * it is one selectable backend among others rather than a hard dependency.
 *
 * objectKey format: "<bucketName>/<objectName>".
 */
import { Readable } from "node:stream";
import { Storage } from "@google-cloud/storage";
import {
  type StorageAdapter,
  type StorageReadResult,
  type StorageWriteOptions,
  StorageObjectNotFoundError,
} from "./types.js";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/** Lazily-created GCS client wired to the Replit sidecar for credentials. */
let cachedClient: Storage | undefined;
function gcsClient(): Storage {
  if (!cachedClient) {
    cachedClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }
  return cachedClient;
}

/** Split "<bucket>/<object>" into its parts. */
function splitObjectKey(objectKey: string): { bucket: string; object: string } {
  const trimmed = objectKey.replace(/^\/+/, "");
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(
      `ReplitStorageAdapter: invalid objectKey "${objectKey}" — expected "<bucket>/<object>"`,
    );
  }
  return { bucket: trimmed.slice(0, slash), object: trimmed.slice(slash + 1) };
}

/** Ask the sidecar to sign a time-limited object URL. */
async function signObjectURL(args: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: args.bucketName,
        object_name: args.objectName,
        method: args.method,
        expires_at: new Date(Date.now() + args.ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Replit sidecar failed to sign object URL (HTTP ${response.status})`,
    );
  }
  const { signed_url: signedURL } = (await response.json()) as {
    signed_url: string;
  };
  return signedURL;
}

export class ReplitStorageAdapter implements StorageAdapter {
  readonly id = "replit";

  async write(
    objectKey: string,
    data: Buffer,
    opts: StorageWriteOptions = {},
  ): Promise<void> {
    const { bucket, object } = splitObjectKey(objectKey);
    await gcsClient()
      .bucket(bucket)
      .file(object)
      .save(data, opts.contentType ? { contentType: opts.contentType } : {});
  }

  async read(objectKey: string): Promise<StorageReadResult> {
    const { bucket, object } = splitObjectKey(objectKey);
    const file = gcsClient().bucket(bucket).file(object);
    const [exists] = await file.exists();
    if (!exists) throw new StorageObjectNotFoundError(objectKey);
    const [metadata] = await file.getMetadata();
    return {
      stream: file.createReadStream() as unknown as Readable,
      info: {
        contentType: (metadata.contentType as string) || "application/octet-stream",
        size: metadata.size != null ? Number(metadata.size) : undefined,
      },
    };
  }

  async exists(objectKey: string): Promise<boolean> {
    const { bucket, object } = splitObjectKey(objectKey);
    const [exists] = await gcsClient().bucket(bucket).file(object).exists();
    return exists;
  }

  async delete(objectKey: string): Promise<void> {
    const { bucket, object } = splitObjectKey(objectKey);
    await gcsClient()
      .bucket(bucket)
      .file(object)
      .delete({ ignoreNotFound: true });
  }

  async createUploadUrl(objectKey: string, ttlSec: number): Promise<string> {
    const { bucket, object } = splitObjectKey(objectKey);
    return signObjectURL({
      bucketName: bucket,
      objectName: object,
      method: "PUT",
      ttlSec,
    });
  }
}
