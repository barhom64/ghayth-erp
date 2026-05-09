/**
 * Public surface of the ZATCA Phase 2 module.
 *
 * Today this is mostly types + pure helpers (QR encoding, ICV / PIH
 * counters). The signing, API client, and retry worker land in the
 * later weeks of the rollout (see docs/ZATCA_PHASE_2_DESIGN.md).
 *
 * The Phase 1 sandbox simulation in
 *   artifacts/api-server/src/routes/finance-zatca.ts
 * keeps using its own inlined helpers for now to avoid breaking the
 * existing flow during the Phase 2 build-out. As each Phase 2 piece
 * lands, the route handler will swap inline calls for imports from
 * here.
 */

export * from "./types.js";
export * from "./qr.js";
export { reserveNextIcv, currentIcv } from "./icv.js";
export { readNextPih, advancePih, PIH_CHAIN_HEAD } from "./pih.js";
