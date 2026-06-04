import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { currentPeriod } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// المساعد الذكي — أسئلة المالك بالعربية (آمن: نوايا مُعرّفة + استعلامات مُدقَّقة)
// ─────────────────────────────────────────────────────────────────────────────
// لا يولّد SQL من نص المستخدم إطلاقًا — يطابق السؤال مع «نية» معروفة ويشغّل
// استعلامًا مُعاملًا مُدقَّقًا مسبقًا، معزولًا بالشركة. يحقّق رؤية «مساعد HR/مالي/
// قانوني» دون مخاطرة حقن SQL أو كشف بيانات. exec فقط لأنه يكشف بيانات عابرة.

const router = Router();

interface Intent {
  key: string;
  match: RegExp;
  label: string; // مثال السؤال (للاقتراحات)
  run: (companyId: number) => Promise<{ answerAr: string; rows: Record<string, unknown>[] }>;
}

const INTENTS: Intent[] = [
  {
    key: "late_employees",
    match: /تأخر|متأخر|تأخير|تأخروا/,
    label: "من تأخر أكثر هذا الشهر؟",
    run: async (companyId) => {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT e.name, ma."lateDays" AS "أيام_التأخر", ma."totalLateMinutes" AS "دقائق_التأخر"
           FROM employee_monthly_attendance ma
           JOIN employee_assignments ea ON ea.id = ma."assignmentId"
           JOIN employees e ON e.id = ea."employeeId"
          WHERE ma."companyId" = $1 AND ma.period = $2 AND ma."lateDays" > 0
          ORDER BY ma."lateDays" DESC LIMIT 5`,
        [companyId, currentPeriod()]
      );
      return { answerAr: rows.length ? `أكثر ${rows.length} موظفين تأخرًا هذا الشهر:` : "لا يوجد تأخّر مسجّل هذا الشهر.", rows };
    },
  },
  {
    key: "top_debtors",
    match: /مديون|دين|عليه ?مبلغ|متعثر|مستحقات|الأعلى ?مديونية/,
    label: "من العملاء الأعلى مديونية؟",
    run: async (companyId) => {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT c.name, COALESCE(SUM(i.total - COALESCE(i."paidAmount",0)),0) AS "المستحق"
           FROM invoices i JOIN clients c ON c.id = i."clientId"
          WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled') AND i."deletedAt" IS NULL
          GROUP BY c.id, c.name
         HAVING COALESCE(SUM(i.total - COALESCE(i."paidAmount",0)),0) > 0
          ORDER BY "المستحق" DESC LIMIT 5`,
        [companyId]
      );
      return { answerAr: rows.length ? `أعلى ${rows.length} عملاء مديونية:` : "لا توجد مديونيات قائمة.", rows };
    },
  },
  {
    key: "overdue_legal",
    match: /(قضايا|قضية|أحكام|حكم).*(متأخر|متعثر|مستحق)|متأخرة.*قضا/,
    label: "ما الأحكام القضائية المتأخرة السداد؟",
    run: async (companyId) => {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT lc.title AS "القضية", (lj.amount - COALESCE(lj."paidAmount",0)) AS "المتبقّي", lj."dueDate" AS "تاريخ_الاستحقاق"
           FROM legal_judgments lj LEFT JOIN legal_cases lc ON lc.id = lj."caseId"
          WHERE lj."companyId" = $1 AND lj."dueDate" < CURRENT_DATE AND COALESCE(lj."paidAmount",0) < lj.amount
          ORDER BY lj."dueDate" ASC LIMIT 5`,
        [companyId]
      );
      return { answerAr: rows.length ? `أحكام متأخرة السداد (${rows.length}):` : "لا توجد أحكام متأخرة.", rows };
    },
  },
  {
    key: "expiring_iqama",
    match: /إقام|اقام|تنتهي|انتهاء|تجديد.*إقام/,
    label: "أي إقامات تنتهي قريبًا؟",
    run: async (companyId) => {
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT name, "iqamaExpiry" AS "انتهاء_الإقامة"
           FROM employees
          WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "iqamaExpiry" IS NOT NULL
            AND "iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
          ORDER BY "iqamaExpiry" ASC LIMIT 10`,
        [companyId]
      );
      return { answerAr: rows.length ? `إقامات تنتهي خلال 30 يومًا (${rows.length}):` : "لا توجد إقامات تنتهي خلال 30 يومًا.", rows };
    },
  },
];

const suggestions = INTENTS.map((i) => i.label);

router.post("/ask", authorize({ feature: "dashboard.executive", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const q = String((req.body?.q ?? "")).trim();
    if (!q) throw new ValidationError("اكتب سؤالك");
    const intent = INTENTS.find((i) => i.match.test(q));
    if (!intent) {
      return void res.json(maskFields(req, {
        matched: false,
        answerAr: "لم أفهم السؤال. يمكنني الإجابة عن:",
        suggestions,
      }));
    }
    const { answerAr, rows } = await intent.run(scope.companyId);
    res.json(maskFields(req, { matched: true, intent: intent.key, question: q, answerAr, rows, suggestions }));
  } catch (err) {
    handleRouteError(err, res, "assistant ask");
  }
});

// GET /assistant/suggestions — the curated questions the assistant can answer.
router.get("/suggestions", authorize({ feature: "dashboard.executive", action: "view" }), (_req, res) => {
  res.json({ suggestions });
});

export default router;
