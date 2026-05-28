import { lazy } from "react";

const Fleet = lazy(() => import("@/pages/fleet"));
const VehiclesCreate = lazy(() => import("@/pages/create/fleet/vehicles-create"));
const Drivers = lazy(() => import("@/pages/fleet/drivers"));
const DriversCreate = lazy(() => import("@/pages/create/fleet/drivers-create"));
const DriverDetail = lazy(() => import("@/pages/details/driver-detail"));
const Trips = lazy(() => import("@/pages/fleet/trips"));
const TripsCreate = lazy(() => import("@/pages/create/fleet/trips-create"));
const TripDetail = lazy(() => import("@/pages/fleet/trip-detail"));
const FleetMaintenance = lazy(() => import("@/pages/fleet/maintenance"));
const MaintenanceCreate = lazy(() => import("@/pages/create/fleet/maintenance-create"));
const MaintenanceDetail = lazy(() => import("@/pages/details/maintenance-detail"));
const Fuel = lazy(() => import("@/pages/fleet/fuel"));
const FuelCreate = lazy(() => import("@/pages/create/fleet/fuel-create"));
const FuelDetail = lazy(() => import("@/pages/details/fuel-detail"));
const Insurance = lazy(() => import("@/pages/fleet/insurance"));
const InsuranceCreate = lazy(() => import("@/pages/create/fleet/insurance-create"));
const InsuranceDetail = lazy(() => import("@/pages/details/insurance-detail"));
const FleetAlerts = lazy(() => import("@/pages/fleet/alerts"));
const FleetReports = lazy(() => import("@/pages/fleet/reports"));
const VehicleDetail = lazy(() => import("@/pages/details/vehicle-detail"));
const VehicleStatusChange = lazy(() => import("@/pages/create/fleet/vehicle-status-change"));
const PreventivePlans = lazy(() => import("@/pages/fleet/preventive-plans"));
const TrafficViolations = lazy(() => import("@/pages/fleet/traffic-violations"));
const TrafficViolationDetail = lazy(() => import("@/pages/details/traffic-violation-detail"));
const TCO = lazy(() => import("@/pages/fleet/tco"));
const TelematicsLiveMap = lazy(() => import("@/pages/fleet/telematics/live-map"));
const TelematicsAiAlerts = lazy(() => import("@/pages/fleet/telematics/ai-alerts"));
const TelematicsSensors = lazy(() => import("@/pages/fleet/telematics/sensors"));
const TelematicsDevices = lazy(() => import("@/pages/fleet/telematics/devices"));
const TelematicsVideoEvidence = lazy(() => import("@/pages/fleet/telematics/video-evidence"));
const TelematicsSettings = lazy(() => import("@/pages/fleet/telematics/settings"));
const TelematicsOperations = lazy(() => import("@/pages/fleet/telematics/operations"));

export const fleetRoutes = [
  { path: "/fleet", component: Fleet },
  { path: "/fleet/vehicles/create", component: VehiclesCreate },
  { path: "/fleet/drivers", component: Drivers },
  { path: "/fleet/drivers/create", component: DriversCreate },
  { path: "/fleet/drivers/:id", component: DriverDetail },
  { path: "/fleet/trips", component: Trips },
  { path: "/fleet/trips/create", component: TripsCreate },
  { path: "/fleet/trips/:id", component: TripDetail },
  { path: "/fleet/maintenance", component: FleetMaintenance },
  { path: "/fleet/maintenance/create", component: MaintenanceCreate },
  { path: "/fleet/maintenance/:id", component: MaintenanceDetail },
  { path: "/fleet/fuel", component: Fuel },
  { path: "/fleet/fuel/create", component: FuelCreate },
  { path: "/fleet/fuel/:id", component: FuelDetail },
  { path: "/fleet/insurance", component: Insurance },
  { path: "/fleet/insurance/create", component: InsuranceCreate },
  { path: "/fleet/insurance/:id", component: InsuranceDetail },
  { path: "/fleet/alerts", component: FleetAlerts },
  { path: "/fleet/reports", component: FleetReports },
  { path: "/fleet/preventive-plans", component: PreventivePlans },
  { path: "/fleet/traffic-violations", component: TrafficViolations },
  { path: "/fleet/traffic-violations/:id", component: TrafficViolationDetail },
  { path: "/fleet/tco", component: TCO },
  // Telematics surface (#1354). The live-map is the landing tab for the
  // /fleet/telematics/* section; nested pages live under the same prefix
  // so the sub-tabs nav (FleetTelematicsTabsNav) highlights correctly.
  { path: "/fleet/telematics", component: TelematicsLiveMap },
  { path: "/fleet/telematics/live-map", component: TelematicsLiveMap },
  { path: "/fleet/telematics/ai-alerts", component: TelematicsAiAlerts },
  { path: "/fleet/telematics/sensors", component: TelematicsSensors },
  { path: "/fleet/telematics/devices", component: TelematicsDevices },
  { path: "/fleet/telematics/video-evidence", component: TelematicsVideoEvidence },
  { path: "/fleet/telematics/settings", component: TelematicsSettings },
  { path: "/fleet/telematics/operations", component: TelematicsOperations },
  { path: "/fleet/:id/status", component: VehicleStatusChange },
  { path: "/fleet/:id", component: VehicleDetail },
];
