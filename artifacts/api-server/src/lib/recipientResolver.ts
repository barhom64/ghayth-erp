/**
 * Centralized recipient resolution for outbound communications.
 *
 * Before this module, every call site of `sendMessage()` did its own
 * lookup — `SELECT email FROM clients WHERE id=$1`, then `SELECT phone
 * FROM employees WHERE id=$1`, scattered across 12+ routes. This led to
 * inconsistency: HR letters never CC'd the employee's personal email
 * even though the column existed, and the channel-to-field mapping
 * (email vs phone vs whatsapp) was reinvented at every call site.
 *
 * This helper centralizes the lookup:
 *   - entityType + entityId + channel → the right address to send to
 *   - returns the recipient's display name + preferred language
 *   - automatically suggests a CC for employee email when the company
 *     has the personal-email-cc policy enabled
 *
 * The resolver does NOT send. It only computes addresses. Callers pass
 * the result into `sendMessage()` directly.
 */
import { rawQuery } from "./rawdb.js";

export type ResolvableEntity = "employee" | "client" | "supplier" | "user";
export type ResolvableChannel = "email" | "sms" | "whatsapp" | "internal";

export interface ResolvedRecipient {
  /** Primary address: email for email/internal, phone for sms/whatsapp. */
  primary: string | null;
  /** CC address (email only). Empty for non-email channels. */
  cc: string | null;
  /** Human-readable name for the recipient — surfaced in subject/log. */
  displayName: string | null;
  /** "ar" or "en" — used by notificationDispatch to pick the right template language. */
  language: "ar" | "en";
  /** Source entity row id — passed through to messageSender as relatedId. */
  entityId: number;
  /** The DB row's company — callers MUST verify it matches their tenant. */
  companyId: number | null;
}

/**
 * Look up an entity and return the address fit for the channel.
 *
 * Returns `{ primary: null, ... }` if the entity exists but has no
 * matching address for this channel. Returns `null` if the entity
 * doesn't exist or has been soft-deleted.
 */
export async function resolveRecipient(
  entityType: ResolvableEntity,
  entityId: number,
  channel: ResolvableChannel,
  opts: { companyId: number; ccPersonalEmail?: boolean } = { companyId: 0 },
): Promise<ResolvedRecipient | null> {
  switch (entityType) {
    case "employee": {
      const rows = await rawQuery<{
        id: number;
        name: string;
        phone: string | null;
        email: string | null;
        personalEmail: string | null;
        internalEmail: string | null;
        companyId: number | null;
        userId: number | null;
        preferredLocale: string | null;
      }>(
        `SELECT e.id, e."name", e.phone, e.email, e."personalEmail", e."internalEmail",
                e."companyId", u.id AS "userId", u."preferredLocale"
         FROM employees e
         LEFT JOIN users u ON u."employeeId" = e.id
         WHERE e.id = $1
           AND e."companyId" = $2
           AND e."deletedAt" IS NULL
         LIMIT 1`,
        [entityId, opts.companyId],
      );
      const r = rows[0];
      if (!r) return null;
      const language = r.preferredLocale === "en" ? "en" : "ar";
      switch (channel) {
        case "email": {
          // Prefer internalEmail (org-controlled) over personal email
          // for primary delivery. Fall back to the legacy `email` column
          // if internalEmail is empty.
          const primary = r.internalEmail || r.email;
          const cc = opts.ccPersonalEmail && r.personalEmail && r.personalEmail !== primary
            ? r.personalEmail
            : null;
          return { primary, cc, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        }
        case "sms":
        case "whatsapp":
          return { primary: r.phone, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        case "internal":
          return { primary: String(r.userId ?? ""), cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
      }
      return null;
    }

    case "client": {
      const rows = await rawQuery<{
        id: number;
        name: string;
        phone: string | null;
        email: string | null;
        companyId: number | null;
      }>(
        `SELECT id, "name", phone, email, "companyId"
         FROM clients
         WHERE id = $1 AND "companyId" = $2
         LIMIT 1`,
        [entityId, opts.companyId],
      );
      const r = rows[0];
      if (!r) return null;
      // Clients don't carry a locale preference today — default to Arabic.
      const language: "ar" | "en" = "ar";
      switch (channel) {
        case "email":
          return { primary: r.email, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        case "sms":
        case "whatsapp":
          return { primary: r.phone, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        case "internal":
          return { primary: null, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
      }
      return null;
    }

    case "supplier": {
      const rows = await rawQuery<{
        id: number;
        name: string;
        phone: string | null;
        email: string | null;
        companyId: number | null;
      }>(
        `SELECT id, "name", phone, email, "companyId"
         FROM suppliers
         WHERE id = $1 AND "companyId" = $2
         LIMIT 1`,
        [entityId, opts.companyId],
      );
      const r = rows[0];
      if (!r) return null;
      const language: "ar" | "en" = "ar";
      switch (channel) {
        case "email":
          return { primary: r.email, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        case "sms":
        case "whatsapp":
          return { primary: r.phone, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
        case "internal":
          return { primary: null, cc: null, displayName: r.name, language, entityId: r.id, companyId: r.companyId };
      }
      return null;
    }

    case "user": {
      const rows = await rawQuery<{
        id: number;
        email: string;
        preferredLocale: string;
        employeeId: number | null;
        phone: string | null;
        empPhone: string | null;
        empName: string | null;
        empPersonalEmail: string | null;
        empCompanyId: number | null;
      }>(
        `SELECT u.id, u.email, u."preferredLocale", u."employeeId",
                NULL::varchar AS phone,
                e.phone AS "empPhone",
                e."name" AS "empName",
                e."personalEmail" AS "empPersonalEmail",
                e."companyId" AS "empCompanyId"
         FROM users u
         LEFT JOIN employees e ON e.id = u."employeeId"
         WHERE u.id = $1
         LIMIT 1`,
        [entityId],
      );
      const r = rows[0];
      if (!r) return null;
      // Ensure the user's linked employee, if any, belongs to the caller's tenant.
      if (r.empCompanyId && r.empCompanyId !== opts.companyId) return null;
      const language = r.preferredLocale === "en" ? "en" : "ar";
      const displayName = r.empName ?? r.email;
      switch (channel) {
        case "email": {
          const cc = opts.ccPersonalEmail && r.empPersonalEmail && r.empPersonalEmail !== r.email
            ? r.empPersonalEmail
            : null;
          return { primary: r.email, cc, displayName, language, entityId: r.id, companyId: r.empCompanyId };
        }
        case "sms":
        case "whatsapp":
          return { primary: r.empPhone, cc: null, displayName, language, entityId: r.id, companyId: r.empCompanyId };
        case "internal":
          return { primary: String(r.id), cc: null, displayName, language, entityId: r.id, companyId: r.empCompanyId };
      }
      return null;
    }
  }
}

/**
 * Look up the company-level policy for "CC personal email when sending
 * to employees". Reads `settings` row scope='company', scopeId=companyId,
 * key='commsCcPersonalEmail' — JSONB value coerced to boolean. Defaults
 * to false when the row is missing, so the existing behavior is
 * preserved unless the operator opts in.
 */
export async function shouldCcPersonalEmail(companyId: number): Promise<boolean> {
  const rows = await rawQuery<{ value: unknown }>(
    `SELECT value FROM settings
     WHERE scope = 'company' AND "scopeId" = $1 AND key = 'commsCcPersonalEmail'
     LIMIT 1`,
    [companyId],
  ).catch(() => [] as { value: unknown }[]);
  return rows[0]?.value === true;
}
