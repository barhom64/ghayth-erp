/**
 * Transient in-memory handoff for the generic record-detail screen.
 * لا نمرر السجل عبر URL params لحماية البيانات الحساسة من سجل التنقل.
 */
export interface StoredRecord {
  title: string;
  row: Record<string, unknown>;
  /** اسم الوحدة والقسم — لعرض الإجراءات المناسبة في شاشة التفاصيل */
  module?: string;
  section?: string;
}

let current: StoredRecord | null = null;

export function setRecord(record: StoredRecord): void {
  current = record;
}

export function getRecord(): StoredRecord | null {
  return current;
}
