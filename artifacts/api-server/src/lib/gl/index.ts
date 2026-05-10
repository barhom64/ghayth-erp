/**
 * Public surface of the GL helper module.
 *
 * Today: typed account-purpose resolver + balanced journal-entry
 * builder. The downstream FX / inventory / cycle-count posters
 * import from here so they don't carry the raw `accounting_mappings`
 * SQL by hand.
 */

export type { AccountPurpose, AccountSide, AccountResolution } from "./account-purposes.js";
export { getAccountForPurpose, getAccountPair } from "./account-purposes.js";

export type {
  JournalLine,
  JournalEntryPayload,
  BuildEntryInput,
} from "./journal-poster.js";
export { buildEntry, buildSimpleEntry } from "./journal-poster.js";

export type {
  JournalEntryStatus,
  EntryContext,
  PostedEntry,
} from "./posting.js";
export { postJournalEntry } from "./posting.js";
