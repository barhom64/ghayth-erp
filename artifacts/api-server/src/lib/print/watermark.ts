/**
 * watermark — composes the "DUPLICATE COPY" banner text shown on reprints.
 */

export function makeWatermark(copyNumber: number, isReprint: boolean): string | undefined {
  if (!isReprint && copyNumber <= 1) return undefined;
  return `نسخة مكررة #${copyNumber} — DUPLICATE COPY`;
}
