/**
 * Public Print Verify endpoint — Phase 6 of the Print Platform.
 *
 *   GET /api/print/verify/:jobId      (no auth required)
 *
 * Every printed document carries a QR encoding this URL. Scanning the QR
 * with any phone — without an ERP account — returns a safe-subset of the
 * audit row that proves the document is genuine and tells the holder when
 * it was printed, by which branch, and whether it's a reprint.
 *
 * This router is mounted BEFORE authMiddleware in routes/index.ts; the
 * authenticated printRouter (which owns /render, /templates, /jobs, etc.)
 * mounts AFTER. Express picks the more specific match first, so
 * `/print/verify/<uuid>` resolves here.
 */

import { Router, type Request, type Response } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Per-IP cap — the endpoint is anonymous so a per-user limiter would
// give every drive-by scanner unlimited credit. 60/min/IP comfortably
// covers a courier verifying a stack of invoices but blocks scraper
// behaviour. The window resets on the first quiet minute.
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز حد التحقق. يرجى المحاولة بعد قليل" },
});

router.get("/:jobId", verifyLimiter, async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId ?? "");
    // Strict UUID shape — block scanners from probing the table with
    // arbitrary strings. Parameterized queries already block SQL injection,
    // but we also don't want non-UUID input touching the DB at all.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      return res.status(400).json({ verified: false, error: "INVALID_JOB_ID" });
    }
    const [row] = await rawQuery<{
      entityType: string;
      entityId: string;
      copyNumber: number;
      isReprint: boolean;
      status: string;
      createdAt: string;
      companyId: number;
      companyName: string | null;
      branchName: string | null;
    }>(
      `SELECT pj."entityType", pj."entityId", pj."copyNumber", pj."isReprint",
              pj."status", pj."createdAt",
              pj."companyId",
              c.name AS "companyName",
              b.name AS "branchName"
         FROM print_jobs pj
         LEFT JOIN companies c ON c.id = pj."companyId"
         LEFT JOIN branches b ON b.id = pj."branchId"
        WHERE pj."jobId" = $1::uuid
        LIMIT 1`,
      [jobId],
    );
    if (!row) {
      return res.status(404).json({ verified: false, error: "NOT_FOUND" });
    }
    // Failed or in-progress renders are not verified — only "done" rows
    // are authoritative. We still return a 200 so the SPA / verify page
    // can show the reason instead of a generic error.
    if (row.status !== "done") {
      return res.status(200).json({
        verified: false,
        status: row.status,
        message: "هذه النسخة لم تكتمل أو تم إلغاؤها.",
      });
    }
    return res.json({
      verified: true,
      jobId,
      entityType: row.entityType,
      entityId: row.entityId,
      copyNumber: row.copyNumber,
      isReprint: row.isReprint,
      printedAt: row.createdAt,
      issuer: {
        company: row.companyName,
        branch: row.branchName,
      },
    });
  } catch (err) {
    return handleRouteError(err, res, "print:verify");
  }
});

export default router;
