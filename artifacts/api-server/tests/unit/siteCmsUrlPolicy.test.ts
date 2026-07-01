import { describe, it, expect } from "vitest";
import { isSafeCmsUrl } from "../../src/lib/urlPolicy.js";

// ─── Site CMS URL policy (stored-XSS guard) ─────────────────────────────────
// Admin-editable nav-item `url` and banner `ctaUrl` are rendered into public
// <a href> tags on the Wafd marketing site. isSafeCmsUrl is the server-side
// gate that rejects executable schemes (javascript:/data:/vbscript:) so a
// malicious CMS value can never become a clickable XSS payload. The Wafd
// frontend `toSafeHref` mirrors this as defense-in-depth.
describe("isSafeCmsUrl — CMS link scheme allowlist", () => {
  it("allows http(s), root-relative, anchor, mailto, tel, and empty", () => {
    for (const ok of [
      "",
      "https://example.com/path?q=1",
      "http://example.com",
      "/about",
      "/programs/economy",
      "#section",
      "mailto:info@wafd.sa",
      "tel:+966125369972",
      "  https://trimmed.example  ",
    ]) {
      expect(isSafeCmsUrl(ok), `expected safe: ${JSON.stringify(ok)}`).toBe(true);
    }
  });

  it("rejects executable / dangerous schemes and protocol-relative URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "//evil.example.com",
      "ftp://example.com",
      "file:///etc/passwd",
      "not a url",
      "example.com",
    ]) {
      expect(isSafeCmsUrl(bad), `expected unsafe: ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});
