import { lazy } from "react";

const Fleet = lazy(() => import("@/pages/fleet"));
const VehiclesCreate = lazy(() => import("@/pages/create/fleet/vehicles-create"));
const Drivers = lazy(() => import("@/pages/fleet/drivers"));
const DriversCreate = lazy(() => import("@/pages/create/fleet/drivers-create"));
const DriverDetail = lazy(() => import("@/pages/details/driver-detail"));
const Trips = lazy(() => import("@/pages/fleet/trips"));
// #2079 TA-T18-13 (FIX-10) — the /fleet/trips/create deprecation
// page (5-sec redirect to /fleet/transport/bookings/create) is
// removed entirely. After TA-T18-14 (#2285) tightened POST
// /fleet/trips to require a parent dispatch order, no live SPA
// path linked to it. The route entry, the lazy import, and the
// page file itself are all gone — manual trip creation now flows
// exclusively through booking → dispatch.
const TripDetail = lazy(() => import("@/pages/fleet/trip-detail"));
// البند ٤ — «تسجيل واقعة مركبة» الموحّدة (الكيان يقود: وقود/صيانة/تأمين في مكان واحد).
const VehicleEventCreate = lazy(() => import("@/pages/create/fleet/vehicle-event-create"));
const FleetMaintenance = lazy(() => import("@/pages/fleet/maintenance"));
const MaintenanceTicketImpact = lazy(() => import("@/pages/fleet/maintenance-ticket-impact"));
const MaintenanceCreate = lazy(() => import("@/pages/create/fleet/maintenance-create"));
const MaintenanceDetail = lazy(() => import("@/pages/details/maintenance-detail"));
const Fuel = lazy(() => import("@/pages/fleet/fuel"));
const FuelCreate = lazy(() => import("@/pages/create/fleet/fuel-create"));
const FuelDetail = lazy(() => import("@/pages/details/fuel-detail"));
const Insurance = lazy(() => import("@/pages/fleet/insurance"));
const Tires = lazy(() => import("@/pages/fleet/tires"));
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
// TA-GAP-09 Phase 2 — Maps quota usage dashboard.
const MapsUsage = lazy(() => import("@/pages/fleet/maps-usage"));
// Control Tower — single-page operator dashboard (audit file 22 + #1812).
const TransportControlTower = lazy(() => import("@/pages/fleet/transport-control-tower"));
// TA-T18-VRP Phase 2 — Fleet Optimizer batch-mode (runs list + detail).
const OptimizerRuns = lazy(() => import("@/pages/fleet/optimizer-runs"));
const OptimizerRunDetail = lazy(() => import("@/pages/fleet/optimizer-run-detail"));
const TelematicsEvidence = lazy(() => import("@/pages/fleet/telematics/evidence"));
const TelematicsScorecard = lazy(() => import("@/pages/fleet/telematics/scorecard"));
const CargoList = lazy(() => import("@/pages/fleet/cargo"));
const CargoCreate = lazy(() => import("@/pages/fleet/cargo-create"));
const CargoDetail = lazy(() => import("@/pages/fleet/cargo-detail"));
// #1733 Comment 9 — Booking + Dispatch SPA surface.
const TransportBookings = lazy(() => import("@/pages/fleet/transport-bookings"));
const TransportBookingCreate = lazy(() => import("@/pages/fleet/transport-booking-create"));
const TransportBookingDetail = lazy(() => import("@/pages/fleet/transport-booking-detail"));
const TransportBookingConfirmation = lazy(() => import("@/pages/fleet/transport-booking-confirmation"));
const TransportDispatch = lazy(() => import("@/pages/fleet/transport-dispatch"));
const TransportPriceRules = lazy(() => import("@/pages/fleet/transport-price-rules"));
const TransportServiceLines = lazy(() => import("@/pages/fleet/transport-service-lines"));
const TransportRulesAdmin = lazy(() => import("@/pages/fleet/transport-rules-admin"));
// #1812 Wave 1 Step C — equipment rental (the third leg).
const RentalContractsList = lazy(() => import("@/pages/fleet/rental-contracts"));
const RentalCreate = lazy(() => import("@/pages/fleet/rental-create"));
const RentalDetail = lazy(() => import("@/pages/fleet/rental-detail"));
// #1812 Planning engine — ops dashboard + driver in-app navigation.
const TransportOpsDashboard = lazy(() => import("@/pages/fleet/transport-ops-dashboard"));
// TR-022 — unified transport calendar.
const TransportCalendar = lazy(() => import("@/pages/fleet/transport-calendar"));
const MeDriverNavigation = lazy(() => import("@/pages/fleet/me-driver-navigation"));
// #1812 integration bridges — linked sources view.
const TransportIntegration = lazy(() => import("@/pages/fleet/transport-integration"));
// #1812 itineraries — chained-trip programs.
const TransportItineraries = lazy(() => import("@/pages/fleet/transport-itineraries"));
const TransportItineraryDetail = lazy(() => import("@/pages/fleet/transport-itinerary-detail"));
// #2079 TA-T18-04 — Route patterns SPA (cargo recurring schedules).
// Pure UI over existing /transport/route-patterns* endpoints.
const TransportRoutePatterns = lazy(() => import("@/pages/fleet/transport-route-patterns"));
// Unified driver self-service surface (#1354). Replaces /driver-portal/*
// — drivers log in to the regular ERP, get the `driver` role, and land
// here as their dashboard (see dashboard.tsx role-based redirect).
const MeDriver = lazy(() => import("@/pages/fleet/me-driver"));
const MeInspection = lazy(() => import("@/pages/fleet/me-inspection"));
const MeDriverReports = lazy(() => import("@/pages/fleet/me-driver-reports"));
const InspectionsReview = lazy(() => import("@/pages/fleet/inspections-review"));
// أجر السائق بالساعة — شاشة ساعات العمل (الدفعة 1).
const DriverWorkHours = lazy(() => import("@/pages/fleet/driver-work-hours"));
const MovementBonuses = lazy(() => import("@/pages/fleet/movement-bonuses")); // مكافآت حركات النقل — الدفعة أ

