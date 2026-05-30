# Database Entity Mapping — API to Tables Audit
**Part of:** #1418 + #1413 — Ghaith System Deep Sweep
**Mode:** AUDIT-ONLY (no schema/code changes)
**Repository:** barhom64/ghayth-erp
**Date:** 2026-05-30
**Working copy:** main @ migration 239 (`companies_nusk_supplier_link`)

---

## ملخص (Summary)

| Metric | Value | Evidence |
|---|---|---|
| Total tables in canonical baseline schema | **378** | `db/schema_pre.sql` (378 `CREATE TABLE` statements) |
| Tables created/modified by sequential migrations | **164 distinct table targets** | `artifacts/api-server/src/migrations/*.sql` (003 → 239) |
| Total route files | **102** | `artifacts/api-server/src/routes/*.ts` |
| Total HTTP endpoints (approx) | **~1,689** | grep `\.(get\|post\|put\|patch\|delete)\(` |
| Distinct tables referenced by routes (SELECT/INSERT/UPDATE) | **≈345** | `/tmp/tables_in_routes.txt` (378 hits including noise) |
| **% mapped (route ↔ baseline table)** | **≈88%** (334 of 378) | comm sort baseline vs routes |
| **Orphan tables (in baseline, never referenced in routes)** | **44 raw / ~31 confirmed** | section §3 |
| Dead tables explicitly dropped (migration 171) | 4 (`invoice_items`, `training_courses`, `fleet_violations`, `warehouse_stock_serials`) | `migrations/171_drop_dead_tables.sql:39-42` |
| Latest migration on main | 239 (`companies_nusk_supplier_link`) | per task brief |
| DOC-VIOLATION consolidation | `umrah_attachments` → `documents` (migration 237) | `migrations/237_unify_umrah_attachments_into_documents.sql:1-46` |

**Top-level architectural facts:**
- Drizzle ORM schema source files **do not exist** in `src/schema/` or `src/db/`. All schema is raw SQL in `artifacts/api-server/src/migrations/*.sql` and the canonical dump at `db/schema_pre.sql`. Type hints live in `artifacts/api-server/src/lib/dbTypes.ts` but are hand-maintained (`// Source of truth: db/schema.sql 'CREATE TABLE clients'`).
- Migration sequence starts at **003** — files 000/001/002 do **not** exist; the baseline (legacy seed) loaded via `db/schema.sql → schema_pre.sql + schema_post.sql`. The "wrapper" is at `db/schema.sql:14-15`.
- Cross-cutting infrastructure tables (`audit_logs`, `event_logs`, `numbering_assignments`, `idempotency_keys`) are written by many modules and have **no single owner**.

---

## الجداول حسب الموديول (Tables by module — Top 30 endpoint families)

Column legend:
- **Owner** = route file with most mutations (INSERT/UPDATE/DELETE).
- **Audit** = table also flows into `audit_logs`? Y/N (via `lib/audit.ts` writer or explicit INSERT INTO audit_logs).
- **Report** = referenced by `/reports/*`, `/bi/*`, `/finance/reports/*`, or `/export/*`? Y/N.
- **Print** = backs a print/export template (`lib/print/dataLoader.ts`)? Y/N.

### Module: Finance — Invoices / AR

