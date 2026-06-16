// ─────────────────────────────────────────────────────────────────────────────
// umrah-hotels.ts — UMRAH ACCOMMODATION (hotels, room blocks, room allocations)
//
// U-07 (umrah-entities.ts split, Phase 4): the 9 accommodation routes
// (hotels CRUD + room-blocks list/create + per-block allocations list +
// allocation create/delete) live in a dedicated module so the parent
// `umrah-entities.ts` keeps shrinking. The sub-router is mounted from
// umrah-entities.ts via `router.use(hotelsRouter)` so the API surface
// stays identical (paths still resolve at /umrah/hotels, /umrah/room-blocks,
// /umrah/room-allocations).
//
// Routes owned here:
//   GET    /hotels
//   POST   /hotels
//   PATCH  /hotels/:id
//   DELETE /hotels/:id
//   GET    /room-blocks
//   POST   /room-blocks
//   GET    /room-blocks/:id/allocations
//   POST   /room-allocations
//   DELETE /room-allocations/:id
//
// Domain notes (verbatim from the parent banner):
//   N6 — UMRAH ACCOMMODATION (hotels, room blocks, room allocations).
//   Closes N6 from CRITICAL_DEFECTS_REPORT.md. Replaces the pre-fix
//   "hotelName free string on umrah_pilgrims" with a real 3-table model.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const createHotelSchema = z.object({
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  city: z.string().max(60).optional(),
  address: z.string().optional(),
  starRating: z.coerce.number().int().min(1).max(7).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(40).optional(),
  notes: z.string().optional(),
});
const updateHotelSchema = createHotelSchema.partial();

router.get("/hotels", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const city = req.query.city ? String(req.query.city) : null;
    const params: unknown[] = [scope.companyId];
    let sql = `SELECT * FROM umrah_hotels WHERE "companyId" = $1 AND "deletedAt" IS NULL`;
    if (city) { params.push(city); sql += ` AND city = $${params.length}`; }
    sql += ` ORDER BY name ASC LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "hotels list error"); }
});

router.post("/hotels", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createHotelSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_hotels ("companyId","branchId",name,"nameEn",city,address,"starRating","contactName","contactPhone",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, scope.branchId ?? null, b.name, b.nameEn ?? null, b.city ?? null, b.address ?? null, b.starRating ?? null, b.contactName ?? null, b.contactPhone ?? null, b.notes ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_hotels", entityId: insertId, after: { name: b.name, city: b.city } }).catch(() => undefined);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.hotel.created", entity: "umrah_hotels", entityId: insertId }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "hotels create error"); }
});

router.patch("/hotels/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateHotelSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`"${col}" = $${params.length}`); };
    for (const k of ["name", "nameEn", "city", "address", "starRating", "contactName", "contactPhone", "notes"] as const) {
      if ((b as any)[k] !== undefined) set(k, (b as any)[k]);
    }
    if (!sets.length) { res.json({ ok: true, updated: 0 }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id, scope.companyId);
    await rawExecute(
      `UPDATE umrah_hotels SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`,
      params
    );
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "hotels update error"); }
});

router.delete("/hotels/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE umrah_hotels SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "hotels delete error"); }
});

// Room blocks

const createBlockSchema = z.object({
  hotelId: z.coerce.number().int().positive(),
  seasonId: z.coerce.number().int().positive().optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  roomType: z.enum(["single", "double", "triple", "quad", "suite"]).optional(),
  totalRooms: z.coerce.number().int().nonnegative(),
  ratePerNight: z.coerce.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional(),
});

router.get("/room-blocks", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const hotelId = req.query.hotelId ? Number(req.query.hotelId) : null;
    const seasonId = req.query.seasonId ? Number(req.query.seasonId) : null;
    const params: unknown[] = [scope.companyId];
    // Pre-aggregate room allocations counts via CTE — original was
    // N+1: 500 room blocks × COUNT subquery = 501 lookups through
    // umrah_room_allocations. CTE collapses to one scan.
    let sql = `WITH alloc_counts AS (
                  SELECT "blockId", COUNT(*) AS "allocatedCount"
                  FROM umrah_room_allocations
                  WHERE "deletedAt" IS NULL
                  GROUP BY "blockId"
                )
                SELECT b.*, h.name AS "hotelName", h.city AS "hotelCity",
                       COALESCE(ac."allocatedCount", 0)::int AS "allocatedCount"
                 FROM umrah_room_blocks b
                 LEFT JOIN umrah_hotels h ON h.id = b."hotelId" AND h."deletedAt" IS NULL
                 LEFT JOIN alloc_counts ac ON ac."blockId" = b.id
                WHERE b."companyId" = $1 AND b."deletedAt" IS NULL`;
    if (hotelId) { params.push(hotelId); sql += ` AND b."hotelId" = $${params.length}`; }
    if (seasonId) { params.push(seasonId); sql += ` AND b."seasonId" = $${params.length}`; }
    sql += ` ORDER BY b."checkInDate" DESC NULLS LAST LIMIT 500`;
    const rows = await rawQuery(sql, params).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "room-blocks list error"); }
});

router.post("/room-blocks", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createBlockSchema.safeParse(req.body));
    const [hotel] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_hotels WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.hotelId, scope.companyId]
    );
    if (!hotel) throw new ValidationError("الفندق غير موجود", { field: "hotelId" });
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_room_blocks ("companyId","hotelId","seasonId","checkInDate","checkOutDate","roomType","totalRooms","ratePerNight",currency,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.hotelId, b.seasonId ?? null, b.checkInDate ?? null, b.checkOutDate ?? null, b.roomType ?? null, b.totalRooms, b.ratePerNight ?? null, b.currency ?? 'SAR', b.notes ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_room_blocks", entityId: insertId, after: { hotelId: b.hotelId, seasonId: b.seasonId, totalRooms: b.totalRooms } }).catch(() => undefined);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.room_block.created", entity: "umrah_room_blocks", entityId: insertId }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "room-blocks create error"); }
});

// Allocations

const allocateSchema = z.object({
  blockId: z.coerce.number().int().positive(),
  pilgrimId: z.coerce.number().int().positive(),
  roomNumber: z.string().max(40).optional(),
  occupants: z.coerce.number().int().min(1).max(9).optional(),
  checkInAt: z.string().optional(),
});

router.get("/room-blocks/:id/allocations", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT a.*, p."fullName" AS "pilgrimName", p."passportNumber"
         FROM umrah_room_allocations a
         LEFT JOIN umrah_pilgrims p ON p.id = a."pilgrimId" AND p."deletedAt" IS NULL
        WHERE a."companyId" = $1 AND a."blockId" = $2 AND a."deletedAt" IS NULL
        ORDER BY a."roomNumber" NULLS LAST, a.id`,
      [scope.companyId, id]
    ).catch(() => []);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "allocations list error"); }
});

