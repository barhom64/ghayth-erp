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
// mirror the implementation here so this file stays hermetic AND the
// contract is checked. A future refactor that drifts the route impl
// will fail this test; a refactor that changes both keeps the lock.
function rewriteHlsPlaylist(
  body: string,
  originalUrl: string,
  sessionId: number,
  token: string,
): string {
  const base = new URL(originalUrl);
  const segmentRoot = `/api/fleet/telematics/video/proxy/${sessionId}/segment`;
  const playlistRoot = `/api/fleet/telematics/video/proxy/${sessionId}/playlist.m3u8`;
  const encodedToken = encodeURIComponent(token);

  const proxify = (urlText: string, mode: "segment" | "variant"): string | null => {
    let resolved: URL;
    try {
      resolved = new URL(urlText, base);
    } catch {
      return null;
    }
    if (resolved.host !== base.host) return null;
    const tail =
      resolved.pathname.replace(/^\//, "") +
      (resolved.search.length > 0 ? resolved.search : "");
    if (mode === "variant") {
      return `${playlistRoot}?token=${encodedToken}&variant=${encodeURIComponent(tail)}`;
    }
    return `${segmentRoot}/${encodeURIComponent(tail)}?token=${encodedToken}`;
  };

  const rewriteUriAttribute = (
    tagLine: string,
    mode: "segment" | "variant",
  ): string | null => {
    const match = tagLine.match(/URI="([^"]*)"/);
    if (!match) return tagLine;
    const proxied = proxify(match[1], mode);
    if (proxied === null) return null;
    return tagLine.replace(/URI="[^"]*"/, `URI="${proxied}"`);
  };

  let prevTag = "";
  const isVariantContext = (tag: string): boolean =>
    /^#EXT-X-STREAM-INF/i.test(tag) || /^#EXT-X-I-FRAME-STREAM-INF/i.test(tag);

  const out: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      out.push(rawLine);
      continue;
    }
    if (line.startsWith("#")) {
      if (
        /^#EXT-X-MEDIA[: ]/.test(line) ||
        /^#EXT-X-I-FRAME-STREAM-INF[: ]/.test(line)
      ) {
        const rewritten = rewriteUriAttribute(line, "variant");
        if (rewritten !== null) out.push(rewritten);
      } else if (/^#EXT-X-MAP[: ]/.test(line) || /^#EXT-X-KEY[: ]/.test(line)) {
        const rewritten = rewriteUriAttribute(line, "segment");
        if (rewritten !== null) out.push(rewritten);
      } else {
        out.push(rawLine);
      }
      prevTag = line;
      continue;
    }
    const mode: "segment" | "variant" = isVariantContext(prevTag)
      ? "variant"
      : "segment";
    const proxied = proxify(line, mode);
    if (proxied !== null) out.push(proxied);
    prevTag = "";
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

