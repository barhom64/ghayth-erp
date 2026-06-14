// U-15-P2 — single source of truth for "what hotel does this pilgrim stay in?"
//
// Migration 246 documented an order: allocation row > pilgrim.hotelName.
// U-15-P1 added the umrah_packages.defaultHotelId column, opening a third
// fallback. This helper exposes the official resolution chain so any
// caller (statement page, report, FE detail panel) reads from one
// canonical place — eliminating the "three sources of truth" drift the
// audit (#2310 §2.2) documented.
//
// Read-only. No writes. No engine touch. Reads four columns from three
// tables; safe to call on every detail request.

import { rawQuery } from "./rawdb.js";

export type HotelResolutionSource =
  | "allocation"
  | "hotelName"
  | "package"
  | "unknown";

export interface HotelResolution {
  source: HotelResolutionSource;
  hotelId: number | null;
  hotelName: string | null;
}

/**
 * Resolve the hotel a pilgrim is staying at, applying migration 246's
 * resolution order:
 *
 *   1. Active room allocation → umrah_room_allocations.blockId →
 *      umrah_room_blocks.hotelId → umrah_hotels.name. Source = "allocation".
 *   2. Pilgrim's `hotelName` free-text column. Source = "hotelName".
 *   3. Package's defaultHotelId (added by U-15-P1, nullable).
 *      Source = "package".
 *   4. Nothing found. Source = "unknown", hotelId + hotelName = null.
 *
 * The function is read-only and tenant-scoped via the standard
 * `companyId + deletedAt IS NULL` guards on every table join.
 *
 * Returns { source, hotelId, hotelName }. The caller decides how to
 * render — e.g. a statement page surfaces "محجوز: <hotelName>
 * (مصدر: <source>)" so the operator sees not just the answer but the
 * confidence level.
 */
export async function resolveHotelForPilgrim(
  companyId: number,
  pilgrimId: number,
): Promise<HotelResolution> {
  // Step 1 — allocation row wins. The join chain reads the active
  // allocation (no deletedAt), its block's hotelId, and the hotel
  // name + id in a single round-trip.
  const allocation = await rawQuery<{ hotelId: number; hotelName: string | null }>(
    `SELECT h.id AS "hotelId", h.name AS "hotelName"
       FROM umrah_room_allocations ra
       JOIN umrah_room_blocks rb
         ON rb.id = ra."blockId"
        AND rb."companyId" = ra."companyId"
        AND rb."deletedAt" IS NULL
       JOIN umrah_hotels h
         ON h.id = rb."hotelId"
        AND h."companyId" = ra."companyId"
        AND h."deletedAt" IS NULL
      WHERE ra."companyId" = $1
        AND ra."pilgrimId" = $2
        AND ra."deletedAt" IS NULL
      ORDER BY ra.id DESC
      LIMIT 1`,
    [companyId, pilgrimId],
  );
  if (allocation[0]) {
    return {
      source: "allocation",
      hotelId: allocation[0].hotelId,
      hotelName: allocation[0].hotelName,
    };
  }

  // Step 2 — pilgrim's free-text hotelName. This is the legacy field
  // migration 246 deliberately kept for backward compatibility. We
  // also fetch the packageId so step 3 doesn't need a second SELECT.
  const pilgrim = await rawQuery<{ hotelName: string | null; packageId: number | null }>(
    `SELECT "hotelName", "packageId"
       FROM umrah_pilgrims
      WHERE id = $1
        AND "companyId" = $2
        AND "deletedAt" IS NULL`,
    [pilgrimId, companyId],
  );
  const pilgrimRow = pilgrim[0];
  if (!pilgrimRow) {
    // The pilgrim row was deleted between the allocation lookup and
    // here, OR the caller passed an unknown id. Treat as unknown
    // rather than throwing — a journey-status helper or statement
    // page expects a tolerant resolver.
    return { source: "unknown", hotelId: null, hotelName: null };
  }
  if (pilgrimRow.hotelName && pilgrimRow.hotelName.length > 0) {
    return {
      source: "hotelName",
      // The legacy free-text path doesn't carry a hotel id. The FE
      // renders the name verbatim; reports group by the string.
      hotelId: null,
      hotelName: pilgrimRow.hotelName,
    };
  }

  // Step 3 — package's defaultHotelId (added by U-15-P1). Falls
  // through here when the pilgrim has no allocation AND no
  // free-text hotelName. The package must exist + be active to
  // resolve.
  if (pilgrimRow.packageId) {
    const pkg = await rawQuery<{ defaultHotelId: number | null }>(
      `SELECT "defaultHotelId"
         FROM umrah_packages
        WHERE id = $1
          AND "companyId" = $2
          AND "deletedAt" IS NULL`,
      [pilgrimRow.packageId, companyId],
    );
    if (pkg[0]?.defaultHotelId) {
      const hotel = await rawQuery<{ name: string | null }>(
        `SELECT name
           FROM umrah_hotels
          WHERE id = $1
            AND "companyId" = $2
            AND "deletedAt" IS NULL`,
        [pkg[0].defaultHotelId, companyId],
      );
      // Even if the hotel row was deleted, surface the id so the
      // caller can log the orphan — but null the name so the FE
      // shows a placeholder instead of stale data.
      return {
        source: "package",
        hotelId: pkg[0].defaultHotelId,
        hotelName: hotel[0]?.name ?? null,
      };
    }
  }

  // Step 4 — nothing resolved.
  return { source: "unknown", hotelId: null, hotelName: null };
}
