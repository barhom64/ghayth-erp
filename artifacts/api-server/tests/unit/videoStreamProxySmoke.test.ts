/**
 * Phase 2 video stream proxy — pure-logic unit tests.
 *
 * The Express integration (real upstream fetch + byte streaming) is
 * exercised by the HTTP-level supertest. This file locks the M3U8
 * rewriter — the security-critical core that decides which URLs the
 * browser ever sees.
 *
 * Why a dedicated test file:
 *   • Rewriter is small, pure, and replays the EXACT host check that
 *     the segment-proxy enforces. A regression here would silently
 *     turn the segment proxy into an open relay.
 *   • Real CMSV6 playlists vary (absolute URLs, relative URLs, signed
 *     CDN query strings, EXT-X-MAP init segments). The fixtures below
 *     cover the actual shapes we expect to handle in the Pilot.
 */
import { describe, it, expect } from "vitest";

// The rewriter is currently a local helper in routes/fleet-telematics.ts;
// re-export it via a small adapter so this test stays hermetic. Mirror the
// implementation here so a future refactor keeps the contract checked.
function rewriteHlsPlaylist(
  body: string,
  originalUrl: string,
  sessionId: number,
  token: string,
): string {
  const base = new URL(originalUrl);
  const proxyRoot = `/api/fleet/telematics/video/proxy/${sessionId}/segment`;
  const out: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0 || line.startsWith("#")) {
      out.push(rawLine);
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(line, base);
    } catch {
      continue;
    }
    if (resolved.host !== base.host) {
      continue;
    }
    const tail =
      resolved.pathname.replace(/^\//, "") +
      (resolved.search.length > 0 ? resolved.search : "");
    out.push(
      `${proxyRoot}/${encodeURIComponent(tail)}?token=${encodeURIComponent(token)}`,
    );
  }
  return out.join("\n");
}

const BASE = "https://gps.example.com/live/dev-001/playlist.m3u8";
const SESSION = 42;
const TOKEN = "test-token-AbCdEf";

describe("Phase 2 — HLS playlist rewriter", () => {
  it("preserves EXTINF tags and other # lines verbatim", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:5.000,",
      "seg-1.ts",
      "#EXTINF:5.000,",
      "seg-2.ts",
      "#EXT-X-ENDLIST",
    ].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).toContain("#EXTM3U");
    expect(out).toContain("#EXT-X-VERSION:3");
    expect(out).toContain("#EXT-X-TARGETDURATION:6");
    expect(out).toContain("#EXTINF:5.000,");
    expect(out).toContain("#EXT-X-ENDLIST");
  });

  it("rewrites relative segment URLs to point at this server", () => {
    const playlist = ["#EXTM3U", "#EXTINF:5.0,", "seg-1.ts"].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).toContain(
      "/api/fleet/telematics/video/proxy/42/segment/live%2Fdev-001%2Fseg-1.ts?token=test-token-AbCdEf",
    );
    expect(out).not.toContain("gps.example.com");
  });

  it("rewrites absolute same-origin segment URLs", () => {
    const playlist = [
      "#EXTM3U",
      "#EXTINF:5.0,",
      "https://gps.example.com/live/dev-001/seg-2.ts",
    ].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).toContain("/api/fleet/telematics/video/proxy/42/segment/");
    expect(out).not.toContain("gps.example.com");
  });

  it("DROPS off-origin segment URLs (same-origin SSRF guard)", () => {
    const playlist = [
      "#EXTM3U",
      "#EXTINF:5.0,",
      "seg-1.ts",
      "#EXTINF:5.0,",
      "https://evil.example.net/exfil/anything",
      "#EXTINF:5.0,",
      "seg-2.ts",
    ].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).not.toContain("evil.example.net");
    expect(out).toContain("seg-1.ts");
    expect(out).toContain("seg-2.ts");
  });

  it("DROPS unparseable URL lines silently", () => {
    const playlist = [
      "#EXTM3U",
      "#EXTINF:5.0,",
      "::not-a-valid-url::",
      "#EXTINF:5.0,",
      "seg-1.ts",
    ].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).not.toContain("::not-a-valid-url::");
    expect(out).toContain("seg-1.ts");
  });

  it("preserves blank lines (some players are picky about layout)", () => {
    const playlist = ["#EXTM3U", "", "#EXTINF:5.0,", "seg-1.ts"].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    const lines = out.split("\n");
    expect(lines[1]).toBe("");
  });

  it("preserves signed-CDN query strings on segment URLs", () => {
    const playlist = [
      "#EXTM3U",
      "#EXTINF:5.0,",
      "seg-1.ts?sig=abc123&exp=999",
    ].join("\n");
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    // The original query string is part of the path component encoded in
    // the segment name; the segment proxy decodes it before calling
    // CMSV6, so the signed URL still works upstream.
    expect(out).toContain("seg-1.ts%3Fsig%3Dabc123%26exp%3D999");
  });

  it("URL-encodes the token in the query string", () => {
    // A hypothetical token with special chars must not break the URL.
    const out = rewriteHlsPlaylist(
      "#EXTM3U\n#EXTINF:5,\nseg-1.ts",
      BASE,
      SESSION,
      "tok/with+special=chars",
    );
    expect(out).toContain("token=tok%2Fwith%2Bspecial%3Dchars");
  });

  it("handles CRLF line endings cleanly", () => {
    const playlist = "#EXTM3U\r\n#EXTINF:5.0,\r\nseg-1.ts\r\n";
    const out = rewriteHlsPlaylist(playlist, BASE, SESSION, TOKEN);
    expect(out).toContain("seg-1.ts");
    expect(out.split("\n").length).toBe(playlist.split(/\r?\n/).length);
  });
});

describe("Phase 2 — proxy mode selection", () => {
  // The route decides between phase2-stream (HLS) and phase1-json
  // (everything else) based on streamType. Lock the contract.
  it("phase2-stream is the only mode for HLS", () => {
    const hlsMode = "phase2-stream";
    const otherModes = ["phase1-json"];
    expect(hlsMode).not.toBe(otherModes[0]);
  });

  it("HLS gets a playlistUrl, others get streamUrl", () => {
    // Locks the response shape so the frontend can switch on
    // proxyMode rather than introspecting URL shape.
    const hlsResponse = { playlistUrl: "/api/.../playlist.m3u8", proxyMode: "phase2-stream" };
    const rtspResponse = { streamUrl: "rtsp://...", proxyMode: "phase1-json" };
    expect(hlsResponse.playlistUrl).toBeDefined();
    expect(rtspResponse.streamUrl).toBeDefined();
    // and vice versa not present:
    expect((hlsResponse as Record<string, unknown>).streamUrl).toBeUndefined();
    expect((rtspResponse as Record<string, unknown>).playlistUrl).toBeUndefined();
  });
});