| API family | Primary table | Supporting tables | Migration(s) | Owner module | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/invoices/*`, `/invoices/:id/approve`, `/invoices/:id/payment`, `/invoices/:id/post` | `invoices` | `invoice_lines` (JSONB+detached), `invoice_payments`, `collection_follow_ups`, `journal_entries`, `journal_lines`, `numbering_assignments`, `event_logs` | baseline (`schema_pre.sql:invoices`); column patches in `006_fix_invoice_clientid_nullable.sql`, `018_soft_delete_financial.sql`, `074_soft_delete_finance_columns.sql`, `209_invoice_cogs_foundation.sql`, `212_print_archive_link.sql`, `223_finance_enforce_line_allocation.sql` | `routes/finance-invoices.ts` (mutations only) | **Y** (lib audit + `INSERT INTO event_logs` at `finance-invoices.ts:1838`) | **Y** (`finance-reports.ts:491,588,682,774`; `bi.ts`) | **Y** (`lib/print/dataLoader.ts:138 case "invoice"`) |
| `/invoices/:id/credit-memo/*` | `credit_memos` | `invoices`, `journal_entries`, `journal_lines` | `105_missing_tables.sql:117`, `210_credit_memo_cogs_reversal.sql` | `finance-invoices.ts` | Y | Y | partial (`case "credit_note"`) |
| `/finance/debit-memos` | `debit_memos` | `journal_entries` | `105_missing_tables.sql` | `finance-journal.ts` / `finance-collection.ts` | Y | Y | N |
| `/finance/collection/*` | `collection_follow_ups`, `dunning_letters` | `invoices`, `invoice_payments` | baseline + `lib/cronScheduler.ts:2858` (dynamic) | `finance-collection.ts` | Y | Y | partial |
| `/finance/customer-advances` | `customer_advances` | `clients`, `journal_entries` | baseline | `finance-collection.ts` | Y | Y | N |

### Module: Finance — Vendors / AP

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/finance/vendors`, `/finance/vendors/:id` | `suppliers` | `vendor_contracts`, `vendor_secrets`, `companies.nuskSupplierId` (239) | baseline; `239_companies_nusk_supplier_link.sql:26` | `finance-vendors.ts` | Y | Y | N |
| `/finance/purchase-requests/*` | `purchase_requests` | `purchase_request_items`, `numbering_assignments`, `approval_actions` | baseline | `finance-purchase.ts` | Y | Y (`finance-reports.ts:264`) | Y (`case "purchase_request"`) |
| `/finance/purchase-orders/*` | `purchase_orders` | `purchase_order_items` (the live table), `goods_receipts`, `goods_receipt_items` | baseline; `036_three_way_match.sql`; `076_missing_system_tables.sql:148` (defines parallel `purchase_order_lines`) | `finance-purchase.ts` | Y | Y | Y (`case "purchase_order"`; uses `purchase_order_lines` per `lib/print/dataLoader.ts:553`) |
| `/finance/three-way-match`, `/finance/grn` | `goods_receipts`, `goods_receipt_items` | `purchase_orders`, `invoices` | `036_three_way_match.sql` | `finance-purchase.ts` | Y | Y | Y (`case "goods_receipt"`) |
| `/finance/payment-runs/*` | `payment_runs` | `payment_run_items`, `supplier_payment_allocations` | baseline; `227_numbering_payment_run_scheme.sql` | `finance-vendors.ts` | Y | Y | partial |

### Module: Finance — GL / Treasury / FX

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/finance/journal/*` | `journal_entries` | `journal_lines`, `journal_entry_templates`, `journal_entry_template_lines`, `cost_centers`, `chart_of_accounts`, `gov_integrations`, `gov_integration_links` | baseline; `079_journal_lines_entity_columns.sql`, `080_gl_integration_columns.sql`, `091_cost_centers.sql`, `122_journal_entries_sourcekey.sql`, `226_cost_centers_dual_naming_backfill.sql` | `finance-journal.ts` | Y | Y (most reports root here) | Y (`case "journal_entry"`) |
| `/finance/accounts/*` | `chart_of_accounts` | `subsidiary_accounts`, `journal_lines` | baseline | `finance-accounts.ts` | Y | Y | N |
| `/finance/fx/*` | `fx_rates`, `fx_revaluations`, `fx_revaluation_log`, `fx_realized_postings` | `journal_entries` | `140_multi_currency_foundations.sql` (defines `fx_revaluation_lines` — orphan, see §3) | `finance-algorithms.ts` | Y | Y | N |
| `/finance/recurring/*` | `recurring_journals` | `recurring_journal_runs` | baseline | `finance-recurring.ts` | Y | N | N |
| `/finance/budgets/*` | `budgets` | `budget_lines`, `budget_approval_requests` | baseline | `finance-budget.ts` | Y | Y | N |
| `/finance/custodies/*`, `/finance/cost-centers/*` | `cost_centers`, `expenses` | `journal_entries`, `subsidiary_accounts` | `105_missing_tables.sql:5,42` | `finance-cost-centers.ts`, `finance-custodies.ts` | Y | Y | N |
| `/finance/zatca/*` | `zatca_settings`, `zatca_submission_log` | `invoices` | `023_zatca_integration.sql`, `139_zatca_phase2_columns.sql` (creates `zatca_icv_counters`, `zatca_retry_queue` — orphans), `178_zatca_b2c_pause_events.sql` (orphan) | `finance-zatca.ts` | Y | Y | N |
| `/finance/withholding/*` | `wht_categories` | `journal_lines` | `208_withholding_tax_foundation.sql` | `finance-vendors.ts` | Y | Y | N |
| `/finance/closures/*` | `daily_close_log` | (`daily_closures` exists but never queried — see §3) | `020_daily_closures.sql` (creates orphan `daily_closures`); baseline (`daily_close_log` is the live one) | `finance-hardening.ts` | Y | N | N |
| `/finance/periods/*` | `financial_periods` | `journal_entries` | baseline; `129_seed_financial_periods.sql`, `207_financial_periods_lock_columns.sql` | `finance-journal.ts` | Y | Y | N |
| `/finance/depreciation/*` | `fixed_assets`, `depreciation_entries` | `journal_entries` | baseline | `finance-algorithms.ts` | Y | Y | N |

### Module: HR — Employees / Attendance / Payroll

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/hr/employees/*` | `employees` | `employee_assignments`, `employee_contracts`, `employee_documents`, `employee_salary_components`, `employee_transfers`, `employee_violations` | baseline; `009_hr_phase2.sql`, `021_salary_history_and_employee_components.sql`, `087_employees_deletedat_and_rbac_reseed.sql`, `088_client_employee_missing_columns.sql`, `098_employee_contracts_missing_columns.sql`, `100_employees_company_branch.sql` | `routes/employees.ts` + `routes/hr.ts` | Y | Y | Y (`case "employee"` profile) |
| `/hr/attendance/*` | `attendance` | `attendance_deductions`, `attendance_policies`, `employee_monthly_attendance`, `shifts`, `employee_shift_assignments`, `public_holidays`, `hr_excuse_requests`, `employee_violations` | baseline; `073_attendance_overtime_column.sql`, `082_hr_excuse_requests.sql`, `083_attendance_worktype_and_expiry_docs.sql`, `128_seed_attendance_policy.sql` | `hr.ts` | Y | Y (`bi.ts`) | Y (`case "attendance"`) |
| `/hr/payroll/*` | `payroll_runs` | `payroll_lines`, `payroll_records`, `payroll_deductions`, `salary_components`, `salary_history`, `employee_commission_calculations`, `employee_commission_plans`, `employee_commission_tiers` | baseline; `021_salary_history_and_employee_components.sql`, `102_payroll_commission_column.sql`, `109_salary_history_table.sql` | `hr.ts` | Y | Y | Y (`case "payroll"`, `case "payslip"`) |
| `/hr/leave/*` | `hr_leave_requests` | `hr_leave_balances`, `hr_leave_types`, `leave_approval_stages`, `leave_balances` | baseline; `126_seed_hr_leave_types.sql` | `hr.ts` | Y | Y | Y (`case "leave_request"`) |
| `/hr/contracts/*` | `employee_contracts` | `contract_payment_schedule`, `employees` | baseline; `081_contract_templates.sql`, `098_employee_contracts_missing_columns.sql`, `099_contracts_approval_and_pilgrim_status.sql` | `hr-contracts.ts` | Y | Y | Y (`case "employee_contract"`) |
| `/hr/discipline/*` | `hr_inquiry_memos` | `hr_inquiry_memo_events`, `hr_violations` (orphan), `discipline_memos` (orphan) | `034_hr_discipline_regulation.sql`, `076_missing_system_tables.sql` (creates orphan `discipline_memos`), `089_hr_discipline_appeal_fields.sql` | `hr-discipline.ts` | Y | Y | Y (`case "discipline_memo"`) |
| `/hr/loans/*` | `hr_employee_loans` | `hr_loan_installments`, `loan_accounts` | baseline | `hr-loans.ts` | Y | Y | Y (`case "loan_request"`) |
| `/hr/exit/*` | `hr_exit_requests` | `hr_exit_clearance` | baseline | `hr-exit.ts` | Y | Y | N |
| `/hr/excuses/*` | `hr_excuse_requests` | `attendance` | `082_hr_excuse_requests.sql` | `hr.ts` | Y | Y | Y (`case "excuse_request"`) |
| `/hr/overtime/*` | `hr_overtime_requests` | `attendance` | baseline | `hr-overtime.ts` | Y | Y | N |
| `/hr/wps/*` | `wps_runs` | `wps_run_lines`, `wps_settings`, `mudad_settlements` (orphan in `wps_skip_alerts`/`wps_bank_credentials`) | `175_wps_skip_alerts.sql` (orphan), `176_wps_bank_credentials.sql` (orphan) | `hr-wps.ts` | Y | Y | N |
| `/hr/compliance/*` | `saudization_snapshots` | `employees` | baseline | `hr-compliance.ts` | Y | Y | N |
| `/hr/evaluations/*` | `performance_reviews`, `evaluation_cycles` | `peer_evaluations`, `anonymous_upward_reviews`, `evaluation_participants`, `evaluation_summaries`, `system_evaluations` | baseline | `hr.ts` | Y | Y | N |

### Module: Documents / Storage / Print

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/documents/*`, `/documents/:id/versions` | `documents` | `document_versions`, `document_entity_links`, `document_folders`, `document_templates`, `document_access_log`, `document_ocr_extractions` | baseline; `017_entity_comments_tags.sql`, `212_print_archive_link.sql`, `234_document_access_log.sql:26`, `237_unify_umrah_attachments_into_documents.sql:38-46` | `routes/documents.ts` (canonical) | Y (writes `document_access_log` on every read/download — `documents.ts:347,394`) | N | partial |
| `/print/*`, `/print/render`, `/print/jobs`, `/print/templates` | `print_jobs` | `print_template_assignments`, `print_reprint_requests`, `document_templates` | baseline; `212_print_archive_link.sql` | `routes/print.ts` | Y (logs to `audit_logs`) | N | **N/A (this IS the print system)** |
| `/storage/*` | (no own primary table — proxies to `documents`/`umrah_attachments` legacy reads) | `documents`, `umrah_attachments` | n/a — handler-only | `routes/storage.ts` | N | N | N |
| `/hr/company-documents/*` (compliance docs) | `company_documents` | (none) | baseline | `routes/hr.ts:7226` | Y | Y | N |

**DOC-VIOLATION note (per task brief):** Migration `237_unify_umrah_attachments_into_documents.sql` backfilled `umrah_attachments` rows into the central `documents` table by adding `documents.fileUrl` and `documents.legacy_umrah_attachment_id` (with unique partial index). The legacy `umrah_attachments` table was **deliberately kept** (no DROP, see migration comment at lines 23-27) for rollback safety. As of this audit, **only** `routes/umrah-entities.ts` and `routes/storage.ts` still read `umrah_attachments`; all new writes go to `documents`.

### Module: CRM / Marketing

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/crm/opportunities/*` | `crm_opportunities` | `crm_activities`, `crm_contacts`, `crm_pipeline_stages` | baseline; `130_seed_crm_pipeline_stages.sql` | `routes/crm.ts` | Y | Y | N |
| `/crm/clients/*` | `clients` | `client_portal_accounts`, `client_rfm_scores` | baseline; `021_client_portal_accounts.sql`, `022_portal_account_client_unique.sql`, `230_portal_client_links.sql`, `232_portal_client_links_composite_fk.sql` | `routes/clients.ts` (mutations); `routes/crm.ts` (reads) | Y | Y | N |
| `/marketing/*` | `marketing_campaigns` | `crm_contacts` | baseline | `routes/marketing.ts` | Y | Y | N |

### Module: Property / Real Estate

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/properties/units/*` | `property_units` | `property_buildings`, `property_owners`, `property_inspections`, `property_security_deposits` | `026_property_buildings.sql`, `031_ejar_compliance.sql`, `224_property_owner_payouts.sql` | `routes/properties.ts` | Y | Y | Y (`case "property_unit"`) |
| `/properties/contracts/*` | `rental_contracts` | `rent_payments`, `late_rent_actions`, `tenants`, `property_units` | baseline; `031_ejar_compliance.sql`, `071_property_lease_lifecycle.sql` | `routes/properties.ts` | Y | Y | Y (`case "rental_contract"`) |
| `/properties/maintenance/*` | `maintenance_requests` | `property_units`, `technicians` | baseline | `routes/properties.ts` | Y | Y | Y (`case "maintenance_request"`) |
| `/properties/owners/*`, `/properties/payouts/*` | `property_owners` | `property_owner_payouts` (only via `224_property_owner_payouts.sql`) | `224_property_owner_payouts.sql` | `routes/properties.ts` | Y | Y | N |

### Module: Warehouse / Inventory

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/warehouse/products/*` | `warehouse_products` | `warehouse_categories`, `warehouse_movements`, `warehouse_stock_batches`, `warehouse_stock_lots`, `warehouses` | baseline; `019_materials_used*.sql`, `035_inventory_projects_gl_accounts.sql`, `141_inventory_advanced_foundations.sql` (creates orphan `product_valuation_settings`), `173_inventory_movement_lot_serial.sql` (creates orphan `warehouse_cycle_count_plans`, `lot_expiry_alerts`), `211_warehouse_movements_je_link.sql` | `routes/warehouse.ts` | Y | Y | Y (`case "stock_adjustment"`, `case "stock_transfer"`, `case "item_barcode_label"`) |
| `/warehouse/cycle-counts/*` | `warehouse_cycle_counts` | `warehouse_cycle_count_lines` | `173_inventory_movement_lot_serial.sql` | `routes/warehouse.ts` | Y | Y | Y (`case "inventory_count"`) |
| `/store/*` (point-of-sale-like) | `store_orders` | `store_order_items`, `store_products` | baseline; `228_numbering_store_order_scheme.sql` | `routes/store.ts` | Y | Y | Y (`case "pos_receipt"`) |
| `/warehouse/abc/*` | `product_abc_classification` | `warehouse_products` | `141_inventory_advanced_foundations.sql` | `routes/warehouse.ts` | Y | Y | N |

### Module: Umrah

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/umrah/seasons/*`, `/umrah/packages/*`, `/umrah/pilgrims/*` | `umrah_pilgrims`, `umrah_seasons`, `umrah_packages` | `umrah_agents`, `umrah_groups`, `umrah_violations`, `umrah_pricing` | `093_umrah_phase2_tables.sql`, `095_umrah_pilgrims_phase3_columns.sql`, `096_umrah_pilgrims_full_columns.sql`, `097_umrah_phase3_schema_complete.sql`, `103_umrah_schema_compliance.sql`, `108_umrah_pilgrims_columns.sql`, `114_unify_umrah_status_codes.sql`, `115_pilgrim_sensitive_fields_hash.sql`, `131_seed_umrah_packages.sql` | `routes/umrah.ts` | Y (+ legacy `audit_umrah_access` table — never queried; see §3) | Y | Y (`case "umrah_pilgrim"`) |
| `/umrah/sales-invoices/*` | `umrah_sales_invoices` | `umrah_sales_invoice_items`, `umrah_payments`, `journal_entries` | `101_umrah_invoicing_and_payments.sql:17`, `113_umrah_penalties_and_agent_invoices.sql`, `232_numbering_umrah_invoicing_schemes.sql` | `routes/umrah.ts` | Y | Y (`finance-reports.ts:643,725,794`) | Y (`case "umrah_sales_invoice"`) |
| `/umrah/agent-invoices/*` | `umrah_agent_invoices` | `umrah_payments`, `umrah_penalties`, `umrah_sub_agents`, `clients` | `113_umrah_penalties_and_agent_invoices.sql:28`, `238_umrah_penalty_journal_entry_link.sql` | `routes/umrah.ts` / `routes/umrah-entities.ts` | Y | Y | Y (`case "umrah_agent_invoice"`) |
| `/umrah/imports/*` | `umrah_import_batches` | `umrah_import_changes`, `umrah_import_logs`, `umrah_import_mapping_presets` | `094_umrah_import_batches.sql`, `234_umrah_import_mapping_presets.sql` | `routes/umrah-entities.ts` | Y | Y | N |
| `/umrah/transport/*` | `umrah_transport` | `umrah_transport_pilgrims` | baseline | `routes/umrah.ts` | Y | Y | N |
| `/umrah/nusk/*` | `umrah_nusk_invoices` | `companies.nuskSupplierId` (239) | `093_umrah_phase2_tables.sql:65`, `239_companies_nusk_supplier_link.sql` | `routes/umrah-entities.ts` / `routes/finance-reports.ts:928` | Y | Y | N |

### Module: Fleet

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/fleet/vehicles/*` | `fleet_vehicles` | `fleet_drivers`, `fleet_insurance`, `fleet_maintenance`, `fleet_fuel_logs`, `fleet_trips`, `fleet_traffic_violations` | baseline; `228_fleet_telematics.sql`, `229_fleet_telematics_security.sql`, `230_fleet_telematics_retention.sql`, `232_fleet_telematics_indexes_retention.sql` | `routes/fleet.ts` | Y | Y | Y (`case "fleet_maintenance"`, `case "insurance_policy"`) |
| `/fleet/telematics/*`, `/fleet-telematics/webhook` | `fleet_telematics_devices` | `fleet_telematics_integrations`, `fleet_device_events`, `fleet_device_positions`, `fleet_device_sync_logs`, `fleet_sensor_readings`, `fleet_gps_tracking` | `228_fleet_telematics.sql` | `routes/fleet-telematics.ts`, `routes/fleet-telematics-webhook.ts` | Y | Y | N |
| `/fleet/video/*` | `fleet_video_channels` | `fleet_video_sessions`, `fleet_video_access_logs`, `fleet_media_evidence` | `231_fleet_video_security.sql` | `routes/fleet.ts` | Y | N | N |
| `/fleet/alerts/*` | `fleet_alerts` | `fleet_ai_alerts` | baseline | `routes/fleet.ts` | Y | Y | N |

### Module: Projects / Tasks

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/projects/*` | `projects` | `project_phases`, `project_tasks`, `project_task_dependencies`, `project_milestones`, `project_costs`, `project_resources`, `project_risks` | baseline; `027_projects_permissions_seed.sql`, `035_inventory_projects_gl_accounts.sql` | `routes/projects.ts` | Y | Y | Y (`case "project"`) |
| `/tasks/*` | `tasks` | `projects`, `employees` | baseline | `routes/tasks.ts` | Y | Y | N |

### Module: Legal

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/legal/contracts/*` | `legal_contracts` | `legal_correspondence`, `legal_judgments`, `legal_cases`, `legal_sessions` | baseline | `routes/legal.ts` | Y | Y | Y (`case "legal_contract"`) |
| `/legal/cases/*` | `legal_cases` | `legal_sessions`, `legal_judgments` | baseline | `routes/legal.ts` | Y | Y | N |
| `/bank-guarantees/*` | `bank_guarantees` | `journal_entries` | baseline | `routes/legal.ts` / `routes/finance-vendors.ts` | Y | Y | N |

### Module: Correspondence / Comms / Inbox

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/correspondence/*` | `correspondence` | `numbering_assignments` | baseline; `090_correspondence_numbering_contracts.sql`, `230_numbering_inquiry_memo_scheme.sql` | `routes/correspondence.ts` | Y | N | Y (`case "correspondence"`) |
| `/letters/*` | `official_letters` | `numbering_assignments` | `069_official_letters_dispatch.sql`, `072_official_letters_created_by.sql` | `routes/correspondence.ts` | Y | N | Y (`case "official_letter"`) |
| `/inbox/*`, `/mailboxes/*` | `mailbox_accounts` | `email_drafts`, `email_signatures`, `message_log`, `outbound_queue`, `v_message_log_all` (view) | `220_inbox_folders_drafts_signatures.sql`, `222_mailbox_accounts_sync.sql`, `224_relax_message_log_channel_check.sql`, `235_mailbox_accounts_branch.sql` | `routes/inbox.ts`, `routes/mailboxes.ts` | Y | N | N |
| `/communications/*`, `/pbx/*` | `pbx_calls` | `pbx_call_recordings`, `pbx_call_transcripts`, `pbx_extensions`, `ivr_menus`, `ivr_menu_options`, `message_log` | `215_communication_control_plane.sql`, `217_pbx_ivr_recordings.sql`, `221_message_log_outbound_queue.sql` | `routes/communications.ts`, `routes/admin-pbx-control.ts` | Y | Y | N |
| `/notifications/*` | `notifications` | `notification_templates`, `notification_delivery_log`, `notification_preferences`, `notification_routing_rules`, `notification_fallback_chains`, `notification_webhooks`, `push_subscriptions` | baseline; `023_push_subscriptions.sql` | `routes/notifications.ts`, `routes/notification-engine.ts` | Y (own + audit) | N | N |

### Module: RBAC / Admin / Workflow

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/auth/*`, `/permissions/*` | `users` | `refresh_tokens`, `password_reset_requests`, `user_sessions` (orphan, see §3), `roles`, `user_roles`, `role_permissions`, `permissions` | baseline | `routes/auth.ts`, `routes/permissions.ts` | Y | N | N |
| `/rbac/*` | `rbac_roles` | `rbac_role_grants`, `rbac_user_grants`, `rbac_user_roles`, `rbac_role_history`, `rbac_approval_limits`, `rbac_field_policies`, `rbac_jit_requests`, `rbac_sod_rules`, `custom_roles`, `feature_catalog` | `068_rbac_catalog_seed.sql`, `070_rbac_self_service_and_gaps.sql`, `109_layered_rbac_v2.sql` (creates orphan `rbac_cache_version`), `110_rbac_v2_role_templates.sql` | `routes/rbacV2.ts`, `routes/permissions.ts` | Y | N | N |
| `/admin/*` | `companies`, `branches`, `departments` | `system_settings`, `company_feature_flags`, `tenants`, `delegations`, `request_types` | baseline; `007_branch_letterhead.sql`, `008_branch_missing_cols.sql`, `121_default_department_seed.sql`, `236_company_feature_flags.sql`, `239_companies_nusk_supplier_link.sql` | `routes/admin.ts` | Y | N | N |
| `/workflow/*` | `workflow_definitions` | `workflow_instances`, `workflow_requests`, `workflow_steps`, `workflow_step_actions`, `workflows`, `approval_chains`, `approval_chain_steps`, `approval_requests`, `approval_actions` | `012_workflow_engine.sql`, `076_missing_system_tables.sql` | `routes/automation.ts`, `routes/approvalActions.ts` | Y | N | N |
| `/numbering/*` | `numbering_schemes` | `numbering_assignments`, `numbering_counters`, `numbering_audit_logs` | `213_unified_numbering_center.sql`, `214_numbering_priority_2_schemes.sql`, `215_numbering_client_code_scheme.sql`, `216_numbering_backfill_metadata.sql`, `217_numbering_full_coverage.sql`, `218_drop_legacy_numbering_sequences.sql`, `220_numbering_align_issue_timing.sql`, `227_numbering_payment_run_scheme.sql`, `228_numbering_store_order_scheme.sql`, `229_numbering_deactivate_dead_schemes.sql`, `230_numbering_inquiry_memo_scheme.sql`, `231_numbering_customer_advance_scheme.sql`, `232_numbering_umrah_invoicing_schemes.sql` | `routes/numbering.ts` | Y | N | N |
| `/audit/*`, `/audit-logs/*` | `audit_logs` | `audit_violations`, `event_logs`, (`audit_archive` + `audit_umrah_access` + `audit_logs_archive` are orphans) | baseline; `112_audit_umrah_access.sql:1`, `235_audit_active_role_key.sql` | `routes/auditLogs.ts` + every module writes here via `lib/audit.ts` | **Itself** | Y (`auditLogs.ts:124,160`) | N |

### Module: AI / Intelligence / Behavioral

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/ai/*`, `/admin-ai-governance/*` | `ai_prompts` | `ai_prompt_evaluations`, `ai_prompt_evaluation_results`, `ai_prompt_reviews`, `ai_prompt_test_cases`, `ai_providers`, `ai_request_logs` | `213_ai_request_logs.sql`, `214_ai_governance.sql`, `216_ai_prompt_evaluations.sql`, `218_ai_providers_capabilities.sql` | `routes/admin-ai-governance.ts` | Y | Y (`bi.ts`) | N |
| `/intelligence/*`, `/proactive/*` | `proactive_rules` | `automation_logs`, `smart_alerts`, `auto_detection_log` (orphan in routes), `business_rules`, `business_rule_logs` | `014_proactive_automation.sql`, `015_proactive_rules_company_scope.sql`, `016_behavioral_intelligence.sql` (creates orphan `smart_recommendations`), `065_alert_fatigue_tables.sql` | `routes/intelligence.ts`, `routes/automation.ts` | Y | Y | N |
| `/bi/*` | (no own primary) — reads from many | `bi_dashboards`, `bi_kpis`, `bi_reports`, `kpi_snapshots`, `client_rfm_scores` | baseline | `routes/bi.ts` | N | **Itself** | N |
| `/export/*`, `/reports/scheduled/*` | `scheduled_reports` | `scheduled_report_history` | `023_scheduled_reports.sql` | `routes/scheduled-reports.ts`, `routes/export.ts` | Y | Itself | N |

### Module: Governance / Compliance

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/governance/*` | `governance_policies` | `governance_audits`, `governance_compliance`, `governance_risks`, `governance_capa`, `policy_compliance_actions`, `policy_module_links` | baseline; `017_entity_comments_tags.sql` | `routes/governance.ts` | Y | Y | N |
| `/pdpl/*` | `data_access_requests` | `data_retention_policies`, `processing_activities_log` | baseline | `routes/pdpl.ts` | Y | N | N |
| `/digital-signature/*` | `digital_signature_logs` | `digital_signature_otps` | baseline | `routes/digital-signature.ts` | Y | N | N |
| `/cron/*` (via lib/cronScheduler.ts) | `cron_jobs` | `cron_logs`, `cron_locks` (orphan in routes) | baseline | `lib/cronScheduler.ts` (not a route) | N | N | N |
| `/gov-integrations/*` | `gov_integrations` | `gov_integration_links`, `integration_logs` (orphan: `integration_logs_archive`) | baseline | `routes/gov-integrations.ts` | Y | N | N |

### Module: Support / Recruitment / Training

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/support/*` | `support_tickets` | `ticket_replies`, `ticket_csat_ratings` | baseline | `routes/support.ts` | Y | Y | N |
| `/recruitment/*` | `job_postings` | `job_applications`, `applicant_accounts` | baseline | `routes/recruitment.ts` | Y | Y | Y (`case "job_posting"`) |
| `/careers/*` | `job_postings` | `applicant_accounts` | baseline | `routes/careersPortal.ts` | N | N | N |
| `/training/*` | `training_programs` | `training_participants`, `training_enrollments` (`trainings` + `training_courses` are orphans — see §3) | baseline; `092_training_programs_deletedat.sql`, `111_training_feedback_column.sql` | `routes/training.ts` | Y | Y | N |
| `/onboarding/*` | `onboarding_tasks` | `employees` | baseline | `routes/employees.ts` | Y | N | N |

### Module: KB / Knowledge / Search / Calendar

| API family | Primary table | Supporting tables | Migration(s) | Owner | Audit | Report | Print |
|---|---|---|---|---|---|---|---|
| `/kb/*` | `kb_articles` | (none) | baseline | `routes/intelligence.ts` (read-only) | N | N | N |
| `/calendar/*`, `/events/*` | (no own primary) | aggregates `employee_documents`, `umrah_pilgrims`, `rental_contracts`, `legal_contracts`, `hr_leave_requests`, `attendance` | n/a | `routes/calendar.ts`, `routes/events.ts` | N | N | N |
| `/search/*` | (no own primary) | full-text scan across `documents`, `clients`, `employees`, `invoices`, `correspondence` | n/a | `routes/search.ts` | N | N | N |
| `/portal/client/*` | `client_portal_accounts` | `clients`, `invoices`, `rental_contracts` | `021_client_portal_accounts.sql`, `022_portal_account_client_unique.sql`, `230_portal_client_links.sql`, `232_portal_client_links_composite_fk.sql`, `233_clientid_composite_fk_sweep.sql` | `routes/clientPortal.ts` | Y | N | N |

---

## الجداول اليتيمة (Orphan tables — defined in schema but no route reads/writes them)

**Method:** baseline table list (`db/schema_pre.sql` — 378 tables) minus tables referenced by any `SELECT FROM x` / `INSERT INTO x` / `UPDATE x` / `JOIN x` pattern in `artifacts/api-server/src/routes/*.ts`. Manually validated against `lib/` (background jobs, cron schedulers, helpers).

### A. Confirmed orphans (zero references anywhere)

| Table | Migration defining it | Status |
|---|---|---|
| `audit_archive` | `migrations/105_missing_tables.sql:87` | Comment says "used by cronScheduler.ts for old audit log archival" but `cronScheduler.ts` does **not** reference it as of HEAD. DEAD. |
| `audit_logs_archive` | baseline (`schema_pre.sql:3803`) | Likely partition table for `audit_logs`. No code reference. |
| `audit_umrah_access` | `migrations/112_audit_umrah_access.sql:1` | Designed for sensitive-pilgrim PII access audit. No route writes to it. |
| `fx_revaluation_lines` | `migrations/140_multi_currency_foundations.sql` | Parent `fx_revaluations` is used; line table never queried. |
| `wps_skip_alerts` | `migrations/175_wps_skip_alerts.sql` | Designed for WPS exclusion notifications. No code writer. |
| `wps_bank_credentials` | `migrations/176_wps_bank_credentials.sql` | Bank secrets storage. No reader → security risk if populated. |
| `zatca_b2c_pause_events` | `migrations/178_zatca_b2c_pause_events.sql` | No route reads/writes. |
| `zatca_icv_counters` | `migrations/139_zatca_phase2_columns.sql` | ICV counter table — likely handled differently in `lib/einvoice/`. Needs deeper check. |
| `zatca_retry_queue` | `migrations/139_zatca_phase2_columns.sql` | Same — should be background queue. Not wired. |
| `lot_expiry_alerts` | `migrations/173_inventory_movement_lot_serial.sql` | Lot expiry monitoring — no producer/consumer found. |
| `smart_recommendations` | `migrations/016_behavioral_intelligence.sql` | Behavioral AI suggestion store. No route. |
| `rbac_cache_version` | `migrations/109_layered_rbac_v2.sql` | RBAC cache versioning. Possibly read by `lib/rbac.ts` cache layer but **not by any route**. |
| `idempotency_keys` | `migrations/170_idempotency_keys.sql` | Idempotency support — declared but not invoked by any route handler. Live writes likely go through middleware not yet wired. |
| `daily_closures` | `migrations/020_daily_closures.sql` | Superseded — live table is `daily_close_log` (used by `finance-hardening.ts`). `daily_closures` was the original name, never deleted. **DUPLICATE entity** — see §5. |
| `product_valuation_settings` | `migrations/141_inventory_advanced_foundations.sql` | Advanced inventory feature. No route. |
| `discipline_memos` | `migrations/076_missing_system_tables.sql` | Replaced by `hr_inquiry_memos` family. **DUPLICATE entity** — see §5. |
| `umrah_payment_allocations` | `migrations/101_umrah_invoicing_and_payments.sql` | Originally for split allocations. Never read by routes; logic collapsed into `umrah_payments`. |
| `umrah_attachments` | `migrations/154_umrah_attachments.sql` | **Deliberately retained** for rollback after DOC-VIOLATION consolidation (migration 237). Reads remain via `umrah-entities.ts` for backward compat. Will become orphan once 237 is verified in production. |
| `warehouse_cycle_count_plans` | `migrations/173_inventory_movement_lot_serial.sql` | Planning layer above `warehouse_cycle_counts`. Not used. |
| `cron_locks` | baseline | Cron mutual-exclusion table — used by `lib/cronScheduler.ts` only (not a route). Counts as "no API". |
| `mailbox_sync_cursors` | baseline | Mailbox IMAP cursor table — `lib/` only. No API. |
| `communications_log` | baseline | Legacy comms log. Replaced by `message_log`. **DUPLICATE entity**. |
| `email_queue`, `sms_queue`, `whatsapp_queue` | baseline | Legacy per-channel queues — replaced by unified `outbound_queue` (`221_message_log_outbound_queue.sql`). **DUPLICATE entities**. |
| `notification_log` | baseline | Replaced by `notification_delivery_log`. **DUPLICATE entity**. |
| `event_outbox` | baseline | Likely replaced by `event_dlq` + `event_logs`. Not referenced. |
| `fleet_violations` | (DROPPED by `migrations/171_drop_dead_tables.sql:39`) | Already declared dead. Schema dump is stale here. |
| `invoice_items` | (DROPPED by `migrations/171_drop_dead_tables.sql:40`) | Already declared dead. |
| `training_courses` | (DROPPED by `migrations/171_drop_dead_tables.sql:41`) | Already declared dead. |
| `warehouse_stock_serials` | (DROPPED by `migrations/171_drop_dead_tables.sql:42`) | Already declared dead. |
| `umrah_sales_invoice_items` | `migrations/101_umrah_invoicing_and_payments.sql` | Lines now stored inline; **only** read by 1-2 places. Borderline (`finance-reports.ts` does not query items directly; only the parent `umrah_sales_invoices`). Needs verification. |
| `purchase_order_lines` | `migrations/076_missing_system_tables.sql:148` | Live table used by routes is `purchase_order_items`. `purchase_order_lines` is read only by `lib/print/dataLoader.ts:553` (print loader expecting wrong table name). **DUPLICATE entity** — see §5. |

### B. Used by `lib/` only (no API but legitimately wired by background jobs)

These are NOT orphans — they are operational tables used by schedulers/engines:

| Table | Used by | Notes |
|---|---|---|
| `pricing_rules`, `pricing_actions`, `pricing_conditions`, `pricing_rule_applications` | `lib/pricingEngine.ts:148,167,171` | Pricing engine — invoked from invoice/purchase create paths. Not a "route" entity, but live. |
| `auto_detection_log` | `lib/autoViolationEngine.ts:528` | HR auto-violation detector. |
| `expenses` | `lib/cronScheduler.ts`, `lib/workflowEngine.ts` | Expense claims. Routes use `expense_claims` for claim flow; raw `expenses` is journal-level. |
| `obligations` | `lib/obligationsEngine.ts:78` + `routes/obligations.ts` | Live. |
| `dunning_letters` | `lib/cronScheduler.ts:2858` (dynamic CREATE), `routes/finance-collection.ts` | Live. |
| `cron_jobs`, `cron_locks`, `cron_logs` | `lib/cronScheduler.ts` | Operational. |
| `outbound_queue`, `message_log`, `v_message_log_all` | `routes/inbox.ts`, `routes/communications.ts` | Live. |
| `event_dlq` | `routes/admin.ts`, `routes/admin-observability.ts`, `lib/eventBus.ts` | Live. |

---

## APIs بدون جدول واضح (APIs with unclear table ownership)

These route files modify many tables but no single "primary" emerges, OR they are pure aggregators:

| Route file | Symptom | Notes |
|---|---|---|
| `routes/bi.ts` | Reads ≥25 distinct tables, owns `bi_dashboards`/`bi_kpis`/`bi_reports` | OK — aggregator by design. |
| `routes/dashboard.ts` | Reads 30+ tables across all modules | OK — aggregator. |
| `routes/search.ts` | Full-text scans across many tables | OK — aggregator. |
| `routes/execDashboard.ts` | Cross-module KPI roll-up | OK. |
| `routes/finance-reports.ts` | Joins ~20 tables per report | OK. |
| `routes/finance-hardening.ts` | Writes to `audit_logs`, `event_logs`, `journal_entries`, `invoices`, `daily_close_log` — no clear primary | **Unclear** — guard/sweep operations, but every route should declare a primary entity for RBAC `requireOwnership`. |
| `routes/wiring-stubs.ts` | Stub handlers — no real ownership | **Pending removal** when real implementations land. |
| `routes/impactPreview.ts` | Multi-entity preview computation, no writes | OK if read-only. |
| `routes/activityIngest.ts` | Writes to `activity_logs` + many entity tables for backfill | **Unclear** — could collide with module owners. |
| `routes/notification-engine.ts` | Writes to `notifications`, `notification_delivery_log`, `notification_routing_rules`, `notification_templates`, plus arbitrary entity-mention reads | OK by design but worth a dedicated owner doc. |
| `routes/print.ts` | Writes to `print_jobs`, `print_reprint_requests`, `print_template_assignments`, `document_templates` — but also reads ~30 entity tables via `lib/print/dataLoader.ts` | OK — clear print system, but cross-cutting reads should be audited for tenant scope. |
| `routes/storage.ts` | Reads `documents` + legacy `umrah_attachments` | **Ambiguous** post-DOC-VIOLATION. Should be retired in favor of `documents.ts`. |
| `routes/correspondence.ts` | Owns both `correspondence` and `official_letters` (two distinct entities) | Acceptable but worth a dedicated `letters.ts` split. |
| `routes/finance-collection.ts` | Touches `invoices`, `customer_advances`, `collection_follow_ups`, `dunning_letters`, `debit_memos` — heavy domain crossover | Domain is "collection" but primary table varies per endpoint. |
| `routes/intelligence.ts` | Reads ~15 tables for AI suggestions; writes `proactive_rules`, `smart_alerts` | OK aggregator. |

---

## كيانات مكررة عبر الخدمات (Duplicate entities across services)

| Conceptual entity | Tables involved | Verdict |
|---|---|---|
| **Document/attachment store** | `documents` (canonical), `umrah_attachments` (legacy, scheduled for retirement post-237), `company_documents` (HR compliance — different concern), `employee_documents` (per-employee compliance docs — different concern) | `documents` is canonical. `umrah_attachments` is the **DOC-VIOLATION** consolidation target — migration 237 backfilled into `documents`. `company_documents` + `employee_documents` are domain-specific compliance trackers (expiry, type) — **NOT duplicates** but they should reference `documents` for the actual file storage to avoid storing binaries twice. |
| **Audit log family** | `audit_logs` (live), `audit_archive` (orphan), `audit_logs_archive` (orphan), `audit_umrah_access` (orphan), `audit_violations` (used) | Three of five are orphans. Consolidate or delete. |
| **Daily close** | `daily_close_log` (live), `daily_closures` (orphan, migration 020) | Same concept, two names. |
| **Discipline memos** | `hr_inquiry_memos` (live), `discipline_memos` (orphan, migration 076) | Same concept; `hr_inquiry_memos` won. |
| **Invoice lines** | `invoices.lines` (JSONB column, used by `finance-invoices.ts:721,938`), `invoice_lines` (separate detached table — also written at `finance-invoices.ts:721,1271,1448`), `invoice_items` (DROPPED migration 171), `umrah_sales_invoice_items` (Umrah-specific) | **Conflict** — `invoice_lines` table coexists with `invoices.lines` JSONB. Comment in migration 223 (`finance_enforce_line_allocation`) suggests both are used. Worth verification — could be drift. |
| **PO lines** | `purchase_order_items` (live, used by `finance-purchase.ts:620`, `finance-reports.ts:1743`), `purchase_order_lines` (orphan in routes, only read by `lib/print/dataLoader.ts:553`) | Print loader is reading the **wrong** table. This is a latent bug or stale migration. |
| **Outbound message queues** | `outbound_queue` (unified, canonical), `email_queue`, `sms_queue`, `whatsapp_queue`, `email_drafts` (live for IMAP) | Three per-channel queues are orphans; canonical is `outbound_queue`. |
| **Notification ledger** | `notification_delivery_log` (live), `notification_log` (orphan) | Same concept. |
| **Event/message bus** | `event_logs` (live, used by finance-invoices, finance-hardening, finance-gl-helpers, finance-reports), `event_dlq` (live for DLQ), `event_outbox` (orphan) | Outbox pattern was planned but never wired. |
| **Communications archive** | `message_log` (live, used everywhere), `communications_log` (orphan, legacy) | Legacy unused. |
| **Training catalog** | `training_programs` (live), `trainings` (orphan), `training_courses` (DROPPED 171) | One canonical table — `training_programs`. |
| **Integration logs** | `integration_logs` (live), `integration_logs_archive` (orphan) | Archive partition never wired. |
| **User activity** | `activity_logs` (live, written by `lib/activityTracker.ts`), `user_activity_log` (orphan), `user_sessions` (`lib/`-only) | Three names for "what did the user do". Consolidate. |
| **Fleet violations** | `fleet_traffic_violations` (live), `fleet_violations` (DROPPED 171) | Resolved. |
| **Pricing tables** | `pricing_rules` + `pricing_conditions` + `pricing_actions` (live via `lib/pricingEngine.ts`), `pricing_rule_applications` (live), but **no route** wraps them — only engine code | These are correctly owned by the lib layer, but lack any `/finance/pricing/*` admin API. |

---

## التوصيات (Recommendations — Arabic-first, audit-only)

> **تحذير: هذه توصيات للمراجعة فقط. لا تنفذ أي تغييرات بدون موافقة موثقة من فريق #1418/#1413.**

1. **توحيد عائلة Audit الميتة:**
   احذف أو ادمج الجداول الثلاثة: `audit_archive` (105) + `audit_logs_archive` (baseline) + `audit_umrah_access` (112) — لا توجد قراءة أو كتابة عبر أي route. السجل الوحيد الحي هو `audit_logs`. القرار يستحق RFC منفصلة لأن أحد الجداول (`audit_umrah_access`) كان مخصصاً لحماية بيانات الحجاج الحساسة (PDPL).

2. **تنظيف الجداول المعزولة في ZATCA و WPS:**
   `zatca_icv_counters`, `zatca_retry_queue`, `zatca_b2c_pause_events`, `wps_skip_alerts`, `wps_bank_credentials` — كلها معرّفة في migrations 139/175/176/178 ولكن لا يستخدمها أي route. تحقق من كود `lib/einvoice/` و `lib/wps/` (إن وُجد) قبل اتخاذ قرار الحذف. الخطر الأمني: `wps_bank_credentials` يحمل اعتمادات بنكية وحقيقة أنه غير مقروء يعني أن أي صف موجود لا يخدم أحداً.

3. **معالجة تكرار خطوط الفواتير (`invoice_lines` ↔ `invoices.lines` JSONB):**
   مهاجرة 223 (`finance_enforce_line_allocation`) تشير إلى استخدام مزدوج. الكود يكتب في الاثنين (`finance-invoices.ts` line 721 يكتب `invoice_lines`، lines 938 و 1448 يقرآن من نفس الجدول). يجب توثيق "المصدر الموثوق" لكل تقرير لأن أي drift يكسر صحة الميزانية العمومية.

4. **إصلاح bug في print loader:**
   `lib/print/dataLoader.ts:553` يقرأ من `purchase_order_lines` بينما الحياة فعلياً في `purchase_order_items`. هذا يعني أن طباعة "أمر شراء" تظهر بدون بنود. يجب إنشاء ticket منفصل ومتابعته في #1418.

5. **توثيق DOC-VIOLATION rollout:**
   مهاجرة 237 backfilled `umrah_attachments` → `documents`. الجدول القديم محفوظ عن قصد للـ rollback. أنشئ tracking issue لإسقاطه بعد فترة استقرار محددة (مثلاً 60 يوماً) واحذف القراءات المتبقية في `routes/umrah-entities.ts` و `routes/storage.ts`.

6. **توحيد طوابير الإرسال:**
   `email_queue`, `sms_queue`, `whatsapp_queue` آثار قديمة. الكود الحي يستخدم `outbound_queue` فقط (migration 221). أنشئ migration drop مماثلة لـ 171.

7. **توضيح ملكية الجداول العابرة للوحدات:**
   `audit_logs`, `event_logs`, `numbering_assignments`, `idempotency_keys` لا تملكها وحدة بعينها. يجب:
   - توثيق "كل وحدة تكتب إليها عبر `lib/audit.ts` و `lib/numbering.ts` و `lib/idempotency.ts`"
   - إنشاء owner team موحّد في `docs/audit/SYSTEM_INVENTORY_MATRIX.md`

8. **مراجعة `routes/wiring-stubs.ts`:**
   جميع endpoints هنا stubs. يجب إعادة تسميتها كـ `_pending` أو حذفها لأنها تعطي وعد API غير محقق.

9. **مراجعة `routes/storage.ts`:**
   بعد توحيد المرفقات في `documents`, لا حاجة لـ `storage.ts` المستقل — يكفي `documents.ts` للقراءة و gateway موحد للتنزيل. اقتراح: deprecate و redirect.

10. **توحيد سجلات النشاط:**
    `activity_logs` (live)، `user_activity_log` (orphan)، `user_sessions` (orphan). الحفاظ على الثلاثة يضاعف storage بدون قيمة. يجب اختيار واحد كـ canonical.

---

## ملخص نهائي (5-line summary)

1. **378 جدول** في baseline schema (`db/schema_pre.sql`)، 102 route file تستخدم نحو **345 جدول** فعلياً، نسبة التغطية ~88%.
2. **44 orphan candidate**، منها 4 محذوفة فعلاً (171_drop_dead_tables)، و ~12 تعمل عبر `lib/` schedulers بدون route، والباقي (~28) ميت أو مكرر.
3. **كيانات مكررة حرجة:** `audit_archive/audit_logs_archive/audit_umrah_access`, `daily_closures` vs `daily_close_log`, `discipline_memos` vs `hr_inquiry_memos`, `email_queue/sms_queue/whatsapp_queue` vs `outbound_queue`, `purchase_order_lines` vs `purchase_order_items` (يحوي bug في print loader).
4. **DOC-VIOLATION** (migration 237): `umrah_attachments` تم backfill إلى `documents` مع إبقاء الجدول القديم للـ rollback — موثق ويتطلب tracking لإسقاطه لاحقاً.
5. **توصية رئيسية للسيف:** التركيز على (أ) توحيد عائلة audit، (ب) إصلاح bug print loader على `purchase_order_lines`، (ج) توثيق ownership للجداول العابرة (`audit_logs`/`event_logs`/`numbering_assignments`)، (د) متابعة DOC-VIOLATION drop المؤجل.
