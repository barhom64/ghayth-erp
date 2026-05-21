import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsStorageAdapter } from "../../src/lib/storage/localAdapter.js";
import { StorageObjectNotFoundError } from "../../src/lib/storage/types.js";

/** Drain a Readable into a Buffer. */
async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("LocalFsStorageAdapter", () => {
  let root: string;
  let adapter: LocalFsStorageAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ghayth-storage-"));
    adapter = new LocalFsStorageAdapter(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("exposes the local backend id", () => {
    expect(adapter.id).toBe("local");
  });

  it("writes then reads an object round-trip", async () => {
    const body = Buffer.from("مرحبا بالعالم — ghayth", "utf8");
    await adapter.write("docs/2026/report.txt", body);

    const { stream, info } = await adapter.read("docs/2026/report.txt");
    expect((await collect(stream)).equals(body)).toBe(true);
    expect(info.contentType).toBe("text/plain");
    expect(info.size).toBe(body.length);
  });

  it("derives content type from the extension", async () => {
    await adapter.write("a/b.pdf", Buffer.from("%PDF-1.4"));
    const { info } = await adapter.read("a/b.pdf");
    expect(info.contentType).toBe("application/pdf");
  });

  it("reports existence accurately", async () => {
    expect(await adapter.exists("missing.txt")).toBe(false);
    await adapter.write("present.txt", Buffer.from("x"));
    expect(await adapter.exists("present.txt")).toBe(true);
  });

  it("deletes an object (and delete is a no-op when absent)", async () => {
    await adapter.write("temp.txt", Buffer.from("x"));
    await adapter.delete("temp.txt");
    expect(await adapter.exists("temp.txt")).toBe(false);
    await expect(adapter.delete("temp.txt")).resolves.toBeUndefined();
  });

  it("throws StorageObjectNotFoundError when reading a missing object", async () => {
    await expect(adapter.read("nope.txt")).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it("rejects an objectKey that escapes the storage root", async () => {
    await expect(adapter.read("../../etc/passwd")).rejects.toThrow(/escapes/);
    await expect(
      adapter.write("../escape.txt", Buffer.from("x")),
    ).rejects.toThrow(/escapes/);
  });

  it("does not leak writes outside the root", async () => {
    await adapter.write("nested/deep/file.txt", Buffer.from("safe"));
    const onDisk = await readFile(join(root, "nested/deep/file.txt"), "utf8");
    expect(onDisk).toBe("safe");
  });
});
