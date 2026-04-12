import { lazy } from "react";

const Fleet = lazy(() => import("@/pages/fleet"));
const VehiclesCreate = lazy(() => import("@/pages/create/fleet/vehicles-create"));
const Drivers = lazy(() => import("@/pages/fleet/drivers"));
const DriversCreate = lazy(() => import("@/pages/create/fleet/drivers-create"));
const Trips = lazy(() => import("@/pages/fleet/trips"));
const TripsCreate = lazy(() => import("@/pages/create/fleet/trips-create"));
const TripDetail = lazy(() => import("@/pages/fleet/trip-detail"));
const FleetMaintenance = lazy(() => import("@/pages/fleet/maintenance"));
const MaintenanceCreate = lazy(() => import("@/pages/create/fleet/maintenance-create"));
const Fuel = lazy(() => import("@/pages/fleet/fuel"));
const FuelCreate = lazy(() => import("@/pages/create/fleet/fuel-create"));
const Insurance = lazy(() => import("@/pages/fleet/insurance"));
const InsuranceCreate = lazy(() => import("@/pages/create/fleet/insurance-create"));
const FleetAlerts = lazy(() => import("@/pages/fleet/alerts"));
const FleetAlertsCreate = lazy(() => import("@/pages/create/fleet/alerts-create"));
const FleetReports = lazy(() => import("@/pages/fleet/reports"));
const VehicleDetail = lazy(() => import("@/pages/details/vehicle-detail"));
const VehicleStatusChange = lazy(() => import("@/pages/create/fleet/vehicle-status-change"));
const PreventivePlans = lazy(() => import("@/pages/fleet/preventive-plans"));
const TrafficViolations = lazy(() => import("@/pages/fleet/traffic-violations"));
const TCO = lazy(() => import("@/pages/fleet/tco"));

export const fleetRoutes = [
  { path: "/fleet", component: Fleet },
  { path: "/fleet/vehicles/create", component: VehiclesCreate },
  { path: "/fleet/drivers", component: Drivers },
  { path: "/fleet/drivers/create", component: DriversCreate },
  { path: "/fleet/trips", component: Trips },
  { path: "/fleet/trips/create", component: TripsCreate },
  { path: "/fleet/trips/:id", component: TripDetail },
  { path: "/fleet/maintenance", component: FleetMaintenance },
  { path: "/fleet/maintenance/create", component: MaintenanceCreate },
  { path: "/fleet/fuel", component: Fuel },
  { path: "/fleet/fuel/create", component: FuelCreate },
  { path: "/fleet/insurance", component: Insurance },
  { path: "/fleet/insurance/create", component: InsuranceCreate },
  { path: "/fleet/alerts", component: FleetAlerts },
  { path: "/fleet/alerts/create", component: FleetAlertsCreate },
  { path: "/fleet/reports", component: FleetReports },
  { path: "/fleet/preventive-plans", component: PreventivePlans },
  { path: "/fleet/traffic-violations", component: TrafficViolations },
  { path: "/fleet/tco", component: TCO },
  { path: "/fleet/:id/status", component: VehicleStatusChange },
  { path: "/fleet/:id", component: VehicleDetail },
];
