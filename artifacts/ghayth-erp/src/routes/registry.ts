import { hrRoutes } from "@/routes/hrRoutes";
import { financeRoutes } from "@/routes/financeRoutes";
import { fleetRoutes } from "@/routes/fleetRoutes";
import { governanceRoutes } from "@/routes/governanceRoutes";
import { biRoutes } from "@/routes/biRoutes";
import { adminRoutes } from "@/routes/adminRoutes";
import { settingsRoutes } from "@/routes/settingsRoutes";
import { legalRoutes } from "@/routes/legalRoutes";
import { propertyRoutes } from "@/routes/propertyRoutes";
import { storeRoutes } from "@/routes/storeRoutes";
import { documentsRoutes } from "@/routes/documentsRoutes";
import { requestsRoutes } from "@/routes/requestsRoutes";
import { commsRoutes } from "@/routes/commsRoutes";
import { warehouseRoutes } from "@/routes/warehouseRoutes";
import { miscRoutes } from "@/routes/miscRoutes";
import { umrahRoutes } from "@/routes/umrahRoutes";
import { websiteRoutes } from "@/routes/websiteRoutes";

const IMPLICIT_PATHS = ["/", "/dashboard", "/login"];

const REGISTERED_PATTERNS: string[] = [
  ...IMPLICIT_PATHS,
  ...hrRoutes.map((r) => r.path),
  ...financeRoutes.map((r) => r.path),
  ...fleetRoutes.map((r) => r.path),
  ...governanceRoutes.map((r) => r.path),
  ...biRoutes.map((r) => r.path),
  ...adminRoutes.map((r) => r.path),
  ...settingsRoutes.map((r) => r.path),
  ...legalRoutes.map((r) => r.path),
  ...propertyRoutes.map((r) => r.path),
  ...storeRoutes.map((r) => r.path),
  ...documentsRoutes.map((r) => r.path),
  ...requestsRoutes.map((r) => r.path),
  ...commsRoutes.map((r) => r.path),
  ...warehouseRoutes.map((r) => r.path),
  ...miscRoutes.map((r) => r.path),
  ...umrahRoutes.map((r) => r.path),
  ...websiteRoutes.map((r) => r.path),
];

const EXACT_PATHS = new Set<string>();
const PATTERN_REGEXES: RegExp[] = [];
for (const pat of REGISTERED_PATTERNS) {
  if (pat.includes(":") || pat.includes("*")) {
    const re = new RegExp(
      "^" +
        pat
          .replace(/[.+?^${}()|[\]\\*]/g, "\\$&")
          .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "[^/]+")
          .replace(/\\\*/g, ".*") +
        "$"
    );
    PATTERN_REGEXES.push(re);
  } else {
    EXACT_PATHS.add(pat);
  }
}

export function isRegisteredRoute(rawPath: string): boolean {
  const path = rawPath.split("?")[0].split("#")[0];
  if (EXACT_PATHS.has(path)) return true;
  for (const re of PATTERN_REGEXES) if (re.test(path)) return true;
  return false;
}
