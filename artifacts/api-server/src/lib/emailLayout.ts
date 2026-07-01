/**
 * Branded HTML email layout (RTL Arabic).
 *
 * Outbound email bodies in `outbound_queue` carry only the inner content of
 * the message (typically a few bare `<p>…</p>` fragments interpolated from a
 * `notification_templates.bodyTemplate`). Historically `processEmailQueue`
 * passed that fragment straight to nodemailer's `html:` field, so recipients
 * received unstyled, brand-less paragraphs.
 *
 * `wrapBrandedEmail` wraps any message content in a single, email-client-safe
 * branded shell — Ghayth navy/teal identity, RTL Arabic, a header wordmark,
 * a content card, and a footer — using only inline styles + tables so it
 * renders consistently across Gmail / Outlook / Apple Mail.
 *
 * It is idempotent: a body that is already a full HTML document (starts with
 * `<!DOCTYPE` / `<html>`) is returned unchanged so we never double-wrap.
 */

import { currentYear } from "./businessHelpers.js";

const BRAND = {
  navy: "#0F3D5C",
  teal: "#3FBFD9",
  ink: "#0f172a",
  muted: "#64748b",
  pageBg: "#f4f6f8",
  cardBg: "#ffffff",
  footerBg: "#f8fafc",
  border: "#e2e8f0",
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandedEmailOptions {
  subject?: string | null;
  recipientName?: string | null;
  /** When false, `content` is treated as plain text and HTML-escaped. */
  isHtml?: boolean;
}

export function wrapBrandedEmail(content: string, opts: BrandedEmailOptions = {}): string {
  const raw = content ?? "";

  // Already a full document — don't double-wrap.
  if (/^\s*<(?:!doctype|html)[\s>]/i.test(raw)) return raw;

  const isHtml = opts.isHtml !== false;
  const inner = isHtml
    ? raw
    : escapeHtml(raw).replace(/\r?\n/g, "<br>");

  const subject = opts.subject ? escapeHtml(opts.subject) : "نظام غيث";
  const year = currentYear();

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:${BRAND.ink};direction:rtl;text-align:right;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${BRAND.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
        <tr><td style="background:${BRAND.navy};padding:22px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;">
              <span style="display:inline-block;width:42px;height:42px;line-height:42px;text-align:center;background:${BRAND.teal};color:${BRAND.navy};border-radius:10px;font-size:23px;font-weight:800;">غ</span>
            </td>
            <td style="vertical-align:middle;padding-right:12px;">
              <span style="color:#ffffff;font-size:20px;font-weight:800;">نظام غيث</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:${BRAND.teal};line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px;font-size:15px;line-height:1.9;color:${BRAND.ink};">
${inner}
        </td></tr>
        <tr><td style="background:${BRAND.footerBg};border-top:1px solid ${BRAND.border};padding:18px 30px;font-size:12px;line-height:1.8;color:${BRAND.muted};text-align:center;">
          هذه رسالة آلية من <strong style="color:${BRAND.navy};">نظام غيث للموارد المؤسسية</strong> — يُرجى عدم الرد عليها مباشرة.<br>
          © ${year} مجموعة الدور — جميع الحقوق محفوظة.
        </td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
        <tr><td style="padding:14px 8px;text-align:center;font-size:11px;color:#94a3b8;">
          تم الإرسال عبر منصة غيث — erp.door.sa
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
