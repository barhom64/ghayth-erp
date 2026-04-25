// ─── Domain Registry — السجل المركزي لمسارات النظام ─────────────────────
// Single source of truth mapping each business domain to its:
//   • database tables
//   • engines used
//   • event actions emitted/consumed
//   • permissions required
//   • lifecycle entities
//   • cron jobs
//
// This replaces the "each module is an island" pattern with a unified
// registry that governance, auditing, and monitoring can query.

export interface DomainDefinition {
  id: string;
  label: string;
  tables: string[];
  engines: string[];
  permissions: string[];
  lifecycleEntities: string[];
  eventPrefix: string;
  cronJobs: string[];
  glIntegration: boolean;
  obligationTypes: string[];
  routeFile: string;
}

export const DOMAIN_REGISTRY: DomainDefinition[] = [
  {
    id: "hr",
    label: "الموارد البشرية",
    tables: [
      "employees", "employee_assignments", "hr_leave_requests", "hr_attendance_records",
      "hr_overtime_requests", "hr_official_letters", "hr_loans", "hr_exit_requests",
      "hr_transfers", "payroll_runs", "payroll_lines", "hr_discipline_memos",
      "hr_evaluation_cycles", "hr_individual_development_plans", "hr_company_documents",
      "hr_approval_chain_definitions", "hr_attendance_policies", "onboarding_tasks",
    ],
    engines: ["hrEngine", "disciplineEngine", "lifecycleEngine", "workflowEngine", "obligationsEngine"],
    permissions: ["hr:read", "hr:create", "hr:update", "hr:write", "hr:delete", "hr:approve", "hr:self", "hr:discipline:read", "hr:discipline:create", "hr:discipline:update", "hr:discipline:approve"],
    lifecycleEntities: ["hr_leave_requests", "hr_exit_requests", "hr_discipline_memos", "hr_transfers"],
    eventPrefix: "hr.",
    cronJobs: ["attendance_anomaly_scan", "leave_balance_check", "contract_expiry_check"],
    glIntegration: true,
    obligationTypes: ["gosi_submission", "contract_renewal", "residency_expiry", "license_expiry"],
    routeFile: "hr.ts",
  },
  {
    id: "finance",
    label: "المالية والمحاسبة",
    tables: [
      "invoices", "journal_entries", "journal_lines", "chart_of_accounts",
      "financial_periods", "budgets", "budget_lines", "payment_vouchers",
      "purchase_requests", "purchase_orders", "purchase_order_items",
      "custodies", "cost_centers", "subsidiary_accounts",
      "financial_posting_failures", "recurring_journals",
    ],
    engines: ["financialEngine", "lifecycleEngine", "obligationsEngine", "rulesEngine"],
    permissions: ["finance:read", "finance:create", "finance:update", "finance:write", "finance:delete", "finance:approve"],
    lifecycleEntities: ["invoices", "purchase_orders", "purchase_requests", "journal_entries", "budgets", "financial_periods"],
    eventPrefix: "finance.",
    cronJobs: ["overdue_invoice_scan", "recurring_journal_run", "budget_utilization_check"],
    glIntegration: true,
    obligationTypes: ["invoice_payment", "tax_declaration", "period_close"],
    routeFile: "finance-invoices.ts",
  },
  {
    id: "fleet",
    label: "إدارة الأسطول",
    tables: [
      "fleet_vehicles", "fleet_trips", "fleet_trip_waypoints",
      "fleet_fuel_logs", "fleet_maintenance", "fleet_insurance_policies",
      "fleet_traffic_violations", "fleet_drivers", "fleet_preventive_plans",
    ],
    engines: ["fleetEngine", "lifecycleEngine", "obligationsEngine"],
    permissions: ["fleet:read", "fleet:create", "fleet:update", "fleet:delete"],
    lifecycleEntities: ["fleet_trips", "fleet_maintenance"],
    eventPrefix: "fleet.",
    cronJobs: ["preventive_maintenance_due", "insurance_expiry_check", "vehicle_license_check"],
    glIntegration: true,
    obligationTypes: ["vehicle_maintenance", "insurance_renewal", "license_renewal"],
    routeFile: "fleet.ts",
  },
  {
    id: "property",
    label: "إدارة العقارات",
    tables: [
      "property_buildings", "property_units", "rental_contracts",
      "rent_payments", "maintenance_requests", "property_inspections",
      "property_owners", "property_security_deposits",
    ],
    engines: ["propertiesEngine", "lifecycleEngine", "obligationsEngine"],
    permissions: ["property:read", "property:create", "property:update", "property:delete"],
    lifecycleEntities: ["property_contracts", "maintenance_requests"],
    eventPrefix: "property.",
    cronJobs: ["contract_expiry_reminder", "rent_due_reminder"],
    glIntegration: true,
    obligationTypes: ["rent_collection", "contract_renewal", "maintenance_completion"],
    routeFile: "properties.ts",
  },
  {
    id: "legal",
    label: "الشؤون القانونية",
    tables: [
      "legal_cases", "legal_sessions", "legal_contracts",
      "legal_correspondences", "legal_judgments",
    ],
    engines: ["legalEngine", "lifecycleEngine", "obligationsEngine"],
    permissions: ["legal:read", "legal:create", "legal:update", "legal:write", "legal:delete"],
    lifecycleEntities: ["legal_cases", "legal_contracts"],
    eventPrefix: "legal.",
    cronJobs: ["hearing_reminder", "contract_expiry_scan"],
    glIntegration: true,
    obligationTypes: ["hearing_preparation", "contract_renewal", "judgment_follow_up"],
    routeFile: "legal.ts",
  },
  {
    id: "umrah",
    label: "إدارة العمرة",
    tables: [
      "umrah_seasons", "umrah_packages", "umrah_pricing_tiers",
      "umrah_agents", "umrah_sub_agents", "umrah_pilgrims",
      "umrah_sales_invoices", "umrah_sales_invoice_items",
      "umrah_payments", "umrah_transport_assignments",
      "umrah_commission_plans", "umrah_commissions",
      "umrah_violations", "umrah_agent_invoices",
      "umrah_import_batches", "umrah_import_changes",
    ],
    engines: ["umrahInvoicingEngine", "umrahCommissionEngine", "umrahImportEngine", "obligationsEngine"],
    permissions: ["umrah:read", "umrah:write"],
    lifecycleEntities: ["umrah_sales_invoices"],
    eventPrefix: "umrah.",
    cronJobs: ["season_auto_close", "commission_auto_calculate"],
    glIntegration: true,
    obligationTypes: ["visa_processing", "transport_assignment", "commission_settlement"],
    routeFile: "umrah.ts",
  },
  {
    id: "crm",
    label: "إدارة العملاء",
    tables: ["clients", "crm_opportunities", "crm_activities"],
    engines: ["crmEngine", "lifecycleEngine"],
    permissions: ["crm:read", "crm:create", "crm:update", "crm:write", "crm:delete"],
    lifecycleEntities: ["crm_opportunities"],
    eventPrefix: "crm.",
    cronJobs: ["follow_up_reminder", "deal_stale_check"],
    glIntegration: true,
    obligationTypes: ["follow_up", "proposal_deadline"],
    routeFile: "crm.ts",
  },
  {
    id: "support",
    label: "الدعم الفني",
    tables: ["support_tickets", "support_replies", "support_kb_articles"],
    engines: ["obligationsEngine"],
    permissions: ["support:read", "support:create", "support:update", "support:write", "support:delete"],
    lifecycleEntities: ["support_tickets"],
    eventPrefix: "support.",
    cronJobs: ["sla_breach_scan", "csat_follow_up"],
    glIntegration: true,
    obligationTypes: ["sla_deadline", "first_response"],
    routeFile: "support.ts",
  },
  {
    id: "warehouse",
    label: "المستودعات",
    tables: [
      "warehouse_products", "warehouse_movements", "warehouse_categories",
      "warehouse_suppliers", "warehouse_inventory_counts",
    ],
    engines: [],
    permissions: ["warehouse:read", "warehouse:create", "warehouse:update", "warehouse:delete"],
    lifecycleEntities: [],
    eventPrefix: "warehouse.",
    cronJobs: ["low_stock_alert", "expiry_check"],
    glIntegration: true,
    obligationTypes: ["reorder_point"],
    routeFile: "warehouse.ts",
  },
  {
    id: "projects",
    label: "إدارة المشاريع",
    tables: [
      "projects", "project_phases", "project_milestones",
      "project_costs", "project_resources", "project_risks",
    ],
    engines: ["lifecycleEngine"],
    permissions: ["projects:read", "projects:create", "projects:update", "projects:delete"],
    lifecycleEntities: [],
    eventPrefix: "project.",
    cronJobs: ["milestone_reminder", "budget_overrun_check"],
    glIntegration: true,
    obligationTypes: ["milestone_deadline", "budget_review"],
    routeFile: "projects.ts",
  },
  {
    id: "governance",
    label: "الحوكمة والامتثال",
    tables: [
      "governance_policies", "governance_risks", "governance_audits",
      "governance_compliance_items", "governance_capa",
    ],
    engines: ["obligationsEngine"],
    permissions: ["governance:read", "governance:write"],
    lifecycleEntities: ["governance_policies"],
    eventPrefix: "governance.",
    cronJobs: ["compliance_due_scan", "risk_reassessment"],
    glIntegration: false,
    obligationTypes: ["compliance_deadline", "audit_follow_up", "risk_review"],
    routeFile: "governance.ts",
  },
  {
    id: "store",
    label: "المتجر الإلكتروني",
    tables: ["store_products", "store_orders", "store_order_items"],
    engines: ["storeEngine"],
    permissions: ["store:read", "store:write"],
    lifecycleEntities: [],
    eventPrefix: "store.",
    cronJobs: [],
    glIntegration: true,
    obligationTypes: ["order_fulfillment"],
    routeFile: "store.ts",
  },
  {
    id: "training",
    label: "التدريب والتطوير",
    tables: ["training_programs", "training_enrollments"],
    engines: ["obligationsEngine"],
    permissions: [],
    lifecycleEntities: [],
    eventPrefix: "training.",
    cronJobs: ["enrollment_reminder"],
    glIntegration: false,
    obligationTypes: ["program_deadline"],
    routeFile: "hr.ts",
  },
  {
    id: "recruitment",
    label: "التوظيف",
    tables: ["job_postings", "job_applications"],
    engines: [],
    permissions: [],
    lifecycleEntities: [],
    eventPrefix: "recruitment.",
    cronJobs: ["posting_expiry_check"],
    glIntegration: false,
    obligationTypes: [],
    routeFile: "hr.ts",
  },
];

