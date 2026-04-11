export interface DiffEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export function computeDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffEntry[] {
  if (!before && !after) return [];
  if (!before) {
    return Object.entries(after!).map(([field, newValue]) => ({ field, oldValue: null, newValue }));
  }
  if (!after) {
    return Object.entries(before).map(([field, oldValue]) => ({ field, oldValue, newValue: null }));
  }

  const diffs: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const SKIP_FIELDS = new Set(["updatedAt", "createdAt", "password", "passwordHash"]);

  for (const field of allKeys) {
    if (SKIP_FIELDS.has(field)) continue;
    const oldVal = before[field];
    const newVal = after[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ field, oldValue: oldVal ?? null, newValue: newVal ?? null });
    }
  }

  return diffs;
}
