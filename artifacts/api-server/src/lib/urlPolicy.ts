// سياسة روابط CMS المشتركة — أي رابط يحرّره مسؤول ويُعرض في وسم <a href> أو
// <img src> عام يجب أن يمرّ عبر قائمة سماح للمخطّطات (scheme allowlist) على
// الخادم. نمنع javascript:/data:/vbscript: والروابط النسبية-للبروتوكول
// (//evil.com) لتفادي حقن سكربتات مخزَّنة (stored XSS). مسموح فقط: http(s)://…
// أو مسار جذري نسبي (/…) أو مرساة (#…) أو mailto:/tel:. يُستخدم من site.ts
// (CMS الموقع) و marketing.ts (حملات عامة) معاً — مصدر واحد، لا تكرار.
import { z } from "zod";

export const SAFE_URL_RE = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;

export const isSafeCmsUrl = (v: string): boolean => v === "" || SAFE_URL_RE.test(v.trim());

export const safeUrl = (max = 1000, opts?: { required?: boolean }) => {
  const base = opts?.required
    ? z.string().trim().min(1).max(max)
    : z.string().trim().max(max);
  return base.refine((v) => isSafeCmsUrl(v), {
    message: "الرابط غير صالح — استخدم https:// أو مساراً يبدأ بـ /",
  });
};
