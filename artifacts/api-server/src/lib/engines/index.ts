// ─── Domain Engines — المحركات المركزية ──────────────────────────────────
// Central barrel file for all domain engines. Each engine encapsulates
// business logic that crosses domain boundaries, ensuring:
//  1. All GL posting goes through the Financial Engine
//  2. Cross-domain writes use events instead of direct SQL
//  3. Period checks and sourceKey idempotency are mandatory
//  4. Domain boundaries are enforced at the code level

export { financialEngine } from "./financialEngine.js";
export { fleetEngine } from "./fleetEngine.js";
export { hrEngine } from "./hrEngine.js";
export { propertiesEngine } from "./propertiesEngine.js";
export { storeEngine } from "./storeEngine.js";
export { crmEngine } from "./crmEngine.js";
export { legalEngine } from "./legalEngine.js";
export { umrahEngine } from "./umrahEngine.js";
export { projectsEngine } from "./projectsEngine.js";
export { warehouseEngine } from "./warehouseEngine.js";
export { supportEngine } from "./supportEngine.js";

export type { GLPostingRequest, DomainEngine } from "./domainEngineBase.js";
export type { GLPostingResult, AccountMapping } from "./financialEngine.js";
