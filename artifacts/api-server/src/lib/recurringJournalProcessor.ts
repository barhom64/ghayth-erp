import { rawQuery, rawExecute } from "./rawdb.js";
import { todayISO } from "./businessHelpers.js";
import { logger } from "./logger.js";

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export function computeNextRunDate(fromDate: string | Date, frequency: RecurringFrequency): string {
  const d = new Date(fromDate);
  switch (frequency) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split("T")[0];
}

export async function runRecurringJournal(params: {
  companyId: number;
  recurring: any;
  triggeredBy: "scheduler" | "manual";
  actorAssignmentId?: number;
  branchId?: number;
}): Promise<{ success: boolean; journalId?: number; ref?: string; error?: string }> {
  const { companyId, recurring, triggeredBy, actorAssignmentId, branchId } = params;
  try {
    const lines = typeof recurring.templateLines === "string"
      ? JSON.parse(recurring.templateLines)
      : recurring.templateLines;
    const ref = `${recurring.templateRef || `REC-${recurring.id}`}-${todayISO()}`;
    const description = recurring.templateDescription || recurring.description || recurring.name;

    const { financialEngine } = await import("./engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId,
      branchId: branchId ?? recurring.branchId ?? 0,
      createdBy: actorAssignmentId ?? recurring.createdBy ?? 0,
      ref,
      description,
      type: "recurring",
      sourceType: "recurring_journal",
      sourceId: recurring.id,
      sourceKey: `finance:recurring:${recurring.id}:${todayISO()}`,
      lines,
    });

    const today = todayISO();
    const next = computeNextRunDate(today, recurring.frequency);
    await rawExecute(
      `UPDATE recurring_journals
         SET "lastRunDate" = $1, "nextRunDate" = $2, "runsCount" = "runsCount" + 1, "updatedAt" = NOW()
       WHERE id = $3`,
      [today, next, recurring.id]
    );
    await rawExecute(
      `INSERT INTO recurring_journal_runs
         ("companyId","recurringJournalId","journalEntryId","runDate",status,"triggeredBy")
       VALUES ($1,$2,$3,$4,'success',$5)`,
      [companyId, recurring.id, journalId, today, triggeredBy]
    );

    return { success: true, journalId, ref };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await rawExecute(
      `INSERT INTO recurring_journal_runs
         ("companyId","recurringJournalId","runDate",status,error,"triggeredBy")
       VALUES ($1,$2,$3,'failed',$4,$5)`,
      [companyId, recurring.id, todayISO(), msg, triggeredBy]
    ).catch((e) => logger.error(e, "[recurringJournalProcessor] background task failed"));
    return { success: false, error: msg };
  }
}

export async function processDueRecurringJournals(): Promise<string> {
  const due = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM recurring_journals
     WHERE active = TRUE AND "deletedAt" IS NULL AND "nextRunDate" <= CURRENT_DATE`
  );
  let ok = 0;
  let failed = 0;
  for (const r of due) {
    const result = await runRecurringJournal({
      companyId: r.companyId as number,
      recurring: r,
      triggeredBy: "scheduler",
      branchId: (r.branchId as number | undefined) ?? undefined,
    });
    if (result.success) ok++; else failed++;
  }
  return `Recurring journals: ${ok} success, ${failed} failed, ${due.length} due`;
}
