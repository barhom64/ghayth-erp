export interface EntityFeatures {
  attachments: boolean;
  financialImpact: boolean;
  financialEntityType?: string;
  approval: boolean;
  comments: boolean;
  tags: boolean;
  timeline: boolean;
  tasks: boolean;
}

const defaults: EntityFeatures = {
  attachments: true,
  financialImpact: false,
  approval: false,
  comments: true,
  tags: true,
  timeline: true,
  tasks: true,
};

const FEATURES: Record<string, Partial<EntityFeatures>> = {
  employee:           { financialImpact: true, financialEntityType: "employee" },
  employee_contract:  { financialImpact: true, financialEntityType: "contract", approval: true },
  leave_request:      { approval: true },
  attendance:         { attachments: false },
  overtime_request:   { attachments: false, financialImpact: true, approval: true },
  official_letter:    { approval: true },
  loan:               { financialImpact: true, approval: true },
  exit_request:       { financialImpact: true, approval: true },
  transfer:           { attachments: false, approval: true },
  excuse_request:     { attachments: false, approval: true },
  discipline_memo:    { financialImpact: true, approval: true },
  payroll_run:        { financialImpact: true, approval: true },
  shift:              { attachments: false, financialImpact: false, tags: false, tasks: false },
  evaluation_cycle:   { attachments: false },
  training_program:   {},
  job_posting:        {},

  invoice:            { financialImpact: true, approval: true },
  journal_entry:      { financialImpact: true, approval: true },
  purchase_request:   { approval: true },
  purchase_order:     { financialImpact: true, approval: true },
  expense_claim:      { financialImpact: true, approval: true },
  budget:             { approval: true },
  custody:            { financialImpact: true, financialEntityType: "employee", approval: true },
  salary_advance:     { attachments: false, financialImpact: true, approval: true },
  payment_voucher:    { financialImpact: true, approval: true },
  vendor:             { financialImpact: true, financialEntityType: "vendor" },
  chart_of_account:   { attachments: false, tags: false, tasks: false },
  recurring_journal:  { attachments: false },

  vehicle:            { financialImpact: true, financialEntityType: "vehicle" },
  fleet_trip:         { attachments: false },
  fleet_maintenance:  { financialImpact: true },
  fuel_log:           { financialImpact: true },
  insurance_policy:   { financialImpact: true },

  building:           {},
  property_unit:      { financialImpact: true, financialEntityType: "property" },
  rental_contract:    { financialImpact: true, financialEntityType: "contract" },
  maintenance_request:{ financialImpact: true, approval: true },

  legal_case:         { financialImpact: true },
  legal_contract:     {},

  client:             { financialImpact: true, financialEntityType: "client" },
  crm_opportunity:    {},

  support_ticket:     {},
  warehouse_product:  { financialImpact: true, financialEntityType: "product" },
  inventory_count:    { approval: true },

  store_order:        { attachments: false, financialImpact: true },
  project:            { financialImpact: true, financialEntityType: "project" },
  task:               {},
  document:           {},

  umrah_sales_invoice:{ financialImpact: true },
  umrah_pilgrim:      {},
  umrah_season:       { attachments: false },
  governance_policy:  {},

  crm_lead:           {},
  account:            { attachments: false, tags: false, tasks: false },
  audit:              {},
  commitment:         { financialImpact: true, approval: true },
  compliance:         { approval: true },
  correspondence:     {},
  driver:             {},
  "financial-request":{ financialImpact: true, approval: true },
  "fixed-asset":      { financialImpact: true },
  "legal-judgment":   {},
  "legal-session":    { attachments: false },
  owner:              {},
  policy:             {},
  "property-maintenance": { financialImpact: true },
  "property-payment": { financialImpact: true },
  receivable:         { financialImpact: true },
  request:            { approval: true },
  risk:               {},
  tenant:             { financialImpact: true },
  "traffic-violation":{ financialImpact: true },
  "umrah-agent":      {},
  "umrah-invoice":    { financialImpact: true },
  "umrah-package":    {},
  "umrah-penalty":    { financialImpact: true },
  "umrah-transport":  {},
  violation:          { approval: true },
  voucher:            { financialImpact: true, approval: true },
  "warehouse-category":{ attachments: false, tags: false, tasks: false },
  "warehouse-movement":{ attachments: false },
  "warehouse-supplier":{},
  "project-costing":  { financialImpact: true },
  "evaluation-360":   { attachments: false },
  "hr-evaluation-360":{ attachments: false },
  pilgrim:            {},
  transport:          {},
};

export function getEntityFeatures(entityType: string): EntityFeatures {
  const overrides = FEATURES[entityType];
  if (!overrides) return { ...defaults };
  return { ...defaults, ...overrides };
}