router.post("/room-allocations", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(allocateSchema.safeParse(req.body));
    // Capacity guard: don't exceed totalRooms for this block.
    const [stats] = await rawQuery<{ totalRooms: number; allocatedCount: string }>(
      `SELECT b."totalRooms",
              (SELECT COUNT(*) FROM umrah_room_allocations a
                WHERE a."blockId" = b.id AND a."deletedAt" IS NULL)::text AS "allocatedCount"
         FROM umrah_room_blocks b
        WHERE b.id = $1 AND b."companyId" = $2 AND b."deletedAt" IS NULL`,
      [b.blockId, scope.companyId]
    );
    if (!stats) throw new ValidationError("بلوك الغرف غير موجود", { field: "blockId" });
    if (Number(stats.allocatedCount) >= Number(stats.totalRooms)) {
      throw new ValidationError("تم استنفاد كل غرف هذا البلوك", { field: "blockId" });
    }
    const { insertId } = await rawExecute(
      `INSERT INTO umrah_room_allocations ("companyId","blockId","pilgrimId","roomNumber",occupants,"checkInAt")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, b.blockId, b.pilgrimId, b.roomNumber ?? null, b.occupants ?? 1, b.checkInAt ?? null]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_room_allocations", entityId: insertId, after: { blockId: b.blockId, pilgrimId: b.pilgrimId } }).catch(() => undefined);
    res.status(201).json({ id: insertId, ok: true });
  } catch (err) { handleRouteError(err, res, "allocate error"); }
});

router.delete("/room-allocations/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Capture the row BEFORE deleting it so the audit log carries the
    // last-known state (pilgrimId + roomNumber + blockId + occupants
    // + check-in/out timestamps). Without this snapshot the audit
    // trail just records "id X deleted", which is useless for
    // reconstructing which pilgrim was unassigned from which room
    // when housekeeping disputes arise.
    const [existing] = await rawQuery<{
      pilgrimId: number;
      roomNumber: string | null;
      blockId: number;
      occupants: number | null;
      checkInAt: string | null;
      checkOutAt: string | null;
    }>(
      `SELECT "pilgrimId", "roomNumber", "blockId", occupants, "checkInAt", "checkOutAt"
         FROM umrah_room_allocations
        WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_room_allocations SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (affectedRows > 0 && existing) {
      createAuditLog({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.room_allocation.deleted",
        entity: "umrah_room_allocations",
        entityId: id,
        before: existing,
        after: { deletedAt: "NOW()" },
      });
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "umrah.room_allocation.deleted",
        entity: "umrah_room_allocations",
        entityId: id,
        details: JSON.stringify({ pilgrimId: existing.pilgrimId, blockId: existing.blockId }),
      }).catch((e) => logger.error(e, "umrah room-allocation delete event emit failed"));
    }
    res.json({ ok: true });
  } catch (err) { handleRouteError(err, res, "deallocate error"); }
});

export default router;
