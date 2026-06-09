/**
 * Transient in-memory handoff for the generic record-detail screen.
 *
 * We deliberately do NOT pass the selected row through navigation params:
 * serializing a full ERP record (which may contain PII like passport numbers,
 * phones, financial figures) into a URL/route-state leaks regulated data into
 * navigation history and logging surfaces. Instead the list screen stashes the
 * row here and the detail screen reads it back. Lives only for the current
 * in-app navigation; a hard reload clears it (detail screen handles the miss).
 */
export interface StoredRecord {
  title: string;
  row: Record<string, unknown>;
}

let current: StoredRecord | null = null;

export function setRecord(record: StoredRecord): void {
  current = record;
}

export function getRecord(): StoredRecord | null {
  return current;
}