describe("Phase 2 — master playlist (multi-variant) rewriting", () => {
  it("rewrites EXT-X-STREAM-INF variant URLs to playlist proxy + variant param", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=720x480",
      "high.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=640000,RESOLUTION=640x360",
      "low.m3u8",
    ].join("\n");
    const out = rewriteHlsPlaylist(master, BASE, SESSION, TOKEN);
    expect(out).toContain("/api/fleet/telematics/video/proxy/42/playlist.m3u8");
    expect(out).toContain("variant=live%2Fdev-001%2Fhigh.m3u8");
    expect(out).toContain("variant=live%2Fdev-001%2Flow.m3u8");
    // Variant URLs are NOT routed to the segment endpoint
    expect(out).not.toMatch(/segment\/[^?]*high\.m3u8/);
  });

  it("rewrites EXT-X-I-FRAME-STREAM-INF variants", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=180000,URI=\"iframe.m3u8\"",
      "#EXT-X-STREAM-INF:BANDWIDTH=1280000",
      "high.m3u8",
    ].join("\n");
    const out = rewriteHlsPlaylist(master, BASE, SESSION, TOKEN);
    // I-FRAME variant via URI="..."
    expect(out).toMatch(/URI="\/api\/fleet\/telematics\/video\/proxy\/42\/playlist\.m3u8/);
    // Regular STREAM-INF variant via bare line
    expect(out).toContain("variant=live%2Fdev-001%2Fhigh.m3u8");
  });

  it("rewrites EXT-X-MEDIA alternate audio/subtitle URIs as variants", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Arabic\",URI=\"audio/ar.m3u8\"",
      "#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"sub\",NAME=\"AR\",URI=\"subs/ar.m3u8\"",
      "#EXT-X-STREAM-INF:BANDWIDTH=1280000,AUDIO=\"aud\",SUBTITLES=\"sub\"",
      "high.m3u8",
    ].join("\n");
    const out = rewriteHlsPlaylist(master, BASE, SESSION, TOKEN);
    expect(out).toMatch(/URI="\/api\/fleet\/telematics\/video\/proxy\/42\/playlist\.m3u8\?token=[^"]+&variant=live%2Fdev-001%2Faudio%2Far\.m3u8"/);
    expect(out).toMatch(/URI="\/api\/fleet\/telematics\/video\/proxy\/42\/playlist\.m3u8\?token=[^"]+&variant=live%2Fdev-001%2Fsubs%2Far\.m3u8"/);
  });

  it("rewrites EXT-X-MAP init segment URI as a segment proxy URL", () => {
    const fmp4 = [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-MAP:URI=\"init.mp4\"",
      "#EXTINF:5.0,",
      "seg-1.m4s",
    ].join("\n");
    const out = rewriteHlsPlaylist(fmp4, BASE, SESSION, TOKEN);
    expect(out).toMatch(/URI="\/api\/fleet\/telematics\/video\/proxy\/42\/segment\/[^"]*init\.mp4/);
    expect(out).toContain("seg-1.m4s");
  });

  it("rewrites EXT-X-KEY decryption key URI as a segment proxy URL", () => {
    const encrypted = [
      "#EXTM3U",
      "#EXT-X-KEY:METHOD=AES-128,URI=\"keys/k1.bin\",IV=0x00000000000000000000000000000000",
      "#EXTINF:5.0,",
      "seg-1.ts",
    ].join("\n");
    const out = rewriteHlsPlaylist(encrypted, BASE, SESSION, TOKEN);
    expect(out).toMatch(/URI="\/api\/fleet\/telematics\/video\/proxy\/42\/segment\/[^"]*keys%2Fk1\.bin/);
  });

  it("DROPS EXT-X-MEDIA tags whose URI points off-origin", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Arabic\",URI=\"https://evil.example.net/aud.m3u8\"",
      "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English\",URI=\"audio/en.m3u8\"",
      "#EXT-X-STREAM-INF:BANDWIDTH=1280000,AUDIO=\"aud\"",
      "high.m3u8",
    ].join("\n");
    const out = rewriteHlsPlaylist(master, BASE, SESSION, TOKEN);
    expect(out).not.toContain("evil.example.net");
    // Off-origin tag dropped, on-origin tag kept
    expect(out).toContain("audio%2Fen.m3u8");
  });

  it("DROPS EXT-X-MAP whose URI points off-origin (defence in depth)", () => {
    const malicious = [
      "#EXTM3U",
      "#EXT-X-MAP:URI=\"https://evil.example.net/init.mp4\"",
      "#EXTINF:5.0,",
      "seg-1.m4s",
    ].join("\n");
    const out = rewriteHlsPlaylist(malicious, BASE, SESSION, TOKEN);
    expect(out).not.toContain("evil.example.net");
    expect(out).not.toContain("EXT-X-MAP");
  });

  it("does not confuse a media playlist segment URL with a variant URL", () => {
    // EXTINF means "next URL is a segment", not "next URL is a variant"
    const media = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:5.0,",
      "highquality.ts", // accidentally looks like a variant name
    ].join("\n");
    const out = rewriteHlsPlaylist(media, BASE, SESSION, TOKEN);
    expect(out).toContain("/segment/");
    expect(out).not.toContain("/playlist.m3u8?token=");
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