export const fleetRoutes = [
  { path: "/fleet", component: Fleet },
  { path: "/fleet/record-event", component: VehicleEventCreate },
  { path: "/fleet/vehicles/create", component: VehiclesCreate },
  { path: "/fleet/inspections", component: InspectionsReview },
  { path: "/fleet/drivers", component: Drivers },
  { path: "/fleet/drivers/create", component: DriversCreate },
  { path: "/fleet/drivers/:id", component: DriverDetail },
  { path: "/fleet/trips", component: Trips },
  // /fleet/trips/create route removed (see TA-T18-13 FIX-10 above).
  { path: "/fleet/trips/:id", component: TripDetail },
  { path: "/fleet/maintenance", component: FleetMaintenance },
  { path: "/fleet/maintenance-impact", component: MaintenanceTicketImpact },
  { path: "/fleet/maintenance/create", component: MaintenanceCreate },
  { path: "/fleet/maintenance/:id", component: MaintenanceDetail },
  { path: "/fleet/fuel", component: Fuel },
  { path: "/fleet/fuel/create", component: FuelCreate },
  { path: "/fleet/fuel/:id", component: FuelDetail },
  { path: "/fleet/insurance", component: Insurance },
  { path: "/fleet/tires", component: Tires },
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
  // TA-GAP-09 Phase 2 — Maps quota usage dashboard.
  { path: "/fleet/maps/usage", component: MapsUsage },
  // Control Tower — audit doc file 22 + #1812 user brief.
  { path: "/fleet/transport/control-tower", component: TransportControlTower },
  // TA-T18-VRP Phase 2 — Fleet Optimizer (detail BEFORE list since wouter is order-sensitive).
  { path: "/fleet/optimizer/runs/:id", component: OptimizerRunDetail },
  { path: "/fleet/optimizer/runs", component: OptimizerRuns },
  { path: "/fleet/telematics/evidence", component: TelematicsEvidence },
  { path: "/fleet/telematics/scorecard", component: TelematicsScorecard },
  // Driver self-service dashboard — appears at /me/driver. Role gate
  // happens in dashboard.tsx (drivers redirected here automatically).
  { path: "/me/driver", component: MeDriver },
  // Driver field reports — fuel / breakdown / accident self-report.
  { path: "/me/driver/reports", component: MeDriverReports },
  // Driver fulfils a daily vehicle inspection (odometer + photos). Reached
  // from the daily-inspection reminder notification + the driver dashboard card.
  { path: "/fleet/me/inspections/:id", component: MeInspection },
  // Cargo / freight (#1354 — نقل بري للبضائع). Manifest + items CRUD.
  { path: "/fleet/cargo", component: CargoList },
  { path: "/fleet/cargo/create", component: CargoCreate },
  { path: "/fleet/cargo/:id", component: CargoDetail },
  // #1733 Booking + Dispatch (Comment 9). Pre-trip pipeline:
  //   intake → booking → lines → dispatch order → cargo manifest.
  // The dispatch board groups orders by driver with conflict detection.
  { path: "/fleet/transport/bookings", component: TransportBookings },
  // /create must be listed BEFORE /:id so "create" isn't matched as an id.
  { path: "/fleet/transport/bookings/create", component: TransportBookingCreate },
  // /confirmation must come before /:id so "confirmation" isn't matched as an id.
  { path: "/fleet/transport/bookings/:id/confirmation", component: TransportBookingConfirmation },
  { path: "/fleet/transport/bookings/:id", component: TransportBookingDetail },
  { path: "/fleet/transport/dispatch", component: TransportDispatch },
  { path: "/fleet/transport/price-rules", component: TransportPriceRules },
  { path: "/fleet/transport/service-lines", component: TransportServiceLines },
  { path: "/fleet/transport/rules", component: TransportRulesAdmin },
  // #1812 Wave 1 Step C — equipment rental (3rd transport leg).
  // /create + /:id come after the parent list path; /:id is a numeric
  // catch-all so /create must be matched first.
  { path: "/fleet/rental-contracts", component: RentalContractsList },
  { path: "/fleet/rental-contracts/create", component: RentalCreate },
  { path: "/fleet/rental-contracts/:id", component: RentalDetail },
  // #1812 ops dashboard + driver navigation surfaces.
  { path: "/fleet/transport/ops-dashboard", component: TransportOpsDashboard },
  { path: "/fleet/transport/calendar", component: TransportCalendar }, // TR-022
  { path: "/fleet/transport/integration", component: TransportIntegration },
  { path: "/fleet/transport/itineraries", component: TransportItineraries },
  { path: "/fleet/transport/itineraries/:id", component: TransportItineraryDetail },
  { path: "/fleet/transport/route-patterns", component: TransportRoutePatterns },
  { path: "/me/driver/navigation", component: MeDriverNavigation },
  // أجر السائق بالساعة — ساعات العمل (قبل /fleet/:id كي لا يُطابَق كمعرّف).
  { path: "/fleet/driver-work-hours", component: DriverWorkHours },
  { path: "/fleet/movement-bonuses", component: MovementBonuses },
  { path: "/fleet/:id/status", component: VehicleStatusChange },
  { path: "/fleet/:id", component: VehicleDetail },
];
