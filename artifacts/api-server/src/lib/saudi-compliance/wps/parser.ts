/**
 * Parser for the WPS bank acknowledgement file.
 *
 * After the bank processes the WPS submission it returns an ack
 * file in the same pipe-delimited shape:
 *
 *   H|<companyId>|<period>|<totalProcessed>|<totalFailed>
 *   A|<iqamaOrId>|<iban>|<status>|<bankRef>|<errorMessage>
 *   ...
 *   T|<count>
 *
 * status values: PAID | FAILED | HELD
 *
 * Pure: takes the file text and returns parsed lines. The route
 * handler reconciles them against `wps_run_lines` rows by
 * (iqamaOrId, iban) match.
 */
import type { WpsLineStatus } from "../types.js";

export interface ParsedAckLine {
  iqamaOrId: string;
  iban: string;
  status: WpsLineStatus;
  bankRefNumber: string | null;
  errorMessage: string | null;
}

export interface ParsedAckFile {
  header: { companyId: string; period: string; totalProcessed: number; totalFailed: number } | null;
  lines: ParsedAckLine[];
  trailerCount: number | null;
}

/**
 * Parse the ack text. Tolerates trailing whitespace + Windows line
 * endings. Rejects rows that don't start with H/A/T (so an HTML
 * error page from the bank's portal can't masquerade as ack data).
 */
export function parseAckFile(text: string): ParsedAckFile {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("WPS ack parse: input is empty");
  }

  const out: ParsedAckFile = { header: null, lines: [], trailerCount: null };

  const rows = text.split(/\r?\n/).map((r) => r.trim()).filter((r) => r.length > 0);

  for (const row of rows) {
    const cols = row.split("|");
    const tag = cols[0]?.toUpperCase();

    if (tag === "H") {
      out.header = {
        companyId: cols[1] ?? "",
        period: cols[2] ?? "",
        totalProcessed: Number(cols[3] ?? 0) || 0,
        totalFailed: Number(cols[4] ?? 0) || 0,
      };
    } else if (tag === "A") {
      out.lines.push({
        iqamaOrId: cols[1] ?? "",
        iban: cols[2] ?? "",
        status: mapStatus(cols[3] ?? ""),
        bankRefNumber: cols[4]?.length ? cols[4] : null,
        errorMessage: cols[5]?.length ? cols[5] : null,
      });
    } else if (tag === "T") {
      out.trailerCount = Number(cols[1] ?? 0) || 0;
    } else {
      throw new Error(`WPS ack parse: unknown row tag "${tag}" — file may not be a bank ack`);
    }
  }

  if (out.header === null) {
    throw new Error("WPS ack parse: missing header row");
  }
  if (out.trailerCount !== null && out.trailerCount !== out.lines.length) {
    // Surfaced as a warning by the route handler — file MAY have
    // been truncated mid-write.
    throw new Error(
      `WPS ack parse: trailer count ${out.trailerCount} does not match parsed line count ${out.lines.length}`,
    );
  }

  return out;
}

function mapStatus(raw: string): WpsLineStatus {
  switch (raw.toUpperCase().trim()) {
    case "PAID":
      return "paid";
    case "FAILED":
      return "failed";
    case "HELD":
      return "held";
    case "REJECTED":
      return "rejected";
    default:
      // Unknown status from bank — surface as 'rejected' so the
      // operator notices in the dashboard rather than silently
      // marking it 'paid'.
      return "rejected";
  }
}