const _domainIndex = new Map<string, DomainDefinition>(
  DOMAIN_REGISTRY.map((d) => [d.id, d])
);

export function getDomain(id: string): DomainDefinition | undefined {
  return _domainIndex.get(id);
}

export function getDomainsWithGL(): DomainDefinition[] {
  return DOMAIN_REGISTRY.filter((d) => d.glIntegration);
}

export function getDomainsUsingEngine(engine: string): DomainDefinition[] {
  return DOMAIN_REGISTRY.filter((d) => d.engines.includes(engine));
}

export function getAllTables(): string[] {
  return DOMAIN_REGISTRY.flatMap((d) => d.tables);
}

export function findDomainByTable(table: string): DomainDefinition | undefined {
  return DOMAIN_REGISTRY.find((d) => d.tables.includes(table));
}

export function getSystemStats() {
  return {
    domains: DOMAIN_REGISTRY.length,
    tables: new Set(DOMAIN_REGISTRY.flatMap((d) => d.tables)).size,
    permissions: new Set(DOMAIN_REGISTRY.flatMap((d) => d.permissions)).size,
    engines: new Set(DOMAIN_REGISTRY.flatMap((d) => d.engines)).size,
    cronJobs: DOMAIN_REGISTRY.reduce((s, d) => s + d.cronJobs.length, 0),
    obligationTypes: new Set(DOMAIN_REGISTRY.flatMap((d) => d.obligationTypes)).size,
    glDomains: DOMAIN_REGISTRY.filter((d) => d.glIntegration).length,
  };
}
