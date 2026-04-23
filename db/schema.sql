--
-- PostgreSQL database dump
--

\restrict N8aLHyPCVG3H1XKp9RfMpgRknKkoFHJHGlmbeKPbQWRw6wMnX9Pye24hbIZ7Bmw


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.zatca_submission_log DROP CONSTRAINT IF EXISTS "zatca_submission_log_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.zatca_settings DROP CONSTRAINT IF EXISTS "zatca_settings_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.workflows DROP CONSTRAINT IF EXISTS "workflows_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.workflow_steps DROP CONSTRAINT IF EXISTS "workflow_steps_definitionId_fkey";
ALTER TABLE IF EXISTS ONLY public.workflow_step_actions DROP CONSTRAINT IF EXISTS "workflow_step_actions_instanceId_fkey";
ALTER TABLE IF EXISTS ONLY public.workflow_instances DROP CONSTRAINT IF EXISTS "workflow_instances_definitionId_fkey";
ALTER TABLE IF EXISTS ONLY public.warehouse_stock_batches DROP CONSTRAINT IF EXISTS "warehouse_stock_batches_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.warehouse_products DROP CONSTRAINT IF EXISTS "warehouse_products_categoryId_fkey";
ALTER TABLE IF EXISTS ONLY public.warehouse_movements DROP CONSTRAINT IF EXISTS "warehouse_movements_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.warehouse_categories DROP CONSTRAINT IF EXISTS "warehouse_categories_parentId_fkey";
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS "users_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.user_roles DROP CONSTRAINT IF EXISTS "user_roles_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.user_activity_log DROP CONSTRAINT IF EXISTS "user_activity_log_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_transport DROP CONSTRAINT IF EXISTS "umrah_transport_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_pilgrims DROP CONSTRAINT IF EXISTS "umrah_pilgrims_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_pilgrims DROP CONSTRAINT IF EXISTS "umrah_pilgrims_packageId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_pilgrims DROP CONSTRAINT IF EXISTS "umrah_pilgrims_agentId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_penalties DROP CONSTRAINT IF EXISTS "umrah_penalties_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_penalties DROP CONSTRAINT IF EXISTS "umrah_penalties_pilgrimId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_penalties DROP CONSTRAINT IF EXISTS "umrah_penalties_agentId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_packages DROP CONSTRAINT IF EXISTS "umrah_packages_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_import_logs DROP CONSTRAINT IF EXISTS "umrah_import_logs_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_agent_invoices DROP CONSTRAINT IF EXISTS "umrah_agent_invoices_seasonId_fkey";
ALTER TABLE IF EXISTS ONLY public.umrah_agent_invoices DROP CONSTRAINT IF EXISTS "umrah_agent_invoices_agentId_fkey";
ALTER TABLE IF EXISTS ONLY public.training_programs DROP CONSTRAINT IF EXISTS "training_programs_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.training_enrollments DROP CONSTRAINT IF EXISTS "training_enrollments_programId_fkey";
ALTER TABLE IF EXISTS ONLY public.ticket_replies DROP CONSTRAINT IF EXISTS "ticket_replies_ticketId_fkey";
ALTER TABLE IF EXISTS ONLY public.ticket_escalations DROP CONSTRAINT IF EXISTS "ticket_escalations_ticketId_fkey";
ALTER TABLE IF EXISTS ONLY public.ticket_escalations DROP CONSTRAINT IF EXISTS "ticket_escalations_escalatedTo_fkey";
ALTER TABLE IF EXISTS ONLY public.ticket_escalations DROP CONSTRAINT IF EXISTS "ticket_escalations_escalatedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.ticket_csat_ratings DROP CONSTRAINT IF EXISTS "ticket_csat_ratings_ticketId_fkey";
ALTER TABLE IF EXISTS ONLY public.tenants DROP CONSTRAINT IF EXISTS "tenants_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS "tasks_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.system_evaluations DROP CONSTRAINT IF EXISTS "system_evaluations_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.system_evaluations DROP CONSTRAINT IF EXISTS "system_evaluations_cycleId_fkey";
ALTER TABLE IF EXISTS ONLY public.system_evaluations DROP CONSTRAINT IF EXISTS "system_evaluations_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.subsidiary_accounts DROP CONSTRAINT IF EXISTS "subsidiary_accounts_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.subsidiary_accounts DROP CONSTRAINT IF EXISTS "subsidiary_accounts_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public.store_products DROP CONSTRAINT IF EXISTS "store_products_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.store_orders DROP CONSTRAINT IF EXISTS "store_orders_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.store_order_items DROP CONSTRAINT IF EXISTS "store_order_items_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.store_order_items DROP CONSTRAINT IF EXISTS "store_order_items_orderId_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS "stock_transfers_requestedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS "stock_transfers_receivedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS "stock_transfers_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS "stock_transfers_approvedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfer_items DROP CONSTRAINT IF EXISTS "stock_transfer_items_transferId_fkey";
ALTER TABLE IF EXISTS ONLY public.stock_transfer_items DROP CONSTRAINT IF EXISTS "stock_transfer_items_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS "shifts_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS "shifts_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.scheduled_report_history DROP CONSTRAINT IF EXISTS "scheduled_report_history_reportId_fkey";
ALTER TABLE IF EXISTS ONLY public.salary_components DROP CONSTRAINT IF EXISTS "salary_components_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS "role_permissions_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.requests DROP CONSTRAINT IF EXISTS "requests_typeId_fkey";
ALTER TABLE IF EXISTS ONLY public.requests DROP CONSTRAINT IF EXISTS "requests_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.request_types DROP CONSTRAINT IF EXISTS "request_types_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.rental_contracts DROP CONSTRAINT IF EXISTS "rental_contracts_unitId_fkey";
ALTER TABLE IF EXISTS ONLY public.rental_contracts DROP CONSTRAINT IF EXISTS "rental_contracts_tenantId_fkey";
ALTER TABLE IF EXISTS ONLY public.rental_contracts DROP CONSTRAINT IF EXISTS "rental_contracts_renewedFromId_fkey";
ALTER TABLE IF EXISTS ONLY public.rental_contracts DROP CONSTRAINT IF EXISTS "rental_contracts_ownerId_fkey";
ALTER TABLE IF EXISTS ONLY public.rent_payments DROP CONSTRAINT IF EXISTS "rent_payments_contractId_fkey";
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS "refresh_tokens_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.recurring_journal_runs DROP CONSTRAINT IF EXISTS "recurring_journal_runs_recurringJournalId_fkey";
ALTER TABLE IF EXISTS ONLY public.quality_checks DROP CONSTRAINT IF EXISTS "quality_checks_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.quality_checks DROP CONSTRAINT IF EXISTS "quality_checks_movementId_fkey";
ALTER TABLE IF EXISTS ONLY public.quality_checks DROP CONSTRAINT IF EXISTS "quality_checks_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.quality_checks DROP CONSTRAINT IF EXISTS "quality_checks_checkedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.push_subscriptions DROP CONSTRAINT IF EXISTS "push_subscriptions_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_requests DROP CONSTRAINT IF EXISTS "purchase_requests_supplierId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_request_items DROP CONSTRAINT IF EXISTS purchase_request_items_request_id_fk;
ALTER TABLE IF EXISTS ONLY public.purchase_request_items DROP CONSTRAINT IF EXISTS "purchase_request_items_requestId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_request_items DROP CONSTRAINT IF EXISTS "purchase_request_items_productId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS "purchase_orders_supplierId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS "purchase_orders_requestId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS "purchase_orders_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.purchase_order_items DROP CONSTRAINT IF EXISTS "purchase_order_items_orderId_fkey";
ALTER TABLE IF EXISTS ONLY public.public_announcements DROP CONSTRAINT IF EXISTS "public_announcements_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.public_announcements DROP CONSTRAINT IF EXISTS "public_announcements_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_units DROP CONSTRAINT IF EXISTS "property_units_ownerId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_units DROP CONSTRAINT IF EXISTS "property_units_buildingId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_owners DROP CONSTRAINT IF EXISTS "property_owners_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_buildings DROP CONSTRAINT IF EXISTS "property_buildings_ownerId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_buildings DROP CONSTRAINT IF EXISTS "property_buildings_managerId_fkey";
ALTER TABLE IF EXISTS ONLY public.property_buildings DROP CONSTRAINT IF EXISTS "property_buildings_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.project_tasks DROP CONSTRAINT IF EXISTS "project_tasks_projectId_fkey";
ALTER TABLE IF EXISTS ONLY public.project_tasks DROP CONSTRAINT IF EXISTS "project_tasks_phaseId_fkey";
ALTER TABLE IF EXISTS ONLY public.project_task_dependencies DROP CONSTRAINT IF EXISTS "project_task_dependencies_taskId_fkey";
ALTER TABLE IF EXISTS ONLY public.project_task_dependencies DROP CONSTRAINT IF EXISTS "project_task_dependencies_dependsOnId_fkey";
ALTER TABLE IF EXISTS ONLY public.project_phases DROP CONSTRAINT IF EXISTS "project_phases_projectId_fkey";
ALTER TABLE IF EXISTS ONLY public.processing_activities_log DROP CONSTRAINT IF EXISTS "processing_activities_log_performedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.processing_activities_log DROP CONSTRAINT IF EXISTS "processing_activities_log_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.proactive_rules DROP CONSTRAINT IF EXISTS "proactive_rules_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.privacy_consent_records DROP CONSTRAINT IF EXISTS "privacy_consent_records_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.privacy_consent_records DROP CONSTRAINT IF EXISTS "privacy_consent_records_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.policy_module_links DROP CONSTRAINT IF EXISTS "policy_module_links_policyId_fkey";
ALTER TABLE IF EXISTS ONLY public.policy_module_links DROP CONSTRAINT IF EXISTS "policy_module_links_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS "permissions_userId_fkey";
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS "permissions_grantedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS "permissions_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS "performance_reviews_reviewerId_fkey";
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_employee_id_fk;
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS "performance_reviews_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_company_id_fk;
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS "performance_reviews_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.peer_evaluations DROP CONSTRAINT IF EXISTS "peer_evaluations_evaluatorId_fkey";
ALTER TABLE IF EXISTS ONLY public.peer_evaluations DROP CONSTRAINT IF EXISTS "peer_evaluations_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.peer_evaluations DROP CONSTRAINT IF EXISTS "peer_evaluations_cycleId_fkey";
ALTER TABLE IF EXISTS ONLY public.peer_evaluations DROP CONSTRAINT IF EXISTS "peer_evaluations_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.payroll_runs DROP CONSTRAINT IF EXISTS "payroll_runs_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.payroll_lines DROP CONSTRAINT IF EXISTS "payroll_lines_runId_fkey";
ALTER TABLE IF EXISTS ONLY public.password_reset_requests DROP CONSTRAINT IF EXISTS "password_reset_requests_resolvedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS "notifications_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_webhooks DROP CONSTRAINT IF EXISTS "notification_webhooks_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_templates DROP CONSTRAINT IF EXISTS "notification_templates_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_routing_rules DROP CONSTRAINT IF EXISTS "notification_routing_rules_fallbackChainId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_routing_rules DROP CONSTRAINT IF EXISTS "notification_routing_rules_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_fallback_chains DROP CONSTRAINT IF EXISTS "notification_fallback_chains_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_delivery_log DROP CONSTRAINT IF EXISTS "notification_delivery_log_parentDeliveryId_fkey";
ALTER TABLE IF EXISTS ONLY public.notification_delivery_log DROP CONSTRAINT IF EXISTS "notification_delivery_log_fallbackChainId_fkey";
ALTER TABLE IF EXISTS ONLY public.marketing_campaigns DROP CONSTRAINT IF EXISTS "marketing_campaigns_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.marketing_campaigns DROP CONSTRAINT IF EXISTS "marketing_campaigns_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.maintenance_requests DROP CONSTRAINT IF EXISTS "maintenance_requests_unitId_fkey";
ALTER TABLE IF EXISTS ONLY public.maintenance_requests DROP CONSTRAINT IF EXISTS "maintenance_requests_contractId_fkey";
ALTER TABLE IF EXISTS ONLY public.loan_accounts DROP CONSTRAINT IF EXISTS loan_accounts_employee_id_fk;
ALTER TABLE IF EXISTS ONLY public.loan_accounts DROP CONSTRAINT IF EXISTS loan_accounts_company_id_fk;
ALTER TABLE IF EXISTS ONLY public.legal_sessions DROP CONSTRAINT IF EXISTS "legal_sessions_caseId_fkey";
ALTER TABLE IF EXISTS ONLY public.legal_judgments DROP CONSTRAINT IF EXISTS "legal_judgments_caseId_fkey";
ALTER TABLE IF EXISTS ONLY public.legal_correspondence DROP CONSTRAINT IF EXISTS "legal_correspondence_caseId_fkey";
ALTER TABLE IF EXISTS ONLY public.leave_balances DROP CONSTRAINT IF EXISTS "leave_balances_leaveTypeId_fkey";
ALTER TABLE IF EXISTS ONLY public.leave_balances DROP CONSTRAINT IF EXISTS "leave_balances_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.leave_balances DROP CONSTRAINT IF EXISTS "leave_balances_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.leave_approval_stages DROP CONSTRAINT IF EXISTS leave_approval_stages_request_id_fk;
ALTER TABLE IF EXISTS ONLY public.late_rent_actions DROP CONSTRAINT IF EXISTS "late_rent_actions_paymentId_fkey";
ALTER TABLE IF EXISTS ONLY public.late_rent_actions DROP CONSTRAINT IF EXISTS "late_rent_actions_contractId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_lines DROP CONSTRAINT IF EXISTS journal_lines_journal_id_fk;
ALTER TABLE IF EXISTS ONLY public.journal_lines DROP CONSTRAINT IF EXISTS "journal_lines_journalId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_lines DROP CONSTRAINT IF EXISTS "journal_lines_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entry_templates DROP CONSTRAINT IF EXISTS "journal_entry_templates_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entry_template_lines DROP CONSTRAINT IF EXISTS "journal_entry_template_lines_templateId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entry_template_lines DROP CONSTRAINT IF EXISTS "journal_entry_template_lines_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS "journal_entries_reviewedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS "journal_entries_postedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS "journal_entries_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS "journal_entries_approvedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.job_titles DROP CONSTRAINT IF EXISTS "job_titles_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.job_postings DROP CONSTRAINT IF EXISTS "job_postings_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.job_applications DROP CONSTRAINT IF EXISTS "job_applications_postingId_fkey";
ALTER TABLE IF EXISTS ONLY public.job_applications DROP CONSTRAINT IF EXISTS "job_applications_applicantAccountId_fkey";
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS "invoices_projectId_fkey";
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS "invoices_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS "invoices_clientId_fkey";
ALTER TABLE IF EXISTS ONLY public.invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_invoice_id_fk;
ALTER TABLE IF EXISTS ONLY public.invoice_collection_stages DROP CONSTRAINT IF EXISTS invoice_collection_stages_invoice_id_fk;
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS "intercompany_transactions_toJournalId_fkey";
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS "intercompany_transactions_toCompanyId_fkey";
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS "intercompany_transactions_fromJournalId_fkey";
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS "intercompany_transactions_fromCompanyId_fkey";
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS "intercompany_transactions_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.integrations DROP CONSTRAINT IF EXISTS "integrations_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.integration_logs DROP CONSTRAINT IF EXISTS "integration_logs_integrationId_fkey";
ALTER TABLE IF EXISTS ONLY public.integration_logs DROP CONSTRAINT IF EXISTS "integration_logs_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_types DROP CONSTRAINT IF EXISTS "hr_leave_types_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_requests DROP CONSTRAINT IF EXISTS "hr_leave_requests_leaveTypeId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_requests DROP CONSTRAINT IF EXISTS "hr_leave_requests_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_requests DROP CONSTRAINT IF EXISTS "hr_leave_requests_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_balances DROP CONSTRAINT IF EXISTS "hr_leave_balances_leaveTypeId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_leave_balances DROP CONSTRAINT IF EXISTS "hr_leave_balances_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS "hr_inquiry_memos_regulationId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS "hr_inquiry_memos_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS "hr_inquiry_memos_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS "hr_inquiry_memos_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS "hr_inquiry_memos_assignmentId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memo_events DROP CONSTRAINT IF EXISTS "hr_inquiry_memo_events_memoId_fkey";
ALTER TABLE IF EXISTS ONLY public.hr_discipline_regulation DROP CONSTRAINT IF EXISTS "hr_discipline_regulation_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.governance_risks DROP CONSTRAINT IF EXISTS "governance_risks_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.governance_policies DROP CONSTRAINT IF EXISTS "governance_policies_parentId_fkey";
ALTER TABLE IF EXISTS ONLY public.governance_policies DROP CONSTRAINT IF EXISTS "governance_policies_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.governance_compliance DROP CONSTRAINT IF EXISTS "governance_compliance_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.governance_audits DROP CONSTRAINT IF EXISTS "governance_audits_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.gov_integrations DROP CONSTRAINT IF EXISTS "gov_integrations_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.gov_integration_links DROP CONSTRAINT IF EXISTS "gov_integration_links_integrationId_fkey";
ALTER TABLE IF EXISTS ONLY public.gov_integration_links DROP CONSTRAINT IF EXISTS "gov_integration_links_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.goods_receipt_items DROP CONSTRAINT IF EXISTS "goods_receipt_items_grnId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_violations DROP CONSTRAINT IF EXISTS "fleet_violations_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_violations DROP CONSTRAINT IF EXISTS "fleet_violations_driverId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_violations DROP CONSTRAINT IF EXISTS "fleet_violations_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_trips DROP CONSTRAINT IF EXISTS "fleet_trips_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_trips DROP CONSTRAINT IF EXISTS "fleet_trips_driverId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_maintenance DROP CONSTRAINT IF EXISTS "fleet_maintenance_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_insurance DROP CONSTRAINT IF EXISTS "fleet_insurance_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_gps_tracking DROP CONSTRAINT IF EXISTS "fleet_gps_tracking_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fleet_fuel_logs DROP CONSTRAINT IF EXISTS "fleet_fuel_logs_vehicleId_fkey";
ALTER TABLE IF EXISTS ONLY public.fixed_assets DROP CONSTRAINT IF EXISTS "fixed_assets_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.fixed_assets DROP CONSTRAINT IF EXISTS "fixed_assets_assignedTo_fkey";
ALTER TABLE IF EXISTS ONLY public.financial_periods DROP CONSTRAINT IF EXISTS "financial_periods_reopenedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.financial_periods DROP CONSTRAINT IF EXISTS "financial_periods_lockedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.financial_periods DROP CONSTRAINT IF EXISTS "financial_periods_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.financial_periods DROP CONSTRAINT IF EXISTS "financial_periods_closedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.expense_claims DROP CONSTRAINT IF EXISTS "expense_claims_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.expense_claims DROP CONSTRAINT IF EXISTS "expense_claims_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.expense_claims DROP CONSTRAINT IF EXISTS "expense_claims_approvedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_summaries DROP CONSTRAINT IF EXISTS "evaluation_summaries_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_summaries DROP CONSTRAINT IF EXISTS "evaluation_summaries_cycleId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_summaries DROP CONSTRAINT IF EXISTS "evaluation_summaries_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_participants DROP CONSTRAINT IF EXISTS "evaluation_participants_evaluatorId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_participants DROP CONSTRAINT IF EXISTS "evaluation_participants_cycleId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_participants DROP CONSTRAINT IF EXISTS "evaluation_participants_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_cycles DROP CONSTRAINT IF EXISTS "evaluation_cycles_initiatorId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_cycles DROP CONSTRAINT IF EXISTS "evaluation_cycles_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.evaluation_cycles DROP CONSTRAINT IF EXISTS "evaluation_cycles_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS "employee_of_month_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS "employee_of_month_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS "employee_of_month_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS "employee_of_month_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_documents DROP CONSTRAINT IF EXISTS "employee_documents_uploadedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_documents DROP CONSTRAINT IF EXISTS "employee_documents_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_documents DROP CONSTRAINT IF EXISTS "employee_documents_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_managerId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_jobTitleId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_employeeId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_departmentId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS "employee_assignments_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS "documents_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.document_versions DROP CONSTRAINT IF EXISTS "document_versions_documentId_fkey";
ALTER TABLE IF EXISTS ONLY public.document_templates DROP CONSTRAINT IF EXISTS "document_templates_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.document_templates DROP CONSTRAINT IF EXISTS "document_templates_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.document_folders DROP CONSTRAINT IF EXISTS "document_folders_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.document_entity_links DROP CONSTRAINT IF EXISTS "document_entity_links_documentId_fkey";
ALTER TABLE IF EXISTS ONLY public.depreciation_entries DROP CONSTRAINT IF EXISTS "depreciation_entries_assetId_fkey";
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS "departments_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS "departments_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.deduction_rules DROP CONSTRAINT IF EXISTS "deduction_rules_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.data_retention_policies DROP CONSTRAINT IF EXISTS "data_retention_policies_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.data_access_requests DROP CONSTRAINT IF EXISTS "data_access_requests_requesterId_fkey";
ALTER TABLE IF EXISTS ONLY public.data_access_requests DROP CONSTRAINT IF EXISTS "data_access_requests_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.cron_logs DROP CONSTRAINT IF EXISTS "cron_logs_jobId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_pipeline_stages DROP CONSTRAINT IF EXISTS "crm_pipeline_stages_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_opportunities DROP CONSTRAINT IF EXISTS "crm_opportunities_pipelineStageId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_contacts DROP CONSTRAINT IF EXISTS "crm_contacts_opportunityId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_contacts DROP CONSTRAINT IF EXISTS "crm_contacts_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_contacts DROP CONSTRAINT IF EXISTS "crm_contacts_clientId_fkey";
ALTER TABLE IF EXISTS ONLY public.crm_activities DROP CONSTRAINT IF EXISTS "crm_activities_opportunityId_fkey";
ALTER TABLE IF EXISTS ONLY public.contract_payment_schedule DROP CONSTRAINT IF EXISTS "contract_payment_schedule_contractId_fkey";
ALTER TABLE IF EXISTS ONLY public.contract_payment_schedule DROP CONSTRAINT IF EXISTS "contract_payment_schedule_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS "clients_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.client_rfm_scores DROP CONSTRAINT IF EXISTS "client_rfm_scores_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.client_rfm_scores DROP CONSTRAINT IF EXISTS "client_rfm_scores_clientId_fkey";
ALTER TABLE IF EXISTS ONLY public.client_portal_accounts DROP CONSTRAINT IF EXISTS "client_portal_accounts_clientId_fkey";
ALTER TABLE IF EXISTS ONLY public.chart_of_accounts DROP CONSTRAINT IF EXISTS "chart_of_accounts_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.business_rules DROP CONSTRAINT IF EXISTS "business_rules_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.business_rule_logs DROP CONSTRAINT IF EXISTS "business_rule_logs_ruleId_fkey";
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS "budgets_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS "budgets_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS "budgets_approvedBy_fkey";
ALTER TABLE IF EXISTS ONLY public.budget_lines DROP CONSTRAINT IF EXISTS "budget_lines_budgetId_fkey";
ALTER TABLE IF EXISTS ONLY public.budget_lines DROP CONSTRAINT IF EXISTS "budget_lines_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public.branches DROP CONSTRAINT IF EXISTS "branches_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.bi_reports DROP CONSTRAINT IF EXISTS "bi_reports_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.bi_kpis DROP CONSTRAINT IF EXISTS "bi_kpis_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.bi_dashboards DROP CONSTRAINT IF EXISTS "bi_dashboards_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.bank_guarantees DROP CONSTRAINT IF EXISTS "bank_guarantees_createdBy_fkey";
ALTER TABLE IF EXISTS ONLY public.bank_guarantees DROP CONSTRAINT IF EXISTS "bank_guarantees_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.bank_guarantees DROP CONSTRAINT IF EXISTS "bank_guarantees_branchId_fkey";
ALTER TABLE IF EXISTS ONLY public.attendance DROP CONSTRAINT IF EXISTS "attendance_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.approval_requests DROP CONSTRAINT IF EXISTS "approval_requests_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.approval_requests DROP CONSTRAINT IF EXISTS "approval_requests_chainId_fkey";
ALTER TABLE IF EXISTS ONLY public.approval_chain_steps DROP CONSTRAINT IF EXISTS "approval_chain_steps_chainId_fkey";
ALTER TABLE IF EXISTS ONLY public.approval_actions DROP CONSTRAINT IF EXISTS "approval_actions_actionBy_fkey";
ALTER TABLE IF EXISTS ONLY public.anonymous_upward_reviews DROP CONSTRAINT IF EXISTS "anonymous_upward_reviews_managerId_fkey";
ALTER TABLE IF EXISTS ONLY public.anonymous_upward_reviews DROP CONSTRAINT IF EXISTS "anonymous_upward_reviews_cycleId_fkey";
ALTER TABLE IF EXISTS ONLY public.anonymous_upward_reviews DROP CONSTRAINT IF EXISTS "anonymous_upward_reviews_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.alert_mute_rules DROP CONSTRAINT IF EXISTS "alert_mute_rules_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.alert_mute_rules DROP CONSTRAINT IF EXISTS "alert_mute_rules_assignmentId_fkey";
ALTER TABLE IF EXISTS ONLY public.alert_fatigue_settings DROP CONSTRAINT IF EXISTS "alert_fatigue_settings_companyId_fkey";
ALTER TABLE IF EXISTS ONLY public.alert_fatigue_settings DROP CONSTRAINT IF EXISTS "alert_fatigue_settings_assignmentId_fkey";
ALTER TABLE IF EXISTS ONLY public.accounting_mappings DROP CONSTRAINT IF EXISTS "accounting_mappings_debitAccountId_fkey";
ALTER TABLE IF EXISTS ONLY public.accounting_mappings DROP CONSTRAINT IF EXISTS "accounting_mappings_creditAccountId_fkey";
ALTER TABLE IF EXISTS ONLY public.accounting_mappings DROP CONSTRAINT IF EXISTS "accounting_mappings_companyId_fkey";
DROP INDEX IF EXISTS public.viol_regulation_idx;
DROP INDEX IF EXISTS public.viol_memo_idx;
DROP INDEX IF EXISTS public."user_roles_userId_roleKey_companyId_key";
DROP INDEX IF EXISTS public.uq_goods_receipts_ref;
DROP INDEX IF EXISTS public.training_programs_company_idx;
DROP INDEX IF EXISTS public.ticket_escalations_ticket_idx;
DROP INDEX IF EXISTS public.system_settings_key_uq;
DROP INDEX IF EXISTS public.system_evaluations_cycle_idx;
DROP INDEX IF EXISTS public.subsidiary_accounts_entity_idx;
DROP INDEX IF EXISTS public.subsidiary_accounts_company_idx;
DROP INDEX IF EXISTS public.stock_transfers_company_idx;
DROP INDEX IF EXISTS public.stock_transfer_items_transfer_idx;
DROP INDEX IF EXISTS public.settings_system_key_uq;
DROP INDEX IF EXISTS public.settings_scoped_key_uq;
DROP INDEX IF EXISTS public.settings_scope_id_idx;
DROP INDEX IF EXISTS public.salary_components_company_idx;
DROP INDEX IF EXISTS public.role_permissions_role_perm_global_uq;
DROP INDEX IF EXISTS public.role_permissions_role_perm_company_uq;
DROP INDEX IF EXISTS public.role_permissions_role_company_idx;
DROP INDEX IF EXISTS public.quality_checks_company_idx;
DROP INDEX IF EXISTS public.purchase_requests_ref_company_uq;
DROP INDEX IF EXISTS public.purchase_orders_ref_company_uq;
DROP INDEX IF EXISTS public.purchase_orders_deleted_at_idx;
DROP INDEX IF EXISTS public.purchase_orders_company_status_idx;
DROP INDEX IF EXISTS public.property_buildings_company_idx;
DROP INDEX IF EXISTS public.proactive_rules_name_idx;
DROP INDEX IF EXISTS public.proactive_rules_name_company_idx;
DROP INDEX IF EXISTS public.proactive_rules_company_idx;
DROP INDEX IF EXISTS public.permissions_user_perm_global_uq;
DROP INDEX IF EXISTS public.permissions_user_perm_company_uq;
DROP INDEX IF EXISTS public.permissions_user_company_idx;
DROP INDEX IF EXISTS public.performance_reviews_employee_idx;
DROP INDEX IF EXISTS public.performance_reviews_company_idx;
DROP INDEX IF EXISTS public.peer_evaluations_employee_idx;
DROP INDEX IF EXISTS public.peer_evaluations_cycle_evaluator_idx;
DROP INDEX IF EXISTS public.peer_evaluations_company_idx;
DROP INDEX IF EXISTS public.payroll_runs_deleted_at_idx;
DROP INDEX IF EXISTS public.payroll_lines_deleted_at_idx;
DROP INDEX IF EXISTS public.onboarding_tasks_employee_idx;
DROP INDEX IF EXISTS public.onboarding_tasks_company_idx;
DROP INDEX IF EXISTS public.official_letters_status_sent_idx;
DROP INDEX IF EXISTS public.official_letters_created_by_idx;
DROP INDEX IF EXISTS public.leave_balances_employee_idx;
DROP INDEX IF EXISTS public.leave_balances_company_idx;
DROP INDEX IF EXISTS public.journal_lines_journal_idx;
DROP INDEX IF EXISTS public.journal_entries_deleted_at_idx;
DROP INDEX IF EXISTS public.journal_entries_date_idx;
DROP INDEX IF EXISTS public.journal_entries_company_idx;
DROP INDEX IF EXISTS public.journal_entries_company_created_idx;
DROP INDEX IF EXISTS public.jet_lines_template_idx;
DROP INDEX IF EXISTS public.jet_company_idx;
DROP INDEX IF EXISTS public.invoices_ref_company_uq;
DROP INDEX IF EXISTS public.invoices_due_date_idx;
DROP INDEX IF EXISTS public.invoices_deleted_at_idx;
DROP INDEX IF EXISTS public.invoices_company_status_idx;
DROP INDEX IF EXISTS public.integration_logs_created_at_idx;
DROP INDEX IF EXISTS public.idx_zatca_log_status;
DROP INDEX IF EXISTS public.idx_zatca_log_entity;
DROP INDEX IF EXISTS public.idx_zatca_log_company;
DROP INDEX IF EXISTS public.idx_wf_step_actions_instance;
DROP INDEX IF EXISTS public.idx_wf_instances_status;
DROP INDEX IF EXISTS public.idx_wf_instances_sla;
DROP INDEX IF EXISTS public.idx_wf_instances_ref;
DROP INDEX IF EXISTS public.idx_wf_instances_company;
DROP INDEX IF EXISTS public.idx_wf_instances_assignee;
DROP INDEX IF EXISTS public.idx_umrah_pilgrim_passport_season;
DROP INDEX IF EXISTS public.idx_ual_user;
DROP INDEX IF EXISTS public.idx_ual_created;
DROP INDEX IF EXISTS public.idx_ual_company;
DROP INDEX IF EXISTS public.idx_tenants_national_id;
DROP INDEX IF EXISTS public.idx_tenants_company;
DROP INDEX IF EXISTS public.idx_store_order_items_order;
DROP INDEX IF EXISTS public.idx_sig_otps_doc;
DROP INDEX IF EXISTS public.idx_sig_logs_doc;
DROP INDEX IF EXISTS public.idx_sig_logs_company;
DROP INDEX IF EXISTS public.idx_security_log_user;
DROP INDEX IF EXISTS public.idx_security_log_created;
DROP INDEX IF EXISTS public.idx_security_log_company;
DROP INDEX IF EXISTS public.idx_routing_rules_event;
DROP INDEX IF EXISTS public.idx_routing_rules_company;
DROP INDEX IF EXISTS public.idx_role_permissions_role;
DROP INDEX IF EXISTS public.idx_rfm_segment;
DROP INDEX IF EXISTS public.idx_rfm_company;
DROP INDEX IF EXISTS public.idx_rfm_churn;
DROP INDEX IF EXISTS public.idx_rent_payments_status;
DROP INDEX IF EXISTS public.idx_rent_payments_due;
DROP INDEX IF EXISTS public.idx_rent_payments_contract;
DROP INDEX IF EXISTS public.idx_refresh_tokens_user;
DROP INDEX IF EXISTS public.idx_refresh_tokens_token;
DROP INDEX IF EXISTS public.idx_recurring_journals_next_run;
DROP INDEX IF EXISTS public.idx_recurring_journals_company;
DROP INDEX IF EXISTS public.idx_recurring_journal_runs_parent;
DROP INDEX IF EXISTS public.idx_push_subscriptions_company;
DROP INDEX IF EXISTS public.idx_push_subscriptions_assignment;
DROP INDEX IF EXISTS public.idx_public_announcements_active;
DROP INDEX IF EXISTS public.idx_property_owners_company;
DROP INDEX IF EXISTS public.idx_property_buildings_company;
DROP INDEX IF EXISTS public.idx_projects_company;
DROP INDEX IF EXISTS public.idx_processing_log_type;
DROP INDEX IF EXISTS public.idx_processing_log_created;
DROP INDEX IF EXISTS public.idx_processing_log_company;
DROP INDEX IF EXISTS public.idx_privacy_consent_user;
DROP INDEX IF EXISTS public.idx_privacy_consent_company;
DROP INDEX IF EXISTS public.idx_policy_module_links_policy;
DROP INDEX IF EXISTS public.idx_policy_module_links_module;
DROP INDEX IF EXISTS public.idx_payment_schedule_status;
DROP INDEX IF EXISTS public.idx_payment_schedule_due;
DROP INDEX IF EXISTS public.idx_payment_schedule_contract;
DROP INDEX IF EXISTS public.idx_payment_schedule_company;
DROP INDEX IF EXISTS public.idx_password_reset_pending;
DROP INDEX IF EXISTS public.idx_notif_webhooks_company;
DROP INDEX IF EXISTS public.idx_notif_webhooks_active;
DROP INDEX IF EXISTS public.idx_notif_templates_key;
DROP INDEX IF EXISTS public.idx_notif_templates_company;
DROP INDEX IF EXISTS public.idx_notif_pref_user;
DROP INDEX IF EXISTS public.idx_notif_pref_company;
DROP INDEX IF EXISTS public.idx_legal_corr_company;
DROP INDEX IF EXISTS public.idx_legal_corr_case;
DROP INDEX IF EXISTS public.idx_legal_contracts_renewed_from;
DROP INDEX IF EXISTS public.idx_late_rent_actions_phase;
DROP INDEX IF EXISTS public.idx_late_rent_actions_payment;
DROP INDEX IF EXISTS public.idx_late_rent_actions_contract;
DROP INDEX IF EXISTS public.idx_kb_status;
DROP INDEX IF EXISTS public.idx_kb_company;
DROP INDEX IF EXISTS public.idx_judgments_company;
DROP INDEX IF EXISTS public.idx_judgments_case;
DROP INDEX IF EXISTS public.idx_journal_entries_reversal_of;
DROP INDEX IF EXISTS public.idx_job_titles_company;
DROP INDEX IF EXISTS public.idx_job_titles_category;
DROP INDEX IF EXISTS public.idx_inv_payments_txref;
DROP INDEX IF EXISTS public.idx_inv_payments_inv;
DROP INDEX IF EXISTS public.idx_intercompany_transactions_deleted_at;
DROP INDEX IF EXISTS public.idx_intercompany_to;
DROP INDEX IF EXISTS public.idx_intercompany_from;
DROP INDEX IF EXISTS public.idx_integrations_company;
DROP INDEX IF EXISTS public.idx_integration_logs_status;
DROP INDEX IF EXISTS public.idx_integration_logs_company;
DROP INDEX IF EXISTS public.idx_integration_logs_channel;
DROP INDEX IF EXISTS public.idx_grn_items_po_item;
DROP INDEX IF EXISTS public.idx_grn_items_grn;
DROP INDEX IF EXISTS public.idx_gov_links_unique_entity;
DROP INDEX IF EXISTS public.idx_gov_links_integration;
DROP INDEX IF EXISTS public.idx_gov_links_entity;
DROP INDEX IF EXISTS public.idx_gov_links_company;
DROP INDEX IF EXISTS public.idx_gov_integrations_type;
DROP INDEX IF EXISTS public.idx_gov_integrations_company;
DROP INDEX IF EXISTS public.idx_goods_receipts_po;
DROP INDEX IF EXISTS public.idx_goods_receipts_company;
DROP INDEX IF EXISTS public.idx_fixed_assets_company;
DROP INDEX IF EXISTS public.idx_financial_periods_status;
DROP INDEX IF EXISTS public.idx_financial_periods_deleted_at;
DROP INDEX IF EXISTS public.idx_financial_periods_dates;
DROP INDEX IF EXISTS public.idx_financial_periods_company;
DROP INDEX IF EXISTS public.idx_fallback_chains_company;
DROP INDEX IF EXISTS public.idx_entity_tags_tag;
DROP INDEX IF EXISTS public.idx_entity_tags_entity;
DROP INDEX IF EXISTS public.idx_entity_tags_company;
DROP INDEX IF EXISTS public.idx_entity_comments_entity;
DROP INDEX IF EXISTS public.idx_entity_comments_company;
DROP INDEX IF EXISTS public.idx_employee_assignments_manager_id;
DROP INDEX IF EXISTS public.idx_ea_manager_id;
DROP INDEX IF EXISTS public.idx_documents_status;
DROP INDEX IF EXISTS public.idx_documents_category;
DROP INDEX IF EXISTS public.idx_doc_versions_docid;
DROP INDEX IF EXISTS public.idx_doc_entity_links_entity;
DROP INDEX IF EXISTS public.idx_depreciation_entries_asset;
DROP INDEX IF EXISTS public.idx_delivery_log_status;
DROP INDEX IF EXISTS public.idx_delivery_log_notification;
DROP INDEX IF EXISTS public.idx_delivery_log_created;
DROP INDEX IF EXISTS public.idx_delivery_log_company;
DROP INDEX IF EXISTS public.idx_delivery_log_channel;
DROP INDEX IF EXISTS public.idx_data_access_requests_status;
DROP INDEX IF EXISTS public.idx_data_access_requests_company;
DROP INDEX IF EXISTS public.idx_custom_roles_company;
DROP INDEX IF EXISTS public.idx_csat_company;
DROP INDEX IF EXISTS public.idx_csat_assignee;
DROP INDEX IF EXISTS public.idx_crm_opportunities_converted_client;
DROP INDEX IF EXISTS public.idx_comp_actions_company;
DROP INDEX IF EXISTS public.idx_client_portal_accounts_email;
DROP INDEX IF EXISTS public.idx_client_portal_accounts_client;
DROP INDEX IF EXISTS public.idx_capa_company;
DROP INDEX IF EXISTS public.idx_business_rules_trigger;
DROP INDEX IF EXISTS public.idx_business_rules_company;
DROP INDEX IF EXISTS public.idx_business_rules_active;
DROP INDEX IF EXISTS public.idx_business_rule_logs_rule;
DROP INDEX IF EXISTS public.idx_business_rule_logs_executed;
DROP INDEX IF EXISTS public.idx_business_rule_logs_company;
DROP INDEX IF EXISTS public.idx_budget_approval_requests_deleted_at;
DROP INDEX IF EXISTS public.idx_bank_statements_company;
DROP INDEX IF EXISTS public.idx_bank_statements_batch;
DROP INDEX IF EXISTS public.idx_bank_guarantees_expiry;
DROP INDEX IF EXISTS public.idx_bank_guarantees_deleted_at;
DROP INDEX IF EXISTS public.idx_bank_guarantees_company;
DROP INDEX IF EXISTS public.idx_audit_violations_type;
DROP INDEX IF EXISTS public.idx_audit_violations_status;
DROP INDEX IF EXISTS public.idx_audit_violations_priority;
DROP INDEX IF EXISTS public.idx_audit_violations_department;
DROP INDEX IF EXISTS public.idx_audit_violations_date;
DROP INDEX IF EXISTS public.idx_audit_violations_company;
DROP INDEX IF EXISTS public.idx_approval_actions_entity;
DROP INDEX IF EXISTS public.idx_approval_actions_company;
DROP INDEX IF EXISTS public.idx_applicant_accounts_email;
DROP INDEX IF EXISTS public.idx_alert_mute_rules_company;
DROP INDEX IF EXISTS public.idx_alert_mute_rules_assignment;
DROP INDEX IF EXISTS public.idx_alert_fatigue_settings_assignment;
DROP INDEX IF EXISTS public.hr_memo_violation_idx;
DROP INDEX IF EXISTS public.hr_memo_status_idx;
DROP INDEX IF EXISTS public.hr_memo_number_unique;
DROP INDEX IF EXISTS public.hr_memo_incident_date_idx;
DROP INDEX IF EXISTS public.hr_memo_events_memo_idx;
DROP INDEX IF EXISTS public.hr_memo_events_action_idx;
DROP INDEX IF EXISTS public.hr_memo_company_idx;
DROP INDEX IF EXISTS public.hr_memo_assignment_idx;
DROP INDEX IF EXISTS public.hr_disc_template_article_unique;
DROP INDEX IF EXISTS public.hr_disc_section_idx;
DROP INDEX IF EXISTS public.hr_disc_company_idx;
DROP INDEX IF EXISTS public.hr_disc_company_article_unique;
DROP INDEX IF EXISTS public.hr_disc_active_idx;
DROP INDEX IF EXISTS public.fleet_violations_vehicle_idx;
DROP INDEX IF EXISTS public.fleet_violations_company_idx;
DROP INDEX IF EXISTS public.fleet_insurance_vehicle_idx;
DROP INDEX IF EXISTS public.fleet_insurance_expiry_idx;
DROP INDEX IF EXISTS public.fixed_assets_company_idx;
DROP INDEX IF EXISTS public.expense_claims_status_idx;
DROP INDEX IF EXISTS public.expense_claims_employee_idx;
DROP INDEX IF EXISTS public.expense_claims_deleted_at_idx;
DROP INDEX IF EXISTS public.expense_claims_company_idx;
DROP INDEX IF EXISTS public.evaluation_summaries_employee_idx;
DROP INDEX IF EXISTS public.evaluation_summaries_cycle_idx;
DROP INDEX IF EXISTS public.evaluation_summaries_company_idx;
DROP INDEX IF EXISTS public.evaluation_cycles_employee_idx;
DROP INDEX IF EXISTS public.evaluation_cycles_company_idx;
DROP INDEX IF EXISTS public.eval_participants_evaluator_idx;
DROP INDEX IF EXISTS public.eval_participants_cycle_idx;
DROP INDEX IF EXISTS public.eval_participants_cycle_evaluator_idx;
DROP INDEX IF EXISTS public.employee_violations_deleted_at_idx;
DROP INDEX IF EXISTS public.employee_documents_expiry_idx;
DROP INDEX IF EXISTS public.employee_documents_employee_idx;
DROP INDEX IF EXISTS public.employee_documents_company_idx;
DROP INDEX IF EXISTS public.employee_contracts_probation_idx;
DROP INDEX IF EXISTS public.employee_contracts_employee_idx;
DROP INDEX IF EXISTS public.employee_contracts_company_idx;
DROP INDEX IF EXISTS public.employee_assignments_company_status_idx;
DROP INDEX IF EXISTS public.deduction_rules_company_idx;
DROP INDEX IF EXISTS public.cron_locks_job_name_uq;
DROP INDEX IF EXISTS public.crm_pipeline_stages_company_idx;
DROP INDEX IF EXISTS public.crm_contacts_company_idx;
DROP INDEX IF EXISTS public.crm_contacts_client_idx;
DROP INDEX IF EXISTS public.chart_of_accounts_deleted_at_idx;
DROP INDEX IF EXISTS public.chart_of_accounts_company_idx;
DROP INDEX IF EXISTS public.budget_lines_budget_idx;
DROP INDEX IF EXISTS public.automation_logs_type_idx;
DROP INDEX IF EXISTS public.automation_logs_created_idx;
DROP INDEX IF EXISTS public.automation_logs_company_idx;
DROP INDEX IF EXISTS public.audit_logs_user_idx;
DROP INDEX IF EXISTS public.audit_logs_entity_idx;
DROP INDEX IF EXISTS public.audit_logs_created_idx;
DROP INDEX IF EXISTS public.audit_logs_created_at_idx;
DROP INDEX IF EXISTS public.audit_logs_company_idx;
DROP INDEX IF EXISTS public.approval_requests_status_idx;
DROP INDEX IF EXISTS public.approval_requests_ref_idx;
DROP INDEX IF EXISTS public.approval_chains_company_type_idx;
DROP INDEX IF EXISTS public.anon_reviews_token_idx;
DROP INDEX IF EXISTS public.anon_reviews_manager_idx;
DROP INDEX IF EXISTS public.anon_reviews_cycle_idx;
DROP INDEX IF EXISTS public.accounting_mappings_company_idx;
ALTER TABLE IF EXISTS ONLY public.zatca_submission_log DROP CONSTRAINT IF EXISTS zatca_submission_log_pkey;
ALTER TABLE IF EXISTS ONLY public.zatca_settings DROP CONSTRAINT IF EXISTS zatca_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.zatca_settings DROP CONSTRAINT IF EXISTS "zatca_settings_companyId_key";
ALTER TABLE IF EXISTS ONLY public.workflows DROP CONSTRAINT IF EXISTS workflows_pkey;
ALTER TABLE IF EXISTS ONLY public.workflow_steps DROP CONSTRAINT IF EXISTS workflow_steps_pkey;
ALTER TABLE IF EXISTS ONLY public.workflow_steps DROP CONSTRAINT IF EXISTS "workflow_steps_definitionId_stepOrder_key";
ALTER TABLE IF EXISTS ONLY public.workflow_step_actions DROP CONSTRAINT IF EXISTS workflow_step_actions_pkey;
ALTER TABLE IF EXISTS ONLY public.workflow_instances DROP CONSTRAINT IF EXISTS workflow_instances_pkey;
ALTER TABLE IF EXISTS ONLY public.workflow_definitions DROP CONSTRAINT IF EXISTS workflow_definitions_pkey;
ALTER TABLE IF EXISTS ONLY public.workflow_definitions DROP CONSTRAINT IF EXISTS "workflow_definitions_companyId_requestType_key";
ALTER TABLE IF EXISTS ONLY public.whatsapp_queue DROP CONSTRAINT IF EXISTS whatsapp_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.warehouse_stock_batches DROP CONSTRAINT IF EXISTS warehouse_stock_batches_pkey;
ALTER TABLE IF EXISTS ONLY public.warehouse_products DROP CONSTRAINT IF EXISTS warehouse_products_pkey;
ALTER TABLE IF EXISTS ONLY public.warehouse_movements DROP CONSTRAINT IF EXISTS warehouse_movements_pkey;
ALTER TABLE IF EXISTS ONLY public.warehouse_categories DROP CONSTRAINT IF EXISTS warehouse_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE IF EXISTS ONLY public.user_shortcuts DROP CONSTRAINT IF EXISTS "user_shortcuts_userId_path_key";
ALTER TABLE IF EXISTS ONLY public.user_shortcuts DROP CONSTRAINT IF EXISTS user_shortcuts_pkey;
ALTER TABLE IF EXISTS ONLY public.user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;
ALTER TABLE IF EXISTS ONLY public.user_activity_log DROP CONSTRAINT IF EXISTS user_activity_log_pkey;
ALTER TABLE IF EXISTS ONLY public.client_portal_accounts DROP CONSTRAINT IF EXISTS uq_client_portal_accounts_client;
ALTER TABLE IF EXISTS ONLY public.umrah_transport DROP CONSTRAINT IF EXISTS umrah_transport_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_seasons DROP CONSTRAINT IF EXISTS umrah_seasons_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_pilgrims DROP CONSTRAINT IF EXISTS umrah_pilgrims_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_penalties DROP CONSTRAINT IF EXISTS umrah_penalties_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_packages DROP CONSTRAINT IF EXISTS umrah_packages_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_import_logs DROP CONSTRAINT IF EXISTS umrah_import_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_agents DROP CONSTRAINT IF EXISTS umrah_agents_pkey;
ALTER TABLE IF EXISTS ONLY public.umrah_agent_invoices DROP CONSTRAINT IF EXISTS umrah_agent_invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.training_programs DROP CONSTRAINT IF EXISTS training_programs_pkey;
ALTER TABLE IF EXISTS ONLY public.training_enrollments DROP CONSTRAINT IF EXISTS training_enrollments_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_replies DROP CONSTRAINT IF EXISTS ticket_replies_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_escalations DROP CONSTRAINT IF EXISTS ticket_escalations_pkey;
ALTER TABLE IF EXISTS ONLY public.ticket_csat_ratings DROP CONSTRAINT IF EXISTS "ticket_csat_ratings_ticketId_key";
ALTER TABLE IF EXISTS ONLY public.ticket_csat_ratings DROP CONSTRAINT IF EXISTS ticket_csat_ratings_pkey;
ALTER TABLE IF EXISTS ONLY public.tenants DROP CONSTRAINT IF EXISTS tenants_pkey;
ALTER TABLE IF EXISTS ONLY public.technicians DROP CONSTRAINT IF EXISTS technicians_pkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.system_settings DROP CONSTRAINT IF EXISTS "system_settings_companyId_branchId_key_key";
ALTER TABLE IF EXISTS ONLY public.system_evaluations DROP CONSTRAINT IF EXISTS system_evaluations_pkey;
ALTER TABLE IF EXISTS ONLY public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_pkey;
ALTER TABLE IF EXISTS ONLY public.suppliers DROP CONSTRAINT IF EXISTS suppliers_pkey;
ALTER TABLE IF EXISTS ONLY public.subsidiary_accounts DROP CONSTRAINT IF EXISTS subsidiary_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.subsidiary_accounts DROP CONSTRAINT IF EXISTS "subsidiary_accounts_companyId_entityType_entityId_accountTy_key";
ALTER TABLE IF EXISTS ONLY public.store_products DROP CONSTRAINT IF EXISTS store_products_pkey;
ALTER TABLE IF EXISTS ONLY public.store_orders DROP CONSTRAINT IF EXISTS store_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.store_order_items DROP CONSTRAINT IF EXISTS store_order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_pkey;
ALTER TABLE IF EXISTS ONLY public.stock_transfer_items DROP CONSTRAINT IF EXISTS stock_transfer_items_pkey;
ALTER TABLE IF EXISTS ONLY public.sms_queue DROP CONSTRAINT IF EXISTS sms_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.smart_alerts DROP CONSTRAINT IF EXISTS smart_alerts_pkey;
ALTER TABLE IF EXISTS ONLY public.sla_definitions DROP CONSTRAINT IF EXISTS sla_definitions_pkey;
ALTER TABLE IF EXISTS ONLY public.sla_definitions DROP CONSTRAINT IF EXISTS "sla_definitions_companyId_requestType_key";
ALTER TABLE IF EXISTS ONLY public.shifts DROP CONSTRAINT IF EXISTS shifts_pkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE IF EXISTS ONLY public.security_log DROP CONSTRAINT IF EXISTS security_log_pkey;
ALTER TABLE IF EXISTS ONLY public.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE IF EXISTS ONLY public.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_filename_key;
ALTER TABLE IF EXISTS ONLY public.scheduled_reports DROP CONSTRAINT IF EXISTS scheduled_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.scheduled_report_history DROP CONSTRAINT IF EXISTS scheduled_report_history_pkey;
ALTER TABLE IF EXISTS ONLY public.salary_components DROP CONSTRAINT IF EXISTS salary_components_pkey;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS roles_pkey;
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE IF EXISTS ONLY public.requests DROP CONSTRAINT IF EXISTS requests_pkey;
ALTER TABLE IF EXISTS ONLY public.request_types DROP CONSTRAINT IF EXISTS request_types_pkey;
ALTER TABLE IF EXISTS ONLY public.rental_contracts DROP CONSTRAINT IF EXISTS rental_contracts_pkey;
ALTER TABLE IF EXISTS ONLY public.rent_payments DROP CONSTRAINT IF EXISTS rent_payments_pkey;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_token_key;
ALTER TABLE IF EXISTS ONLY public.refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.recurring_journals DROP CONSTRAINT IF EXISTS recurring_journals_pkey;
ALTER TABLE IF EXISTS ONLY public.recurring_journal_runs DROP CONSTRAINT IF EXISTS recurring_journal_runs_pkey;
ALTER TABLE IF EXISTS ONLY public.quality_checks DROP CONSTRAINT IF EXISTS quality_checks_pkey;
ALTER TABLE IF EXISTS ONLY public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_pkey;
ALTER TABLE IF EXISTS ONLY public.push_subscriptions DROP CONSTRAINT IF EXISTS "push_subscriptions_companyId_endpointHash_key";
ALTER TABLE IF EXISTS ONLY public.purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_request_items DROP CONSTRAINT IF EXISTS purchase_request_items_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_pkey;
ALTER TABLE IF EXISTS ONLY public.public_holidays DROP CONSTRAINT IF EXISTS public_holidays_pkey;
ALTER TABLE IF EXISTS ONLY public.public_announcements DROP CONSTRAINT IF EXISTS public_announcements_pkey;
ALTER TABLE IF EXISTS ONLY public.property_units DROP CONSTRAINT IF EXISTS property_units_pkey;
ALTER TABLE IF EXISTS ONLY public.property_security_deposits DROP CONSTRAINT IF EXISTS property_security_deposits_pkey;
ALTER TABLE IF EXISTS ONLY public.property_owners DROP CONSTRAINT IF EXISTS property_owners_pkey;
ALTER TABLE IF EXISTS ONLY public.property_inspections DROP CONSTRAINT IF EXISTS property_inspections_pkey;
ALTER TABLE IF EXISTS ONLY public.property_buildings DROP CONSTRAINT IF EXISTS property_buildings_pkey;
ALTER TABLE IF EXISTS ONLY public.projects DROP CONSTRAINT IF EXISTS projects_pkey;
ALTER TABLE IF EXISTS ONLY public.project_tasks DROP CONSTRAINT IF EXISTS project_tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.project_task_dependencies DROP CONSTRAINT IF EXISTS project_task_dependencies_pkey;
ALTER TABLE IF EXISTS ONLY public.project_risks DROP CONSTRAINT IF EXISTS project_risks_pkey;
ALTER TABLE IF EXISTS ONLY public.project_resources DROP CONSTRAINT IF EXISTS project_resources_pkey;
ALTER TABLE IF EXISTS ONLY public.project_phases DROP CONSTRAINT IF EXISTS project_phases_pkey;
ALTER TABLE IF EXISTS ONLY public.project_milestones DROP CONSTRAINT IF EXISTS project_milestones_pkey;
ALTER TABLE IF EXISTS ONLY public.project_costs DROP CONSTRAINT IF EXISTS project_costs_pkey;
ALTER TABLE IF EXISTS ONLY public.processing_activities_log DROP CONSTRAINT IF EXISTS processing_activities_log_pkey;
ALTER TABLE IF EXISTS ONLY public.proactive_rules DROP CONSTRAINT IF EXISTS proactive_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.privacy_consent_records DROP CONSTRAINT IF EXISTS privacy_consent_records_pkey;
ALTER TABLE IF EXISTS ONLY public.policy_module_links DROP CONSTRAINT IF EXISTS "policy_module_links_policyId_module_key";
ALTER TABLE IF EXISTS ONLY public.policy_module_links DROP CONSTRAINT IF EXISTS policy_module_links_pkey;
ALTER TABLE IF EXISTS ONLY public.policy_compliance_actions DROP CONSTRAINT IF EXISTS policy_compliance_actions_pkey;
ALTER TABLE IF EXISTS ONLY public.permissions DROP CONSTRAINT IF EXISTS permissions_pkey;
ALTER TABLE IF EXISTS ONLY public.performance_reviews DROP CONSTRAINT IF EXISTS performance_reviews_pkey;
ALTER TABLE IF EXISTS ONLY public.peer_evaluations DROP CONSTRAINT IF EXISTS peer_evaluations_pkey;
ALTER TABLE IF EXISTS ONLY public.pbx_calls DROP CONSTRAINT IF EXISTS pbx_calls_pkey;
ALTER TABLE IF EXISTS ONLY public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_pkey;
ALTER TABLE IF EXISTS ONLY public.payroll_lines DROP CONSTRAINT IF EXISTS payroll_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.onboarding_tasks DROP CONSTRAINT IF EXISTS onboarding_tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.official_letters DROP CONSTRAINT IF EXISTS official_letters_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_webhooks DROP CONSTRAINT IF EXISTS notification_webhooks_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_templates DROP CONSTRAINT IF EXISTS "notification_templates_companyId_templateKey_channel_langua_key";
ALTER TABLE IF EXISTS ONLY public.notification_routing_rules DROP CONSTRAINT IF EXISTS notification_routing_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_routing_rules DROP CONSTRAINT IF EXISTS "notification_routing_rules_companyId_eventCategory_key";
ALTER TABLE IF EXISTS ONLY public.notification_preferences DROP CONSTRAINT IF EXISTS "notification_preferences_userId_channel_category_key";
ALTER TABLE IF EXISTS ONLY public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_log DROP CONSTRAINT IF EXISTS notification_log_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_fallback_chains DROP CONSTRAINT IF EXISTS notification_fallback_chains_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_delivery_log DROP CONSTRAINT IF EXISTS notification_delivery_log_pkey;
ALTER TABLE IF EXISTS ONLY public.marketing_campaigns DROP CONSTRAINT IF EXISTS marketing_campaigns_pkey;
ALTER TABLE IF EXISTS ONLY public.maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.loan_accounts DROP CONSTRAINT IF EXISTS loan_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_sessions DROP CONSTRAINT IF EXISTS legal_sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_judgments DROP CONSTRAINT IF EXISTS legal_judgments_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_correspondence DROP CONSTRAINT IF EXISTS legal_correspondence_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_contracts DROP CONSTRAINT IF EXISTS legal_contracts_pkey;
ALTER TABLE IF EXISTS ONLY public.legal_cases DROP CONSTRAINT IF EXISTS legal_cases_pkey;
ALTER TABLE IF EXISTS ONLY public.leave_balances DROP CONSTRAINT IF EXISTS leave_balances_pkey;
ALTER TABLE IF EXISTS ONLY public.leave_balances DROP CONSTRAINT IF EXISTS "leave_balances_employeeId_leaveTypeId_year_key";
ALTER TABLE IF EXISTS ONLY public.leave_approval_stages DROP CONSTRAINT IF EXISTS leave_approval_stages_pkey;
ALTER TABLE IF EXISTS ONLY public.late_rent_actions DROP CONSTRAINT IF EXISTS late_rent_actions_pkey;
ALTER TABLE IF EXISTS ONLY public.kpi_snapshots DROP CONSTRAINT IF EXISTS kpi_snapshots_pkey;
ALTER TABLE IF EXISTS ONLY public.kb_articles DROP CONSTRAINT IF EXISTS kb_articles_pkey;
ALTER TABLE IF EXISTS ONLY public.journal_lines DROP CONSTRAINT IF EXISTS journal_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.journal_entry_templates DROP CONSTRAINT IF EXISTS journal_entry_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.journal_entry_template_lines DROP CONSTRAINT IF EXISTS journal_entry_template_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.job_titles DROP CONSTRAINT IF EXISTS job_titles_pkey;
ALTER TABLE IF EXISTS ONLY public.job_postings DROP CONSTRAINT IF EXISTS job_postings_pkey;
ALTER TABLE IF EXISTS ONLY public.job_applications DROP CONSTRAINT IF EXISTS job_applications_pkey;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_ref_key;
ALTER TABLE IF EXISTS ONLY public.invoices DROP CONSTRAINT IF EXISTS invoices_pkey;
ALTER TABLE IF EXISTS ONLY public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_pkey;
ALTER TABLE IF EXISTS ONLY public.invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.invoice_collection_stages DROP CONSTRAINT IF EXISTS invoice_collection_stages_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_counts DROP CONSTRAINT IF EXISTS inventory_counts_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_count_items DROP CONSTRAINT IF EXISTS inventory_count_items_pkey;
ALTER TABLE IF EXISTS ONLY public.inventory_count_items DROP CONSTRAINT IF EXISTS "inventory_count_items_countId_productId_key";
ALTER TABLE IF EXISTS ONLY public.intercompany_transactions DROP CONSTRAINT IF EXISTS intercompany_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.integrations DROP CONSTRAINT IF EXISTS integrations_pkey;
ALTER TABLE IF EXISTS ONLY public.integration_logs DROP CONSTRAINT IF EXISTS integration_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_leave_types DROP CONSTRAINT IF EXISTS hr_leave_types_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_leave_balances DROP CONSTRAINT IF EXISTS hr_leave_balances_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memos DROP CONSTRAINT IF EXISTS hr_inquiry_memos_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_inquiry_memo_events DROP CONSTRAINT IF EXISTS hr_inquiry_memo_events_pkey;
ALTER TABLE IF EXISTS ONLY public.hr_discipline_regulation DROP CONSTRAINT IF EXISTS hr_discipline_regulation_pkey;
ALTER TABLE IF EXISTS ONLY public.governance_risks DROP CONSTRAINT IF EXISTS governance_risks_pkey;
ALTER TABLE IF EXISTS ONLY public.governance_policies DROP CONSTRAINT IF EXISTS governance_policies_pkey;
ALTER TABLE IF EXISTS ONLY public.governance_compliance DROP CONSTRAINT IF EXISTS governance_compliance_pkey;
ALTER TABLE IF EXISTS ONLY public.governance_capa DROP CONSTRAINT IF EXISTS governance_capa_pkey;
ALTER TABLE IF EXISTS ONLY public.governance_audits DROP CONSTRAINT IF EXISTS governance_audits_pkey;
ALTER TABLE IF EXISTS ONLY public.gov_integrations DROP CONSTRAINT IF EXISTS gov_integrations_pkey;
ALTER TABLE IF EXISTS ONLY public.gov_integrations DROP CONSTRAINT IF EXISTS "gov_integrations_companyId_type_key";
ALTER TABLE IF EXISTS ONLY public.gov_integration_links DROP CONSTRAINT IF EXISTS gov_integration_links_pkey;
ALTER TABLE IF EXISTS ONLY public.goods_receipts DROP CONSTRAINT IF EXISTS goods_receipts_pkey;
ALTER TABLE IF EXISTS ONLY public.goods_receipt_items DROP CONSTRAINT IF EXISTS goods_receipt_items_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_violations DROP CONSTRAINT IF EXISTS fleet_violations_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_vehicles DROP CONSTRAINT IF EXISTS fleet_vehicles_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_trips DROP CONSTRAINT IF EXISTS fleet_trips_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_traffic_violations DROP CONSTRAINT IF EXISTS fleet_traffic_violations_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_preventive_plans DROP CONSTRAINT IF EXISTS fleet_preventive_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_maintenance DROP CONSTRAINT IF EXISTS fleet_maintenance_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_insurance DROP CONSTRAINT IF EXISTS fleet_insurance_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_gps_tracking DROP CONSTRAINT IF EXISTS fleet_gps_tracking_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_fuel_logs DROP CONSTRAINT IF EXISTS fleet_fuel_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.fleet_drivers DROP CONSTRAINT IF EXISTS fleet_drivers_pkey;
ALTER TABLE IF EXISTS ONLY public.fixed_assets DROP CONSTRAINT IF EXISTS fixed_assets_pkey;
ALTER TABLE IF EXISTS ONLY public.financial_periods DROP CONSTRAINT IF EXISTS financial_periods_pkey;
ALTER TABLE IF EXISTS ONLY public.expense_claims DROP CONSTRAINT IF EXISTS expense_claims_pkey;
ALTER TABLE IF EXISTS ONLY public.event_logs DROP CONSTRAINT IF EXISTS event_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.evaluation_summaries DROP CONSTRAINT IF EXISTS evaluation_summaries_pkey;
ALTER TABLE IF EXISTS ONLY public.evaluation_participants DROP CONSTRAINT IF EXISTS evaluation_participants_pkey;
ALTER TABLE IF EXISTS ONLY public.evaluation_cycles DROP CONSTRAINT IF EXISTS evaluation_cycles_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_tags DROP CONSTRAINT IF EXISTS entity_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.entity_tags DROP CONSTRAINT IF EXISTS "entity_tags_entityType_entityId_tag_companyId_key";
ALTER TABLE IF EXISTS ONLY public.entity_comments DROP CONSTRAINT IF EXISTS entity_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_pkey;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_phone_key;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS "employees_nationalId_key";
ALTER TABLE IF EXISTS ONLY public.employee_violations DROP CONSTRAINT IF EXISTS employee_violations_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_transfers DROP CONSTRAINT IF EXISTS employee_transfers_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_shift_assignments DROP CONSTRAINT IF EXISTS employee_shift_assignments_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS employee_of_month_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_of_month DROP CONSTRAINT IF EXISTS "employee_of_month_companyId_month_year_key";
ALTER TABLE IF EXISTS ONLY public.employee_monthly_attendance DROP CONSTRAINT IF EXISTS employee_monthly_attendance_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_monthly_attendance DROP CONSTRAINT IF EXISTS "employee_monthly_attendance_assignmentId_period_key";
ALTER TABLE IF EXISTS ONLY public.employee_documents DROP CONSTRAINT IF EXISTS employee_documents_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_development_plans DROP CONSTRAINT IF EXISTS employee_development_plans_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_contracts DROP CONSTRAINT IF EXISTS employee_contracts_pkey;
ALTER TABLE IF EXISTS ONLY public.employee_assignments DROP CONSTRAINT IF EXISTS employee_assignments_pkey;
ALTER TABLE IF EXISTS ONLY public.email_queue DROP CONSTRAINT IF EXISTS email_queue_pkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE IF EXISTS ONLY public.document_versions DROP CONSTRAINT IF EXISTS document_versions_pkey;
ALTER TABLE IF EXISTS ONLY public.document_templates DROP CONSTRAINT IF EXISTS document_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.document_folders DROP CONSTRAINT IF EXISTS document_folders_pkey;
ALTER TABLE IF EXISTS ONLY public.document_entity_links DROP CONSTRAINT IF EXISTS document_entity_links_pkey;
ALTER TABLE IF EXISTS ONLY public.document_entity_links DROP CONSTRAINT IF EXISTS "document_entity_links_documentId_entityType_entityId_key";
ALTER TABLE IF EXISTS ONLY public.digital_signature_otps DROP CONSTRAINT IF EXISTS digital_signature_otps_pkey;
ALTER TABLE IF EXISTS ONLY public.digital_signature_logs DROP CONSTRAINT IF EXISTS digital_signature_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.depreciation_entries DROP CONSTRAINT IF EXISTS depreciation_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_pkey;
ALTER TABLE IF EXISTS ONLY public.deduction_rules DROP CONSTRAINT IF EXISTS deduction_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.data_retention_policies DROP CONSTRAINT IF EXISTS data_retention_policies_pkey;
ALTER TABLE IF EXISTS ONLY public.data_retention_policies DROP CONSTRAINT IF EXISTS "data_retention_policies_companyId_dataType_key";
ALTER TABLE IF EXISTS ONLY public.data_access_requests DROP CONSTRAINT IF EXISTS data_access_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.daily_closures DROP CONSTRAINT IF EXISTS daily_closures_pkey;
ALTER TABLE IF EXISTS ONLY public.daily_closures DROP CONSTRAINT IF EXISTS "daily_closures_companyId_date_key";
ALTER TABLE IF EXISTS ONLY public.daily_close_log DROP CONSTRAINT IF EXISTS daily_close_log_pkey;
ALTER TABLE IF EXISTS ONLY public.daily_close_log DROP CONSTRAINT IF EXISTS "daily_close_log_companyId_closeDate_key";
ALTER TABLE IF EXISTS ONLY public.custom_roles DROP CONSTRAINT IF EXISTS custom_roles_pkey;
ALTER TABLE IF EXISTS ONLY public.custom_roles DROP CONSTRAINT IF EXISTS "custom_roles_companyId_roleKey_key";
ALTER TABLE IF EXISTS ONLY public.cron_logs DROP CONSTRAINT IF EXISTS cron_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.cron_locks DROP CONSTRAINT IF EXISTS cron_locks_pkey;
ALTER TABLE IF EXISTS ONLY public.cron_locks DROP CONSTRAINT IF EXISTS cron_locks_job_name_key;
ALTER TABLE IF EXISTS ONLY public.cron_jobs DROP CONSTRAINT IF EXISTS cron_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.cron_jobs DROP CONSTRAINT IF EXISTS cron_jobs_name_key;
ALTER TABLE IF EXISTS ONLY public.crm_pipeline_stages DROP CONSTRAINT IF EXISTS crm_pipeline_stages_pkey;
ALTER TABLE IF EXISTS ONLY public.crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_pkey;
ALTER TABLE IF EXISTS ONLY public.crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_pkey;
ALTER TABLE IF EXISTS ONLY public.crm_activities DROP CONSTRAINT IF EXISTS crm_activities_pkey;
ALTER TABLE IF EXISTS ONLY public.contract_payment_schedule DROP CONSTRAINT IF EXISTS contract_payment_schedule_pkey;
ALTER TABLE IF EXISTS ONLY public.companies DROP CONSTRAINT IF EXISTS companies_pkey;
ALTER TABLE IF EXISTS ONLY public.communications_log DROP CONSTRAINT IF EXISTS communications_log_pkey;
ALTER TABLE IF EXISTS ONLY public.collection_follow_ups DROP CONSTRAINT IF EXISTS collection_follow_ups_pkey;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
ALTER TABLE IF EXISTS ONLY public.client_rfm_scores DROP CONSTRAINT IF EXISTS client_rfm_scores_pkey;
ALTER TABLE IF EXISTS ONLY public.client_rfm_scores DROP CONSTRAINT IF EXISTS "client_rfm_scores_companyId_clientId_key";
ALTER TABLE IF EXISTS ONLY public.client_portal_accounts DROP CONSTRAINT IF EXISTS client_portal_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.client_portal_accounts DROP CONSTRAINT IF EXISTS client_portal_accounts_email_key;
ALTER TABLE IF EXISTS ONLY public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_company_code_uq;
ALTER TABLE IF EXISTS ONLY public.business_rules DROP CONSTRAINT IF EXISTS business_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.business_rule_logs DROP CONSTRAINT IF EXISTS business_rule_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.budgets DROP CONSTRAINT IF EXISTS budgets_pkey;
ALTER TABLE IF EXISTS ONLY public.budget_lines DROP CONSTRAINT IF EXISTS budget_lines_pkey;
ALTER TABLE IF EXISTS ONLY public.budget_approval_requests DROP CONSTRAINT IF EXISTS budget_approval_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.branches DROP CONSTRAINT IF EXISTS branches_pkey;
ALTER TABLE IF EXISTS ONLY public.bi_reports DROP CONSTRAINT IF EXISTS bi_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.bi_kpis DROP CONSTRAINT IF EXISTS bi_kpis_pkey;
ALTER TABLE IF EXISTS ONLY public.bi_dashboards DROP CONSTRAINT IF EXISTS bi_dashboards_pkey;
ALTER TABLE IF EXISTS ONLY public.bank_statements DROP CONSTRAINT IF EXISTS bank_statements_pkey;
ALTER TABLE IF EXISTS ONLY public.bank_guarantees DROP CONSTRAINT IF EXISTS bank_guarantees_pkey;
ALTER TABLE IF EXISTS ONLY public.automation_logs DROP CONSTRAINT IF EXISTS automation_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_violations DROP CONSTRAINT IF EXISTS audit_violations_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.attendance_policies DROP CONSTRAINT IF EXISTS attendance_policies_pkey;
ALTER TABLE IF EXISTS ONLY public.attendance_policies DROP CONSTRAINT IF EXISTS "attendance_policies_companyId_key";
ALTER TABLE IF EXISTS ONLY public.attendance DROP CONSTRAINT IF EXISTS attendance_pkey;
ALTER TABLE IF EXISTS ONLY public.attendance_deductions DROP CONSTRAINT IF EXISTS attendance_deductions_pkey;
ALTER TABLE IF EXISTS ONLY public.approval_requests DROP CONSTRAINT IF EXISTS approval_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.approval_chains DROP CONSTRAINT IF EXISTS approval_chains_pkey;
ALTER TABLE IF EXISTS ONLY public.approval_chain_steps DROP CONSTRAINT IF EXISTS approval_chain_steps_pkey;
ALTER TABLE IF EXISTS ONLY public.approval_actions DROP CONSTRAINT IF EXISTS approval_actions_pkey;
ALTER TABLE IF EXISTS ONLY public.applicant_accounts DROP CONSTRAINT IF EXISTS applicant_accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.applicant_accounts DROP CONSTRAINT IF EXISTS applicant_accounts_email_key;
ALTER TABLE IF EXISTS ONLY public.anonymous_upward_reviews DROP CONSTRAINT IF EXISTS anonymous_upward_reviews_pkey;
ALTER TABLE IF EXISTS ONLY public.alert_mute_rules DROP CONSTRAINT IF EXISTS alert_mute_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.alert_mute_rules DROP CONSTRAINT IF EXISTS "alert_mute_rules_assignmentId_alertType_key";
ALTER TABLE IF EXISTS ONLY public.alert_fatigue_settings DROP CONSTRAINT IF EXISTS alert_fatigue_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.accounting_mappings DROP CONSTRAINT IF EXISTS accounting_mappings_pkey;
ALTER TABLE IF EXISTS ONLY public.accounting_mappings DROP CONSTRAINT IF EXISTS "accounting_mappings_companyId_operationType_key";
ALTER TABLE IF EXISTS public.zatca_submission_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.zatca_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.workflows ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.workflow_steps ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.workflow_step_actions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.workflow_instances ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.workflow_definitions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.whatsapp_queue ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.warehouse_stock_batches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.warehouse_products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.warehouse_movements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.warehouse_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_shortcuts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.user_activity_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_transport ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_seasons ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_pilgrims ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_penalties ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_packages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_import_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_agents ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.umrah_agent_invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.training_programs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.training_enrollments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ticket_replies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ticket_escalations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.ticket_csat_ratings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tenants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.technicians ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tasks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.system_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.system_evaluations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.support_tickets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.suppliers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.subsidiary_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.store_products ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.store_orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.store_order_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stock_transfers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stock_transfer_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sms_queue ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.smart_alerts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.sla_definitions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.shifts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.security_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.schema_migrations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.scheduled_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.scheduled_report_history ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.salary_components ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.role_permissions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.request_types ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rental_contracts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rent_payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.recurring_journals ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.recurring_journal_runs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.quality_checks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.push_subscriptions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_request_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_orders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.purchase_order_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.public_holidays ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.public_announcements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.property_units ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.property_security_deposits ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.property_owners ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.property_inspections ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.property_buildings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.projects ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_tasks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_task_dependencies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_risks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_resources ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_phases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_milestones ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.project_costs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.processing_activities_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.proactive_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.privacy_consent_records ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.policy_module_links ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.policy_compliance_actions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.permissions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.performance_reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.peer_evaluations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.pbx_calls ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.payroll_runs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.payroll_lines ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.password_reset_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.onboarding_tasks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.official_letters ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_webhooks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_routing_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_preferences ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_fallback_chains ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_delivery_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.marketing_campaigns ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.maintenance_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.loan_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.legal_sessions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.legal_judgments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.legal_correspondence ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.legal_contracts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.legal_cases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.leave_balances ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.leave_approval_stages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.late_rent_actions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.kpi_snapshots ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.kb_articles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.journal_lines ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.journal_entry_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.journal_entry_template_lines ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.journal_entries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.job_titles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.job_postings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.job_applications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoices ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_lines ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.invoice_collection_stages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_counts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.inventory_count_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.intercompany_transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.integrations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.integration_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_leave_types ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_leave_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_leave_balances ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_inquiry_memos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_inquiry_memo_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hr_discipline_regulation ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.governance_risks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.governance_policies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.governance_compliance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.governance_capa ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.governance_audits ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.gov_integrations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.gov_integration_links ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.goods_receipts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.goods_receipt_items ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_violations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_vehicles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_trips ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_traffic_violations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_preventive_plans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_maintenance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_insurance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_gps_tracking ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_fuel_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fleet_drivers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fixed_assets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.financial_periods ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.expense_claims ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.event_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.evaluation_summaries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.evaluation_participants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.evaluation_cycles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.entity_tags ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.entity_comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employees ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_violations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_transfers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_shift_assignments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_of_month ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_monthly_attendance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_documents ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_development_plans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_contracts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employee_assignments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.email_queue ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.documents ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.document_versions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.document_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.document_folders ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.document_entity_links ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.digital_signature_otps ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.digital_signature_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.depreciation_entries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.departments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.deduction_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.data_retention_policies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.data_access_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.daily_closures ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.daily_close_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.custom_roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cron_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cron_locks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cron_jobs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.crm_pipeline_stages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.crm_opportunities ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.crm_contacts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.crm_activities ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.contract_payment_schedule ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.companies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.communications_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.collection_follow_ups ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.clients ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.client_rfm_scores ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.client_portal_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chart_of_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.business_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.business_rule_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.budgets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.budget_lines ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.budget_approval_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.branches ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bi_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bi_kpis ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bi_dashboards ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bank_statements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.bank_guarantees ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.automation_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_violations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.attendance_policies ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.attendance_deductions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.attendance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.approval_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.approval_chains ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.approval_chain_steps ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.approval_actions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.applicant_accounts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.anonymous_upward_reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.alert_mute_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.alert_fatigue_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.accounting_mappings ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.zatca_submission_log_id_seq;
DROP TABLE IF EXISTS public.zatca_submission_log;
DROP SEQUENCE IF EXISTS public.zatca_settings_id_seq;
DROP TABLE IF EXISTS public.zatca_settings;
DROP SEQUENCE IF EXISTS public.workflows_id_seq;
DROP TABLE IF EXISTS public.workflows;
DROP SEQUENCE IF EXISTS public.workflow_steps_id_seq;
DROP TABLE IF EXISTS public.workflow_steps;
DROP SEQUENCE IF EXISTS public.workflow_step_actions_id_seq;
DROP TABLE IF EXISTS public.workflow_step_actions;
DROP SEQUENCE IF EXISTS public.workflow_instances_id_seq;
DROP TABLE IF EXISTS public.workflow_instances;
DROP SEQUENCE IF EXISTS public.workflow_definitions_id_seq;
DROP TABLE IF EXISTS public.workflow_definitions;
DROP SEQUENCE IF EXISTS public.whatsapp_queue_id_seq;
DROP TABLE IF EXISTS public.whatsapp_queue;
DROP SEQUENCE IF EXISTS public.warehouse_stock_batches_id_seq;
DROP TABLE IF EXISTS public.warehouse_stock_batches;
DROP SEQUENCE IF EXISTS public.warehouse_products_id_seq;
DROP TABLE IF EXISTS public.warehouse_products;
DROP SEQUENCE IF EXISTS public.warehouse_movements_id_seq;
DROP TABLE IF EXISTS public.warehouse_movements;
DROP SEQUENCE IF EXISTS public.warehouse_categories_id_seq;
DROP TABLE IF EXISTS public.warehouse_categories;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.user_shortcuts_id_seq;
DROP TABLE IF EXISTS public.user_shortcuts;
DROP SEQUENCE IF EXISTS public.user_roles_id_seq;
DROP TABLE IF EXISTS public.user_roles;
DROP SEQUENCE IF EXISTS public.user_activity_log_id_seq;
DROP TABLE IF EXISTS public.user_activity_log;
DROP SEQUENCE IF EXISTS public.umrah_transport_id_seq;
DROP TABLE IF EXISTS public.umrah_transport;
DROP SEQUENCE IF EXISTS public.umrah_seasons_id_seq;
DROP TABLE IF EXISTS public.umrah_seasons;
DROP SEQUENCE IF EXISTS public.umrah_pilgrims_id_seq;
DROP TABLE IF EXISTS public.umrah_pilgrims;
DROP SEQUENCE IF EXISTS public.umrah_penalties_id_seq;
DROP TABLE IF EXISTS public.umrah_penalties;
DROP SEQUENCE IF EXISTS public.umrah_packages_id_seq;
DROP TABLE IF EXISTS public.umrah_packages;
DROP SEQUENCE IF EXISTS public.umrah_import_logs_id_seq;
DROP TABLE IF EXISTS public.umrah_import_logs;
DROP SEQUENCE IF EXISTS public.umrah_agents_id_seq;
DROP TABLE IF EXISTS public.umrah_agents;
DROP SEQUENCE IF EXISTS public.umrah_agent_invoices_id_seq;
DROP TABLE IF EXISTS public.umrah_agent_invoices;
DROP SEQUENCE IF EXISTS public.training_programs_id_seq;
DROP TABLE IF EXISTS public.training_programs;
DROP SEQUENCE IF EXISTS public.training_enrollments_id_seq;
DROP TABLE IF EXISTS public.training_enrollments;
DROP SEQUENCE IF EXISTS public.ticket_replies_id_seq;
DROP TABLE IF EXISTS public.ticket_replies;
DROP SEQUENCE IF EXISTS public.ticket_escalations_id_seq;
DROP TABLE IF EXISTS public.ticket_escalations;
DROP SEQUENCE IF EXISTS public.ticket_csat_ratings_id_seq;
DROP TABLE IF EXISTS public.ticket_csat_ratings;
DROP SEQUENCE IF EXISTS public.tenants_id_seq;
DROP TABLE IF EXISTS public.tenants;
DROP SEQUENCE IF EXISTS public.technicians_id_seq;
DROP TABLE IF EXISTS public.technicians;
DROP SEQUENCE IF EXISTS public.tasks_id_seq;
DROP TABLE IF EXISTS public.tasks;
DROP SEQUENCE IF EXISTS public.system_settings_id_seq;
DROP TABLE IF EXISTS public.system_settings;
DROP SEQUENCE IF EXISTS public.system_evaluations_id_seq;
DROP TABLE IF EXISTS public.system_evaluations;
DROP SEQUENCE IF EXISTS public.support_tickets_id_seq;
DROP TABLE IF EXISTS public.support_tickets;
DROP SEQUENCE IF EXISTS public.suppliers_id_seq;
DROP TABLE IF EXISTS public.suppliers;
DROP SEQUENCE IF EXISTS public.subsidiary_accounts_id_seq;
DROP TABLE IF EXISTS public.subsidiary_accounts;
DROP SEQUENCE IF EXISTS public.store_products_id_seq;
DROP TABLE IF EXISTS public.store_products;
DROP SEQUENCE IF EXISTS public.store_orders_id_seq;
DROP TABLE IF EXISTS public.store_orders;
DROP SEQUENCE IF EXISTS public.store_order_items_id_seq;
DROP TABLE IF EXISTS public.store_order_items;
DROP SEQUENCE IF EXISTS public.stock_transfers_id_seq;
DROP TABLE IF EXISTS public.stock_transfers;
DROP SEQUENCE IF EXISTS public.stock_transfer_items_id_seq;
DROP TABLE IF EXISTS public.stock_transfer_items;
DROP SEQUENCE IF EXISTS public.sms_queue_id_seq;
DROP TABLE IF EXISTS public.sms_queue;
DROP SEQUENCE IF EXISTS public.smart_alerts_id_seq;
DROP TABLE IF EXISTS public.smart_alerts;
DROP SEQUENCE IF EXISTS public.sla_definitions_id_seq;
DROP TABLE IF EXISTS public.sla_definitions;
DROP SEQUENCE IF EXISTS public.shifts_id_seq;
DROP TABLE IF EXISTS public.shifts;
DROP SEQUENCE IF EXISTS public.settings_id_seq;
DROP TABLE IF EXISTS public.settings;
DROP SEQUENCE IF EXISTS public.security_log_id_seq;
DROP TABLE IF EXISTS public.security_log;
DROP SEQUENCE IF EXISTS public.schema_migrations_id_seq;
DROP TABLE IF EXISTS public.schema_migrations;
DROP SEQUENCE IF EXISTS public.scheduled_reports_id_seq;
DROP TABLE IF EXISTS public.scheduled_reports;
DROP SEQUENCE IF EXISTS public.scheduled_report_history_id_seq;
DROP TABLE IF EXISTS public.scheduled_report_history;
DROP SEQUENCE IF EXISTS public.salary_components_id_seq;
DROP TABLE IF EXISTS public.salary_components;
DROP SEQUENCE IF EXISTS public.roles_id_seq;
DROP TABLE IF EXISTS public.roles;
DROP SEQUENCE IF EXISTS public.role_permissions_id_seq;
DROP TABLE IF EXISTS public.role_permissions;
DROP SEQUENCE IF EXISTS public.requests_id_seq;
DROP TABLE IF EXISTS public.requests;
DROP SEQUENCE IF EXISTS public.request_types_id_seq;
DROP TABLE IF EXISTS public.request_types;
DROP SEQUENCE IF EXISTS public.rental_contracts_id_seq;
DROP TABLE IF EXISTS public.rental_contracts;
DROP SEQUENCE IF EXISTS public.rent_payments_id_seq;
DROP TABLE IF EXISTS public.rent_payments;
DROP TABLE IF EXISTS public.refresh_tokens;
DROP SEQUENCE IF EXISTS public.recurring_journals_id_seq;
DROP TABLE IF EXISTS public.recurring_journals;
DROP SEQUENCE IF EXISTS public.recurring_journal_runs_id_seq;
DROP TABLE IF EXISTS public.recurring_journal_runs;
DROP SEQUENCE IF EXISTS public.quality_checks_id_seq;
DROP TABLE IF EXISTS public.quality_checks;
DROP SEQUENCE IF EXISTS public.push_subscriptions_id_seq;
DROP TABLE IF EXISTS public.push_subscriptions;
DROP SEQUENCE IF EXISTS public.purchase_requests_id_seq;
DROP TABLE IF EXISTS public.purchase_requests;
DROP SEQUENCE IF EXISTS public.purchase_request_items_id_seq;
DROP TABLE IF EXISTS public.purchase_request_items;
DROP SEQUENCE IF EXISTS public.purchase_orders_id_seq;
DROP TABLE IF EXISTS public.purchase_orders;
DROP SEQUENCE IF EXISTS public.purchase_order_items_id_seq;
DROP TABLE IF EXISTS public.purchase_order_items;
DROP SEQUENCE IF EXISTS public.public_holidays_id_seq;
DROP TABLE IF EXISTS public.public_holidays;
DROP SEQUENCE IF EXISTS public.public_announcements_id_seq;
DROP TABLE IF EXISTS public.public_announcements;
DROP SEQUENCE IF EXISTS public.property_units_id_seq;
DROP TABLE IF EXISTS public.property_units;
DROP SEQUENCE IF EXISTS public.property_security_deposits_id_seq;
DROP TABLE IF EXISTS public.property_security_deposits;
DROP SEQUENCE IF EXISTS public.property_owners_id_seq;
DROP TABLE IF EXISTS public.property_owners;
DROP SEQUENCE IF EXISTS public.property_inspections_id_seq;
DROP TABLE IF EXISTS public.property_inspections;
DROP SEQUENCE IF EXISTS public.property_buildings_id_seq;
DROP TABLE IF EXISTS public.property_buildings;
DROP SEQUENCE IF EXISTS public.projects_id_seq;
DROP TABLE IF EXISTS public.projects;
DROP SEQUENCE IF EXISTS public.project_tasks_id_seq;
DROP TABLE IF EXISTS public.project_tasks;
DROP SEQUENCE IF EXISTS public.project_task_dependencies_id_seq;
DROP TABLE IF EXISTS public.project_task_dependencies;
DROP SEQUENCE IF EXISTS public.project_risks_id_seq;
DROP TABLE IF EXISTS public.project_risks;
DROP SEQUENCE IF EXISTS public.project_resources_id_seq;
DROP TABLE IF EXISTS public.project_resources;
DROP SEQUENCE IF EXISTS public.project_phases_id_seq;
DROP TABLE IF EXISTS public.project_phases;
DROP SEQUENCE IF EXISTS public.project_milestones_id_seq;
DROP TABLE IF EXISTS public.project_milestones;
DROP SEQUENCE IF EXISTS public.project_costs_id_seq;
DROP TABLE IF EXISTS public.project_costs;
DROP SEQUENCE IF EXISTS public.processing_activities_log_id_seq;
DROP TABLE IF EXISTS public.processing_activities_log;
DROP SEQUENCE IF EXISTS public.proactive_rules_id_seq;
DROP TABLE IF EXISTS public.proactive_rules;
DROP SEQUENCE IF EXISTS public.privacy_consent_records_id_seq;
DROP TABLE IF EXISTS public.privacy_consent_records;
DROP SEQUENCE IF EXISTS public.pr_number_seq;
DROP SEQUENCE IF EXISTS public.policy_module_links_id_seq;
DROP TABLE IF EXISTS public.policy_module_links;
DROP SEQUENCE IF EXISTS public.policy_compliance_actions_id_seq;
DROP TABLE IF EXISTS public.policy_compliance_actions;
DROP SEQUENCE IF EXISTS public.po_number_seq;
DROP SEQUENCE IF EXISTS public.permissions_id_seq;
DROP TABLE IF EXISTS public.permissions;
DROP SEQUENCE IF EXISTS public.performance_reviews_id_seq;
DROP TABLE IF EXISTS public.performance_reviews;
DROP SEQUENCE IF EXISTS public.peer_evaluations_id_seq;
DROP TABLE IF EXISTS public.peer_evaluations;
DROP SEQUENCE IF EXISTS public.pbx_calls_id_seq;
DROP TABLE IF EXISTS public.pbx_calls;
DROP SEQUENCE IF EXISTS public.payroll_runs_id_seq;
DROP VIEW IF EXISTS public.payroll_records;
DROP TABLE IF EXISTS public.payroll_runs;
DROP SEQUENCE IF EXISTS public.payroll_lines_id_seq;
DROP TABLE IF EXISTS public.payroll_lines;
DROP SEQUENCE IF EXISTS public.password_reset_requests_id_seq;
DROP TABLE IF EXISTS public.password_reset_requests;
DROP SEQUENCE IF EXISTS public.onboarding_tasks_id_seq;
DROP TABLE IF EXISTS public.onboarding_tasks;
DROP SEQUENCE IF EXISTS public.official_letters_id_seq;
DROP TABLE IF EXISTS public.official_letters;
DROP SEQUENCE IF EXISTS public.notifications_id_seq;
DROP TABLE IF EXISTS public.notifications;
DROP SEQUENCE IF EXISTS public.notification_webhooks_id_seq;
DROP TABLE IF EXISTS public.notification_webhooks;
DROP SEQUENCE IF EXISTS public.notification_templates_id_seq;
DROP TABLE IF EXISTS public.notification_templates;
DROP SEQUENCE IF EXISTS public.notification_routing_rules_id_seq;
DROP TABLE IF EXISTS public.notification_routing_rules;
DROP SEQUENCE IF EXISTS public.notification_preferences_id_seq;
DROP TABLE IF EXISTS public.notification_preferences;
DROP SEQUENCE IF EXISTS public.notification_log_id_seq;
DROP TABLE IF EXISTS public.notification_log;
DROP SEQUENCE IF EXISTS public.notification_fallback_chains_id_seq;
DROP TABLE IF EXISTS public.notification_fallback_chains;
DROP SEQUENCE IF EXISTS public.notification_delivery_log_id_seq;
DROP TABLE IF EXISTS public.notification_delivery_log;
DROP SEQUENCE IF EXISTS public.marketing_campaigns_id_seq;
DROP TABLE IF EXISTS public.marketing_campaigns;
DROP SEQUENCE IF EXISTS public.maintenance_requests_id_seq;
DROP TABLE IF EXISTS public.maintenance_requests;
DROP SEQUENCE IF EXISTS public.loan_accounts_id_seq;
DROP TABLE IF EXISTS public.loan_accounts;
DROP SEQUENCE IF EXISTS public.legal_sessions_id_seq;
DROP TABLE IF EXISTS public.legal_sessions;
DROP SEQUENCE IF EXISTS public.legal_judgments_id_seq;
DROP TABLE IF EXISTS public.legal_judgments;
DROP SEQUENCE IF EXISTS public.legal_correspondence_id_seq;
DROP TABLE IF EXISTS public.legal_correspondence;
DROP SEQUENCE IF EXISTS public.legal_contracts_id_seq;
DROP TABLE IF EXISTS public.legal_contracts;
DROP SEQUENCE IF EXISTS public.legal_cases_id_seq;
DROP TABLE IF EXISTS public.legal_cases;
DROP SEQUENCE IF EXISTS public.leave_balances_id_seq;
DROP TABLE IF EXISTS public.leave_balances;
DROP SEQUENCE IF EXISTS public.leave_approval_stages_id_seq;
DROP TABLE IF EXISTS public.leave_approval_stages;
DROP SEQUENCE IF EXISTS public.late_rent_actions_id_seq;
DROP TABLE IF EXISTS public.late_rent_actions;
DROP SEQUENCE IF EXISTS public.kpi_snapshots_id_seq;
DROP TABLE IF EXISTS public.kpi_snapshots;
DROP SEQUENCE IF EXISTS public.kb_articles_id_seq;
DROP TABLE IF EXISTS public.kb_articles;
DROP SEQUENCE IF EXISTS public.journal_lines_id_seq;
DROP TABLE IF EXISTS public.journal_lines;
DROP SEQUENCE IF EXISTS public.journal_entry_templates_id_seq;
DROP TABLE IF EXISTS public.journal_entry_templates;
DROP SEQUENCE IF EXISTS public.journal_entry_template_lines_id_seq;
DROP TABLE IF EXISTS public.journal_entry_template_lines;
DROP SEQUENCE IF EXISTS public.journal_entries_id_seq;
DROP TABLE IF EXISTS public.journal_entries;
DROP SEQUENCE IF EXISTS public.job_titles_id_seq;
DROP TABLE IF EXISTS public.job_titles;
DROP SEQUENCE IF EXISTS public.job_postings_id_seq;
DROP TABLE IF EXISTS public.job_postings;
DROP SEQUENCE IF EXISTS public.job_applications_id_seq;
DROP TABLE IF EXISTS public.job_applications;
DROP SEQUENCE IF EXISTS public.invoices_id_seq;
DROP TABLE IF EXISTS public.invoices;
DROP SEQUENCE IF EXISTS public.invoice_payments_id_seq;
DROP TABLE IF EXISTS public.invoice_payments;
DROP SEQUENCE IF EXISTS public.invoice_number_seq;
DROP SEQUENCE IF EXISTS public.invoice_lines_id_seq;
DROP TABLE IF EXISTS public.invoice_lines;
DROP SEQUENCE IF EXISTS public.invoice_collection_stages_id_seq;
DROP TABLE IF EXISTS public.invoice_collection_stages;
DROP SEQUENCE IF EXISTS public.inventory_counts_id_seq;
DROP TABLE IF EXISTS public.inventory_counts;
DROP SEQUENCE IF EXISTS public.inventory_count_items_id_seq;
DROP TABLE IF EXISTS public.inventory_count_items;
DROP SEQUENCE IF EXISTS public.intercompany_transactions_id_seq;
DROP TABLE IF EXISTS public.intercompany_transactions;
DROP SEQUENCE IF EXISTS public.integrations_id_seq;
DROP TABLE IF EXISTS public.integrations;
DROP TABLE IF EXISTS public.integration_logs_archive;
DROP SEQUENCE IF EXISTS public.integration_logs_id_seq;
DROP TABLE IF EXISTS public.integration_logs;
DROP SEQUENCE IF EXISTS public.hr_leave_types_id_seq;
DROP TABLE IF EXISTS public.hr_leave_types;
DROP SEQUENCE IF EXISTS public.hr_leave_requests_id_seq;
DROP TABLE IF EXISTS public.hr_leave_requests;
DROP SEQUENCE IF EXISTS public.hr_leave_balances_id_seq;
DROP TABLE IF EXISTS public.hr_leave_balances;
DROP SEQUENCE IF EXISTS public.hr_inquiry_memos_id_seq;
DROP TABLE IF EXISTS public.hr_inquiry_memos;
DROP SEQUENCE IF EXISTS public.hr_inquiry_memo_events_id_seq;
DROP TABLE IF EXISTS public.hr_inquiry_memo_events;
DROP SEQUENCE IF EXISTS public.hr_discipline_regulation_id_seq;
DROP TABLE IF EXISTS public.hr_discipline_regulation;
DROP SEQUENCE IF EXISTS public.governance_risks_id_seq;
DROP TABLE IF EXISTS public.governance_risks;
DROP SEQUENCE IF EXISTS public.governance_policies_id_seq;
DROP TABLE IF EXISTS public.governance_policies;
DROP SEQUENCE IF EXISTS public.governance_compliance_id_seq;
DROP TABLE IF EXISTS public.governance_compliance;
DROP SEQUENCE IF EXISTS public.governance_capa_id_seq;
DROP TABLE IF EXISTS public.governance_capa;
DROP SEQUENCE IF EXISTS public.governance_audits_id_seq;
DROP TABLE IF EXISTS public.governance_audits;
DROP SEQUENCE IF EXISTS public.gov_integrations_id_seq;
DROP TABLE IF EXISTS public.gov_integrations;
DROP SEQUENCE IF EXISTS public.gov_integration_links_id_seq;
DROP TABLE IF EXISTS public.gov_integration_links;
DROP SEQUENCE IF EXISTS public.goods_receipts_id_seq;
DROP TABLE IF EXISTS public.goods_receipts;
DROP SEQUENCE IF EXISTS public.goods_receipt_items_id_seq;
DROP TABLE IF EXISTS public.goods_receipt_items;
DROP SEQUENCE IF EXISTS public.fleet_violations_id_seq;
DROP TABLE IF EXISTS public.fleet_violations;
DROP SEQUENCE IF EXISTS public.fleet_vehicles_id_seq;
DROP TABLE IF EXISTS public.fleet_vehicles;
DROP SEQUENCE IF EXISTS public.fleet_trips_id_seq;
DROP TABLE IF EXISTS public.fleet_trips;
DROP SEQUENCE IF EXISTS public.fleet_traffic_violations_id_seq;
DROP TABLE IF EXISTS public.fleet_traffic_violations;
DROP SEQUENCE IF EXISTS public.fleet_preventive_plans_id_seq;
DROP TABLE IF EXISTS public.fleet_preventive_plans;
DROP SEQUENCE IF EXISTS public.fleet_maintenance_id_seq;
DROP TABLE IF EXISTS public.fleet_maintenance;
DROP SEQUENCE IF EXISTS public.fleet_insurance_id_seq;
DROP TABLE IF EXISTS public.fleet_insurance;
DROP SEQUENCE IF EXISTS public.fleet_gps_tracking_id_seq;
DROP TABLE IF EXISTS public.fleet_gps_tracking;
DROP SEQUENCE IF EXISTS public.fleet_fuel_logs_id_seq;
DROP TABLE IF EXISTS public.fleet_fuel_logs;
DROP SEQUENCE IF EXISTS public.fleet_drivers_id_seq;
DROP TABLE IF EXISTS public.fleet_drivers;
DROP SEQUENCE IF EXISTS public.fixed_assets_id_seq;
DROP TABLE IF EXISTS public.fixed_assets;
DROP SEQUENCE IF EXISTS public.financial_periods_id_seq;
DROP TABLE IF EXISTS public.financial_periods;
DROP SEQUENCE IF EXISTS public.expense_claims_id_seq;
DROP TABLE IF EXISTS public.expense_claims;
DROP SEQUENCE IF EXISTS public.event_logs_id_seq;
DROP TABLE IF EXISTS public.event_logs;
DROP SEQUENCE IF EXISTS public.evaluation_summaries_id_seq;
DROP TABLE IF EXISTS public.evaluation_summaries;
DROP SEQUENCE IF EXISTS public.evaluation_participants_id_seq;
DROP TABLE IF EXISTS public.evaluation_participants;
DROP SEQUENCE IF EXISTS public.evaluation_cycles_id_seq;
DROP TABLE IF EXISTS public.evaluation_cycles;
DROP SEQUENCE IF EXISTS public.entity_tags_id_seq;
DROP TABLE IF EXISTS public.entity_tags;
DROP SEQUENCE IF EXISTS public.entity_comments_id_seq;
DROP TABLE IF EXISTS public.entity_comments;
DROP SEQUENCE IF EXISTS public.employees_id_seq;
DROP TABLE IF EXISTS public.employees;
DROP SEQUENCE IF EXISTS public.employee_violations_id_seq;
DROP TABLE IF EXISTS public.employee_violations;
DROP SEQUENCE IF EXISTS public.employee_transfers_id_seq;
DROP TABLE IF EXISTS public.employee_transfers;
DROP SEQUENCE IF EXISTS public.employee_shift_assignments_id_seq;
DROP TABLE IF EXISTS public.employee_shift_assignments;
DROP SEQUENCE IF EXISTS public.employee_of_month_id_seq;
DROP TABLE IF EXISTS public.employee_of_month;
DROP SEQUENCE IF EXISTS public.employee_number_seq;
DROP SEQUENCE IF EXISTS public.employee_monthly_attendance_id_seq;
DROP TABLE IF EXISTS public.employee_monthly_attendance;
DROP SEQUENCE IF EXISTS public.employee_documents_id_seq;
DROP TABLE IF EXISTS public.employee_documents;
DROP SEQUENCE IF EXISTS public.employee_development_plans_id_seq;
DROP TABLE IF EXISTS public.employee_development_plans;
DROP SEQUENCE IF EXISTS public.employee_contracts_id_seq;
DROP TABLE IF EXISTS public.employee_contracts;
DROP SEQUENCE IF EXISTS public.employee_assignments_id_seq;
DROP TABLE IF EXISTS public.employee_assignments;
DROP SEQUENCE IF EXISTS public.email_queue_id_seq;
DROP TABLE IF EXISTS public.email_queue;
DROP SEQUENCE IF EXISTS public.documents_id_seq;
DROP TABLE IF EXISTS public.documents;
DROP SEQUENCE IF EXISTS public.document_versions_id_seq;
DROP TABLE IF EXISTS public.document_versions;
DROP SEQUENCE IF EXISTS public.document_templates_id_seq;
DROP TABLE IF EXISTS public.document_templates;
DROP SEQUENCE IF EXISTS public.document_folders_id_seq;
DROP TABLE IF EXISTS public.document_folders;
DROP SEQUENCE IF EXISTS public.document_entity_links_id_seq;
DROP TABLE IF EXISTS public.document_entity_links;
DROP SEQUENCE IF EXISTS public.digital_signature_otps_id_seq;
DROP TABLE IF EXISTS public.digital_signature_otps;
DROP SEQUENCE IF EXISTS public.digital_signature_logs_id_seq;
DROP TABLE IF EXISTS public.digital_signature_logs;
DROP SEQUENCE IF EXISTS public.depreciation_entries_id_seq;
DROP TABLE IF EXISTS public.depreciation_entries;
DROP SEQUENCE IF EXISTS public.departments_id_seq;
DROP TABLE IF EXISTS public.departments;
DROP SEQUENCE IF EXISTS public.deduction_rules_id_seq;
DROP TABLE IF EXISTS public.deduction_rules;
DROP SEQUENCE IF EXISTS public.data_retention_policies_id_seq;
DROP TABLE IF EXISTS public.data_retention_policies;
DROP SEQUENCE IF EXISTS public.data_access_requests_id_seq;
DROP TABLE IF EXISTS public.data_access_requests;
DROP SEQUENCE IF EXISTS public.daily_closures_id_seq;
DROP TABLE IF EXISTS public.daily_closures;
DROP SEQUENCE IF EXISTS public.daily_close_log_id_seq;
DROP TABLE IF EXISTS public.daily_close_log;
DROP SEQUENCE IF EXISTS public.custom_roles_id_seq;
DROP TABLE IF EXISTS public.custom_roles;
DROP SEQUENCE IF EXISTS public.cron_logs_id_seq;
DROP TABLE IF EXISTS public.cron_logs;
DROP SEQUENCE IF EXISTS public.cron_locks_id_seq;
DROP TABLE IF EXISTS public.cron_locks;
DROP SEQUENCE IF EXISTS public.cron_jobs_id_seq;
DROP TABLE IF EXISTS public.cron_jobs;
DROP SEQUENCE IF EXISTS public.crm_pipeline_stages_id_seq;
DROP TABLE IF EXISTS public.crm_pipeline_stages;
DROP SEQUENCE IF EXISTS public.crm_opportunities_id_seq;
DROP TABLE IF EXISTS public.crm_opportunities;
DROP SEQUENCE IF EXISTS public.crm_contacts_id_seq;
DROP TABLE IF EXISTS public.crm_contacts;
DROP SEQUENCE IF EXISTS public.crm_activities_id_seq;
DROP TABLE IF EXISTS public.crm_activities;
DROP SEQUENCE IF EXISTS public.contract_payment_schedule_id_seq;
DROP TABLE IF EXISTS public.contract_payment_schedule;
DROP SEQUENCE IF EXISTS public.companies_id_seq;
DROP TABLE IF EXISTS public.companies;
DROP SEQUENCE IF EXISTS public.communications_log_id_seq;
DROP TABLE IF EXISTS public.communications_log;
DROP SEQUENCE IF EXISTS public.collection_follow_ups_id_seq;
DROP TABLE IF EXISTS public.collection_follow_ups;
DROP SEQUENCE IF EXISTS public.clients_id_seq;
DROP TABLE IF EXISTS public.clients;
DROP SEQUENCE IF EXISTS public.client_rfm_scores_id_seq;
DROP TABLE IF EXISTS public.client_rfm_scores;
DROP SEQUENCE IF EXISTS public.client_portal_accounts_id_seq;
DROP TABLE IF EXISTS public.client_portal_accounts;
DROP SEQUENCE IF EXISTS public.chart_of_accounts_id_seq;
DROP TABLE IF EXISTS public.chart_of_accounts;
DROP SEQUENCE IF EXISTS public.business_rules_id_seq;
DROP TABLE IF EXISTS public.business_rules;
DROP SEQUENCE IF EXISTS public.business_rule_logs_id_seq;
DROP TABLE IF EXISTS public.business_rule_logs;
DROP SEQUENCE IF EXISTS public.budgets_id_seq;
DROP TABLE IF EXISTS public.budgets;
DROP SEQUENCE IF EXISTS public.budget_lines_id_seq;
DROP TABLE IF EXISTS public.budget_lines;
DROP SEQUENCE IF EXISTS public.budget_approval_requests_id_seq;
DROP TABLE IF EXISTS public.budget_approval_requests;
DROP SEQUENCE IF EXISTS public.branches_id_seq;
DROP TABLE IF EXISTS public.branches;
DROP SEQUENCE IF EXISTS public.bi_reports_id_seq;
DROP TABLE IF EXISTS public.bi_reports;
DROP SEQUENCE IF EXISTS public.bi_kpis_id_seq;
DROP TABLE IF EXISTS public.bi_kpis;
DROP SEQUENCE IF EXISTS public.bi_dashboards_id_seq;
DROP TABLE IF EXISTS public.bi_dashboards;
DROP SEQUENCE IF EXISTS public.bank_statements_id_seq;
DROP TABLE IF EXISTS public.bank_statements;
DROP SEQUENCE IF EXISTS public.bank_guarantees_id_seq;
DROP TABLE IF EXISTS public.bank_guarantees;
DROP SEQUENCE IF EXISTS public.automation_logs_id_seq;
DROP TABLE IF EXISTS public.automation_logs;
DROP SEQUENCE IF EXISTS public.audit_violations_id_seq;
DROP TABLE IF EXISTS public.audit_violations;
DROP TABLE IF EXISTS public.audit_logs_archive;
DROP SEQUENCE IF EXISTS public.audit_logs_id_seq;
DROP TABLE IF EXISTS public.audit_logs;
DROP SEQUENCE IF EXISTS public.attendance_policies_id_seq;
DROP TABLE IF EXISTS public.attendance_policies;
DROP SEQUENCE IF EXISTS public.attendance_id_seq;
DROP SEQUENCE IF EXISTS public.attendance_deductions_id_seq;
DROP TABLE IF EXISTS public.attendance_deductions;
DROP TABLE IF EXISTS public.attendance;
DROP SEQUENCE IF EXISTS public.approval_requests_id_seq;
DROP TABLE IF EXISTS public.approval_requests;
DROP SEQUENCE IF EXISTS public.approval_chains_id_seq;
DROP TABLE IF EXISTS public.approval_chains;
DROP SEQUENCE IF EXISTS public.approval_chain_steps_id_seq;
DROP TABLE IF EXISTS public.approval_chain_steps;
DROP SEQUENCE IF EXISTS public.approval_actions_id_seq;
DROP TABLE IF EXISTS public.approval_actions;
DROP SEQUENCE IF EXISTS public.applicant_accounts_id_seq;
DROP TABLE IF EXISTS public.applicant_accounts;
DROP SEQUENCE IF EXISTS public.anonymous_upward_reviews_id_seq;
DROP TABLE IF EXISTS public.anonymous_upward_reviews;
DROP SEQUENCE IF EXISTS public.alert_mute_rules_id_seq;
DROP TABLE IF EXISTS public.alert_mute_rules;
DROP SEQUENCE IF EXISTS public.alert_fatigue_settings_id_seq;
DROP TABLE IF EXISTS public.alert_fatigue_settings;
DROP SEQUENCE IF EXISTS public.accounting_mappings_id_seq;
DROP TABLE IF EXISTS public.accounting_mappings;
DROP FUNCTION IF EXISTS public.upsert_account(p_company_id integer, p_code character varying, p_name character varying, p_type character varying, p_parent_id integer, p_parent_code character varying, p_level integer, p_allow_posting boolean, p_is_analytical boolean);
DROP FUNCTION IF EXISTS public.hr_clone_default_regulation(p_company_id integer);
--
-- Name: hr_clone_default_regulation(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hr_clone_default_regulation(p_company_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO hr_discipline_regulation
    ("companyId", section, "articleNumber", title, description,
     penalty1, penalty2, penalty3, penalty4, "extraDeduction",
     severity, "isTermination", "legalReference", "effectiveFrom", "isActive")
  SELECT
    p_company_id, section, "articleNumber", title, description,
    penalty1, penalty2, penalty3, penalty4, "extraDeduction",
    severity, "isTermination", "legalReference", "effectiveFrom", TRUE
  FROM hr_discipline_regulation
  WHERE "companyId" IS NULL AND "deletedAt" IS NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: upsert_account(integer, character varying, character varying, character varying, integer, character varying, integer, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_account(p_company_id integer, p_code character varying, p_name character varying, p_type character varying, p_parent_id integer, p_parent_code character varying, p_level integer, p_allow_posting boolean, p_is_analytical boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM chart_of_accounts WHERE "companyId" = p_company_id AND code = p_code;
  IF v_id IS NULL THEN
    INSERT INTO chart_of_accounts (
      "companyId", code, name, type, "parentId", "parentCode",
      level, "allowPosting", "isAnalytical"
    ) VALUES (
      p_company_id, p_code, p_name, p_type, p_parent_id, p_parent_code,
      p_level, p_allow_posting, p_is_analytical
    ) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: accounting_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_mappings (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "operationType" character varying(100) NOT NULL,
    "operationLabel" character varying(200) NOT NULL,
    "debitAccountId" integer,
    "creditAccountId" integer,
    "debitAccountCode" character varying(20),
    "creditAccountCode" character varying(20),
    "branchId" integer,
    "activityType" character varying(100),
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: accounting_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accounting_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounting_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accounting_mappings_id_seq OWNED BY public.accounting_mappings.id;


--
-- Name: alert_fatigue_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_fatigue_settings (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "alertType" character varying(100),
    "muteUntil" timestamp with time zone,
    reason text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);


--
-- Name: alert_fatigue_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_fatigue_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_fatigue_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_fatigue_settings_id_seq OWNED BY public.alert_fatigue_settings.id;


--
-- Name: alert_mute_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_mute_rules (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "alertType" character varying(100) NOT NULL,
    "muteUntil" timestamp with time zone,
    reason text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone
);


--
-- Name: alert_mute_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alert_mute_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alert_mute_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alert_mute_rules_id_seq OWNED BY public.alert_mute_rules.id;


--
-- Name: anonymous_upward_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anonymous_upward_reviews (
    id integer NOT NULL,
    "cycleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "managerId" integer NOT NULL,
    "overallScore" numeric(5,2) NOT NULL,
    scores jsonb,
    comments text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "submissionToken" character varying(64)
);


--
-- Name: anonymous_upward_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.anonymous_upward_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: anonymous_upward_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.anonymous_upward_reviews_id_seq OWNED BY public.anonymous_upward_reviews.id;


--
-- Name: applicant_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applicant_accounts (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    "passwordHash" character varying(255) NOT NULL,
    "nationalId" character varying(20),
    gender character varying(10),
    "dateOfBirth" date,
    city character varying(100),
    education character varying(200),
    "experienceYears" integer DEFAULT 0,
    "resumeUrl" text,
    "photoUrl" text,
    skills text,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: applicant_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applicant_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applicant_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applicant_accounts_id_seq OWNED BY public.applicant_accounts.id;


--
-- Name: approval_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_actions (
    id integer NOT NULL,
    "entityType" character varying(50) NOT NULL,
    "entityId" integer NOT NULL,
    action character varying(30) NOT NULL,
    notes text,
    "actionBy" integer,
    "actionByName" character varying(255),
    "companyId" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: approval_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_actions_id_seq OWNED BY public.approval_actions.id;


--
-- Name: approval_chain_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chain_steps (
    id integer NOT NULL,
    "chainId" integer NOT NULL,
    "stepOrder" integer NOT NULL,
    "requiredRole" character varying(50) NOT NULL,
    "timeoutHours" integer DEFAULT 48,
    "autoApproveOnTimeout" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: approval_chain_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_chain_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_chain_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_chain_steps_id_seq OWNED BY public.approval_chain_steps.id;


--
-- Name: approval_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chains (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "chainType" character varying(50) NOT NULL,
    "minAmount" numeric DEFAULT 0,
    "maxAmount" numeric DEFAULT 999999999,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: approval_chains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_chains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_chains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_chains_id_seq OWNED BY public.approval_chains.id;


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "refType" character varying(100) NOT NULL,
    "refId" integer NOT NULL,
    "requiredRole" character varying(100),
    "assignedTo" integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    decision text,
    "decidedBy" integer,
    "decidedAt" timestamp without time zone,
    "expiresAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "chainId" integer,
    "currentStepOrder" integer DEFAULT 1,
    "escalationLevel" integer DEFAULT 0,
    "lastReminderAt" timestamp without time zone
);


--
-- Name: approval_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_requests_id_seq OWNED BY public.approval_requests.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "assignmentId" integer NOT NULL,
    date date NOT NULL,
    "checkIn" timestamp without time zone,
    "checkOut" timestamp without time zone,
    "checkInLat" numeric(10,7),
    "checkInLon" numeric(10,7),
    "checkOutLat" numeric(10,7),
    "checkOutLon" numeric(10,7),
    "lateMinutes" integer DEFAULT 0,
    "earlyLeaveMinutes" integer DEFAULT 0,
    "overtimeMinutes" integer DEFAULT 0,
    status character varying(20) DEFAULT 'present'::character varying,
    method character varying(20) DEFAULT 'gps'::character varying,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deviceId" character varying(100)
);


--
-- Name: attendance_deductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_deductions (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "attendanceId" integer,
    type character varying(50) NOT NULL,
    minutes integer DEFAULT 0,
    amount numeric(12,2) DEFAULT 0,
    period character varying(7),
    status character varying(20) DEFAULT 'pending_payroll'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_deductions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_deductions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_deductions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_deductions_id_seq OWNED BY public.attendance_deductions.id;


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: attendance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_policies (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "lateThresholdMinutes" integer DEFAULT 15,
    "gpsRadiusMeters" integer DEFAULT 500,
    "penaltyLevel1" numeric DEFAULT 0,
    "penaltyLevel2" numeric DEFAULT 50,
    "penaltyLevel3" numeric DEFAULT 100,
    "penaltyLevel4" numeric DEFAULT 200,
    "penaltyLevel5" numeric DEFAULT 500,
    "penaltyLevel1Label" character varying(100) DEFAULT 'إنذار شفهي'::character varying,
    "penaltyLevel2Label" character varying(100) DEFAULT 'إنذار كتابي'::character varying,
    "penaltyLevel3Label" character varying(100) DEFAULT 'خصم يوم'::character varying,
    "penaltyLevel4Label" character varying(100) DEFAULT 'خصم يومين'::character varying,
    "penaltyLevel5Label" character varying(100) DEFAULT 'خصم ثلاثة أيام + إنذار نهائي'::character varying,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: attendance_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_policies_id_seq OWNED BY public.attendance_policies.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    "companyId" integer,
    "branchId" integer,
    "userId" integer,
    action character varying(200) NOT NULL,
    entity character varying(100),
    "entityId" text,
    before jsonb,
    after jsonb,
    reason text,
    scope jsonb,
    "ipAddress" character varying(50),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userAgent" text,
    changes jsonb
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: audit_logs_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs_archive (
    id integer DEFAULT nextval('public.audit_logs_id_seq'::regclass) NOT NULL,
    "companyId" integer,
    "branchId" integer,
    "userId" integer,
    action character varying(200) NOT NULL,
    entity character varying(100),
    "entityId" text,
    before jsonb,
    after jsonb,
    reason text,
    scope jsonb,
    "ipAddress" character varying(50),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userAgent" text,
    changes jsonb
);


--
-- Name: audit_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_violations (
    id integer NOT NULL,
    type character varying(100) NOT NULL,
    "entityType" character varying(100) NOT NULL,
    "entityId" integer,
    description text NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    department character varying(100),
    "resolvedBy" integer,
    "resolvedAt" timestamp with time zone,
    "companyId" integer NOT NULL,
    "auditDate" date DEFAULT CURRENT_DATE NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_violations_id_seq OWNED BY public.audit_violations.id;


--
-- Name: automation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_logs (
    id integer NOT NULL,
    "companyId" integer,
    "automationType" character varying(100) NOT NULL,
    "triggerReason" text NOT NULL,
    "actionTaken" text NOT NULL,
    "entityType" character varying(100),
    "entityId" integer,
    "createdEntityType" character varying(100),
    "createdEntityId" integer,
    "assignedTo" integer,
    status character varying(20) DEFAULT 'success'::character varying,
    details jsonb,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: automation_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.automation_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: automation_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.automation_logs_id_seq OWNED BY public.automation_logs.id;


--
-- Name: bank_guarantees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_guarantees (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    ref character varying(100) NOT NULL,
    bank character varying(200) NOT NULL,
    beneficiary character varying(200) NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'SAR'::character varying,
    "issueDate" date NOT NULL,
    "expiryDate" date NOT NULL,
    "guaranteeType" character varying(50) DEFAULT 'performance'::character varying,
    status character varying(30) DEFAULT 'active'::character varying,
    notes text,
    "attachmentUrl" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdBy" integer,
    "deletedAt" timestamp without time zone,
    CONSTRAINT bank_guarantees_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('expired'::character varying)::text, ('released'::character varying)::text, ('renewed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: bank_guarantees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_guarantees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_guarantees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_guarantees_id_seq OWNED BY public.bank_guarantees.id;


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statements (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "accountCode" character varying(20) DEFAULT '1110'::character varying NOT NULL,
    "statementDate" date NOT NULL,
    reference character varying(100),
    description text,
    amount numeric(15,2) NOT NULL,
    type character varying(10) NOT NULL,
    "matchedJournalLineId" integer,
    "matchStatus" character varying(20) DEFAULT 'unmatched'::character varying NOT NULL,
    "importBatchId" character varying(50),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bank_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_statements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_statements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_statements_id_seq OWNED BY public.bank_statements.id;


--
-- Name: bi_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bi_dashboards (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    layout jsonb DEFAULT '{}'::jsonb,
    "isDefault" boolean DEFAULT false,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: bi_dashboards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bi_dashboards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bi_dashboards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bi_dashboards_id_seq OWNED BY public.bi_dashboards.id;


--
-- Name: bi_kpis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bi_kpis (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    module character varying(100),
    formula text,
    target numeric(15,2),
    "currentValue" numeric(15,2),
    unit character varying(50),
    frequency character varying(50) DEFAULT 'monthly'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: bi_kpis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bi_kpis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bi_kpis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bi_kpis_id_seq OWNED BY public.bi_kpis.id;


--
-- Name: bi_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bi_reports (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    type character varying(100),
    query text,
    filters jsonb DEFAULT '{}'::jsonb,
    "createdBy" integer,
    "scheduledAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: bi_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bi_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bi_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bi_reports_id_seq OWNED BY public.bi_reports.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    address text,
    lat numeric(10,7),
    lon numeric(10,7),
    phone character varying(30),
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "logoUrl" text,
    "taxNumber" character varying(50),
    "crNumber" character varying(50),
    email character varying(200),
    website character varying(200),
    "footerText" text,
    "nameEn" character varying(200),
    city character varying(100)
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: budget_approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_approval_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "accountCode" character varying(20) NOT NULL,
    period character varying(7) NOT NULL,
    "requestedAmount" numeric(18,2) NOT NULL,
    "budgetAmount" numeric(18,2) NOT NULL,
    "utilizationBefore" numeric(6,2) NOT NULL,
    "utilizationAfter" numeric(6,2) NOT NULL,
    "approvalLevel" character varying(16) NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    "sourceType" character varying(32),
    "sourceId" integer,
    reason text,
    "requestedBy" integer NOT NULL,
    "requestedAt" timestamp without time zone DEFAULT now(),
    "decidedBy" integer,
    "decidedAt" timestamp without time zone,
    "decisionNotes" text,
    "deletedAt" timestamp without time zone,
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: budget_approval_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budget_approval_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budget_approval_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budget_approval_requests_id_seq OWNED BY public.budget_approval_requests.id;


--
-- Name: budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_lines (
    id integer NOT NULL,
    "budgetId" integer NOT NULL,
    "accountId" integer,
    category character varying(200),
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    "spentAmount" numeric(15,2) DEFAULT 0 NOT NULL,
    month integer,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT budget_lines_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: budget_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budget_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budget_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budget_lines_id_seq OWNED BY public.budget_lines.id;


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "accountCode" character varying(20) NOT NULL,
    period character varying(7) NOT NULL,
    amount numeric(15,2) DEFAULT 0,
    used numeric(15,2) DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    name character varying(200),
    "fiscalYear" integer,
    "startDate" date,
    "endDate" date,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    "totalAmount" numeric(15,2) DEFAULT 0 NOT NULL,
    notes text,
    "approvedBy" integer,
    "createdBy" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: budgets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.budgets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: budgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.budgets_id_seq OWNED BY public.budgets.id;


--
-- Name: business_rule_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_rule_logs (
    id integer NOT NULL,
    "ruleId" integer,
    "ruleName" character varying(255),
    "triggerEvent" character varying(255),
    "companyId" integer,
    "entityId" integer,
    "entityType" character varying(100),
    "actionTaken" character varying(255),
    "actionResult" text,
    status character varying(50) DEFAULT 'success'::character varying,
    "executedAt" timestamp without time zone DEFAULT now(),
    details jsonb DEFAULT '{}'::jsonb
);


--
-- Name: business_rule_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_rule_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_rule_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_rule_logs_id_seq OWNED BY public.business_rule_logs.id;


--
-- Name: business_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_rules (
    id integer NOT NULL,
    "companyId" integer,
    name character varying(255) NOT NULL,
    description text,
    "triggerEvent" character varying(255) NOT NULL,
    "conditionField" character varying(255),
    "conditionOperator" character varying(50) DEFAULT '>='::character varying,
    "conditionValue" character varying(255),
    "actionType" character varying(100) NOT NULL,
    "actionTarget" character varying(255),
    "actionConfig" jsonb DEFAULT '{}'::jsonb,
    module character varying(100),
    priority integer DEFAULT 0,
    "isActive" boolean DEFAULT true,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: business_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_rules_id_seq OWNED BY public.business_rules.id;


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    type character varying(50),
    "parentCode" character varying(20),
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "nameEn" character varying(200),
    "parentId" integer,
    level integer DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "allowPosting" boolean DEFAULT true NOT NULL,
    "openingBalance" numeric(15,2) DEFAULT 0 NOT NULL,
    "currentBalance" numeric(15,2) DEFAULT 0 NOT NULL,
    description text,
    "branchId" integer,
    "activityType" character varying(100),
    "costCenter" character varying(100),
    "isAnalytical" boolean DEFAULT false NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    subtype character varying,
    "accountSubtype" character varying,
    nature character varying DEFAULT 'debit'::character varying
);


--
-- Name: chart_of_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chart_of_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chart_of_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chart_of_accounts_id_seq OWNED BY public.chart_of_accounts.id;


--
-- Name: client_portal_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_portal_accounts (
    id integer NOT NULL,
    "clientId" integer NOT NULL,
    "companyId" integer NOT NULL,
    email character varying(255) NOT NULL,
    "passwordHash" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "mustChangePassword" boolean DEFAULT true NOT NULL,
    "lastLoginAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_portal_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_portal_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_portal_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_portal_accounts_id_seq OWNED BY public.client_portal_accounts.id;


--
-- Name: client_rfm_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_rfm_scores (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "clientId" integer NOT NULL,
    "recencyDays" integer DEFAULT 0,
    "frequencyCount" integer DEFAULT 0,
    "monetaryValue" numeric(14,2) DEFAULT 0,
    "rfmScore" numeric(5,2) DEFAULT 0,
    segment character varying(50) DEFAULT 'new'::character varying,
    "churnRisk" character varying(20) DEFAULT 'low'::character varying,
    "churnScore" numeric(5,2) DEFAULT 0,
    ltv numeric(14,2) DEFAULT 0,
    "lastCalculated" timestamp without time zone DEFAULT now()
);


--
-- Name: client_rfm_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.client_rfm_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_rfm_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.client_rfm_scores_id_seq OWNED BY public.client_rfm_scores.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    code character varying(50),
    type character varying(20) DEFAULT 'individual'::character varying,
    name character varying(200),
    phone character varying(30),
    email character varying(200),
    nationality character varying(50),
    language character varying(10) DEFAULT 'ar'::character varying,
    lat numeric(10,7),
    lon numeric(10,7),
    classification character varying(20) DEFAULT 'prospect'::character varying,
    source character varying(20) DEFAULT 'whatsapp'::character varying,
    "assignedTo" integer,
    "totalRevenue" numeric(15,2) DEFAULT 0,
    "avgRating" numeric(3,2),
    tags jsonb,
    "isBlacklisted" boolean DEFAULT false,
    "lastActivityAt" timestamp without time zone,
    "lastPaymentAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    notes text,
    "deletedAt" timestamp with time zone
);


--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: collection_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_follow_ups (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "invoiceId" integer NOT NULL,
    "scheduledDate" date NOT NULL,
    type character varying DEFAULT 'reminder'::character varying NOT NULL,
    notes text,
    status character varying DEFAULT 'pending'::character varying,
    "assignedTo" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: collection_follow_ups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.collection_follow_ups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: collection_follow_ups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.collection_follow_ups_id_seq OWNED BY public.collection_follow_ups.id;


--
-- Name: communications_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    channel character varying(20) NOT NULL,
    direction character varying(10) DEFAULT 'outbound'::character varying,
    "fromNumber" character varying(20),
    "toNumber" character varying(20),
    subject character varying(300),
    body text,
    status character varying(20) DEFAULT 'sent'::character varying,
    "relatedType" character varying(50),
    "relatedId" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: communications_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.communications_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: communications_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.communications_log_id_seq OWNED BY public.communications_log.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    "nameEn" character varying(200),
    "crNumber" character varying(50),
    "vatNumber" character varying(50),
    domain character varying(100),
    "pbxPrefix" character varying(20),
    "logoUrl" character varying(500),
    address text,
    phone character varying(30),
    email character varying(200),
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;


--
-- Name: contract_payment_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_payment_schedule (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "contractId" integer NOT NULL,
    "installmentNumber" integer NOT NULL,
    "dueDate" date NOT NULL,
    amount numeric(12,2) NOT NULL,
    "paidAmount" numeric(12,2) DEFAULT 0,
    "paidDate" date,
    method character varying(50),
    status character varying(20) DEFAULT 'pending'::character varying,
    "receiptNumber" character varying(100),
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_payment_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contract_payment_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contract_payment_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contract_payment_schedule_id_seq OWNED BY public.contract_payment_schedule.id;


--
-- Name: crm_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_activities (
    id integer NOT NULL,
    "opportunityId" integer,
    type character varying(50),
    description text,
    "scheduledAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: crm_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_activities_id_seq OWNED BY public.crm_activities.id;


--
-- Name: crm_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contacts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "clientId" integer,
    "opportunityId" integer,
    name character varying(200) NOT NULL,
    title character varying(100),
    phone character varying(30),
    email character varying(200),
    "isPrimary" boolean DEFAULT false NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_contacts_id_seq OWNED BY public.crm_contacts.id;


--
-- Name: crm_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_opportunities (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    title character varying(300) NOT NULL,
    "clientId" integer,
    "contactName" character varying(200),
    "contactPhone" character varying(20),
    "contactEmail" character varying(200),
    source character varying(50),
    stage character varying(50) DEFAULT 'lead'::character varying,
    value numeric(14,2) DEFAULT 0,
    probability integer DEFAULT 50,
    "expectedCloseDate" date,
    "assignedTo" integer,
    status character varying(20) DEFAULT 'open'::character varying,
    "lostReason" character varying(200),
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "pipelineStageId" integer,
    "nextFollowUp" date,
    competitors text,
    tags text[],
    "deletedAt" timestamp with time zone,
    "convertedAt" timestamp with time zone,
    "convertedClientId" integer
);


--
-- Name: crm_opportunities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_opportunities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_opportunities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_opportunities_id_seq OWNED BY public.crm_opportunities.id;


--
-- Name: crm_pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_pipeline_stages (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    "nameEn" character varying(100),
    color character varying(20),
    "order" integer DEFAULT 0 NOT NULL,
    probability integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_pipeline_stages_probability_check CHECK (((probability >= 0) AND (probability <= 100)))
);


--
-- Name: crm_pipeline_stages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_pipeline_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_pipeline_stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_pipeline_stages_id_seq OWNED BY public.crm_pipeline_stages.id;


--
-- Name: cron_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_jobs (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    schedule character varying(50),
    "isActive" boolean DEFAULT true,
    "lastRunAt" timestamp without time zone,
    "lastStatus" character varying(20),
    "lastError" text,
    "nextRunAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: cron_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_jobs_id_seq OWNED BY public.cron_jobs.id;


--
-- Name: cron_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_locks (
    id integer NOT NULL,
    job_name character varying(200) NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by character varying(200),
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL
);


--
-- Name: cron_locks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_locks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_locks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_locks_id_seq OWNED BY public.cron_locks.id;


--
-- Name: cron_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cron_logs (
    id integer NOT NULL,
    "jobId" integer,
    "jobName" character varying(200),
    status character varying(20),
    duration integer,
    result text,
    error text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: cron_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cron_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cron_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cron_logs_id_seq OWNED BY public.cron_logs.id;


--
-- Name: custom_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_roles (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "roleKey" character varying(100) NOT NULL,
    label character varying(200) NOT NULL,
    level integer DEFAULT 10 NOT NULL,
    modules jsonb DEFAULT '[]'::jsonb,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: custom_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_roles_id_seq OWNED BY public.custom_roles.id;


--
-- Name: daily_close_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_close_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "closeDate" date NOT NULL,
    "closedBy" integer,
    notes text,
    forced boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: daily_close_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_close_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_close_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_close_log_id_seq OWNED BY public.daily_close_log.id;


--
-- Name: daily_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_closures (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    date date NOT NULL,
    "closedBy" integer,
    "closedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: daily_closures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_closures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_closures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_closures_id_seq OWNED BY public.daily_closures.id;


--
-- Name: data_access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_access_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "requestType" character varying(50) NOT NULL,
    "requesterId" integer,
    "requesterName" character varying(255),
    "requesterEmail" character varying(255),
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    "responseData" jsonb,
    "completedAt" timestamp with time zone,
    "dueDate" date,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "data_access_requests_requestType_check" CHECK ((("requestType")::text = ANY (ARRAY[('access'::character varying)::text, ('rectification'::character varying)::text, ('erasure'::character varying)::text, ('portability'::character varying)::text, ('objection'::character varying)::text]))),
    CONSTRAINT data_access_requests_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('rejected'::character varying)::text])))
);


--
-- Name: data_access_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_access_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_access_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_access_requests_id_seq OWNED BY public.data_access_requests.id;


--
-- Name: data_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_retention_policies (
    id integer NOT NULL,
    "companyId" integer,
    "dataType" character varying(100) NOT NULL,
    "retentionDays" integer NOT NULL,
    "legalBasis" character varying(255),
    description text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: data_retention_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.data_retention_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_retention_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.data_retention_policies_id_seq OWNED BY public.data_retention_policies.id;


--
-- Name: deduction_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deduction_rules (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    type character varying(30) NOT NULL,
    "calculationType" character varying(20) DEFAULT 'per_hour'::character varying NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL,
    "graceMinutes" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "deduction_rules_calculationType_check" CHECK ((("calculationType")::text = ANY (ARRAY[('per_hour'::character varying)::text, ('per_day'::character varying)::text, ('fixed'::character varying)::text, ('percentage'::character varying)::text]))),
    CONSTRAINT deduction_rules_type_check CHECK (((type)::text = ANY (ARRAY[('late'::character varying)::text, ('absence'::character varying)::text, ('early_leave'::character varying)::text, ('custom'::character varying)::text])))
);


--
-- Name: deduction_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deduction_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deduction_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deduction_rules_id_seq OWNED BY public.deduction_rules.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    name character varying(200) NOT NULL,
    slug character varying(100),
    "parentId" integer,
    "managerId" integer,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: depreciation_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciation_entries (
    id integer NOT NULL,
    "assetId" integer NOT NULL,
    "companyId" integer NOT NULL,
    period character varying(7) NOT NULL,
    "depreciationAmount" numeric(15,2) NOT NULL,
    "bookValueAfter" numeric(15,2) NOT NULL,
    "journalEntryId" integer,
    "postedAt" timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: depreciation_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.depreciation_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: depreciation_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.depreciation_entries_id_seq OWNED BY public.depreciation_entries.id;


--
-- Name: digital_signature_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_signature_logs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "documentId" text NOT NULL,
    "documentType" text,
    "userId" integer,
    "signerName" text,
    "signerEmail" text,
    action text NOT NULL,
    "ipAddress" text,
    "deviceFingerprint" text,
    "userAgent" text,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT digital_signature_logs_action_check CHECK ((action = ANY (ARRAY['otp_requested'::text, 'otp_verified'::text, 'signed'::text, 'rejected'::text])))
);


--
-- Name: digital_signature_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.digital_signature_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: digital_signature_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.digital_signature_logs_id_seq OWNED BY public.digital_signature_logs.id;


--
-- Name: digital_signature_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.digital_signature_otps (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "documentId" text NOT NULL,
    "userId" integer,
    otp text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    "ipAddress" text,
    "deviceFingerprint" text,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: digital_signature_otps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.digital_signature_otps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: digital_signature_otps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.digital_signature_otps_id_seq OWNED BY public.digital_signature_otps.id;


--
-- Name: document_entity_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_entity_links (
    id integer NOT NULL,
    "documentId" integer,
    "entityType" character varying(50) NOT NULL,
    "entityId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_entity_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_entity_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_entity_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_entity_links_id_seq OWNED BY public.document_entity_links.id;


--
-- Name: document_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_folders (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "parentId" integer,
    color character varying(50),
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_folders_id_seq OWNED BY public.document_folders.id;


--
-- Name: document_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_templates (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    content text,
    category character varying(100),
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    format character varying(30) DEFAULT 'html'::character varying NOT NULL,
    variables jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    type character varying(50) DEFAULT 'letter'::character varying,
    "branchId" integer,
    "signatureUrl" text,
    "htmlContent" text,
    "isDefault" boolean DEFAULT false
);


--
-- Name: document_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_templates_id_seq OWNED BY public.document_templates.id;


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id integer NOT NULL,
    "documentId" integer,
    "versionNumber" integer NOT NULL,
    "fileName" character varying(500),
    "fileSize" integer,
    "mimeType" character varying(100),
    "storageKey" text,
    "uploadedBy" integer,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_versions_id_seq OWNED BY public.document_versions.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    "fileName" character varying(255),
    "fileUrl" text,
    "fileSize" integer,
    "mimeType" character varying(100),
    "folderId" integer,
    tags text[],
    "uploadedBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    category character varying(50),
    status character varying(30) DEFAULT 'draft'::character varying,
    "storageKey" text,
    "currentVersion" integer DEFAULT 1
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_queue (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "toEmail" character varying(200) NOT NULL,
    "recipientName" character varying(200),
    subject character varying(500) NOT NULL,
    body text NOT NULL,
    "clientId" integer,
    priority character varying(20) DEFAULT 'normal'::character varying,
    "refType" character varying(100),
    "refId" integer,
    status character varying(20) DEFAULT 'queued'::character varying,
    "sentAt" timestamp without time zone,
    "scheduledAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    cc character varying(500),
    bcc character varying(500),
    "isHtml" boolean DEFAULT true NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 3 NOT NULL,
    "lastAttemptAt" timestamp with time zone,
    "errorMessage" text,
    metadata jsonb,
    "attemptCount" integer DEFAULT 0,
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: email_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_queue_id_seq OWNED BY public.email_queue.id;


--
-- Name: employee_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_assignments (
    id integer NOT NULL,
    "employeeId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer NOT NULL,
    "departmentId" integer,
    "jobTitle" character varying(200) NOT NULL,
    role character varying(50) DEFAULT 'employee'::character varying,
    salary numeric(12,2) DEFAULT 0,
    "isPrimary" boolean DEFAULT false,
    "hireDate" date,
    "probationEndDate" date,
    "endDate" date,
    "endReason" text,
    "sipExtension" character varying(10),
    "workEmail" character varying(200),
    "resolvedTickets" integer DEFAULT 0,
    "slaScore" numeric(5,2) DEFAULT 100,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "jobTitleId" integer,
    "managerId" integer
);


--
-- Name: employee_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_assignments_id_seq OWNED BY public.employee_assignments.id;


--
-- Name: employee_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_contracts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "contractType" character varying(50) DEFAULT 'full_time'::character varying,
    "startDate" date NOT NULL,
    "endDate" date,
    "probationEndDate" date,
    "probationStatus" character varying(20) DEFAULT 'active'::character varying,
    "probationAlertSent" boolean DEFAULT false,
    status character varying(20) DEFAULT 'active'::character varying,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: employee_contracts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_contracts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_contracts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_contracts_id_seq OWNED BY public.employee_contracts.id;


--
-- Name: employee_development_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_development_plans (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    title character varying(300),
    goals jsonb DEFAULT '[]'::jsonb,
    skills jsonb DEFAULT '[]'::jsonb,
    "targetDate" date,
    status character varying(50) DEFAULT 'planned'::character varying,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "trainingIds" jsonb DEFAULT '[]'::jsonb,
    "reviewDate" date,
    progress integer DEFAULT 0
);


--
-- Name: employee_development_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_development_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_development_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_development_plans_id_seq OWNED BY public.employee_development_plans.id;


--
-- Name: employee_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_documents (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(300) NOT NULL,
    number character varying(100),
    "issueDate" date,
    "expiryDate" date,
    "fileUrl" text,
    status character varying(20) DEFAULT 'valid'::character varying NOT NULL,
    notes text,
    "uploadedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_documents_status_check CHECK (((status)::text = ANY (ARRAY[('valid'::character varying)::text, ('expired'::character varying)::text, ('expiring_soon'::character varying)::text])))
);


--
-- Name: employee_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_documents_id_seq OWNED BY public.employee_documents.id;


--
-- Name: employee_monthly_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_monthly_attendance (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    period character varying NOT NULL,
    "presentDays" integer DEFAULT 0,
    "absentDays" integer DEFAULT 0,
    "lateDays" integer DEFAULT 0,
    "totalLateMinutes" integer DEFAULT 0,
    "totalDeduction" numeric DEFAULT 0,
    "overtimeMinutes" integer DEFAULT 0
);


--
-- Name: employee_monthly_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_monthly_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_monthly_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_monthly_attendance_id_seq OWNED BY public.employee_monthly_attendance.id;


--
-- Name: employee_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_of_month; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_of_month (
    id integer NOT NULL,
    "employeeId" integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    reason text,
    "companyId" integer,
    "branchId" integer,
    "isActive" boolean DEFAULT true,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT employee_of_month_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: employee_of_month_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_of_month_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_of_month_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_of_month_id_seq OWNED BY public.employee_of_month.id;


--
-- Name: employee_shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_shift_assignments (
    id integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "shiftId" integer NOT NULL,
    "startDate" date,
    "endDate" date,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_shift_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_shift_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_shift_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_shift_assignments_id_seq OWNED BY public.employee_shift_assignments.id;


--
-- Name: employee_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_transfers (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "fromBranchId" integer,
    "fromDepartmentId" integer,
    "fromJobTitleId" integer,
    "toBranchId" integer,
    "toDepartmentId" integer,
    "toJobTitleId" integer,
    "effectiveDate" date,
    reason text,
    status character varying(50) DEFAULT 'pending'::character varying,
    "requestedBy" integer,
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "fromDeptId" integer,
    "toDeptId" integer,
    "fromJobTitle" character varying(200),
    "toJobTitle" character varying(200),
    "fromSalary" numeric(12,2),
    "toSalary" numeric(12,2),
    "receivedBy" integer,
    "receivedAt" timestamp with time zone
);


--
-- Name: employee_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_transfers_id_seq OWNED BY public.employee_transfers.id;


--
-- Name: employee_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_violations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    severity character varying(20) DEFAULT 'medium'::character varying,
    deduction numeric(12,2) DEFAULT 0,
    period character varying(7),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    "inquiryMemoId" integer,
    "regulationId" integer,
    "occurrenceCount" integer DEFAULT 1,
    status text DEFAULT 'pending_inquiry'::text,
    source text DEFAULT 'manual'::text
);


--
-- Name: employee_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_violations_id_seq OWNED BY public.employee_violations.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    "nationalId" character varying(20),
    "empNumber" character varying(30),
    name character varying(200) NOT NULL,
    "nameEn" character varying(200),
    phone character varying(30),
    email character varying(200),
    gender character varying(10),
    nationality character varying(50),
    "dateOfBirth" date,
    "photoUrl" character varying(500),
    lat numeric(10,7),
    lon numeric(10,7),
    status character varying(20) DEFAULT 'active'::character varying,
    "activationToken" character varying(100),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "iqamaNumber" character varying(30),
    "passportNumber" character varying(30),
    "iqamaExpiry" date,
    "passportExpiry" date,
    "gosiNumber" character varying(50),
    "bankName" character varying(100),
    "bankAccount" character varying(50),
    iban character varying(34),
    "emergencyContact" character varying(200),
    "emergencyPhone" character varying(30),
    "borderNumber" character varying(20),
    "visaNumber" character varying(30),
    "visaType" character varying(50),
    "visaExpiry" date,
    "sponsorNumber" character varying(50),
    "workPermitNumber" character varying(50),
    "workPermitExpiry" date,
    "iqamaStatus" character varying(30) DEFAULT 'active'::character varying
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: entity_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_comments (
    id integer NOT NULL,
    "entityType" character varying(50) NOT NULL,
    "entityId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "userName" character varying(200),
    body text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_comments_id_seq OWNED BY public.entity_comments.id;


--
-- Name: entity_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_tags (
    id integer NOT NULL,
    "entityType" character varying(50) NOT NULL,
    "entityId" integer NOT NULL,
    "companyId" integer NOT NULL,
    tag character varying(50) NOT NULL,
    color character varying(30) DEFAULT 'blue'::character varying,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_tags_id_seq OWNED BY public.entity_tags.id;


--
-- Name: evaluation_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_cycles (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "initiatorId" integer,
    period character varying(50) NOT NULL,
    "startDate" date DEFAULT CURRENT_DATE NOT NULL,
    "endDate" date,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT evaluation_cycles_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('closed'::character varying)::text])))
);


--
-- Name: evaluation_cycles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_cycles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_cycles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_cycles_id_seq OWNED BY public.evaluation_cycles.id;


--
-- Name: evaluation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_participants (
    id integer NOT NULL,
    "cycleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "evaluatorId" integer NOT NULL,
    "evaluatorRole" character varying(20) DEFAULT 'peer'::character varying NOT NULL,
    "hasSubmitted" boolean DEFAULT false NOT NULL,
    "submittedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "evaluation_participants_evaluatorRole_check" CHECK ((("evaluatorRole")::text = ANY (ARRAY[('manager'::character varying)::text, ('peer'::character varying)::text])))
);


--
-- Name: evaluation_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_participants_id_seq OWNED BY public.evaluation_participants.id;


--
-- Name: evaluation_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_summaries (
    id integer NOT NULL,
    "cycleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "systemScore" numeric(5,2),
    "peerScore" numeric(5,2),
    "managerScore" numeric(5,2),
    "upwardAvgScore" numeric(5,2),
    "upwardReviewCount" integer DEFAULT 0,
    "finalScore" numeric(5,2),
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: evaluation_summaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_summaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_summaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_summaries_id_seq OWNED BY public.evaluation_summaries.id;


--
-- Name: event_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_logs (
    id integer NOT NULL,
    "companyId" integer,
    "userId" integer,
    action character varying(100) NOT NULL,
    entity character varying(100),
    "entityId" integer,
    details text,
    "ipAddress" character varying(50),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: event_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_logs_id_seq OWNED BY public.event_logs.id;


--
-- Name: expense_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_claims (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "employeeId" integer NOT NULL,
    ref character varying(50),
    title character varying(300) NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    category character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "receiptUrl" text,
    "expenseDate" date DEFAULT CURRENT_DATE NOT NULL,
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    "paidAt" timestamp with time zone,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT expense_claims_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('paid'::character varying)::text])))
);


--
-- Name: expense_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expense_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expense_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expense_claims_id_seq OWNED BY public.expense_claims.id;


--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_periods (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    "closedAt" timestamp without time zone,
    "closedBy" integer,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "reopenedAt" timestamp without time zone,
    "reopenedBy" integer,
    "reopenReason" text,
    "lockedAt" timestamp without time zone,
    "lockedBy" integer,
    "yearEndClosed" boolean DEFAULT false NOT NULL,
    "yearEndClosedAt" timestamp with time zone,
    "yearEndClosingJournalId" integer,
    "deletedAt" timestamp without time zone,
    CONSTRAINT financial_periods_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('closed'::character varying)::text, ('locked'::character varying)::text])))
);


--
-- Name: financial_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financial_periods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financial_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financial_periods_id_seq OWNED BY public.financial_periods.id;


--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_assets (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    name character varying(300) NOT NULL,
    code character varying(50),
    category character varying(100),
    "purchaseDate" date,
    "purchaseCost" numeric(15,2) DEFAULT 0 NOT NULL,
    "currentBookValue" numeric(15,2) DEFAULT 0 NOT NULL,
    "salvageValue" numeric(15,2) DEFAULT 0 NOT NULL,
    "usefulLifeYears" integer,
    "depreciationMethod" character varying(30) DEFAULT 'straight_line'::character varying,
    "accumulatedDepreciation" numeric(15,2) DEFAULT 0 NOT NULL,
    location character varying(200),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "assignedTo" integer,
    "serialNumber" character varying(100),
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    "disposedAt" date,
    "disposalValue" numeric(15,2),
    "assetAccountCode" character varying(20) DEFAULT '1500'::character varying,
    "depreciationAccountCode" character varying(20) DEFAULT '6100'::character varying,
    "accDepreciationAccountCode" character varying(20) DEFAULT '1590'::character varying,
    CONSTRAINT fixed_assets_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('disposed'::character varying)::text, ('under_maintenance'::character varying)::text])))
);


--
-- Name: fixed_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fixed_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fixed_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fixed_assets_id_seq OWNED BY public.fixed_assets.id;


--
-- Name: fleet_drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_drivers (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer,
    name character varying(200) NOT NULL,
    phone character varying(20),
    "licenseNumber" character varying(50),
    "licenseExpiry" date,
    "licenseType" character varying(20),
    status character varying(20) DEFAULT 'available'::character varying,
    rating numeric(3,2) DEFAULT 5.0,
    "totalTrips" integer DEFAULT 0,
    latitude numeric(10,7),
    longitude numeric(10,7),
    "lastLocationUpdate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: fleet_drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_drivers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_drivers_id_seq OWNED BY public.fleet_drivers.id;


--
-- Name: fleet_fuel_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_fuel_logs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer,
    "driverId" integer,
    "fuelDate" date NOT NULL,
    liters numeric(10,2),
    "costPerLiter" numeric(8,2),
    "totalCost" numeric(12,2),
    "mileageAtFuel" integer,
    "stationName" character varying(200),
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: fleet_fuel_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_fuel_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_fuel_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_fuel_logs_id_seq OWNED BY public.fleet_fuel_logs.id;


--
-- Name: fleet_gps_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_gps_tracking (
    id integer NOT NULL,
    "vehicleId" integer,
    "driverId" integer,
    latitude numeric(10,7),
    longitude numeric(10,7),
    speed numeric(6,2),
    heading integer,
    "recordedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: fleet_gps_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_gps_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_gps_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_gps_tracking_id_seq OWNED BY public.fleet_gps_tracking.id;


--
-- Name: fleet_insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_insurance (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer,
    "policyNumber" character varying(100),
    provider character varying(200),
    type character varying(50) DEFAULT 'comprehensive'::character varying,
    "startDate" date,
    "endDate" date,
    premium numeric(12,2),
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "coverageAmount" numeric(15,2),
    notes text,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone
);


--
-- Name: fleet_insurance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_insurance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_insurance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_insurance_id_seq OWNED BY public.fleet_insurance.id;


--
-- Name: fleet_maintenance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_maintenance (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer,
    type character varying(50),
    description text,
    cost numeric(12,2) DEFAULT 0,
    "mileageAtService" integer,
    "serviceDate" date,
    "nextServiceDate" date,
    "nextServiceKm" integer,
    "performedBy" character varying(200),
    status character varying(20) DEFAULT 'completed'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: fleet_maintenance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_maintenance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_maintenance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_maintenance_id_seq OWNED BY public.fleet_maintenance.id;


--
-- Name: fleet_preventive_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_preventive_plans (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer NOT NULL,
    "serviceType" character varying(100) NOT NULL,
    "intervalKm" integer,
    "intervalDays" integer,
    "lastServiceDate" date,
    "lastServiceMileage" integer,
    "nextServiceDate" date,
    "estimatedCost" numeric(12,2) DEFAULT 0,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "nextServiceMileage" integer,
    status character varying(50) DEFAULT 'active'::character varying,
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: fleet_preventive_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_preventive_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_preventive_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_preventive_plans_id_seq OWNED BY public.fleet_preventive_plans.id;


--
-- Name: fleet_traffic_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_traffic_violations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer NOT NULL,
    "driverId" integer,
    "violationType" character varying(100) NOT NULL,
    "violationDate" date NOT NULL,
    "fineAmount" numeric(12,2) DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    location character varying(300),
    "violationNumber" character varying(100),
    "paidAt" timestamp with time zone,
    "paidBy" integer,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: fleet_traffic_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_traffic_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_traffic_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_traffic_violations_id_seq OWNED BY public.fleet_traffic_violations.id;


--
-- Name: fleet_trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_trips (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer,
    "driverId" integer,
    "clientId" integer,
    "fromLocation" character varying(500),
    "toLocation" character varying(500),
    "fromLat" numeric(10,7),
    "fromLng" numeric(10,7),
    "toLat" numeric(10,7),
    "toLng" numeric(10,7),
    distance numeric(10,2),
    "startTime" timestamp without time zone,
    "endTime" timestamp without time zone,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    cost numeric(12,2) DEFAULT 0,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone,
    "cancelledAt" timestamp with time zone,
    "cancellationReason" text
);


--
-- Name: fleet_trips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_trips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_trips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_trips_id_seq OWNED BY public.fleet_trips.id;


--
-- Name: fleet_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_vehicles (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "plateNumber" character varying(20) NOT NULL,
    make character varying(100),
    model character varying(100),
    year integer,
    color character varying(50),
    "vinNumber" character varying(50),
    "fuelType" character varying(20) DEFAULT 'gasoline'::character varying,
    "currentMileage" integer DEFAULT 0,
    status character varying(20) DEFAULT 'available'::character varying,
    "insuranceExpiry" date,
    "registrationExpiry" date,
    "lastMaintenanceDate" date,
    "nextMaintenanceKm" integer,
    "assignedDriverId" integer,
    "branchId" integer,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "lastServiceDate" date,
    "nextServiceDate" date,
    "fuelCapacity" numeric(8,2),
    "registrationNumber" character varying(50),
    "inspectionDate" date,
    "nextInspectionDate" date,
    "plateType" character varying(30),
    "sequenceNumber" character varying(20),
    "deletedAt" timestamp with time zone
);


--
-- Name: fleet_vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_vehicles_id_seq OWNED BY public.fleet_vehicles.id;


--
-- Name: fleet_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_violations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "vehicleId" integer,
    "driverId" integer,
    "violationType" character varying(100) NOT NULL,
    description text,
    "violationDate" date NOT NULL,
    location character varying(300),
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'unpaid'::character varying NOT NULL,
    "paidAt" timestamp with time zone,
    "referenceNumber" character varying(100),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fleet_violations_status_check CHECK (((status)::text = ANY (ARRAY[('unpaid'::character varying)::text, ('paid'::character varying)::text, ('disputed'::character varying)::text])))
);


--
-- Name: fleet_violations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fleet_violations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fleet_violations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fleet_violations_id_seq OWNED BY public.fleet_violations.id;


--
-- Name: goods_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_items (
    id integer NOT NULL,
    "grnId" integer NOT NULL,
    "poItemId" integer NOT NULL,
    "itemName" text,
    "receivedQty" numeric(18,4) DEFAULT 0 NOT NULL,
    "unitPrice" numeric(18,4) DEFAULT 0 NOT NULL,
    "lineTotal" numeric(18,4) DEFAULT 0 NOT NULL,
    notes text
);


--
-- Name: goods_receipt_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipt_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipt_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipt_items_id_seq OWNED BY public.goods_receipt_items.id;


--
-- Name: goods_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "poId" integer NOT NULL,
    ref text NOT NULL,
    "receivedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "receivedBy" integer,
    notes text,
    "journalId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp without time zone
);


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goods_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goods_receipts_id_seq OWNED BY public.goods_receipts.id;


--
-- Name: gov_integration_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gov_integration_links (
    id integer NOT NULL,
    "integrationId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "entityType" character varying(30) NOT NULL,
    "entityId" integer NOT NULL,
    "externalRef" character varying(200),
    "syncStatus" character varying(20) DEFAULT 'pending'::character varying,
    enabled boolean DEFAULT true,
    notes text,
    "lastSyncAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "gov_integration_links_syncStatus_check" CHECK ((("syncStatus")::text = ANY (ARRAY[('pending'::character varying)::text, ('synced'::character varying)::text, ('failed'::character varying)::text, ('skipped'::character varying)::text])))
);


--
-- Name: gov_integration_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gov_integration_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gov_integration_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gov_integration_links_id_seq OWNED BY public.gov_integration_links.id;


--
-- Name: gov_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gov_integrations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    type character varying(30) NOT NULL,
    name character varying(100) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'inactive'::character varying,
    enabled boolean DEFAULT false,
    "lastCheckedAt" timestamp with time zone,
    "lastCheckStatus" character varying(20),
    "lastCheckMessage" text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT gov_integrations_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('error'::character varying)::text]))),
    CONSTRAINT gov_integrations_type_check CHECK (((type)::text = ANY (ARRAY[('muqeem'::character varying)::text, ('tam'::character varying)::text, ('absher_business'::character varying)::text])))
);


--
-- Name: gov_integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gov_integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gov_integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gov_integrations_id_seq OWNED BY public.gov_integrations.id;


--
-- Name: governance_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_audits (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    scope text,
    status character varying(50) DEFAULT 'planned'::character varying,
    "auditorName" character varying(255),
    "startDate" date,
    "endDate" date,
    findings text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: governance_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_audits_id_seq OWNED BY public.governance_audits.id;


--
-- Name: governance_capa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_capa (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    finding text NOT NULL,
    "auditId" integer,
    "rootCause" text,
    "correctiveAction" text,
    "preventiveAction" text,
    "responsiblePerson" text,
    "dueDate" date,
    status text DEFAULT 'open'::text NOT NULL,
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT governance_capa_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text, 'overdue'::text])))
);


--
-- Name: governance_capa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_capa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_capa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_capa_id_seq OWNED BY public.governance_capa.id;


--
-- Name: governance_compliance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_compliance (
    id integer NOT NULL,
    regulation character varying(255) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'compliant'::character varying,
    "dueDate" date,
    "responsiblePerson" character varying(255),
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: governance_compliance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_compliance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_compliance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_compliance_id_seq OWNED BY public.governance_compliance.id;


--
-- Name: governance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_policies (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category character varying(100),
    status character varying(50) DEFAULT 'active'::character varying,
    "effectiveDate" date,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    version integer DEFAULT 1,
    "expiryDate" date,
    "parentId" integer
);


--
-- Name: governance_policies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_policies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_policies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_policies_id_seq OWNED BY public.governance_policies.id;


--
-- Name: governance_risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_risks (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    severity character varying(50) DEFAULT 'medium'::character varying,
    likelihood character varying(50) DEFAULT 'medium'::character varying,
    impact character varying(50) DEFAULT 'medium'::character varying,
    status character varying(50) DEFAULT 'open'::character varying,
    "mitigationPlan" text,
    "assignedTo" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "treatmentPlan" text,
    "treatmentOwner" text,
    "treatmentDueDate" date,
    "treatmentStatus" text
);


--
-- Name: governance_risks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_risks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_risks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_risks_id_seq OWNED BY public.governance_risks.id;


--
-- Name: hr_discipline_regulation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_discipline_regulation (
    id integer NOT NULL,
    "companyId" integer,
    section text NOT NULL,
    "articleNumber" integer NOT NULL,
    title text NOT NULL,
    description text,
    penalty1 text,
    penalty2 text,
    penalty3 text,
    penalty4 text,
    "extraDeduction" text,
    severity text DEFAULT 'medium'::text NOT NULL,
    "isTermination" boolean DEFAULT false NOT NULL,
    "legalReference" text,
    "effectiveFrom" date DEFAULT '2024-10-01'::date NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT hr_disc_section_chk CHECK ((section = ANY (ARRAY['work_time'::text, 'work_organization'::text, 'conduct'::text])))
);


--
-- Name: hr_discipline_regulation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_discipline_regulation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_discipline_regulation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_discipline_regulation_id_seq OWNED BY public.hr_discipline_regulation.id;


--
-- Name: hr_inquiry_memo_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_inquiry_memo_events (
    id integer NOT NULL,
    "memoId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "actorId" integer,
    "actorRole" text,
    action text NOT NULL,
    payload jsonb,
    note text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hr_inquiry_memo_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_inquiry_memo_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_inquiry_memo_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_inquiry_memo_events_id_seq OWNED BY public.hr_inquiry_memo_events.id;


--
-- Name: hr_inquiry_memos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_inquiry_memos (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "memoNumber" text NOT NULL,
    "assignmentId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "regulationId" integer,
    "violationId" integer,
    "incidentType" text NOT NULL,
    "incidentDate" date NOT NULL,
    "incidentDurationMinutes" integer,
    "incidentDescription" text,
    source text DEFAULT 'manual'::text NOT NULL,
    justification text,
    "employeeSignedAt" timestamp with time zone,
    "employeeDeclined" boolean DEFAULT false NOT NULL,
    "managerId" integer,
    "managerRecommendation" text,
    "managerComment" text,
    "managerDecidedAt" timestamp with time zone,
    "gmId" integer,
    "gmDecision" text,
    "gmComment" text,
    "gmDecidedAt" timestamp with time zone,
    "occurrenceCount" integer DEFAULT 1,
    "appliedPenaltyLabel" text,
    "appliedDeductionAmount" numeric(14,2) DEFAULT 0,
    "appliedExtraDeduction" numeric(14,2) DEFAULT 0,
    "terminationDecided" boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending_employee'::text NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT "hr_inquiry_memos_occurrenceCount_check" CHECK ((("occurrenceCount" >= 1) AND ("occurrenceCount" <= 4))),
    CONSTRAINT hr_memo_incident_chk CHECK (("incidentType" = ANY (ARRAY['late'::text, 'absence'::text, 'early_leave'::text, 'behavior'::text, 'organization'::text, 'gps_out_of_range'::text, 'custom'::text]))),
    CONSTRAINT hr_memo_source_chk CHECK ((source = ANY (ARRAY['manual'::text, 'auto'::text, 'manager'::text, 'hr'::text]))),
    CONSTRAINT hr_memo_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'pending_employee'::text, 'pending_manager'::text, 'pending_gm'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: hr_inquiry_memos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_inquiry_memos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_inquiry_memos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_inquiry_memos_id_seq OWNED BY public.hr_inquiry_memos.id;


--
-- Name: hr_leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_balances (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "leaveTypeId" integer NOT NULL,
    year integer NOT NULL,
    entitled integer DEFAULT 0,
    used integer DEFAULT 0,
    reserved integer DEFAULT 0,
    remaining integer GENERATED ALWAYS AS (((entitled - used) - reserved)) STORED
);


--
-- Name: hr_leave_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_leave_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_leave_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_leave_balances_id_seq OWNED BY public.hr_leave_balances.id;


--
-- Name: hr_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "leaveTypeId" integer NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    days integer NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying,
    "approvedBy" integer,
    "approvedAt" timestamp without time zone,
    "rejectedReason" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT hr_leave_requests_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('cancelled'::character varying)::text, ('returned'::character varying)::text])))
);


--
-- Name: hr_leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_leave_requests_id_seq OWNED BY public.hr_leave_requests.id;


--
-- Name: hr_leave_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_types (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    "annualDays" integer DEFAULT 21,
    "isPaid" boolean DEFAULT true,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "genderRestriction" character varying(10),
    "minServiceMonths" integer DEFAULT 0,
    "oncePerCareer" boolean DEFAULT false,
    "requiresDocument" boolean DEFAULT false,
    "maxDeptAbsentPct" numeric DEFAULT 25
);


--
-- Name: hr_leave_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hr_leave_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hr_leave_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hr_leave_types_id_seq OWNED BY public.hr_leave_types.id;


--
-- Name: integration_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_logs (
    id integer NOT NULL,
    "integrationId" integer,
    "companyId" integer,
    channel character varying(50) NOT NULL,
    direction character varying(20) DEFAULT 'outbound'::character varying,
    recipient character varying(300),
    subject character varying(500),
    body text,
    status character varying(30) DEFAULT 'pending'::character varying,
    "errorMessage" text,
    "retryAttempt" integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT integration_logs_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('sent'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text, ('retrying'::character varying)::text])))
);


--
-- Name: integration_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_logs_id_seq OWNED BY public.integration_logs.id;


--
-- Name: integration_logs_archive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_logs_archive (
    id integer DEFAULT nextval('public.integration_logs_id_seq'::regclass) NOT NULL,
    "integrationId" integer,
    "companyId" integer,
    channel character varying(50) NOT NULL,
    direction character varying(20) DEFAULT 'outbound'::character varying,
    recipient character varying(300),
    subject character varying(500),
    body text,
    status character varying(30) DEFAULT 'pending'::character varying,
    "errorMessage" text,
    "retryAttempt" integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT integration_logs_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('sent'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text, ('retrying'::character varying)::text])))
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id integer NOT NULL,
    "companyId" integer,
    type character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    status character varying(30) DEFAULT 'inactive'::character varying,
    "lastSuccessAt" timestamp with time zone,
    "lastFailureAt" timestamp with time zone,
    "lastError" text,
    "retryCount" integer DEFAULT 0,
    "maxRetries" integer DEFAULT 3,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT integrations_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('error'::character varying)::text]))),
    CONSTRAINT integrations_type_check CHECK (((type)::text = ANY (ARRAY[('email'::character varying)::text, ('sms'::character varying)::text, ('whatsapp'::character varying)::text, ('webhook'::character varying)::text])))
);


--
-- Name: integrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrations_id_seq OWNED BY public.integrations.id;


--
-- Name: intercompany_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intercompany_transactions (
    id integer NOT NULL,
    ref character varying(100) NOT NULL,
    "fromCompanyId" integer NOT NULL,
    "toCompanyId" integer NOT NULL,
    amount numeric(18,2) NOT NULL,
    description text,
    "transactionDate" date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(30) DEFAULT 'posted'::character varying,
    "fromJournalId" integer,
    "toJournalId" integer,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp without time zone,
    CONSTRAINT intercompany_transactions_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('posted'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: intercompany_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.intercompany_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: intercompany_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.intercompany_transactions_id_seq OWNED BY public.intercompany_transactions.id;


--
-- Name: inventory_count_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_count_items (
    id integer NOT NULL,
    "countId" integer NOT NULL,
    "productId" integer NOT NULL,
    "systemStock" numeric(12,3) DEFAULT 0,
    "physicalCount" numeric(12,3) NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    variance numeric(12,3) DEFAULT 0
);


--
-- Name: inventory_count_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_count_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_count_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_count_items_id_seq OWNED BY public.inventory_count_items.id;


--
-- Name: inventory_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_counts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "countDate" date NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying,
    "warehouseLocation" character varying(200),
    notes text,
    "conductedBy" integer,
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_counts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_counts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_counts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_counts_id_seq OWNED BY public.inventory_counts.id;


--
-- Name: invoice_collection_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_collection_stages (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "invoiceId" integer NOT NULL,
    stage integer DEFAULT 1 NOT NULL,
    "stageName" character varying NOT NULL,
    notes text,
    "performedBy" integer,
    "performedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: invoice_collection_stages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_collection_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_collection_stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_collection_stages_id_seq OWNED BY public.invoice_collection_stages.id;


--
-- Name: invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_lines (
    id integer NOT NULL,
    "invoiceId" integer NOT NULL,
    description text,
    quantity numeric DEFAULT 1,
    "unitPrice" numeric DEFAULT 0,
    "lineTotal" numeric DEFAULT 0,
    "vatAmount" numeric DEFAULT 0,
    "lineGross" numeric DEFAULT 0
);


--
-- Name: invoice_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_lines_id_seq OWNED BY public.invoice_lines.id;


--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id integer NOT NULL,
    "invoiceId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "clientId" integer,
    amount numeric(15,2) NOT NULL,
    method text DEFAULT 'online'::text,
    "transactionRef" text,
    "paidAt" timestamp with time zone DEFAULT now(),
    source text DEFAULT 'manual'::text,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_payments_id_seq OWNED BY public.invoice_payments.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "clientId" integer,
    ref character varying(100),
    description text,
    subtotal numeric(15,2) DEFAULT 0,
    "vatRate" numeric(5,2) DEFAULT 15,
    "vatAmount" numeric(15,2) DEFAULT 0,
    total numeric(15,2) DEFAULT 0,
    "paidAmount" numeric(15,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    "dueDate" date,
    "paidAt" timestamp without time zone,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    currency character varying(10) DEFAULT 'SAR'::character varying NOT NULL,
    "paymentTerms" character varying(50),
    "poNumber" character varying(100),
    "discountAmount" numeric(15,2) DEFAULT 0 NOT NULL,
    "discountPercent" numeric(5,2) DEFAULT 0 NOT NULL,
    "journalEntryId" integer,
    "sentAt" timestamp with time zone,
    notes text,
    "deletedAt" timestamp with time zone,
    "isTaxLinked" boolean DEFAULT false,
    "zatcaStatus" character varying(20),
    "zatcaUuid" uuid,
    "zatcaHash" character varying(64),
    "zatcaQrCode" text,
    "invoiceTypeCode" character varying(10) DEFAULT '388'::character varying,
    "taxCategoryCode" character varying(10) DEFAULT 'S'::character varying,
    "exemptionReason" text,
    "projectId" integer,
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_approval'::character varying)::text, ('sent'::character varying)::text, ('partial'::character varying)::text, ('paid'::character varying)::text, ('overdue'::character varying)::text, ('cancelled'::character varying)::text, ('returned'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('delivered'::character varying)::text, ('ordered'::character varying)::text])))
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: job_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_applications (
    id integer NOT NULL,
    "postingId" integer,
    "applicantName" character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    "resumeUrl" text,
    status character varying(50) DEFAULT 'new'::character varying,
    notes text,
    rating integer,
    "interviewDate" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "applicantAccountId" integer,
    "coverLetter" text
);


--
-- Name: job_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_applications_id_seq OWNED BY public.job_applications.id;


--
-- Name: job_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_postings (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    department character varying(100),
    location character varying(255),
    type character varying(50) DEFAULT 'full-time'::character varying,
    description text,
    requirements text,
    "salaryMin" numeric(15,2),
    "salaryMax" numeric(15,2),
    status character varying(50) DEFAULT 'open'::character varying,
    "closingDate" date,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "isPublic" boolean DEFAULT true,
    "closedAt" timestamp with time zone,
    "closedReason" text,
    "reopenedAt" timestamp with time zone
);


--
-- Name: job_postings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_postings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_postings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_postings_id_seq OWNED BY public.job_postings.id;


--
-- Name: job_titles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_titles (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    "nameEn" character varying(100),
    category character varying(50) DEFAULT 'general'::character varying,
    "companyId" integer,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: job_titles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_titles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_titles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_titles_id_seq OWNED BY public.job_titles.id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    ref character varying(100),
    description text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    type character varying(30) DEFAULT 'manual'::character varying NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    "sourceType" character varying(50),
    "sourceId" integer,
    "postedBy" integer,
    "postedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "costCenter" character varying(150),
    "departmentId" integer,
    "relatedEntityType" character varying(50),
    "relatedEntityId" integer,
    "paymentMethod" character varying(50) DEFAULT 'cash'::character varying,
    reference character varying(200),
    "isPaid" boolean DEFAULT true,
    "attachmentUrl" text,
    "attachmentType" character varying(50),
    "expenseType" character varying(50),
    "operationType" character varying(50),
    "projectId" integer,
    "taxCategory" character varying(50),
    "deletedAt" timestamp with time zone,
    notes text,
    "dueDate" date,
    "isTaxLinked" boolean DEFAULT false,
    "zatcaStatus" character varying(20),
    "zatcaUuid" uuid,
    "zatcaHash" character varying(64),
    "zatcaQrCode" text,
    "invoiceTypeCode" character varying(10) DEFAULT '388'::character varying,
    "taxCategoryCode" character varying(10) DEFAULT 'S'::character varying,
    "exemptionReason" text,
    "govIntegrationId" integer,
    "govSyncEnabled" boolean DEFAULT false,
    "govExternalRef" character varying(100),
    "govEntityType" character varying(30),
    "govEntityId" integer,
    "approvalStatus" character varying(30) DEFAULT 'posted'::character varying,
    "isManual" boolean DEFAULT false,
    "reviewedBy" integer,
    "reviewedAt" timestamp without time zone,
    "approvedBy" integer,
    "approvedAt" timestamp without time zone,
    "approvalNotes" text,
    "reversalOfId" integer,
    "reversedById" integer,
    "reversedAt" timestamp with time zone,
    "reversalReason" text,
    CONSTRAINT "journal_entries_approvalStatus_check" CHECK ((("approvalStatus")::text = ANY (ARRAY[('draft'::character varying)::text, ('pending_review'::character varying)::text, ('approved'::character varying)::text, ('posted'::character varying)::text, ('rejected'::character varying)::text]))),
    CONSTRAINT journal_entries_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('posted'::character varying)::text, ('pending_approval'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('returned'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;


--
-- Name: journal_entry_template_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry_template_lines (
    id integer NOT NULL,
    "templateId" integer NOT NULL,
    "accountId" integer,
    "accountCode" character varying(20),
    "lineType" character varying(10) NOT NULL,
    description text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "journal_entry_template_lines_lineType_check" CHECK ((("lineType")::text = ANY (ARRAY[('debit'::character varying)::text, ('credit'::character varying)::text])))
);


--
-- Name: journal_entry_template_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entry_template_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entry_template_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entry_template_lines_id_seq OWNED BY public.journal_entry_template_lines.id;


--
-- Name: journal_entry_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry_templates (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "operationType" character varying(100) NOT NULL,
    description text,
    "branchId" integer,
    "activityType" character varying(100),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_entry_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_entry_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_entry_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_entry_templates_id_seq OWNED BY public.journal_entry_templates.id;


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id integer NOT NULL,
    "journalId" integer NOT NULL,
    "accountCode" character varying(20) NOT NULL,
    debit numeric(15,2) DEFAULT 0,
    credit numeric(15,2) DEFAULT 0,
    "accountId" integer,
    description text,
    "costCenter" character varying(100),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "departmentId" integer,
    "projectId" integer,
    "employeeId" integer,
    "vehicleId" integer,
    "propertyId" integer,
    "contractId" integer,
    "activityType" character varying(100),
    "templateId" integer
);


--
-- Name: journal_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.journal_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: journal_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.journal_lines_id_seq OWNED BY public.journal_lines.id;


--
-- Name: kb_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_articles (
    id integer NOT NULL,
    "companyId" integer,
    title text NOT NULL,
    content text,
    category text,
    tags text[],
    status text DEFAULT 'published'::text NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    helpful integer DEFAULT 0 NOT NULL,
    "notHelpful" integer DEFAULT 0 NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT kb_articles_status_check CHECK ((status = ANY (ARRAY['published'::text, 'draft'::text, 'archived'::text])))
);


--
-- Name: kb_articles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_articles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_articles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_articles_id_seq OWNED BY public.kb_articles.id;


--
-- Name: kpi_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_snapshots (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer,
    "snapshotDate" date NOT NULL,
    "metricName" character varying(100) NOT NULL,
    "metricValue" numeric(14,2),
    "metricTarget" numeric(14,2),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: kpi_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kpi_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kpi_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kpi_snapshots_id_seq OWNED BY public.kpi_snapshots.id;


--
-- Name: late_rent_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.late_rent_actions (
    id integer NOT NULL,
    "contractId" integer,
    "paymentId" integer,
    phase integer DEFAULT 1,
    action character varying(50),
    "sentAt" timestamp without time zone DEFAULT now(),
    notes text
);


--
-- Name: late_rent_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.late_rent_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: late_rent_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.late_rent_actions_id_seq OWNED BY public.late_rent_actions.id;


--
-- Name: leave_approval_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_approval_stages (
    id integer NOT NULL,
    "leaveRequestId" integer NOT NULL,
    stage integer NOT NULL,
    "requiredRole" character varying NOT NULL,
    "assignedTo" integer,
    status character varying DEFAULT 'pending'::character varying,
    decision character varying,
    "decidedBy" integer,
    "decidedAt" timestamp without time zone,
    "expiresAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "reminderSentAt" timestamp without time zone,
    "warningSentAt" timestamp without time zone,
    "escalatedAt" timestamp without time zone,
    "autoApprovedAt" timestamp without time zone
);


--
-- Name: leave_approval_stages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_approval_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_approval_stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_approval_stages_id_seq OWNED BY public.leave_approval_stages.id;


--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_balances (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "leaveTypeId" integer NOT NULL,
    year integer NOT NULL,
    entitled numeric(5,1) DEFAULT 0 NOT NULL,
    used numeric(5,1) DEFAULT 0 NOT NULL,
    pending numeric(5,1) DEFAULT 0 NOT NULL,
    carried numeric(5,1) DEFAULT 0 NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leave_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_balances_id_seq OWNED BY public.leave_balances.id;


--
-- Name: legal_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_cases (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "caseNumber" character varying(100),
    title character varying(300) NOT NULL,
    "caseType" character varying(50),
    court character varying(200),
    "filingDate" date,
    "opposingParty" character varying(300),
    "lawyerName" character varying(200),
    status character varying(20) DEFAULT 'open'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    description text,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone,
    "financialRisk" numeric(15,2),
    "riskLevel" text,
    CONSTRAINT "legal_cases_riskLevel_check" CHECK ((("riskLevel" = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])) OR ("riskLevel" IS NULL)))
);


--
-- Name: legal_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_cases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_cases_id_seq OWNED BY public.legal_cases.id;


--
-- Name: legal_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_contracts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    ref character varying(50),
    title character varying(300) NOT NULL,
    "contractType" character varying(50),
    "partyName" character varying(300),
    "partyContact" character varying(200),
    "startDate" date,
    "endDate" date,
    value numeric(14,2),
    status character varying(20) DEFAULT 'draft'::character varying,
    "renewalAlert" boolean DEFAULT true,
    "alertDaysBefore" integer DEFAULT 30,
    "fileUrl" text,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone,
    "terminationDate" timestamp with time zone,
    "terminationReason" text,
    "renewedFromId" integer,
    "renewedAt" timestamp with time zone,
    "renewalCount" integer DEFAULT 0 NOT NULL
);


--
-- Name: legal_contracts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_contracts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_contracts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_contracts_id_seq OWNED BY public.legal_contracts.id;


--
-- Name: legal_correspondence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_correspondence (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "caseId" integer,
    direction text DEFAULT 'outgoing'::text NOT NULL,
    subject text NOT NULL,
    parties text,
    "documentRef" text,
    "correspondenceDate" date,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT legal_correspondence_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text])))
);


--
-- Name: legal_correspondence_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_correspondence_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_correspondence_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_correspondence_id_seq OWNED BY public.legal_correspondence.id;


--
-- Name: legal_judgments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_judgments (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "caseId" integer,
    "judgmentDate" date,
    "judgmentType" text,
    verdict text,
    amount numeric(15,2),
    "paidAmount" numeric(15,2) DEFAULT 0,
    "dueDate" date,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: legal_judgments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_judgments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_judgments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_judgments_id_seq OWNED BY public.legal_judgments.id;


--
-- Name: legal_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_sessions (
    id integer NOT NULL,
    "caseId" integer,
    "sessionDate" timestamp without time zone NOT NULL,
    location character varying(300),
    judge character varying(200),
    result text,
    "nextSessionDate" timestamp without time zone,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: legal_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.legal_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: legal_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.legal_sessions_id_seq OWNED BY public.legal_sessions.id;


--
-- Name: loan_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_accounts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    amount numeric DEFAULT 0,
    "remainingAmount" numeric DEFAULT 0,
    "monthlyInstallment" numeric DEFAULT 0,
    status character varying DEFAULT 'active'::character varying,
    notes text,
    "startDate" date,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: loan_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_accounts_id_seq OWNED BY public.loan_accounts.id;


--
-- Name: maintenance_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "unitId" integer,
    "contractId" integer,
    "tenantName" character varying(300),
    category character varying(100),
    description text NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying,
    status character varying(20) DEFAULT 'open'::character varying,
    "assignedTo" integer,
    "estimatedCost" numeric(12,2),
    "actualCost" numeric(12,2),
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "beforePhotos" jsonb DEFAULT '[]'::jsonb,
    "afterPhotos" jsonb DEFAULT '[]'::jsonb,
    "technicianId" integer,
    "responseTime" integer,
    "resolutionTime" integer,
    "clientRating" integer,
    "clientComment" text,
    "costResponsibility" character varying(20) DEFAULT 'owner'::character varying,
    "closureReport" text,
    "materialsUsed" jsonb DEFAULT '[]'::jsonb,
    "slaDeadline" timestamp with time zone
);


--
-- Name: maintenance_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maintenance_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maintenance_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maintenance_requests_id_seq OWNED BY public.maintenance_requests.id;


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(100),
    channel character varying(100),
    status character varying(50) DEFAULT 'draft'::character varying,
    budget numeric(15,2) DEFAULT 0,
    spent numeric(15,2) DEFAULT 0,
    "startDate" date,
    "endDate" date,
    "targetAudience" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "createdBy" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    revenue numeric(15,2) DEFAULT 0
);


--
-- Name: marketing_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketing_campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketing_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketing_campaigns_id_seq OWNED BY public.marketing_campaigns.id;


--
-- Name: notification_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "notificationId" integer,
    channel character varying(30) NOT NULL,
    recipient character varying(300) NOT NULL,
    "templateKey" character varying(150),
    subject text,
    body text,
    status character varying(30) DEFAULT 'queued'::character varying NOT NULL,
    "externalId" character varying(300),
    "providerResponse" jsonb,
    "errorMessage" text,
    "attemptCount" integer DEFAULT 0,
    "fallbackChainId" integer,
    "fallbackStep" integer DEFAULT 0,
    "parentDeliveryId" integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    "queuedAt" timestamp with time zone DEFAULT now(),
    "sentAt" timestamp with time zone,
    "deliveredAt" timestamp with time zone,
    "failedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_delivery_log_status_check CHECK (((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('sending'::character varying)::text, ('sent'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text, ('bounced'::character varying)::text, ('rejected'::character varying)::text, ('fallback_triggered'::character varying)::text])))
);


--
-- Name: notification_delivery_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_delivery_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_delivery_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_delivery_log_id_seq OWNED BY public.notification_delivery_log.id;


--
-- Name: notification_fallback_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_fallback_chains (
    id integer NOT NULL,
    "companyId" integer,
    name character varying(200) NOT NULL,
    description text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: notification_fallback_chains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_fallback_chains_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_fallback_chains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_fallback_chains_id_seq OWNED BY public.notification_fallback_chains.id;


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    channel character varying(20),
    recipient character varying(200),
    subject character varying(300),
    body text,
    status character varying(20) DEFAULT 'sent'::character varying,
    "errorMessage" text,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: notification_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_log_id_seq OWNED BY public.notification_log.id;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "companyId" integer DEFAULT 1 NOT NULL,
    channel character varying(50) DEFAULT 'in_app'::character varying NOT NULL,
    category character varying(100) DEFAULT 'general'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "inApp" boolean DEFAULT true,
    email boolean DEFAULT true,
    sms boolean DEFAULT false,
    whatsapp boolean DEFAULT false,
    push boolean DEFAULT true,
    webhook boolean DEFAULT false,
    "quietHoursStart" time without time zone,
    "quietHoursEnd" time without time zone
);


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_preferences_id_seq OWNED BY public.notification_preferences.id;


--
-- Name: notification_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_routing_rules (
    id integer NOT NULL,
    "companyId" integer,
    "eventCategory" character varying(100) NOT NULL,
    channels jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying,
    "isActive" boolean DEFAULT true,
    description text,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "fallbackChainId" integer,
    CONSTRAINT notification_routing_rules_priority_check CHECK (((priority)::text = ANY (ARRAY[('low'::character varying)::text, ('normal'::character varying)::text, ('high'::character varying)::text, ('urgent'::character varying)::text])))
);


--
-- Name: notification_routing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_routing_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_routing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_routing_rules_id_seq OWNED BY public.notification_routing_rules.id;


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id integer NOT NULL,
    "companyId" integer,
    "templateKey" character varying(150) NOT NULL,
    channel character varying(30) NOT NULL,
    "titleTemplate" text,
    "bodyTemplate" text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb,
    language character varying(10) DEFAULT 'ar'::character varying,
    "isActive" boolean DEFAULT true,
    "isDefault" boolean DEFAULT false,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_templates_channel_check CHECK (((channel)::text = ANY (ARRAY[('sms'::character varying)::text, ('whatsapp'::character varying)::text, ('email'::character varying)::text, ('push'::character varying)::text, ('in_app'::character varying)::text, ('webhook'::character varying)::text])))
);


--
-- Name: notification_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_templates_id_seq OWNED BY public.notification_templates.id;


--
-- Name: notification_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_webhooks (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    url text NOT NULL,
    secret character varying(500),
    events jsonb DEFAULT '["*"]'::jsonb NOT NULL,
    headers jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "lastSuccessAt" timestamp with time zone,
    "lastFailureAt" timestamp with time zone,
    "lastError" text,
    "failCount" integer DEFAULT 0,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: notification_webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_webhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_webhooks_id_seq OWNED BY public.notification_webhooks.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer,
    type character varying(100) NOT NULL,
    title character varying(300) NOT NULL,
    body text,
    priority character varying(20) DEFAULT 'normal'::character varying,
    "targetRole" character varying(100),
    "actionUrl" character varying(500),
    "refType" character varying(100),
    "refId" integer,
    "isRead" boolean DEFAULT false,
    "readAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: official_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.official_letters (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer,
    type character varying DEFAULT 'general'::character varying,
    subject character varying(500),
    content text,
    status character varying DEFAULT 'draft'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "sentAt" timestamp with time zone,
    "dispatchedVia" character varying(32),
    "approvedAt" timestamp with time zone,
    "approvedBy" integer,
    "createdByAssignmentId" integer
);


--
-- Name: official_letters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.official_letters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: official_letters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.official_letters_id_seq OWNED BY public.official_letters.id;


--
-- Name: onboarding_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_tasks (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    "assignedTo" integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    "dueDate" date,
    "completedAt" timestamp without time zone,
    "completedBy" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: onboarding_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.onboarding_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: onboarding_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.onboarding_tasks_id_seq OWNED BY public.onboarding_tasks.id;


--
-- Name: password_reset_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_requests (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    "resolvedBy" integer,
    "resolvedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_requests_id_seq OWNED BY public.password_reset_requests.id;


--
-- Name: payroll_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_lines (
    id integer NOT NULL,
    "runId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    basic numeric(12,2) DEFAULT 0,
    "grossSalary" numeric(12,2) DEFAULT 0,
    gosi numeric(12,2) DEFAULT 0,
    "lateDeduction" numeric(12,2) DEFAULT 0,
    "netSalary" numeric(12,2) DEFAULT 0,
    "housingAllowance" numeric DEFAULT 0,
    "transportAllowance" numeric DEFAULT 0,
    "absenceDeduction" numeric DEFAULT 0,
    "violationDeduction" numeric DEFAULT 0,
    "loanDeduction" numeric DEFAULT 0,
    overtime numeric DEFAULT 0,
    "overtimeHours" numeric DEFAULT 0,
    "gosiEmployer" numeric DEFAULT 0,
    "employeeId" integer,
    commission numeric(12,2) DEFAULT 0,
    "deletedAt" timestamp with time zone
);


--
-- Name: payroll_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_lines_id_seq OWNED BY public.payroll_lines.id;


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    period character varying(7) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    "totalNet" numeric(15,2) DEFAULT 0,
    "runBy" integer,
    "approvedBy" integer,
    "approvedAt" timestamp without time zone,
    "paidAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone
);


--
-- Name: payroll_records; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.payroll_records AS
 SELECT pl.id,
    pl."runId",
    pl."assignmentId" AS "employeeAssignmentId",
    pr."companyId",
    pr."branchId",
    pr.period,
    pr.status,
    pl.basic,
    pl."grossSalary",
    pl.gosi,
    pl."lateDeduction",
    pl."netSalary",
    ((((COALESCE(pl.gosi, (0)::numeric) + COALESCE(pl."lateDeduction", (0)::numeric)) + COALESCE(pl."absenceDeduction", (0)::numeric)) + COALESCE(pl."violationDeduction", (0)::numeric)) + COALESCE(pl."loanDeduction", (0)::numeric)) AS "totalDeductions",
    pl."housingAllowance",
    pl."transportAllowance",
    pl."absenceDeduction",
    pl."violationDeduction",
    pl."loanDeduction",
    pl.overtime,
    pl."overtimeHours",
    pl."gosiEmployer",
    pl."employeeId",
    pr."createdAt",
    pl."deletedAt"
   FROM (public.payroll_lines pl
     JOIN public.payroll_runs pr ON ((pr.id = pl."runId")))
  WHERE ((pl."deletedAt" IS NULL) AND (pr."deletedAt" IS NULL));


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_runs_id_seq OWNED BY public.payroll_runs.id;


--
-- Name: pbx_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pbx_calls (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "callId" character varying(100),
    "callerNumber" character varying(20),
    "calledNumber" character varying(20),
    direction character varying(10),
    duration integer DEFAULT 0,
    status character varying(20),
    "recordingUrl" text,
    "answeredBy" integer,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: pbx_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pbx_calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pbx_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pbx_calls_id_seq OWNED BY public.pbx_calls.id;


--
-- Name: peer_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.peer_evaluations (
    id integer NOT NULL,
    "cycleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "evaluatorId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "evaluatorRole" character varying(20) DEFAULT 'peer'::character varying NOT NULL,
    "overallScore" numeric(5,2) NOT NULL,
    scores jsonb,
    comments text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "peer_evaluations_evaluatorRole_check" CHECK ((("evaluatorRole")::text = ANY (ARRAY[('manager'::character varying)::text, ('peer'::character varying)::text, ('self'::character varying)::text])))
);


--
-- Name: peer_evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.peer_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: peer_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.peer_evaluations_id_seq OWNED BY public.peer_evaluations.id;


--
-- Name: performance_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_reviews (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "reviewerId" integer,
    period character varying(50),
    "reviewDate" date,
    "overallScore" numeric(3,1),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    scores jsonb,
    strengths text,
    improvements text,
    goals text,
    comments text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT performance_reviews_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('acknowledged'::character varying)::text])))
);


--
-- Name: performance_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.performance_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: performance_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.performance_reviews_id_seq OWNED BY public.performance_reviews.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    permission character varying(100) NOT NULL,
    type character varying(10) DEFAULT 'grant'::character varying NOT NULL,
    "companyId" integer,
    "grantedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permissions_type_check CHECK (((type)::text = ANY (ARRAY[('grant'::character varying)::text, ('revoke'::character varying)::text])))
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: po_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.po_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_compliance_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_compliance_actions (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    title text NOT NULL,
    regulation text,
    description text,
    owner text,
    "dueDate" date,
    status text DEFAULT 'open'::text NOT NULL,
    "policyId" integer,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT policy_compliance_actions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'overdue'::text])))
);


--
-- Name: policy_compliance_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_compliance_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_compliance_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_compliance_actions_id_seq OWNED BY public.policy_compliance_actions.id;


--
-- Name: policy_module_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_module_links (
    id integer NOT NULL,
    "policyId" integer NOT NULL,
    module character varying(100) NOT NULL,
    "companyId" integer,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: policy_module_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_module_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_module_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_module_links_id_seq OWNED BY public.policy_module_links.id;


--
-- Name: pr_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pr_number_seq
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: privacy_consent_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.privacy_consent_records (
    id integer NOT NULL,
    "companyId" integer,
    "userId" integer,
    "consentType" character varying(100) NOT NULL,
    "consentVersion" character varying(20) DEFAULT '1.0'::character varying NOT NULL,
    granted boolean DEFAULT false NOT NULL,
    "grantedAt" timestamp with time zone,
    "revokedAt" timestamp with time zone,
    "ipAddress" character varying(45),
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: privacy_consent_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.privacy_consent_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: privacy_consent_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.privacy_consent_records_id_seq OWNED BY public.privacy_consent_records.id;


--
-- Name: proactive_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proactive_rules (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    "nameAr" character varying(200) NOT NULL,
    description text,
    "descriptionAr" text,
    module character varying(50) NOT NULL,
    "triggerType" character varying(50) DEFAULT 'cron'::character varying NOT NULL,
    "isActive" boolean DEFAULT true,
    "lastRunAt" timestamp without time zone,
    "totalExecutions" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: proactive_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.proactive_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: proactive_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.proactive_rules_id_seq OWNED BY public.proactive_rules.id;


--
-- Name: processing_activities_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_activities_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "activityType" character varying(100) NOT NULL,
    "dataCategories" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "dataSubjects" character varying(255),
    purpose text NOT NULL,
    "legalBasis" character varying(255) NOT NULL,
    "thirdPartySharing" boolean DEFAULT false NOT NULL,
    "thirdParties" jsonb DEFAULT '[]'::jsonb,
    "crossBorderTransfer" boolean DEFAULT false NOT NULL,
    "transferCountries" jsonb DEFAULT '[]'::jsonb,
    "retentionPeriod" character varying(100),
    "technicalMeasures" jsonb DEFAULT '[]'::jsonb,
    "performedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processing_activities_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.processing_activities_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: processing_activities_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.processing_activities_log_id_seq OWNED BY public.processing_activities_log.id;


--
-- Name: project_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_costs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "projectId" integer NOT NULL,
    category character varying(100) NOT NULL,
    description text,
    amount numeric(12,2) NOT NULL,
    "costDate" date NOT NULL,
    "invoiceRef" character varying(200),
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "enteredBy" integer,
    notes text
);


--
-- Name: project_costs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_costs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_costs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_costs_id_seq OWNED BY public.project_costs.id;


--
-- Name: project_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_milestones (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "projectId" integer NOT NULL,
    name character varying(300) NOT NULL,
    description text,
    "dueDate" date,
    "completedDate" date,
    status character varying(50) DEFAULT 'pending'::character varying,
    "createdAt" timestamp with time zone DEFAULT now(),
    title character varying(300),
    "targetDate" date
);


--
-- Name: project_milestones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_milestones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_milestones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_milestones_id_seq OWNED BY public.project_milestones.id;


--
-- Name: project_phases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_phases (
    id integer NOT NULL,
    "projectId" integer,
    name character varying(200) NOT NULL,
    "orderIndex" integer DEFAULT 0,
    "startDate" date,
    "endDate" date,
    status character varying(20) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: project_phases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_phases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_phases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_phases_id_seq OWNED BY public.project_phases.id;


--
-- Name: project_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_resources (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "projectId" integer NOT NULL,
    "employeeId" integer,
    role character varying(200),
    "hoursAllocated" numeric(8,2) DEFAULT 0,
    "hoursSpent" numeric(8,2) DEFAULT 0,
    "startDate" date,
    "endDate" date,
    "createdAt" timestamp with time zone DEFAULT now(),
    "taskId" integer,
    "allocatedHours" numeric(8,2) DEFAULT 0,
    "budgetAllocated" numeric(12,2) DEFAULT 0
);


--
-- Name: project_resources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_resources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_resources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_resources_id_seq OWNED BY public.project_resources.id;


--
-- Name: project_risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_risks (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "projectId" integer NOT NULL,
    title character varying(300) NOT NULL,
    description text,
    probability integer DEFAULT 3,
    impact integer DEFAULT 3,
    "riskLevel" character varying(50) DEFAULT 'medium'::character varying,
    "mitigationPlan" text,
    status character varying(50) DEFAULT 'open'::character varying,
    "ownerId" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "riskScore" integer DEFAULT 9,
    "responsibleId" integer
);


--
-- Name: project_risks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_risks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_risks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_risks_id_seq OWNED BY public.project_risks.id;


--
-- Name: project_task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_task_dependencies (
    id integer NOT NULL,
    "taskId" integer,
    "dependsOnId" integer
);


--
-- Name: project_task_dependencies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_task_dependencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_task_dependencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_task_dependencies_id_seq OWNED BY public.project_task_dependencies.id;


--
-- Name: project_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_tasks (
    id integer NOT NULL,
    "projectId" integer,
    "phaseId" integer,
    title character varying(300) NOT NULL,
    description text,
    "assigneeId" integer,
    priority character varying(20) DEFAULT 'medium'::character varying,
    status character varying(20) DEFAULT 'todo'::character varying,
    "startDate" date,
    "dueDate" date,
    "completedAt" timestamp without time zone,
    "estimatedHours" numeric(8,2),
    "actualHours" numeric(8,2),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: project_tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_tasks_id_seq OWNED BY public.project_tasks.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(300) NOT NULL,
    description text,
    "clientId" integer,
    "managerId" integer,
    "startDate" date,
    "endDate" date,
    budget numeric(14,2) DEFAULT 0,
    "spentAmount" numeric(14,2) DEFAULT 0,
    status character varying(20) DEFAULT 'planning'::character varying,
    progress integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: property_buildings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_buildings (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    address text,
    city character varying(100),
    type character varying(50),
    "totalUnits" integer DEFAULT 0 NOT NULL,
    "occupiedUnits" integer DEFAULT 0 NOT NULL,
    "totalArea" numeric(12,2),
    "yearBuilt" integer,
    "purchasePrice" numeric(15,2),
    "currentValue" numeric(15,2),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    "managerId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deedNumber" character varying(100),
    "deedDate" date,
    "buildingPermitNumber" character varying(100),
    "nationalAddress" jsonb,
    latitude numeric(10,7),
    longitude numeric(10,7),
    "ownerId" integer,
    "deletedAt" timestamp with time zone
);


--
-- Name: property_buildings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_buildings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_buildings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_buildings_id_seq OWNED BY public.property_buildings.id;


--
-- Name: property_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_inspections (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "unitId" integer NOT NULL,
    type character varying(50) NOT NULL,
    "scheduledDate" date,
    "inspectionDate" date,
    "inspectorName" character varying(200),
    "conditionRating" integer,
    status character varying(50) DEFAULT 'scheduled'::character varying,
    notes text,
    "completedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    findings jsonb DEFAULT '[]'::jsonb,
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: property_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_inspections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_inspections_id_seq OWNED BY public.property_inspections.id;


--
-- Name: property_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_owners (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "ownerType" character varying(20) DEFAULT 'individual'::character varying,
    name character varying(200) NOT NULL,
    "nationalId" character varying(50),
    "crNumber" character varying(50),
    phone character varying(50),
    email character varying(200),
    iban character varying(50),
    "bankName" character varying(100),
    address text,
    city character varying(100),
    "authorizationNumber" character varying(100),
    "authorizationDate" date,
    "authorizationExpiry" date,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone
);


--
-- Name: property_owners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_owners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_owners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_owners_id_seq OWNED BY public.property_owners.id;


--
-- Name: property_security_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_security_deposits (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "contractId" integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "receivedDate" date NOT NULL,
    status character varying(50) DEFAULT 'held'::character varying,
    "refundAmount" numeric(12,2),
    "refundDate" date,
    "refundReason" text,
    "journalEntryId" integer,
    "refundJournalEntryId" integer,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: property_security_deposits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_security_deposits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_security_deposits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_security_deposits_id_seq OWNED BY public.property_security_deposits.id;


--
-- Name: property_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_units (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "unitNumber" character varying(50) NOT NULL,
    "buildingName" character varying(200),
    type character varying(50) DEFAULT 'apartment'::character varying,
    area numeric(10,2),
    bedrooms integer DEFAULT 0,
    bathrooms integer DEFAULT 0,
    floor integer,
    "monthlyRent" numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'available'::character varying,
    address text,
    "branchId" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "buildingId" integer,
    features text[],
    direction character varying(50),
    finishing character varying(100),
    amenities jsonb,
    "electricityMeter" character varying(50),
    "waterMeter" character varying(50),
    "usageType" character varying(50) DEFAULT 'residential'::character varying,
    "ownerId" integer,
    "parkingSpaces" integer DEFAULT 0,
    "acType" character varying(50),
    "hasKitchen" boolean DEFAULT false,
    "yearlyRent" numeric(12,2),
    "insurancePolicy" character varying(100),
    "insuranceExpiry" date,
    "deletedAt" timestamp with time zone
);


--
-- Name: property_units_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_units_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_units_id_seq OWNED BY public.property_units.id;


--
-- Name: public_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_announcements (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    body text,
    category character varying(50) DEFAULT 'general'::character varying,
    "companyId" integer,
    "isActive" boolean DEFAULT true,
    "publishedAt" timestamp with time zone DEFAULT now(),
    "expiresAt" timestamp with time zone,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: public_announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.public_announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: public_announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.public_announcements_id_seq OWNED BY public.public_announcements.id;


--
-- Name: public_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_holidays (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date,
    year integer NOT NULL,
    type character varying(50) DEFAULT 'national'::character varying,
    description text,
    "isRecurring" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: public_holidays_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.public_holidays_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: public_holidays_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.public_holidays_id_seq OWNED BY public.public_holidays.id;


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id integer NOT NULL,
    "orderId" integer NOT NULL,
    "itemName" text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    "unitPrice" numeric DEFAULT 0 NOT NULL,
    "lineTotal" numeric DEFAULT 0 NOT NULL,
    "receivedQty" numeric DEFAULT 0 NOT NULL,
    "invoicedQty" numeric DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_items_id_seq OWNED BY public.purchase_order_items.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    ref character varying(50),
    "supplierId" integer,
    "requestId" integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    "totalAmount" numeric(12,2) DEFAULT 0,
    "expectedDelivery" date,
    "deliveredAt" timestamp without time zone,
    notes text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "branchId" integer,
    "deletedAt" timestamp with time zone,
    CONSTRAINT purchase_orders_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending'::character varying)::text, ('pending_approval'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('received'::character varying)::text, ('cancelled'::character varying)::text, ('completed'::character varying)::text, ('paid'::character varying)::text, ('confirmed'::character varying)::text, ('ordered'::character varying)::text, ('delivered'::character varying)::text])))
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: purchase_request_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_request_items (
    id integer NOT NULL,
    "requestId" integer,
    "productId" integer,
    quantity integer NOT NULL,
    "unitPrice" numeric(12,2),
    "totalPrice" numeric(12,2),
    name character varying(300),
    unit character varying(30),
    "estimatedPrice" numeric(15,2) DEFAULT 0 NOT NULL,
    "actualPrice" numeric(15,2),
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_request_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_request_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_request_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_request_items_id_seq OWNED BY public.purchase_request_items.id;


--
-- Name: purchase_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_requests (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    ref character varying(50),
    "requestedBy" integer,
    "supplierId" integer,
    status character varying(20) DEFAULT 'draft'::character varying,
    "totalAmount" numeric(12,2) DEFAULT 0,
    notes text,
    "approvedBy" integer,
    "approvedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "branchId" integer,
    title character varying(300),
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    "requiredDate" date,
    "rejectionReason" text,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "costCenter" text,
    "expectedDelivery" date,
    CONSTRAINT purchase_requests_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text, ('returned'::character varying)::text, ('converted'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: purchase_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_requests_id_seq OWNED BY public.purchase_requests.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "assignmentId" integer,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "endpointEncrypted" boolean DEFAULT false NOT NULL,
    "endpointHash" text
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: quality_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_checks (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "productId" integer,
    "movementId" integer,
    "checkType" character varying(50) DEFAULT 'incoming'::character varying NOT NULL,
    result character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "checkedBy" integer,
    "checkedAt" timestamp with time zone,
    notes text,
    "quantityChecked" numeric(12,3),
    "quantityPassed" numeric(12,3),
    "quantityFailed" numeric(12,3),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT quality_checks_result_check CHECK (((result)::text = ANY (ARRAY[('pending'::character varying)::text, ('passed'::character varying)::text, ('failed'::character varying)::text, ('partial'::character varying)::text])))
);


--
-- Name: quality_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quality_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quality_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quality_checks_id_seq OWNED BY public.quality_checks.id;


--
-- Name: recurring_journal_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_journal_runs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "recurringJournalId" integer NOT NULL,
    "journalEntryId" integer,
    "runDate" date NOT NULL,
    status character varying(20) DEFAULT 'success'::character varying NOT NULL,
    error text,
    "triggeredBy" character varying(20) DEFAULT 'scheduler'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recurring_journal_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recurring_journal_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recurring_journal_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recurring_journal_runs_id_seq OWNED BY public.recurring_journal_runs.id;


--
-- Name: recurring_journals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_journals (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    name character varying(200) NOT NULL,
    description text,
    frequency character varying(20) NOT NULL,
    "startDate" date NOT NULL,
    "nextRunDate" date NOT NULL,
    "lastRunDate" date,
    active boolean DEFAULT true NOT NULL,
    "templateLines" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "templateRef" character varying(100),
    "templateDescription" text,
    "createdBy" integer,
    "runsCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp with time zone,
    CONSTRAINT recurring_journals_frequency_check CHECK (((frequency)::text = ANY (ARRAY[('daily'::character varying)::text, ('weekly'::character varying)::text, ('monthly'::character varying)::text, ('quarterly'::character varying)::text, ('yearly'::character varying)::text])))
);


--
-- Name: recurring_journals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recurring_journals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recurring_journals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recurring_journals_id_seq OWNED BY public.recurring_journals.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" integer NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "revokedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "userAgent" text,
    "ipAddress" text
);


--
-- Name: rent_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rent_payments (
    id integer NOT NULL,
    "contractId" integer,
    "dueDate" date NOT NULL,
    amount numeric(12,2) NOT NULL,
    "paidAmount" numeric(12,2) DEFAULT 0,
    "paidDate" date,
    method character varying(30),
    status character varying(20) DEFAULT 'pending'::character varying,
    "receiptNumber" character varying(50),
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: rent_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rent_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rent_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rent_payments_id_seq OWNED BY public.rent_payments.id;


--
-- Name: rental_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rental_contracts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "unitId" integer,
    "tenantName" character varying(300) NOT NULL,
    "tenantPhone" character varying(20),
    "tenantEmail" character varying(200),
    "tenantIdNumber" character varying(20),
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "monthlyRent" numeric(12,2) NOT NULL,
    "depositAmount" numeric(12,2) DEFAULT 0,
    "paymentDay" integer DEFAULT 1,
    status character varying(20) DEFAULT 'active'::character varying,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "tenantId" integer,
    "contractNumber" character varying(100),
    "ejarNumber" character varying(100),
    "contractType" character varying(50) DEFAULT 'residential'::character varying,
    "paymentFrequency" character varying(20) DEFAULT 'monthly'::character varying,
    "yearlyRent" numeric(12,2),
    "totalContractValue" numeric(12,2),
    "latePenaltyType" character varying(20) DEFAULT 'percentage'::character varying,
    "latePenaltyValue" numeric(10,2) DEFAULT 0,
    "gracePeriodDays" integer DEFAULT 0,
    "terminationNoticeDays" integer DEFAULT 30,
    "earlyTerminationFee" numeric(12,2) DEFAULT 0,
    "autoRenewal" boolean DEFAULT false,
    "renewalNoticeDays" integer DEFAULT 60,
    "renewalPeriodMonths" integer DEFAULT 12,
    "electricityResponsibility" character varying(20) DEFAULT 'tenant'::character varying,
    "waterResponsibility" character varying(20) DEFAULT 'tenant'::character varying,
    "gasResponsibility" character varying(20) DEFAULT 'tenant'::character varying,
    "maintenanceResponsibility" character varying(100) DEFAULT 'shared'::character varying,
    "brokerageFee" numeric(12,2) DEFAULT 0,
    "brokeragePayor" character varying(20) DEFAULT 'tenant'::character varying,
    "depositHolder" character varying(20) DEFAULT 'owner'::character varying,
    "insuranceRequired" boolean DEFAULT false,
    "ownerId" integer,
    "numberOfInstallments" integer,
    "specialConditions" text,
    "ejarStatus" character varying(50),
    "registrationDate" date,
    "deletedAt" timestamp with time zone,
    "renewedFromId" integer,
    "renewalNoticeSentAt" timestamp with time zone,
    "terminatedAt" timestamp with time zone,
    "terminationReason" text,
    "closedAt" timestamp with time zone
);


--
-- Name: rental_contracts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rental_contracts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rental_contracts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rental_contracts_id_seq OWNED BY public.rental_contracts.id;


--
-- Name: request_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_types (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    "requiredFields" jsonb DEFAULT '[]'::jsonb,
    "approvalFlow" jsonb DEFAULT '[]'::jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.request_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: request_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.request_types_id_seq OWNED BY public.request_types.id;


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id integer NOT NULL,
    "typeId" integer,
    "requesterId" integer,
    "requesterName" character varying(255),
    title character varying(255) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'pending'::character varying,
    priority character varying(50) DEFAULT 'medium'::character varying,
    data jsonb DEFAULT '{}'::jsonb,
    "currentApprover" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    attachments jsonb DEFAULT '[]'::jsonb,
    notes text,
    "reviewedBy" integer,
    "reviewedAt" timestamp without time zone,
    "returnReason" text
);


--
-- Name: requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.requests_id_seq OWNED BY public.requests.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role character varying(50) NOT NULL,
    permission character varying(100) NOT NULL,
    "companyId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    "isSystem" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "nameEn" character varying(200),
    type character varying(20) NOT NULL,
    "calculationType" character varying(20) DEFAULT 'fixed'::character varying NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL,
    formula text,
    "isTaxable" boolean DEFAULT true NOT NULL,
    "isGosi" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "salary_components_calculationType_check" CHECK ((("calculationType")::text = ANY (ARRAY[('fixed'::character varying)::text, ('percentage'::character varying)::text, ('formula'::character varying)::text]))),
    CONSTRAINT salary_components_type_check CHECK (((type)::text = ANY (ARRAY[('earning'::character varying)::text, ('deduction'::character varying)::text, ('benefit'::character varying)::text])))
);


--
-- Name: salary_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_components_id_seq OWNED BY public.salary_components.id;


--
-- Name: scheduled_report_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_report_history (
    id integer NOT NULL,
    "scheduledReportId" integer,
    "sentAt" timestamp without time zone DEFAULT now(),
    status character varying(50) DEFAULT 'completed'::character varying,
    result jsonb DEFAULT '{}'::jsonb,
    error text
);


--
-- Name: scheduled_report_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_report_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_report_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_report_history_id_seq OWNED BY public.scheduled_report_history.id;


--
-- Name: scheduled_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_reports (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "reportType" character varying(100) NOT NULL,
    title character varying(255) NOT NULL,
    frequency character varying(50) NOT NULL,
    recipients jsonb DEFAULT '[]'::jsonb,
    params jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "lastRun" timestamp without time zone,
    "nextRun" timestamp without time zone,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_reports_id_seq OWNED BY public.scheduled_reports.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    filename character varying(200) NOT NULL,
    "appliedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: security_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_log (
    id integer NOT NULL,
    "userId" integer,
    "companyId" integer,
    role character varying(100),
    path text,
    method character varying(10),
    "requiredPerms" jsonb,
    reason character varying(100),
    ip character varying(100),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: security_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_log_id_seq OWNED BY public.security_log.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    scope character varying(20) NOT NULL,
    "scopeId" integer,
    key character varying(200) NOT NULL,
    value jsonb DEFAULT 'null'::jsonb NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT settings_scope_check CHECK (((scope)::text = ANY (ARRAY[('system'::character varying)::text, ('company'::character varying)::text, ('branch'::character varying)::text])))
);


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    name character varying(200) NOT NULL,
    "startTime" time without time zone NOT NULL,
    "endTime" time without time zone NOT NULL,
    days character varying(50) DEFAULT '0,1,2,3,4'::character varying,
    "isDefault" boolean DEFAULT false,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "shiftType" character varying(30) DEFAULT 'fixed'::character varying,
    "remoteAllowed" boolean DEFAULT false,
    "splitBreakStart" time without time zone,
    "splitBreakEnd" time without time zone,
    "flexStartEarliest" time without time zone,
    "flexStartLatest" time without time zone
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: sla_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sla_definitions (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "requestType" character varying(50) NOT NULL,
    "warningHours" integer DEFAULT 24,
    "deadlineHours" integer DEFAULT 48,
    "escalationHours" integer DEFAULT 72,
    "autoApproveOnTimeout" boolean DEFAULT false,
    "escalateTo" character varying(50) DEFAULT 'hr'::character varying,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: sla_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sla_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sla_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sla_definitions_id_seq OWNED BY public.sla_definitions.id;


--
-- Name: smart_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smart_alerts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    type character varying(100) NOT NULL,
    severity character varying(20) DEFAULT 'info'::character varying,
    title character varying(300) NOT NULL,
    description text,
    "relatedType" character varying(50),
    "relatedId" integer,
    "isRead" boolean DEFAULT false,
    "isDismissed" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "suggestedAction" text
);


--
-- Name: smart_alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.smart_alerts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smart_alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.smart_alerts_id_seq OWNED BY public.smart_alerts.id;


--
-- Name: sms_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_queue (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "recipientPhone" character varying(20),
    message text,
    status character varying(20) DEFAULT 'pending'::character varying,
    "sentAt" timestamp without time zone,
    "errorMessage" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "externalId" text,
    "attemptCount" integer DEFAULT 0,
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: sms_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sms_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sms_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sms_queue_id_seq OWNED BY public.sms_queue.id;


--
-- Name: stock_transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_transfer_items (
    id integer NOT NULL,
    "transferId" integer NOT NULL,
    "productId" integer NOT NULL,
    "requestedQty" numeric(12,3) DEFAULT 0 NOT NULL,
    "sentQty" numeric(12,3) DEFAULT 0 NOT NULL,
    "receivedQty" numeric(12,3) DEFAULT 0 NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stock_transfer_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_transfer_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_transfer_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_transfer_items_id_seq OWNED BY public.stock_transfer_items.id;


--
-- Name: stock_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_transfers (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    ref character varying(50) NOT NULL,
    "fromBranchId" integer,
    "toBranchId" integer,
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    "requestedBy" integer,
    "approvedBy" integer,
    "receivedBy" integer,
    "approvedAt" timestamp with time zone,
    "receivedAt" timestamp with time zone,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_transfers_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('in_transit'::character varying)::text, ('received'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_transfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_transfers_id_seq OWNED BY public.stock_transfers.id;


--
-- Name: store_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_order_items (
    id integer NOT NULL,
    "orderId" integer NOT NULL,
    "productId" integer,
    "productName" character varying(255),
    quantity integer DEFAULT 1 NOT NULL,
    "unitPrice" numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: store_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_order_items_id_seq OWNED BY public.store_order_items.id;


--
-- Name: store_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_orders (
    id integer NOT NULL,
    "orderNumber" character varying(50),
    "customerName" character varying(255),
    "customerPhone" character varying(50),
    status character varying(50) DEFAULT 'pending'::character varying,
    "totalAmount" numeric(15,2) DEFAULT 0,
    items jsonb DEFAULT '[]'::jsonb,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "branchId" integer,
    "paidAt" timestamp with time zone,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: store_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_orders_id_seq OWNED BY public.store_orders.id;


--
-- Name: store_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_products (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    sku character varying(100),
    price numeric(15,2) DEFAULT 0,
    "costPrice" numeric(15,2) DEFAULT 0,
    quantity integer DEFAULT 0,
    category character varying(100),
    status character varying(50) DEFAULT 'active'::character varying,
    "imageUrl" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: store_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.store_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: store_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.store_products_id_seq OWNED BY public.store_products.id;


--
-- Name: subsidiary_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subsidiary_accounts (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "entityType" character varying(50) NOT NULL,
    "entityId" integer NOT NULL,
    "accountType" character varying(50) NOT NULL,
    "accountId" integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "subsidiary_accounts_entityType_check" CHECK ((("entityType")::text = ANY (ARRAY[('employee'::character varying)::text, ('client'::character varying)::text, ('vendor'::character varying)::text, ('project'::character varying)::text, ('property'::character varying)::text])))
);


--
-- Name: subsidiary_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subsidiary_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subsidiary_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subsidiary_accounts_id_seq OWNED BY public.subsidiary_accounts.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(300) NOT NULL,
    "contactPerson" character varying(200),
    phone character varying(20),
    email character varying(200),
    address text,
    "taxNumber" character varying(50),
    "paymentTerms" integer DEFAULT 30,
    rating numeric(3,2) DEFAULT 5.0,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    ref character varying(50),
    title character varying(300) NOT NULL,
    description text,
    category character varying(100),
    priority character varying(20) DEFAULT 'medium'::character varying,
    status character varying(20) DEFAULT 'open'::character varying,
    "clientId" integer,
    "assigneeId" integer,
    "slaDeadline" timestamp without time zone,
    "firstResponseAt" timestamp without time zone,
    "resolvedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "escalationLevel" integer DEFAULT 1 NOT NULL,
    rating integer,
    "ratingComment" text,
    "slaBreached" boolean DEFAULT false NOT NULL,
    "deletedAt" timestamp with time zone,
    "invoiceId" integer,
    "contractId" integer
);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_id_seq OWNED BY public.support_tickets.id;


--
-- Name: system_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_evaluations (
    id integer NOT NULL,
    "cycleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    "attendanceScore" numeric(5,2) DEFAULT 0,
    "taskCompletionScore" numeric(5,2) DEFAULT 0,
    "onTimeScore" numeric(5,2) DEFAULT 0,
    "clientSatScore" numeric(5,2) DEFAULT 0,
    "docQualityScore" numeric(5,2) DEFAULT 0,
    "overallScore" numeric(5,2) DEFAULT 0,
    metrics jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_evaluations_id_seq OWNED BY public.system_evaluations.id;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    "companyId" integer,
    "branchId" integer,
    key character varying(200) NOT NULL,
    value text,
    "dataType" character varying(20) DEFAULT 'string'::character varying,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "assignedTo" integer,
    type character varying(100) NOT NULL,
    "refType" character varying(100),
    "refId" integer,
    title character varying(500) NOT NULL,
    description text,
    "clientId" integer,
    lat numeric(10,7),
    lon numeric(10,7),
    priority character varying(20) DEFAULT 'normal'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    "scheduledStart" timestamp without time zone,
    "scheduledEnd" timestamp without time zone,
    "scheduledDate" date,
    "estimatedDuration" integer,
    "actualDuration" integer,
    "slaDeadline" timestamp without time zone,
    "slaBreachNotified" boolean DEFAULT false,
    "completedAt" timestamp without time zone,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "assignmentId" integer,
    "linkedEntityType" character varying(50),
    "linkedEntityId" integer,
    "autoGenerated" boolean DEFAULT false
);


--
-- Name: tasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tasks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tasks_id_seq OWNED BY public.tasks.id;


--
-- Name: technicians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technicians (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "employeeId" integer,
    name character varying(200) NOT NULL,
    phone character varying(20),
    speciality character varying(100),
    status character varying(20) DEFAULT 'available'::character varying,
    rating numeric(3,2) DEFAULT 5.0,
    "activeJobs" integer DEFAULT 0,
    latitude numeric(10,7),
    longitude numeric(10,7),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: technicians_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.technicians_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: technicians_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.technicians_id_seq OWNED BY public.technicians.id;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(50),
    email character varying(200),
    "nationalId" character varying(50),
    nationality character varying(100),
    "idType" character varying(50) DEFAULT 'national_id'::character varying,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "tenantType" character varying(20) DEFAULT 'individual'::character varying,
    "crNumber" character varying(50),
    "unifiedNumber" character varying(50),
    "birthDate" date,
    gender character varying(10),
    "guarantorName" character varying(200),
    "guarantorId" character varying(50),
    "guarantorPhone" character varying(50),
    "guarantorRelation" character varying(100),
    "emergencyContact" character varying(50),
    "emergencyName" character varying(200),
    "maritalStatus" character varying(20),
    occupation character varying(200),
    "monthlyIncome" numeric(12,2),
    "previousAddress" text,
    "previousLandlord" character varying(200),
    "previousLandlordPhone" character varying(50),
    "deletedAt" timestamp with time zone
);


--
-- Name: tenants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenants_id_seq OWNED BY public.tenants.id;


--
-- Name: ticket_csat_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_csat_ratings (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "assigneeId" integer,
    score integer NOT NULL,
    comment text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT ticket_csat_ratings_score_check CHECK (((score >= 1) AND (score <= 5)))
);


--
-- Name: ticket_csat_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_csat_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_csat_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_csat_ratings_id_seq OWNED BY public.ticket_csat_ratings.id;


--
-- Name: ticket_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_escalations (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "fromLevel" integer DEFAULT 1 NOT NULL,
    "toLevel" integer DEFAULT 2 NOT NULL,
    reason text,
    "escalatedBy" integer,
    "escalatedTo" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ticket_escalations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_escalations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_escalations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_escalations_id_seq OWNED BY public.ticket_escalations.id;


--
-- Name: ticket_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_replies (
    id integer NOT NULL,
    "ticketId" integer,
    "authorId" integer,
    "authorName" character varying(200),
    message text NOT NULL,
    "isInternal" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: ticket_replies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ticket_replies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ticket_replies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ticket_replies_id_seq OWNED BY public.ticket_replies.id;


--
-- Name: training_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_enrollments (
    id integer NOT NULL,
    "programId" integer,
    "employeeId" integer,
    "employeeName" character varying(255),
    status character varying(50) DEFAULT 'enrolled'::character varying,
    score numeric(5,2),
    "completedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now(),
    "certificateUrl" text
);


--
-- Name: training_enrollments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_enrollments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_enrollments_id_seq OWNED BY public.training_enrollments.id;


--
-- Name: training_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_programs (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category character varying(100),
    "startDate" date,
    "endDate" date,
    location character varying(255),
    trainer character varying(255),
    capacity integer DEFAULT 0,
    enrolled integer DEFAULT 0,
    status character varying(50) DEFAULT 'upcoming'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer,
    name character varying(300),
    type character varying(50),
    provider character varying(200),
    duration integer,
    "durationUnit" character varying(20) DEFAULT 'hours'::character varying,
    cost numeric(12,2) DEFAULT 0 NOT NULL,
    "maxParticipants" integer,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: training_programs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.training_programs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_programs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.training_programs_id_seq OWNED BY public.training_programs.id;


--
-- Name: umrah_agent_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_agent_invoices (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "agentId" integer NOT NULL,
    "seasonId" integer,
    ref character varying(50),
    type character varying(20) DEFAULT 'sales'::character varying,
    "pilgrimCount" integer DEFAULT 0,
    "visaCost" numeric(12,2) DEFAULT 0,
    "transportCost" numeric(12,2) DEFAULT 0,
    "hotelCost" numeric(12,2) DEFAULT 0,
    "penaltiesTotal" numeric(12,2) DEFAULT 0,
    "servicesTotal" numeric(12,2) DEFAULT 0,
    subtotal numeric(12,2) DEFAULT 0,
    commission numeric(12,2) DEFAULT 0,
    total numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft'::character varying,
    "dueDate" date,
    notes text,
    "journalEntryId" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_agent_invoices_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('sent'::character varying)::text, ('partially_paid'::character varying)::text, ('paid'::character varying)::text, ('overdue'::character varying)::text, ('cancelled'::character varying)::text]))),
    CONSTRAINT umrah_agent_invoices_type_check CHECK (((type)::text = ANY (ARRAY[('sales'::character varying)::text, ('purchase'::character varying)::text, ('credit_note'::character varying)::text])))
);


--
-- Name: umrah_agent_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_agent_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_agent_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_agent_invoices_id_seq OWNED BY public.umrah_agent_invoices.id;


--
-- Name: umrah_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_agents (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "contactPerson" character varying(200),
    phone character varying(50),
    email character varying(200),
    country character varying(100),
    "profitMargin" numeric(5,2) DEFAULT 0,
    "contractRef" character varying(100),
    currency character varying(10) DEFAULT 'SAR'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_agents_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('suspended'::character varying)::text, ('blocked'::character varying)::text])))
);


--
-- Name: umrah_agents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_agents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_agents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_agents_id_seq OWNED BY public.umrah_agents.id;


--
-- Name: umrah_import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_import_logs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "seasonId" integer,
    "userId" integer,
    "fileName" character varying(300),
    "fileType" character varying(50),
    "totalRows" integer DEFAULT 0,
    "newRecords" integer DEFAULT 0,
    "updatedRecords" integer DEFAULT 0,
    "duplicateRecords" integer DEFAULT 0,
    "errorRecords" integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "processedRows" integer DEFAULT 0,
    status character varying(20) DEFAULT 'completed'::character varying
);


--
-- Name: umrah_import_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_import_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_import_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_import_logs_id_seq OWNED BY public.umrah_import_logs.id;


--
-- Name: umrah_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_packages (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "seasonId" integer,
    "costPrice" numeric(12,2) DEFAULT 0 NOT NULL,
    "sellPrice" numeric(12,2) DEFAULT 0 NOT NULL,
    "includesTransport" boolean DEFAULT false,
    "includesHotel" boolean DEFAULT false,
    "includesMeals" boolean DEFAULT false,
    "includesZiyarat" boolean DEFAULT false,
    duration integer DEFAULT 7,
    description text,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: umrah_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_packages_id_seq OWNED BY public.umrah_packages.id;


--
-- Name: umrah_penalties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_penalties (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "pilgrimId" integer,
    "agentId" integer,
    "seasonId" integer,
    type character varying(50) NOT NULL,
    "daysOverstayed" integer DEFAULT 0,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'SAR'::character varying,
    status character varying(20) DEFAULT 'pending'::character varying,
    "invoiceId" integer,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_penalties_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('invoiced'::character varying)::text, ('paid'::character varying)::text, ('waived'::character varying)::text]))),
    CONSTRAINT umrah_penalties_type_check CHECK (((type)::text = ANY (ARRAY[('overstay'::character varying)::text, ('violation'::character varying)::text, ('lost'::character varying)::text, ('regulatory'::character varying)::text])))
);


--
-- Name: umrah_penalties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_penalties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_penalties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_penalties_id_seq OWNED BY public.umrah_penalties.id;


--
-- Name: umrah_pilgrims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_pilgrims (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "seasonId" integer,
    "agentId" integer,
    "packageId" integer,
    "fullName" character varying(300) NOT NULL,
    "passportNumber" character varying(50) NOT NULL,
    "visaNumber" character varying(50),
    nationality character varying(100),
    gender character varying(10),
    "dateOfBirth" date,
    phone character varying(50),
    "arrivalDate" date,
    "departureDate" date,
    "actualArrival" date,
    "actualDeparture" date,
    status character varying(30) DEFAULT 'pending'::character varying,
    "hotelName" character varying(200),
    "roomNumber" character varying(50),
    "transportAssigned" boolean DEFAULT false,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_pilgrims_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('arrived'::character varying)::text, ('active'::character varying)::text, ('overstayed'::character varying)::text, ('departed'::character varying)::text, ('violated'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: umrah_pilgrims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_pilgrims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_pilgrims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_pilgrims_id_seq OWNED BY public.umrah_pilgrims.id;


--
-- Name: umrah_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_seasons (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    title character varying(200) NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_seasons_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('closed'::character varying)::text, ('archived'::character varying)::text])))
);


--
-- Name: umrah_seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_seasons_id_seq OWNED BY public.umrah_seasons.id;


--
-- Name: umrah_transport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.umrah_transport (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "seasonId" integer,
    "tripDate" date NOT NULL,
    "fromLocation" character varying(200),
    "toLocation" character varying(200),
    "vehicleId" integer,
    "driverId" integer,
    capacity integer DEFAULT 45,
    "pilgrimCount" integer DEFAULT 0,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    cost numeric(12,2) DEFAULT 0,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT umrah_transport_status_check CHECK (((status)::text = ANY (ARRAY[('scheduled'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: umrah_transport_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.umrah_transport_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: umrah_transport_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.umrah_transport_id_seq OWNED BY public.umrah_transport.id;

-- Stub tables created by migration 067_umrah_extended.sql
CREATE TABLE public.umrah_sub_agents (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "nuskCode" character varying(30),
    name character varying(255) NOT NULL,
    "agentId" integer,
    "clientId" integer,
    "paymentTerms" character varying(20) DEFAULT 'postpaid',
    "defaultPricePerMutamer" numeric(12,2),
    phone character varying(50),
    email character varying(200),
    country character varying(100),
    "isActive" boolean DEFAULT true,
    notes text,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_groups (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "nuskGroupNumber" character varying(30) NOT NULL,
    name character varying(255),
    "agentId" integer,
    "subAgentId" integer,
    "seasonId" integer,
    "mutamerCount" integer DEFAULT 0,
    "programDuration" integer,
    status character varying(30) DEFAULT 'imported',
    "nuskInvoiceNumber" character varying(30),
    "salesInvoiceId" integer,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_pricing (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "subAgentId" integer,
    "agentId" integer,
    "seasonId" integer,
    "pricePerMutamer" numeric(10,2) NOT NULL,
    "includesHotel" boolean DEFAULT false,
    "includesTransport" boolean DEFAULT false,
    "validFrom" date NOT NULL,
    "validTo" date NOT NULL,
    notes text,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_nusk_invoices (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "nuskInvoiceNumber" character varying(30) NOT NULL,
    "agentId" integer,
    "subAgentId" integer,
    "groupId" integer,
    "mutamerCount" integer DEFAULT 0,
    "groundServices" numeric(12,2) DEFAULT 0,
    "electronicFees" numeric(12,2) DEFAULT 0,
    "visaFees" numeric(12,2) DEFAULT 0,
    "insuranceFees" numeric(12,2) DEFAULT 0,
    "enrichmentServices" numeric(12,2) DEFAULT 0,
    "additionalServices" numeric(12,2) DEFAULT 0,
    "transportTotal" numeric(12,2) DEFAULT 0,
    "hotelTotal" numeric(12,2) DEFAULT 0,
    "refundAmount" numeric(12,2) DEFAULT 0,
    "netCost" numeric(12,2) DEFAULT 0,
    "totalAmount" numeric(12,2) DEFAULT 0,
    "nuskStatus" character varying(20) DEFAULT 'pending',
    "issueDate" timestamp with time zone,
    "expiryDate" timestamp with time zone,
    "purchaseInvoiceId" integer,
    "journalEntryId" integer,
    "programDuration" integer,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_violations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    type character varying(20) NOT NULL,
    "referenceType" character varying(20),
    "referenceNumber" character varying(40),
    "mutamerId" integer,
    "groupId" integer,
    "subAgentId" integer,
    "agentId" integer,
    description text,
    "penaltyAmount" numeric(10,2) DEFAULT 0,
    status character varying(20) DEFAULT 'open',
    "linkedInvoiceId" integer,
    "detectedAt" timestamp with time zone DEFAULT now(),
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.employee_commission_plans (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "employeeId" integer NOT NULL,
    "assignmentId" integer NOT NULL,
    "seasonId" integer,
    "planName" character varying(255) NOT NULL,
    "baseSalary" numeric(12,2),
    "commissionType" character varying(20),
    "percentageRate" numeric(5,2),
    "fixedAmount" numeric(12,2),
    "conditionType" character varying(20),
    "minProfitPerVisa" numeric(10,2),
    "minSalesPercent" numeric(5,2),
    "minAvgPrice" numeric(10,2),
    "excludedMonths" jsonb DEFAULT '[]',
    "tierUnit" integer DEFAULT 10000,
    "partialTiersAllowed" boolean DEFAULT false,
    "violationBlocksCommission" boolean DEFAULT true,
    status character varying(20) DEFAULT 'active',
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    notes text,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.employee_commission_tiers (
    id integer NOT NULL,
    "planId" integer NOT NULL,
    "fromCount" integer NOT NULL,
    "toCount" integer,
    "bonusPerUnit" numeric(12,2) NOT NULL,
    "isCumulative" boolean DEFAULT true,
    "tierOrder" integer DEFAULT 1,
    "createdAt" timestamp with time zone DEFAULT now()
);

CREATE TABLE public.employee_commission_calculations (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "planId" integer NOT NULL,
    "employeeId" integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    "totalMutamers" integer DEFAULT 0,
    "avgProfitPerVisa" numeric(10,2),
    "salesPercent" numeric(5,2),
    "avgSalePrice" numeric(10,2),
    "conditionMet" boolean DEFAULT false,
    "conditionDetails" text,
    "completedTiers" integer DEFAULT 0,
    "commissionAmount" numeric(12,2) DEFAULT 0,
    "hasViolations" boolean DEFAULT false,
    "finalAmount" numeric(12,2) DEFAULT 0,
    "isExcludedMonth" boolean DEFAULT false,
    status character varying(20) DEFAULT 'calculated',
    "payrollLineId" integer,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_import_batches (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "seasonId" integer,
    "fileType" character varying(20) NOT NULL,
    "fileName" character varying(255),
    "fileSize" integer,
    "uploadedBy" integer,
    "uploadedAt" timestamp with time zone DEFAULT now(),
    "totalRows" integer DEFAULT 0,
    "newCount" integer DEFAULT 0,
    "updatedCount" integer DEFAULT 0,
    "skippedCount" integer DEFAULT 0,
    "errorCount" integer DEFAULT 0,
    "financialImpactCount" integer DEFAULT 0,
    "manualReviewCount" integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending',
    "summaryJson" jsonb,
    "errorsJson" jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_import_changes (
    id integer NOT NULL,
    "batchId" integer NOT NULL,
    "entityType" character varying(30) NOT NULL,
    "entityId" integer,
    "changeType" character varying(20) NOT NULL,
    "fieldName" character varying(100),
    "oldValue" text,
    "newValue" text,
    "hasFinancialImpact" boolean DEFAULT false,
    notes text,
    "createdAt" timestamp with time zone DEFAULT now()
);

-- Stub tables created by migration 072_umrah_invoicing_and_payments.sql
CREATE TABLE public.umrah_sales_invoices (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "subAgentId" integer NOT NULL,
    "clientId" integer,
    "seasonId" integer,
    ref character varying(50),
    "invoiceDate" date DEFAULT CURRENT_DATE,
    subtotal numeric(12,2) DEFAULT 0,
    "penaltiesTotal" numeric(12,2) DEFAULT 0,
    "vatRate" numeric(5,2) DEFAULT 15,
    "vatAmount" numeric(12,2) DEFAULT 0,
    total numeric(12,2) DEFAULT 0,
    "paidAmount" numeric(12,2) DEFAULT 0,
    status character varying(20) DEFAULT 'draft',
    "dueDate" date,
    "nuskInvoiceRefs" text,
    "groupRefs" text,
    "pilgrimCount" integer DEFAULT 0,
    "journalEntryId" integer,
    notes text,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_sales_invoice_items (
    id integer NOT NULL,
    "invoiceId" integer NOT NULL,
    "itemType" character varying(20) NOT NULL,
    "groupId" integer,
    "violationId" integer,
    description text,
    quantity integer DEFAULT 1,
    "unitPrice" numeric(12,2) DEFAULT 0,
    "lineTotal" numeric(12,2) DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now()
);

CREATE TABLE public.umrah_payments (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "subAgentId" integer NOT NULL,
    ref character varying(50),
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'SAR',
    "exchangeRate" numeric(10,4),
    "sarAmount" numeric(12,2) NOT NULL,
    method character varying(30) DEFAULT 'bank_transfer',
    "externalReference" character varying(100),
    "paymentDate" date DEFAULT CURRENT_DATE,
    "journalEntryId" integer,
    notes text,
    "createdBy" integer,
    "updatedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);

CREATE TABLE public.umrah_payment_allocations (
    id integer NOT NULL,
    "paymentId" integer NOT NULL,
    "invoiceId" integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: user_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "assignmentId" integer,
    "sessionId" character varying(255),
    page character varying(500),
    action character varying(100),
    entity character varying(100),
    method character varying(10),
    path character varying(500),
    "durationMs" integer,
    "ipAddress" character varying(50),
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: user_activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_activity_log_id_seq OWNED BY public.user_activity_log.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "roleKey" character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    modules jsonb DEFAULT '[]'::jsonb NOT NULL,
    level integer DEFAULT 10 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: user_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_roles_id_seq OWNED BY public.user_roles.id;


--
-- Name: user_shortcuts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_shortcuts (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "companyId" integer DEFAULT 1 NOT NULL,
    label character varying(255) NOT NULL,
    path character varying(500) NOT NULL,
    icon character varying(100),
    "sortOrder" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: user_shortcuts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_shortcuts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_shortcuts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_shortcuts_id_seq OWNED BY public.user_shortcuts.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(200) NOT NULL,
    "passwordHash" character varying(200) NOT NULL,
    "employeeId" integer,
    role character varying(50) DEFAULT 'employee'::character varying,
    "lastLoginAt" timestamp without time zone,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "failedLoginAttempts" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp with time zone
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: warehouse_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_categories (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(200) NOT NULL,
    "parentId" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "deletedAt" timestamp with time zone
);


--
-- Name: warehouse_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_categories_id_seq OWNED BY public.warehouse_categories.id;


--
-- Name: warehouse_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_movements (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "productId" integer,
    type character varying(20) NOT NULL,
    quantity integer NOT NULL,
    "unitCost" numeric(12,2),
    reference character varying(200),
    "fromLocation" character varying(100),
    "toLocation" character varying(100),
    notes text,
    "createdBy" integer,
    "createdAt" timestamp without time zone DEFAULT now(),
    "batchNumber" character varying(100),
    "expiryDate" date,
    "fifoLayerId" integer,
    "remainingQty" numeric(12,3),
    "branchId" integer
);


--
-- Name: warehouse_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_movements_id_seq OWNED BY public.warehouse_movements.id;


--
-- Name: warehouse_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_products (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    sku character varying(100),
    name character varying(300) NOT NULL,
    description text,
    "categoryId" integer,
    unit character varying(50) DEFAULT 'piece'::character varying,
    "minStock" integer DEFAULT 0,
    "maxStock" integer DEFAULT 99999,
    "currentStock" integer DEFAULT 0,
    "costPrice" numeric(12,2) DEFAULT 0,
    "sellPrice" numeric(12,2) DEFAULT 0,
    location character varying(100),
    "branchId" integer,
    status character varying(20) DEFAULT 'active'::character varying,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now(),
    "costingMethod" character varying(30) DEFAULT 'weighted_average'::character varying,
    "lastWaCost" numeric(15,4) DEFAULT 0,
    "deletedAt" timestamp with time zone
);


--
-- Name: warehouse_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_products_id_seq OWNED BY public.warehouse_products.id;


--
-- Name: warehouse_stock_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_stock_batches (
    id integer NOT NULL,
    "productId" integer,
    "batchNumber" character varying(100),
    quantity integer NOT NULL,
    "unitCost" numeric(12,2),
    "expiryDate" date,
    "receivedDate" date DEFAULT CURRENT_DATE,
    "createdAt" timestamp without time zone DEFAULT now()
);


--
-- Name: warehouse_stock_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouse_stock_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouse_stock_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouse_stock_batches_id_seq OWNED BY public.warehouse_stock_batches.id;


--
-- Name: whatsapp_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_queue (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    phone character varying(30) NOT NULL,
    "recipientName" character varying(200),
    "clientId" integer,
    "assignmentId" integer,
    message text NOT NULL,
    "templateName" character varying(100),
    "templateParams" jsonb,
    "sentBy" character varying(50),
    status character varying(20) DEFAULT 'queued'::character varying,
    "messageId" character varying(200),
    "sentAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "scheduledAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "externalId" text,
    "attemptCount" integer DEFAULT 0,
    "errorMessage" text,
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: whatsapp_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.whatsapp_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: whatsapp_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.whatsapp_queue_id_seq OWNED BY public.whatsapp_queue.id;


--
-- Name: workflow_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definitions (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "requestType" character varying(50) NOT NULL,
    "requestTypeLabel" character varying(100) NOT NULL,
    "isActive" boolean DEFAULT true,
    "isReturnable" boolean DEFAULT true,
    "enableEscalation" boolean DEFAULT true,
    "defaultSlaHours" integer DEFAULT 48,
    description text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_definitions_id_seq OWNED BY public.workflow_definitions.id;


--
-- Name: workflow_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_instances (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "definitionId" integer,
    "requestType" character varying(50) NOT NULL,
    "requestTypeLabel" character varying(100),
    "refTable" character varying(100),
    "refId" integer,
    title character varying(255),
    "submittedBy" integer,
    "submittedByName" character varying(255),
    status character varying(30) DEFAULT 'pending'::character varying,
    "currentStepOrder" integer DEFAULT 1,
    "currentAssignee" integer,
    "expectedCompletionAt" timestamp with time zone,
    "slaStatus" character varying(20) DEFAULT 'normal'::character varying,
    "completedAt" timestamp with time zone,
    data jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_instances_id_seq OWNED BY public.workflow_instances.id;


--
-- Name: workflow_step_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_step_actions (
    id integer NOT NULL,
    "instanceId" integer NOT NULL,
    "stepOrder" integer NOT NULL,
    "stepName" character varying(100),
    action character varying(30) NOT NULL,
    "actionBy" integer,
    "actionByName" character varying(255),
    "assignedRole" character varying(50),
    notes text,
    attachments jsonb DEFAULT '[]'::jsonb,
    "beforeData" jsonb,
    "afterData" jsonb,
    "referredTo" integer,
    "referredToName" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_step_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_step_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_step_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_step_actions_id_seq OWNED BY public.workflow_step_actions.id;


--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_steps (
    id integer NOT NULL,
    "definitionId" integer NOT NULL,
    "stepOrder" integer DEFAULT 1 NOT NULL,
    "stepName" character varying(100) NOT NULL,
    "requiredRole" character varying(50) NOT NULL,
    "slaHours" integer DEFAULT 48,
    "autoApproveOnTimeout" boolean DEFAULT false,
    "canReject" boolean DEFAULT true,
    "canRefer" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_steps_id_seq OWNED BY public.workflow_steps.id;


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    steps jsonb DEFAULT '[]'::jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "companyId" integer
);


--
-- Name: workflows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflows_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflows_id_seq OWNED BY public.workflows.id;


--
-- Name: zatca_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zatca_settings (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    environment character varying(20) DEFAULT 'sandbox'::character varying NOT NULL,
    "vatRegistrationNumber" character varying(50),
    "crNumber" character varying(50),
    "organizationName" character varying(255),
    "organizationNameEn" character varying(255),
    "streetName" character varying(255),
    "buildingNumber" character varying(20),
    "cityName" character varying(100),
    "postalCode" character varying(10),
    "countryCode" character(2) DEFAULT 'SA'::bpchar,
    "oauthClientId" character varying(255),
    "oauthClientSecret" text,
    csid text,
    "pihKey" text,
    "lastConnectionTest" timestamp with time zone,
    "connectionTestStatus" character varying(20),
    "connectionTestMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zatca_settings_environment_check CHECK (((environment)::text = ANY (ARRAY[('sandbox'::character varying)::text, ('production'::character varying)::text])))
);


--
-- Name: zatca_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zatca_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zatca_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zatca_settings_id_seq OWNED BY public.zatca_settings.id;


--
-- Name: zatca_submission_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zatca_submission_log (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "entityType" character varying(20) NOT NULL,
    "entityId" integer NOT NULL,
    "invoiceRef" character varying(100),
    "zatcaUuid" uuid,
    "zatcaHash" character varying(64),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    environment character varying(20) DEFAULT 'sandbox'::character varying NOT NULL,
    "requestPayload" text,
    "responsePayload" text,
    "errorMessage" text,
    "submittedAt" timestamp with time zone,
    "respondedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "submittedBy" integer,
    CONSTRAINT "zatca_submission_log_entityType_check" CHECK ((("entityType")::text = ANY (ARRAY[('invoice'::character varying)::text, ('expense'::character varying)::text]))),
    CONSTRAINT zatca_submission_log_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('submitted'::character varying)::text, ('accepted'::character varying)::text, ('rejected'::character varying)::text, ('error'::character varying)::text])))
);


--
-- Name: zatca_submission_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zatca_submission_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zatca_submission_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zatca_submission_log_id_seq OWNED BY public.zatca_submission_log.id;


--
-- Name: accounting_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings ALTER COLUMN id SET DEFAULT nextval('public.accounting_mappings_id_seq'::regclass);


--
-- Name: alert_fatigue_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_fatigue_settings ALTER COLUMN id SET DEFAULT nextval('public.alert_fatigue_settings_id_seq'::regclass);


--
-- Name: alert_mute_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mute_rules ALTER COLUMN id SET DEFAULT nextval('public.alert_mute_rules_id_seq'::regclass);


--
-- Name: anonymous_upward_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_upward_reviews ALTER COLUMN id SET DEFAULT nextval('public.anonymous_upward_reviews_id_seq'::regclass);


--
-- Name: applicant_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicant_accounts ALTER COLUMN id SET DEFAULT nextval('public.applicant_accounts_id_seq'::regclass);


--
-- Name: approval_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions ALTER COLUMN id SET DEFAULT nextval('public.approval_actions_id_seq'::regclass);


--
-- Name: approval_chain_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_steps ALTER COLUMN id SET DEFAULT nextval('public.approval_chain_steps_id_seq'::regclass);


--
-- Name: approval_chains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains ALTER COLUMN id SET DEFAULT nextval('public.approval_chains_id_seq'::regclass);


--
-- Name: approval_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests ALTER COLUMN id SET DEFAULT nextval('public.approval_requests_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: attendance_deductions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_deductions ALTER COLUMN id SET DEFAULT nextval('public.attendance_deductions_id_seq'::regclass);


--
-- Name: attendance_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_policies ALTER COLUMN id SET DEFAULT nextval('public.attendance_policies_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: audit_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_violations ALTER COLUMN id SET DEFAULT nextval('public.audit_violations_id_seq'::regclass);


--
-- Name: automation_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs ALTER COLUMN id SET DEFAULT nextval('public.automation_logs_id_seq'::regclass);


--
-- Name: bank_guarantees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_guarantees ALTER COLUMN id SET DEFAULT nextval('public.bank_guarantees_id_seq'::regclass);


--
-- Name: bank_statements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements ALTER COLUMN id SET DEFAULT nextval('public.bank_statements_id_seq'::regclass);


--
-- Name: bi_dashboards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_dashboards ALTER COLUMN id SET DEFAULT nextval('public.bi_dashboards_id_seq'::regclass);


--
-- Name: bi_kpis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_kpis ALTER COLUMN id SET DEFAULT nextval('public.bi_kpis_id_seq'::regclass);


--
-- Name: bi_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_reports ALTER COLUMN id SET DEFAULT nextval('public.bi_reports_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: budget_approval_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_approval_requests ALTER COLUMN id SET DEFAULT nextval('public.budget_approval_requests_id_seq'::regclass);


--
-- Name: budget_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines ALTER COLUMN id SET DEFAULT nextval('public.budget_lines_id_seq'::regclass);


--
-- Name: budgets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets ALTER COLUMN id SET DEFAULT nextval('public.budgets_id_seq'::regclass);


--
-- Name: business_rule_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rule_logs ALTER COLUMN id SET DEFAULT nextval('public.business_rule_logs_id_seq'::regclass);


--
-- Name: business_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rules ALTER COLUMN id SET DEFAULT nextval('public.business_rules_id_seq'::regclass);


--
-- Name: chart_of_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts ALTER COLUMN id SET DEFAULT nextval('public.chart_of_accounts_id_seq'::regclass);


--
-- Name: client_portal_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_accounts ALTER COLUMN id SET DEFAULT nextval('public.client_portal_accounts_id_seq'::regclass);


--
-- Name: client_rfm_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_rfm_scores ALTER COLUMN id SET DEFAULT nextval('public.client_rfm_scores_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: collection_follow_ups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_follow_ups ALTER COLUMN id SET DEFAULT nextval('public.collection_follow_ups_id_seq'::regclass);


--
-- Name: communications_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications_log ALTER COLUMN id SET DEFAULT nextval('public.communications_log_id_seq'::regclass);


--
-- Name: companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);


--
-- Name: contract_payment_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule ALTER COLUMN id SET DEFAULT nextval('public.contract_payment_schedule_id_seq'::regclass);


--
-- Name: crm_activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities ALTER COLUMN id SET DEFAULT nextval('public.crm_activities_id_seq'::regclass);


--
-- Name: crm_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts ALTER COLUMN id SET DEFAULT nextval('public.crm_contacts_id_seq'::regclass);


--
-- Name: crm_opportunities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opportunities ALTER COLUMN id SET DEFAULT nextval('public.crm_opportunities_id_seq'::regclass);


--
-- Name: crm_pipeline_stages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline_stages ALTER COLUMN id SET DEFAULT nextval('public.crm_pipeline_stages_id_seq'::regclass);


--
-- Name: cron_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_jobs ALTER COLUMN id SET DEFAULT nextval('public.cron_jobs_id_seq'::regclass);


--
-- Name: cron_locks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_locks ALTER COLUMN id SET DEFAULT nextval('public.cron_locks_id_seq'::regclass);


--
-- Name: cron_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_logs ALTER COLUMN id SET DEFAULT nextval('public.cron_logs_id_seq'::regclass);


--
-- Name: custom_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles ALTER COLUMN id SET DEFAULT nextval('public.custom_roles_id_seq'::regclass);


--
-- Name: daily_close_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close_log ALTER COLUMN id SET DEFAULT nextval('public.daily_close_log_id_seq'::regclass);


--
-- Name: daily_closures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closures ALTER COLUMN id SET DEFAULT nextval('public.daily_closures_id_seq'::regclass);


--
-- Name: data_access_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_requests ALTER COLUMN id SET DEFAULT nextval('public.data_access_requests_id_seq'::regclass);


--
-- Name: data_retention_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies ALTER COLUMN id SET DEFAULT nextval('public.data_retention_policies_id_seq'::regclass);


--
-- Name: deduction_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_rules ALTER COLUMN id SET DEFAULT nextval('public.deduction_rules_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: depreciation_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_entries ALTER COLUMN id SET DEFAULT nextval('public.depreciation_entries_id_seq'::regclass);


--
-- Name: digital_signature_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_signature_logs ALTER COLUMN id SET DEFAULT nextval('public.digital_signature_logs_id_seq'::regclass);


--
-- Name: digital_signature_otps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_signature_otps ALTER COLUMN id SET DEFAULT nextval('public.digital_signature_otps_id_seq'::regclass);


--
-- Name: document_entity_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_entity_links ALTER COLUMN id SET DEFAULT nextval('public.document_entity_links_id_seq'::regclass);


--
-- Name: document_folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_folders ALTER COLUMN id SET DEFAULT nextval('public.document_folders_id_seq'::regclass);


--
-- Name: document_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates ALTER COLUMN id SET DEFAULT nextval('public.document_templates_id_seq'::regclass);


--
-- Name: document_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions ALTER COLUMN id SET DEFAULT nextval('public.document_versions_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: email_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue ALTER COLUMN id SET DEFAULT nextval('public.email_queue_id_seq'::regclass);


--
-- Name: employee_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments ALTER COLUMN id SET DEFAULT nextval('public.employee_assignments_id_seq'::regclass);


--
-- Name: employee_contracts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_contracts ALTER COLUMN id SET DEFAULT nextval('public.employee_contracts_id_seq'::regclass);


--
-- Name: employee_development_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_development_plans ALTER COLUMN id SET DEFAULT nextval('public.employee_development_plans_id_seq'::regclass);


--
-- Name: employee_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents ALTER COLUMN id SET DEFAULT nextval('public.employee_documents_id_seq'::regclass);


--
-- Name: employee_monthly_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_monthly_attendance ALTER COLUMN id SET DEFAULT nextval('public.employee_monthly_attendance_id_seq'::regclass);


--
-- Name: employee_of_month id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month ALTER COLUMN id SET DEFAULT nextval('public.employee_of_month_id_seq'::regclass);


--
-- Name: employee_shift_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments ALTER COLUMN id SET DEFAULT nextval('public.employee_shift_assignments_id_seq'::regclass);


--
-- Name: employee_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_transfers ALTER COLUMN id SET DEFAULT nextval('public.employee_transfers_id_seq'::regclass);


--
-- Name: employee_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_violations ALTER COLUMN id SET DEFAULT nextval('public.employee_violations_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: entity_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_comments ALTER COLUMN id SET DEFAULT nextval('public.entity_comments_id_seq'::regclass);


--
-- Name: entity_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags ALTER COLUMN id SET DEFAULT nextval('public.entity_tags_id_seq'::regclass);


--
-- Name: evaluation_cycles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_cycles ALTER COLUMN id SET DEFAULT nextval('public.evaluation_cycles_id_seq'::regclass);


--
-- Name: evaluation_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_participants ALTER COLUMN id SET DEFAULT nextval('public.evaluation_participants_id_seq'::regclass);


--
-- Name: evaluation_summaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_summaries ALTER COLUMN id SET DEFAULT nextval('public.evaluation_summaries_id_seq'::regclass);


--
-- Name: event_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs ALTER COLUMN id SET DEFAULT nextval('public.event_logs_id_seq'::regclass);


--
-- Name: expense_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims ALTER COLUMN id SET DEFAULT nextval('public.expense_claims_id_seq'::regclass);


--
-- Name: financial_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods ALTER COLUMN id SET DEFAULT nextval('public.financial_periods_id_seq'::regclass);


--
-- Name: fixed_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets ALTER COLUMN id SET DEFAULT nextval('public.fixed_assets_id_seq'::regclass);


--
-- Name: fleet_drivers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_drivers ALTER COLUMN id SET DEFAULT nextval('public.fleet_drivers_id_seq'::regclass);


--
-- Name: fleet_fuel_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_fuel_logs ALTER COLUMN id SET DEFAULT nextval('public.fleet_fuel_logs_id_seq'::regclass);


--
-- Name: fleet_gps_tracking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_gps_tracking ALTER COLUMN id SET DEFAULT nextval('public.fleet_gps_tracking_id_seq'::regclass);


--
-- Name: fleet_insurance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_insurance ALTER COLUMN id SET DEFAULT nextval('public.fleet_insurance_id_seq'::regclass);


--
-- Name: fleet_maintenance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_maintenance ALTER COLUMN id SET DEFAULT nextval('public.fleet_maintenance_id_seq'::regclass);


--
-- Name: fleet_preventive_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_preventive_plans ALTER COLUMN id SET DEFAULT nextval('public.fleet_preventive_plans_id_seq'::regclass);


--
-- Name: fleet_traffic_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_traffic_violations ALTER COLUMN id SET DEFAULT nextval('public.fleet_traffic_violations_id_seq'::regclass);


--
-- Name: fleet_trips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_trips ALTER COLUMN id SET DEFAULT nextval('public.fleet_trips_id_seq'::regclass);


--
-- Name: fleet_vehicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_vehicles ALTER COLUMN id SET DEFAULT nextval('public.fleet_vehicles_id_seq'::regclass);


--
-- Name: fleet_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_violations ALTER COLUMN id SET DEFAULT nextval('public.fleet_violations_id_seq'::regclass);


--
-- Name: goods_receipt_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items ALTER COLUMN id SET DEFAULT nextval('public.goods_receipt_items_id_seq'::regclass);


--
-- Name: goods_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts ALTER COLUMN id SET DEFAULT nextval('public.goods_receipts_id_seq'::regclass);


--
-- Name: gov_integration_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integration_links ALTER COLUMN id SET DEFAULT nextval('public.gov_integration_links_id_seq'::regclass);


--
-- Name: gov_integrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integrations ALTER COLUMN id SET DEFAULT nextval('public.gov_integrations_id_seq'::regclass);


--
-- Name: governance_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audits ALTER COLUMN id SET DEFAULT nextval('public.governance_audits_id_seq'::regclass);


--
-- Name: governance_capa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_capa ALTER COLUMN id SET DEFAULT nextval('public.governance_capa_id_seq'::regclass);


--
-- Name: governance_compliance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_compliance ALTER COLUMN id SET DEFAULT nextval('public.governance_compliance_id_seq'::regclass);


--
-- Name: governance_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_policies ALTER COLUMN id SET DEFAULT nextval('public.governance_policies_id_seq'::regclass);


--
-- Name: governance_risks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_risks ALTER COLUMN id SET DEFAULT nextval('public.governance_risks_id_seq'::regclass);


--
-- Name: hr_discipline_regulation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_discipline_regulation ALTER COLUMN id SET DEFAULT nextval('public.hr_discipline_regulation_id_seq'::regclass);


--
-- Name: hr_inquiry_memo_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memo_events ALTER COLUMN id SET DEFAULT nextval('public.hr_inquiry_memo_events_id_seq'::regclass);


--
-- Name: hr_inquiry_memos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos ALTER COLUMN id SET DEFAULT nextval('public.hr_inquiry_memos_id_seq'::regclass);


--
-- Name: hr_leave_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances ALTER COLUMN id SET DEFAULT nextval('public.hr_leave_balances_id_seq'::regclass);


--
-- Name: hr_leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests ALTER COLUMN id SET DEFAULT nextval('public.hr_leave_requests_id_seq'::regclass);


--
-- Name: hr_leave_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types ALTER COLUMN id SET DEFAULT nextval('public.hr_leave_types_id_seq'::regclass);


--
-- Name: integration_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs ALTER COLUMN id SET DEFAULT nextval('public.integration_logs_id_seq'::regclass);


--
-- Name: integrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations ALTER COLUMN id SET DEFAULT nextval('public.integrations_id_seq'::regclass);


--
-- Name: intercompany_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions ALTER COLUMN id SET DEFAULT nextval('public.intercompany_transactions_id_seq'::regclass);


--
-- Name: inventory_count_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_count_items_id_seq'::regclass);


--
-- Name: inventory_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts ALTER COLUMN id SET DEFAULT nextval('public.inventory_counts_id_seq'::regclass);


--
-- Name: invoice_collection_stages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_collection_stages ALTER COLUMN id SET DEFAULT nextval('public.invoice_collection_stages_id_seq'::regclass);


--
-- Name: invoice_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_lines ALTER COLUMN id SET DEFAULT nextval('public.invoice_lines_id_seq'::regclass);


--
-- Name: invoice_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.invoice_payments_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: job_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_applications ALTER COLUMN id SET DEFAULT nextval('public.job_applications_id_seq'::regclass);


--
-- Name: job_postings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings ALTER COLUMN id SET DEFAULT nextval('public.job_postings_id_seq'::regclass);


--
-- Name: job_titles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_titles ALTER COLUMN id SET DEFAULT nextval('public.job_titles_id_seq'::regclass);


--
-- Name: journal_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);


--
-- Name: journal_entry_template_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_template_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_entry_template_lines_id_seq'::regclass);


--
-- Name: journal_entry_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_templates ALTER COLUMN id SET DEFAULT nextval('public.journal_entry_templates_id_seq'::regclass);


--
-- Name: journal_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines ALTER COLUMN id SET DEFAULT nextval('public.journal_lines_id_seq'::regclass);


--
-- Name: kb_articles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_articles ALTER COLUMN id SET DEFAULT nextval('public.kb_articles_id_seq'::regclass);


--
-- Name: kpi_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots ALTER COLUMN id SET DEFAULT nextval('public.kpi_snapshots_id_seq'::regclass);


--
-- Name: late_rent_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_rent_actions ALTER COLUMN id SET DEFAULT nextval('public.late_rent_actions_id_seq'::regclass);


--
-- Name: leave_approval_stages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_stages ALTER COLUMN id SET DEFAULT nextval('public.leave_approval_stages_id_seq'::regclass);


--
-- Name: leave_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances ALTER COLUMN id SET DEFAULT nextval('public.leave_balances_id_seq'::regclass);


--
-- Name: legal_cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_cases ALTER COLUMN id SET DEFAULT nextval('public.legal_cases_id_seq'::regclass);


--
-- Name: legal_contracts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_contracts ALTER COLUMN id SET DEFAULT nextval('public.legal_contracts_id_seq'::regclass);


--
-- Name: legal_correspondence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_correspondence ALTER COLUMN id SET DEFAULT nextval('public.legal_correspondence_id_seq'::regclass);


--
-- Name: legal_judgments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_judgments ALTER COLUMN id SET DEFAULT nextval('public.legal_judgments_id_seq'::regclass);


--
-- Name: legal_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_sessions ALTER COLUMN id SET DEFAULT nextval('public.legal_sessions_id_seq'::regclass);


--
-- Name: loan_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounts ALTER COLUMN id SET DEFAULT nextval('public.loan_accounts_id_seq'::regclass);


--
-- Name: maintenance_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_requests ALTER COLUMN id SET DEFAULT nextval('public.maintenance_requests_id_seq'::regclass);


--
-- Name: marketing_campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns ALTER COLUMN id SET DEFAULT nextval('public.marketing_campaigns_id_seq'::regclass);


--
-- Name: notification_delivery_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log ALTER COLUMN id SET DEFAULT nextval('public.notification_delivery_log_id_seq'::regclass);


--
-- Name: notification_fallback_chains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_fallback_chains ALTER COLUMN id SET DEFAULT nextval('public.notification_fallback_chains_id_seq'::regclass);


--
-- Name: notification_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log ALTER COLUMN id SET DEFAULT nextval('public.notification_log_id_seq'::regclass);


--
-- Name: notification_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.notification_preferences_id_seq'::regclass);


--
-- Name: notification_routing_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routing_rules ALTER COLUMN id SET DEFAULT nextval('public.notification_routing_rules_id_seq'::regclass);


--
-- Name: notification_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates ALTER COLUMN id SET DEFAULT nextval('public.notification_templates_id_seq'::regclass);


--
-- Name: notification_webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_webhooks ALTER COLUMN id SET DEFAULT nextval('public.notification_webhooks_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: official_letters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_letters ALTER COLUMN id SET DEFAULT nextval('public.official_letters_id_seq'::regclass);


--
-- Name: onboarding_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks ALTER COLUMN id SET DEFAULT nextval('public.onboarding_tasks_id_seq'::regclass);


--
-- Name: password_reset_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests ALTER COLUMN id SET DEFAULT nextval('public.password_reset_requests_id_seq'::regclass);


--
-- Name: payroll_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_lines ALTER COLUMN id SET DEFAULT nextval('public.payroll_lines_id_seq'::regclass);


--
-- Name: payroll_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs ALTER COLUMN id SET DEFAULT nextval('public.payroll_runs_id_seq'::regclass);


--
-- Name: pbx_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbx_calls ALTER COLUMN id SET DEFAULT nextval('public.pbx_calls_id_seq'::regclass);


--
-- Name: peer_evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations ALTER COLUMN id SET DEFAULT nextval('public.peer_evaluations_id_seq'::regclass);


--
-- Name: performance_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews ALTER COLUMN id SET DEFAULT nextval('public.performance_reviews_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: policy_compliance_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_compliance_actions ALTER COLUMN id SET DEFAULT nextval('public.policy_compliance_actions_id_seq'::regclass);


--
-- Name: policy_module_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_module_links ALTER COLUMN id SET DEFAULT nextval('public.policy_module_links_id_seq'::regclass);


--
-- Name: privacy_consent_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_records ALTER COLUMN id SET DEFAULT nextval('public.privacy_consent_records_id_seq'::regclass);


--
-- Name: proactive_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_rules ALTER COLUMN id SET DEFAULT nextval('public.proactive_rules_id_seq'::regclass);


--
-- Name: processing_activities_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_activities_log ALTER COLUMN id SET DEFAULT nextval('public.processing_activities_log_id_seq'::regclass);


--
-- Name: project_costs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_costs ALTER COLUMN id SET DEFAULT nextval('public.project_costs_id_seq'::regclass);


--
-- Name: project_milestones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones ALTER COLUMN id SET DEFAULT nextval('public.project_milestones_id_seq'::regclass);


--
-- Name: project_phases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases ALTER COLUMN id SET DEFAULT nextval('public.project_phases_id_seq'::regclass);


--
-- Name: project_resources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_resources ALTER COLUMN id SET DEFAULT nextval('public.project_resources_id_seq'::regclass);


--
-- Name: project_risks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_risks ALTER COLUMN id SET DEFAULT nextval('public.project_risks_id_seq'::regclass);


--
-- Name: project_task_dependencies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_task_dependencies ALTER COLUMN id SET DEFAULT nextval('public.project_task_dependencies_id_seq'::regclass);


--
-- Name: project_tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks ALTER COLUMN id SET DEFAULT nextval('public.project_tasks_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: property_buildings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_buildings ALTER COLUMN id SET DEFAULT nextval('public.property_buildings_id_seq'::regclass);


--
-- Name: property_inspections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections ALTER COLUMN id SET DEFAULT nextval('public.property_inspections_id_seq'::regclass);


--
-- Name: property_owners id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_owners ALTER COLUMN id SET DEFAULT nextval('public.property_owners_id_seq'::regclass);


--
-- Name: property_security_deposits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_security_deposits ALTER COLUMN id SET DEFAULT nextval('public.property_security_deposits_id_seq'::regclass);


--
-- Name: property_units id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_units ALTER COLUMN id SET DEFAULT nextval('public.property_units_id_seq'::regclass);


--
-- Name: public_announcements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_announcements ALTER COLUMN id SET DEFAULT nextval('public.public_announcements_id_seq'::regclass);


--
-- Name: public_holidays id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_holidays ALTER COLUMN id SET DEFAULT nextval('public.public_holidays_id_seq'::regclass);


--
-- Name: purchase_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: purchase_request_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_request_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_request_items_id_seq'::regclass);


--
-- Name: purchase_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requests ALTER COLUMN id SET DEFAULT nextval('public.purchase_requests_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: quality_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks ALTER COLUMN id SET DEFAULT nextval('public.quality_checks_id_seq'::regclass);


--
-- Name: recurring_journal_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_journal_runs ALTER COLUMN id SET DEFAULT nextval('public.recurring_journal_runs_id_seq'::regclass);


--
-- Name: recurring_journals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_journals ALTER COLUMN id SET DEFAULT nextval('public.recurring_journals_id_seq'::regclass);


--
-- Name: rent_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rent_payments ALTER COLUMN id SET DEFAULT nextval('public.rent_payments_id_seq'::regclass);


--
-- Name: rental_contracts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts ALTER COLUMN id SET DEFAULT nextval('public.rental_contracts_id_seq'::regclass);


--
-- Name: request_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_types ALTER COLUMN id SET DEFAULT nextval('public.request_types_id_seq'::regclass);


--
-- Name: requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests ALTER COLUMN id SET DEFAULT nextval('public.requests_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: salary_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components ALTER COLUMN id SET DEFAULT nextval('public.salary_components_id_seq'::regclass);


--
-- Name: scheduled_report_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_report_history ALTER COLUMN id SET DEFAULT nextval('public.scheduled_report_history_id_seq'::regclass);


--
-- Name: scheduled_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports ALTER COLUMN id SET DEFAULT nextval('public.scheduled_reports_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: security_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_log ALTER COLUMN id SET DEFAULT nextval('public.security_log_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: sla_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_definitions ALTER COLUMN id SET DEFAULT nextval('public.sla_definitions_id_seq'::regclass);


--
-- Name: smart_alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_alerts ALTER COLUMN id SET DEFAULT nextval('public.smart_alerts_id_seq'::regclass);


--
-- Name: sms_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_queue ALTER COLUMN id SET DEFAULT nextval('public.sms_queue_id_seq'::regclass);


--
-- Name: stock_transfer_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfer_items ALTER COLUMN id SET DEFAULT nextval('public.stock_transfer_items_id_seq'::regclass);


--
-- Name: stock_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers ALTER COLUMN id SET DEFAULT nextval('public.stock_transfers_id_seq'::regclass);


--
-- Name: store_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order_items ALTER COLUMN id SET DEFAULT nextval('public.store_order_items_id_seq'::regclass);


--
-- Name: store_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders ALTER COLUMN id SET DEFAULT nextval('public.store_orders_id_seq'::regclass);


--
-- Name: store_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_products ALTER COLUMN id SET DEFAULT nextval('public.store_products_id_seq'::regclass);


--
-- Name: subsidiary_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiary_accounts ALTER COLUMN id SET DEFAULT nextval('public.subsidiary_accounts_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: support_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN id SET DEFAULT nextval('public.support_tickets_id_seq'::regclass);


--
-- Name: system_evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_evaluations ALTER COLUMN id SET DEFAULT nextval('public.system_evaluations_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: tasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks ALTER COLUMN id SET DEFAULT nextval('public.tasks_id_seq'::regclass);


--
-- Name: technicians id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians ALTER COLUMN id SET DEFAULT nextval('public.technicians_id_seq'::regclass);


--
-- Name: tenants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants ALTER COLUMN id SET DEFAULT nextval('public.tenants_id_seq'::regclass);


--
-- Name: ticket_csat_ratings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_csat_ratings ALTER COLUMN id SET DEFAULT nextval('public.ticket_csat_ratings_id_seq'::regclass);


--
-- Name: ticket_escalations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_escalations ALTER COLUMN id SET DEFAULT nextval('public.ticket_escalations_id_seq'::regclass);


--
-- Name: ticket_replies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies ALTER COLUMN id SET DEFAULT nextval('public.ticket_replies_id_seq'::regclass);


--
-- Name: training_enrollments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments ALTER COLUMN id SET DEFAULT nextval('public.training_enrollments_id_seq'::regclass);


--
-- Name: training_programs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs ALTER COLUMN id SET DEFAULT nextval('public.training_programs_id_seq'::regclass);


--
-- Name: umrah_agent_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agent_invoices ALTER COLUMN id SET DEFAULT nextval('public.umrah_agent_invoices_id_seq'::regclass);


--
-- Name: umrah_agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agents ALTER COLUMN id SET DEFAULT nextval('public.umrah_agents_id_seq'::regclass);


--
-- Name: umrah_import_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_logs ALTER COLUMN id SET DEFAULT nextval('public.umrah_import_logs_id_seq'::regclass);


--
-- Name: umrah_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_packages ALTER COLUMN id SET DEFAULT nextval('public.umrah_packages_id_seq'::regclass);


--
-- Name: umrah_penalties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties ALTER COLUMN id SET DEFAULT nextval('public.umrah_penalties_id_seq'::regclass);


--
-- Name: umrah_pilgrims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims ALTER COLUMN id SET DEFAULT nextval('public.umrah_pilgrims_id_seq'::regclass);


--
-- Name: umrah_seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_seasons ALTER COLUMN id SET DEFAULT nextval('public.umrah_seasons_id_seq'::regclass);


--
-- Name: umrah_transport id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport ALTER COLUMN id SET DEFAULT nextval('public.umrah_transport_id_seq'::regclass);


--
-- Name: user_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log ALTER COLUMN id SET DEFAULT nextval('public.user_activity_log_id_seq'::regclass);


--
-- Name: user_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles ALTER COLUMN id SET DEFAULT nextval('public.user_roles_id_seq'::regclass);


--
-- Name: user_shortcuts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_shortcuts ALTER COLUMN id SET DEFAULT nextval('public.user_shortcuts_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: warehouse_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories ALTER COLUMN id SET DEFAULT nextval('public.warehouse_categories_id_seq'::regclass);


--
-- Name: warehouse_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_movements ALTER COLUMN id SET DEFAULT nextval('public.warehouse_movements_id_seq'::regclass);


--
-- Name: warehouse_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_products ALTER COLUMN id SET DEFAULT nextval('public.warehouse_products_id_seq'::regclass);


--
-- Name: warehouse_stock_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_batches ALTER COLUMN id SET DEFAULT nextval('public.warehouse_stock_batches_id_seq'::regclass);


--
-- Name: whatsapp_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_queue ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_queue_id_seq'::regclass);


--
-- Name: workflow_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions ALTER COLUMN id SET DEFAULT nextval('public.workflow_definitions_id_seq'::regclass);


--
-- Name: workflow_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances ALTER COLUMN id SET DEFAULT nextval('public.workflow_instances_id_seq'::regclass);


--
-- Name: workflow_step_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_actions ALTER COLUMN id SET DEFAULT nextval('public.workflow_step_actions_id_seq'::regclass);


--
-- Name: workflow_steps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps ALTER COLUMN id SET DEFAULT nextval('public.workflow_steps_id_seq'::regclass);


--
-- Name: workflows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows ALTER COLUMN id SET DEFAULT nextval('public.workflows_id_seq'::regclass);


--
-- Name: zatca_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_settings ALTER COLUMN id SET DEFAULT nextval('public.zatca_settings_id_seq'::regclass);


--
-- Name: zatca_submission_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_submission_log ALTER COLUMN id SET DEFAULT nextval('public.zatca_submission_log_id_seq'::regclass);


--
-- Name: accounting_mappings accounting_mappings_companyId_operationType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings
    ADD CONSTRAINT "accounting_mappings_companyId_operationType_key" UNIQUE ("companyId", "operationType");


--
-- Name: accounting_mappings accounting_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings
    ADD CONSTRAINT accounting_mappings_pkey PRIMARY KEY (id);


--
-- Name: alert_fatigue_settings alert_fatigue_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_fatigue_settings
    ADD CONSTRAINT alert_fatigue_settings_pkey PRIMARY KEY (id);


--
-- Name: alert_mute_rules alert_mute_rules_assignmentId_alertType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mute_rules
    ADD CONSTRAINT "alert_mute_rules_assignmentId_alertType_key" UNIQUE ("assignmentId", "alertType");


--
-- Name: alert_mute_rules alert_mute_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mute_rules
    ADD CONSTRAINT alert_mute_rules_pkey PRIMARY KEY (id);


--
-- Name: anonymous_upward_reviews anonymous_upward_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_upward_reviews
    ADD CONSTRAINT anonymous_upward_reviews_pkey PRIMARY KEY (id);


--
-- Name: applicant_accounts applicant_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicant_accounts
    ADD CONSTRAINT applicant_accounts_email_key UNIQUE (email);


--
-- Name: applicant_accounts applicant_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applicant_accounts
    ADD CONSTRAINT applicant_accounts_pkey PRIMARY KEY (id);


--
-- Name: approval_actions approval_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions
    ADD CONSTRAINT approval_actions_pkey PRIMARY KEY (id);


--
-- Name: approval_chain_steps approval_chain_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_steps
    ADD CONSTRAINT approval_chain_steps_pkey PRIMARY KEY (id);


--
-- Name: approval_chains approval_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: attendance_deductions attendance_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_deductions
    ADD CONSTRAINT attendance_deductions_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance_policies attendance_policies_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_policies
    ADD CONSTRAINT "attendance_policies_companyId_key" UNIQUE ("companyId");


--
-- Name: attendance_policies attendance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_policies
    ADD CONSTRAINT attendance_policies_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_violations audit_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_violations
    ADD CONSTRAINT audit_violations_pkey PRIMARY KEY (id);


--
-- Name: automation_logs automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_guarantees bank_guarantees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_guarantees
    ADD CONSTRAINT bank_guarantees_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: bi_dashboards bi_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_dashboards
    ADD CONSTRAINT bi_dashboards_pkey PRIMARY KEY (id);


--
-- Name: bi_kpis bi_kpis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_kpis
    ADD CONSTRAINT bi_kpis_pkey PRIMARY KEY (id);


--
-- Name: bi_reports bi_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_reports
    ADD CONSTRAINT bi_reports_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: budget_approval_requests budget_approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_approval_requests
    ADD CONSTRAINT budget_approval_requests_pkey PRIMARY KEY (id);


--
-- Name: budget_lines budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT budget_lines_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: business_rule_logs business_rule_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rule_logs
    ADD CONSTRAINT business_rule_logs_pkey PRIMARY KEY (id);


--
-- Name: business_rules business_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rules
    ADD CONSTRAINT business_rules_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_company_code_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_company_code_uq UNIQUE ("companyId", code);


--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);


--
-- Name: client_portal_accounts client_portal_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_accounts
    ADD CONSTRAINT client_portal_accounts_email_key UNIQUE (email);


--
-- Name: client_portal_accounts client_portal_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_accounts
    ADD CONSTRAINT client_portal_accounts_pkey PRIMARY KEY (id);


--
-- Name: client_rfm_scores client_rfm_scores_companyId_clientId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_rfm_scores
    ADD CONSTRAINT "client_rfm_scores_companyId_clientId_key" UNIQUE ("companyId", "clientId");


--
-- Name: client_rfm_scores client_rfm_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_rfm_scores
    ADD CONSTRAINT client_rfm_scores_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: collection_follow_ups collection_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_follow_ups
    ADD CONSTRAINT collection_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: communications_log communications_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications_log
    ADD CONSTRAINT communications_log_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: contract_payment_schedule contract_payment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule
    ADD CONSTRAINT contract_payment_schedule_pkey PRIMARY KEY (id);


--
-- Name: crm_activities crm_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT crm_activities_pkey PRIMARY KEY (id);


--
-- Name: crm_contacts crm_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT crm_contacts_pkey PRIMARY KEY (id);


--
-- Name: crm_opportunities crm_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opportunities
    ADD CONSTRAINT crm_opportunities_pkey PRIMARY KEY (id);


--
-- Name: crm_pipeline_stages crm_pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline_stages
    ADD CONSTRAINT crm_pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: cron_jobs cron_jobs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_jobs
    ADD CONSTRAINT cron_jobs_name_key UNIQUE (name);


--
-- Name: cron_jobs cron_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_jobs
    ADD CONSTRAINT cron_jobs_pkey PRIMARY KEY (id);


--
-- Name: cron_locks cron_locks_job_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_locks
    ADD CONSTRAINT cron_locks_job_name_key UNIQUE (job_name);


--
-- Name: cron_locks cron_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_locks
    ADD CONSTRAINT cron_locks_pkey PRIMARY KEY (id);


--
-- Name: cron_logs cron_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_logs
    ADD CONSTRAINT cron_logs_pkey PRIMARY KEY (id);


--
-- Name: custom_roles custom_roles_companyId_roleKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT "custom_roles_companyId_roleKey_key" UNIQUE ("companyId", "roleKey");


--
-- Name: custom_roles custom_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);


--
-- Name: daily_close_log daily_close_log_companyId_closeDate_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close_log
    ADD CONSTRAINT "daily_close_log_companyId_closeDate_key" UNIQUE ("companyId", "closeDate");


--
-- Name: daily_close_log daily_close_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close_log
    ADD CONSTRAINT daily_close_log_pkey PRIMARY KEY (id);


--
-- Name: daily_closures daily_closures_companyId_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT "daily_closures_companyId_date_key" UNIQUE ("companyId", date);


--
-- Name: daily_closures daily_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_closures
    ADD CONSTRAINT daily_closures_pkey PRIMARY KEY (id);


--
-- Name: data_access_requests data_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_requests
    ADD CONSTRAINT data_access_requests_pkey PRIMARY KEY (id);


--
-- Name: data_retention_policies data_retention_policies_companyId_dataType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT "data_retention_policies_companyId_dataType_key" UNIQUE ("companyId", "dataType");


--
-- Name: data_retention_policies data_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT data_retention_policies_pkey PRIMARY KEY (id);


--
-- Name: deduction_rules deduction_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_rules
    ADD CONSTRAINT deduction_rules_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: depreciation_entries depreciation_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT depreciation_entries_pkey PRIMARY KEY (id);


--
-- Name: digital_signature_logs digital_signature_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_signature_logs
    ADD CONSTRAINT digital_signature_logs_pkey PRIMARY KEY (id);


--
-- Name: digital_signature_otps digital_signature_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.digital_signature_otps
    ADD CONSTRAINT digital_signature_otps_pkey PRIMARY KEY (id);


--
-- Name: document_entity_links document_entity_links_documentId_entityType_entityId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_entity_links
    ADD CONSTRAINT "document_entity_links_documentId_entityType_entityId_key" UNIQUE ("documentId", "entityType", "entityId");


--
-- Name: document_entity_links document_entity_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_entity_links
    ADD CONSTRAINT document_entity_links_pkey PRIMARY KEY (id);


--
-- Name: document_folders document_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_folders
    ADD CONSTRAINT document_folders_pkey PRIMARY KEY (id);


--
-- Name: document_templates document_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT document_templates_pkey PRIMARY KEY (id);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- Name: employee_assignments employee_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT employee_assignments_pkey PRIMARY KEY (id);


--
-- Name: employee_contracts employee_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_contracts
    ADD CONSTRAINT employee_contracts_pkey PRIMARY KEY (id);


--
-- Name: employee_development_plans employee_development_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_development_plans
    ADD CONSTRAINT employee_development_plans_pkey PRIMARY KEY (id);


--
-- Name: employee_documents employee_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);


--
-- Name: employee_monthly_attendance employee_monthly_attendance_assignmentId_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_monthly_attendance
    ADD CONSTRAINT "employee_monthly_attendance_assignmentId_period_key" UNIQUE ("assignmentId", period);


--
-- Name: employee_monthly_attendance employee_monthly_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_monthly_attendance
    ADD CONSTRAINT employee_monthly_attendance_pkey PRIMARY KEY (id);


--
-- Name: employee_of_month employee_of_month_companyId_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT "employee_of_month_companyId_month_year_key" UNIQUE ("companyId", month, year);


--
-- Name: employee_of_month employee_of_month_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT employee_of_month_pkey PRIMARY KEY (id);


--
-- Name: employee_shift_assignments employee_shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: employee_transfers employee_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_transfers
    ADD CONSTRAINT employee_transfers_pkey PRIMARY KEY (id);


--
-- Name: employee_violations employee_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_violations
    ADD CONSTRAINT employee_violations_pkey PRIMARY KEY (id);


--
-- Name: employees employees_nationalId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT "employees_nationalId_key" UNIQUE ("nationalId");


--
-- Name: employees employees_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_phone_key UNIQUE (phone);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: entity_comments entity_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_comments
    ADD CONSTRAINT entity_comments_pkey PRIMARY KEY (id);


--
-- Name: entity_tags entity_tags_entityType_entityId_tag_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT "entity_tags_entityType_entityId_tag_companyId_key" UNIQUE ("entityType", "entityId", tag, "companyId");


--
-- Name: entity_tags entity_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_pkey PRIMARY KEY (id);


--
-- Name: evaluation_cycles evaluation_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_cycles
    ADD CONSTRAINT evaluation_cycles_pkey PRIMARY KEY (id);


--
-- Name: evaluation_participants evaluation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_participants
    ADD CONSTRAINT evaluation_participants_pkey PRIMARY KEY (id);


--
-- Name: evaluation_summaries evaluation_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_summaries
    ADD CONSTRAINT evaluation_summaries_pkey PRIMARY KEY (id);


--
-- Name: event_logs event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_pkey PRIMARY KEY (id);


--
-- Name: expense_claims expense_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims
    ADD CONSTRAINT expense_claims_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: fleet_drivers fleet_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_drivers
    ADD CONSTRAINT fleet_drivers_pkey PRIMARY KEY (id);


--
-- Name: fleet_fuel_logs fleet_fuel_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_fuel_logs
    ADD CONSTRAINT fleet_fuel_logs_pkey PRIMARY KEY (id);


--
-- Name: fleet_gps_tracking fleet_gps_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_gps_tracking
    ADD CONSTRAINT fleet_gps_tracking_pkey PRIMARY KEY (id);


--
-- Name: fleet_insurance fleet_insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_insurance
    ADD CONSTRAINT fleet_insurance_pkey PRIMARY KEY (id);


--
-- Name: fleet_maintenance fleet_maintenance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_maintenance
    ADD CONSTRAINT fleet_maintenance_pkey PRIMARY KEY (id);


--
-- Name: fleet_preventive_plans fleet_preventive_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_preventive_plans
    ADD CONSTRAINT fleet_preventive_plans_pkey PRIMARY KEY (id);


--
-- Name: fleet_traffic_violations fleet_traffic_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_traffic_violations
    ADD CONSTRAINT fleet_traffic_violations_pkey PRIMARY KEY (id);


--
-- Name: fleet_trips fleet_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_trips
    ADD CONSTRAINT fleet_trips_pkey PRIMARY KEY (id);


--
-- Name: fleet_vehicles fleet_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_vehicles
    ADD CONSTRAINT fleet_vehicles_pkey PRIMARY KEY (id);


--
-- Name: fleet_violations fleet_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_violations
    ADD CONSTRAINT fleet_violations_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_items goods_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: goods_receipts goods_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (id);


--
-- Name: gov_integration_links gov_integration_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integration_links
    ADD CONSTRAINT gov_integration_links_pkey PRIMARY KEY (id);


--
-- Name: gov_integrations gov_integrations_companyId_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integrations
    ADD CONSTRAINT "gov_integrations_companyId_type_key" UNIQUE ("companyId", type);


--
-- Name: gov_integrations gov_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integrations
    ADD CONSTRAINT gov_integrations_pkey PRIMARY KEY (id);


--
-- Name: governance_audits governance_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audits
    ADD CONSTRAINT governance_audits_pkey PRIMARY KEY (id);


--
-- Name: governance_capa governance_capa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_capa
    ADD CONSTRAINT governance_capa_pkey PRIMARY KEY (id);


--
-- Name: governance_compliance governance_compliance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_compliance
    ADD CONSTRAINT governance_compliance_pkey PRIMARY KEY (id);


--
-- Name: governance_policies governance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT governance_policies_pkey PRIMARY KEY (id);


--
-- Name: governance_risks governance_risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_risks
    ADD CONSTRAINT governance_risks_pkey PRIMARY KEY (id);


--
-- Name: hr_discipline_regulation hr_discipline_regulation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_discipline_regulation
    ADD CONSTRAINT hr_discipline_regulation_pkey PRIMARY KEY (id);


--
-- Name: hr_inquiry_memo_events hr_inquiry_memo_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memo_events
    ADD CONSTRAINT hr_inquiry_memo_events_pkey PRIMARY KEY (id);


--
-- Name: hr_inquiry_memos hr_inquiry_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT hr_inquiry_memos_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_balances hr_leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT hr_leave_balances_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_requests hr_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_types hr_leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_pkey PRIMARY KEY (id);


--
-- Name: integration_logs integration_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: intercompany_transactions intercompany_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT intercompany_transactions_pkey PRIMARY KEY (id);


--
-- Name: inventory_count_items inventory_count_items_countId_productId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT "inventory_count_items_countId_productId_key" UNIQUE ("countId", "productId");


--
-- Name: inventory_count_items inventory_count_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_items
    ADD CONSTRAINT inventory_count_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_counts inventory_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_counts
    ADD CONSTRAINT inventory_counts_pkey PRIMARY KEY (id);


--
-- Name: invoice_collection_stages invoice_collection_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_collection_stages
    ADD CONSTRAINT invoice_collection_stages_pkey PRIMARY KEY (id);


--
-- Name: invoice_lines invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_ref_key UNIQUE (ref);


--
-- Name: job_applications job_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT job_applications_pkey PRIMARY KEY (id);


--
-- Name: job_postings job_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings
    ADD CONSTRAINT job_postings_pkey PRIMARY KEY (id);


--
-- Name: job_titles job_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT job_titles_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_template_lines journal_entry_template_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_template_lines
    ADD CONSTRAINT journal_entry_template_lines_pkey PRIMARY KEY (id);


--
-- Name: journal_entry_templates journal_entry_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_templates
    ADD CONSTRAINT journal_entry_templates_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: kb_articles kb_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_articles
    ADD CONSTRAINT kb_articles_pkey PRIMARY KEY (id);


--
-- Name: kpi_snapshots kpi_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_snapshots
    ADD CONSTRAINT kpi_snapshots_pkey PRIMARY KEY (id);


--
-- Name: late_rent_actions late_rent_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_rent_actions
    ADD CONSTRAINT late_rent_actions_pkey PRIMARY KEY (id);


--
-- Name: leave_approval_stages leave_approval_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_stages
    ADD CONSTRAINT leave_approval_stages_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_employeeId_leaveTypeId_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT "leave_balances_employeeId_leaveTypeId_year_key" UNIQUE ("employeeId", "leaveTypeId", year);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: legal_cases legal_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_cases
    ADD CONSTRAINT legal_cases_pkey PRIMARY KEY (id);


--
-- Name: legal_contracts legal_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_contracts
    ADD CONSTRAINT legal_contracts_pkey PRIMARY KEY (id);


--
-- Name: legal_correspondence legal_correspondence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_correspondence
    ADD CONSTRAINT legal_correspondence_pkey PRIMARY KEY (id);


--
-- Name: legal_judgments legal_judgments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_judgments
    ADD CONSTRAINT legal_judgments_pkey PRIMARY KEY (id);


--
-- Name: legal_sessions legal_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_sessions
    ADD CONSTRAINT legal_sessions_pkey PRIMARY KEY (id);


--
-- Name: loan_accounts loan_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounts
    ADD CONSTRAINT loan_accounts_pkey PRIMARY KEY (id);


--
-- Name: maintenance_requests maintenance_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT maintenance_requests_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: notification_delivery_log notification_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT notification_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: notification_fallback_chains notification_fallback_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_fallback_chains
    ADD CONSTRAINT notification_fallback_chains_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_userId_channel_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT "notification_preferences_userId_channel_category_key" UNIQUE ("userId", channel, category);


--
-- Name: notification_routing_rules notification_routing_rules_companyId_eventCategory_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routing_rules
    ADD CONSTRAINT "notification_routing_rules_companyId_eventCategory_key" UNIQUE ("companyId", "eventCategory");


--
-- Name: notification_routing_rules notification_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routing_rules
    ADD CONSTRAINT notification_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_companyId_templateKey_channel_langua_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT "notification_templates_companyId_templateKey_channel_langua_key" UNIQUE ("companyId", "templateKey", channel, language);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_webhooks notification_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_webhooks
    ADD CONSTRAINT notification_webhooks_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: official_letters official_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_letters
    ADD CONSTRAINT official_letters_pkey PRIMARY KEY (id);


--
-- Name: onboarding_tasks onboarding_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_tasks
    ADD CONSTRAINT onboarding_tasks_pkey PRIMARY KEY (id);


--
-- Name: password_reset_requests password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: payroll_lines payroll_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_lines
    ADD CONSTRAINT payroll_lines_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: pbx_calls pbx_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbx_calls
    ADD CONSTRAINT pbx_calls_pkey PRIMARY KEY (id);


--
-- Name: peer_evaluations peer_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations
    ADD CONSTRAINT peer_evaluations_pkey PRIMARY KEY (id);


--
-- Name: performance_reviews performance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT performance_reviews_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: policy_compliance_actions policy_compliance_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_compliance_actions
    ADD CONSTRAINT policy_compliance_actions_pkey PRIMARY KEY (id);


--
-- Name: policy_module_links policy_module_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_module_links
    ADD CONSTRAINT policy_module_links_pkey PRIMARY KEY (id);


--
-- Name: policy_module_links policy_module_links_policyId_module_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_module_links
    ADD CONSTRAINT "policy_module_links_policyId_module_key" UNIQUE ("policyId", module);


--
-- Name: privacy_consent_records privacy_consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_records
    ADD CONSTRAINT privacy_consent_records_pkey PRIMARY KEY (id);


--
-- Name: proactive_rules proactive_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_rules
    ADD CONSTRAINT proactive_rules_pkey PRIMARY KEY (id);


--
-- Name: processing_activities_log processing_activities_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_activities_log
    ADD CONSTRAINT processing_activities_log_pkey PRIMARY KEY (id);


--
-- Name: project_costs project_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_costs
    ADD CONSTRAINT project_costs_pkey PRIMARY KEY (id);


--
-- Name: project_milestones project_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_milestones
    ADD CONSTRAINT project_milestones_pkey PRIMARY KEY (id);


--
-- Name: project_phases project_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT project_phases_pkey PRIMARY KEY (id);


--
-- Name: project_resources project_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_resources
    ADD CONSTRAINT project_resources_pkey PRIMARY KEY (id);


--
-- Name: project_risks project_risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_risks
    ADD CONSTRAINT project_risks_pkey PRIMARY KEY (id);


--
-- Name: project_task_dependencies project_task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_task_dependencies
    ADD CONSTRAINT project_task_dependencies_pkey PRIMARY KEY (id);


--
-- Name: project_tasks project_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: property_buildings property_buildings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_buildings
    ADD CONSTRAINT property_buildings_pkey PRIMARY KEY (id);


--
-- Name: property_inspections property_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_inspections
    ADD CONSTRAINT property_inspections_pkey PRIMARY KEY (id);


--
-- Name: property_owners property_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_owners
    ADD CONSTRAINT property_owners_pkey PRIMARY KEY (id);


--
-- Name: property_security_deposits property_security_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_security_deposits
    ADD CONSTRAINT property_security_deposits_pkey PRIMARY KEY (id);


--
-- Name: property_units property_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_units
    ADD CONSTRAINT property_units_pkey PRIMARY KEY (id);


--
-- Name: public_announcements public_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_announcements
    ADD CONSTRAINT public_announcements_pkey PRIMARY KEY (id);


--
-- Name: public_holidays public_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_holidays
    ADD CONSTRAINT public_holidays_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_request_items purchase_request_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT purchase_request_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_requests purchase_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT purchase_requests_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_companyId_endpointHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "push_subscriptions_companyId_endpointHash_key" UNIQUE ("companyId", "endpointHash");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: quality_checks quality_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks
    ADD CONSTRAINT quality_checks_pkey PRIMARY KEY (id);


--
-- Name: recurring_journal_runs recurring_journal_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_journal_runs
    ADD CONSTRAINT recurring_journal_runs_pkey PRIMARY KEY (id);


--
-- Name: recurring_journals recurring_journals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_journals
    ADD CONSTRAINT recurring_journals_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- Name: rent_payments rent_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rent_payments
    ADD CONSTRAINT rent_payments_pkey PRIMARY KEY (id);


--
-- Name: rental_contracts rental_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts
    ADD CONSTRAINT rental_contracts_pkey PRIMARY KEY (id);


--
-- Name: request_types request_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_types
    ADD CONSTRAINT request_types_pkey PRIMARY KEY (id);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: scheduled_report_history scheduled_report_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_report_history
    ADD CONSTRAINT scheduled_report_history_pkey PRIMARY KEY (id);


--
-- Name: scheduled_reports scheduled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: security_log security_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_log
    ADD CONSTRAINT security_log_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: sla_definitions sla_definitions_companyId_requestType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_definitions
    ADD CONSTRAINT "sla_definitions_companyId_requestType_key" UNIQUE ("companyId", "requestType");


--
-- Name: sla_definitions sla_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sla_definitions
    ADD CONSTRAINT sla_definitions_pkey PRIMARY KEY (id);


--
-- Name: smart_alerts smart_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_alerts
    ADD CONSTRAINT smart_alerts_pkey PRIMARY KEY (id);


--
-- Name: sms_queue sms_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_queue
    ADD CONSTRAINT sms_queue_pkey PRIMARY KEY (id);


--
-- Name: stock_transfer_items stock_transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT stock_transfer_items_pkey PRIMARY KEY (id);


--
-- Name: stock_transfers stock_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT stock_transfers_pkey PRIMARY KEY (id);


--
-- Name: store_order_items store_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT store_order_items_pkey PRIMARY KEY (id);


--
-- Name: store_orders store_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT store_orders_pkey PRIMARY KEY (id);


--
-- Name: store_products store_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);


--
-- Name: subsidiary_accounts subsidiary_accounts_companyId_entityType_entityId_accountTy_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiary_accounts
    ADD CONSTRAINT "subsidiary_accounts_companyId_entityType_entityId_accountTy_key" UNIQUE ("companyId", "entityType", "entityId", "accountType");


--
-- Name: subsidiary_accounts subsidiary_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiary_accounts
    ADD CONSTRAINT subsidiary_accounts_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_evaluations system_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_evaluations
    ADD CONSTRAINT system_evaluations_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_companyId_branchId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT "system_settings_companyId_branchId_key_key" UNIQUE ("companyId", "branchId", key);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: technicians technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technicians
    ADD CONSTRAINT technicians_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: ticket_csat_ratings ticket_csat_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_csat_ratings
    ADD CONSTRAINT ticket_csat_ratings_pkey PRIMARY KEY (id);


--
-- Name: ticket_csat_ratings ticket_csat_ratings_ticketId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_csat_ratings
    ADD CONSTRAINT "ticket_csat_ratings_ticketId_key" UNIQUE ("ticketId");


--
-- Name: ticket_escalations ticket_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_escalations
    ADD CONSTRAINT ticket_escalations_pkey PRIMARY KEY (id);


--
-- Name: ticket_replies ticket_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_pkey PRIMARY KEY (id);


--
-- Name: training_enrollments training_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments
    ADD CONSTRAINT training_enrollments_pkey PRIMARY KEY (id);


--
-- Name: training_programs training_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs
    ADD CONSTRAINT training_programs_pkey PRIMARY KEY (id);


--
-- Name: umrah_agent_invoices umrah_agent_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agent_invoices
    ADD CONSTRAINT umrah_agent_invoices_pkey PRIMARY KEY (id);


--
-- Name: umrah_agents umrah_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agents
    ADD CONSTRAINT umrah_agents_pkey PRIMARY KEY (id);


--
-- Name: umrah_import_logs umrah_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_logs
    ADD CONSTRAINT umrah_import_logs_pkey PRIMARY KEY (id);


--
-- Name: umrah_packages umrah_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_packages
    ADD CONSTRAINT umrah_packages_pkey PRIMARY KEY (id);


--
-- Name: umrah_penalties umrah_penalties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties
    ADD CONSTRAINT umrah_penalties_pkey PRIMARY KEY (id);


--
-- Name: umrah_pilgrims umrah_pilgrims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims
    ADD CONSTRAINT umrah_pilgrims_pkey PRIMARY KEY (id);


--
-- Name: umrah_seasons umrah_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_seasons
    ADD CONSTRAINT umrah_seasons_pkey PRIMARY KEY (id);


--
-- Name: umrah_transport umrah_transport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport
    ADD CONSTRAINT umrah_transport_pkey PRIMARY KEY (id);


--
-- Name: client_portal_accounts uq_client_portal_accounts_client; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_accounts
    ADD CONSTRAINT uq_client_portal_accounts_client UNIQUE ("clientId", "companyId");


--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_shortcuts user_shortcuts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_shortcuts
    ADD CONSTRAINT user_shortcuts_pkey PRIMARY KEY (id);


--
-- Name: user_shortcuts user_shortcuts_userId_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_shortcuts
    ADD CONSTRAINT "user_shortcuts_userId_path_key" UNIQUE ("userId", path);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouse_categories warehouse_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories
    ADD CONSTRAINT warehouse_categories_pkey PRIMARY KEY (id);


--
-- Name: warehouse_movements warehouse_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_movements
    ADD CONSTRAINT warehouse_movements_pkey PRIMARY KEY (id);


--
-- Name: warehouse_products warehouse_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_products
    ADD CONSTRAINT warehouse_products_pkey PRIMARY KEY (id);


--
-- Name: warehouse_stock_batches warehouse_stock_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_batches
    ADD CONSTRAINT warehouse_stock_batches_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_queue whatsapp_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_queue
    ADD CONSTRAINT whatsapp_queue_pkey PRIMARY KEY (id);


--
-- Name: workflow_definitions workflow_definitions_companyId_requestType_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT "workflow_definitions_companyId_requestType_key" UNIQUE ("companyId", "requestType");


--
-- Name: workflow_definitions workflow_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);


--
-- Name: workflow_instances workflow_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_actions workflow_step_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_actions
    ADD CONSTRAINT workflow_step_actions_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_definitionId_stepOrder_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT "workflow_steps_definitionId_stepOrder_key" UNIQUE ("definitionId", "stepOrder");


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: zatca_settings zatca_settings_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_settings
    ADD CONSTRAINT "zatca_settings_companyId_key" UNIQUE ("companyId");


--
-- Name: zatca_settings zatca_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_settings
    ADD CONSTRAINT zatca_settings_pkey PRIMARY KEY (id);


--
-- Name: zatca_submission_log zatca_submission_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_submission_log
    ADD CONSTRAINT zatca_submission_log_pkey PRIMARY KEY (id);


--
-- Name: accounting_mappings_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounting_mappings_company_idx ON public.accounting_mappings USING btree ("companyId");


--
-- Name: anon_reviews_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anon_reviews_cycle_idx ON public.anonymous_upward_reviews USING btree ("cycleId");


--
-- Name: anon_reviews_manager_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX anon_reviews_manager_idx ON public.anonymous_upward_reviews USING btree ("managerId");


--
-- Name: anon_reviews_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX anon_reviews_token_idx ON public.anonymous_upward_reviews USING btree ("cycleId", "managerId", "submissionToken") WHERE ("submissionToken" IS NOT NULL);


--
-- Name: approval_chains_company_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_chains_company_type_idx ON public.approval_chains USING btree ("companyId", "chainType");


--
-- Name: approval_requests_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_ref_idx ON public.approval_requests USING btree ("refType", "refId");


--
-- Name: approval_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_requests_status_idx ON public.approval_requests USING btree (status) WHERE ((status)::text = 'pending'::text);


--
-- Name: audit_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_company_idx ON public.audit_logs USING btree ("companyId");


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree ("createdAt");


--
-- Name: audit_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_idx ON public.audit_logs USING btree ("createdAt" DESC);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity, "entityId");


--
-- Name: audit_logs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_user_idx ON public.audit_logs USING btree ("userId");


--
-- Name: automation_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_logs_company_idx ON public.automation_logs USING btree ("companyId");


--
-- Name: automation_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_logs_created_idx ON public.automation_logs USING btree ("createdAt" DESC);


--
-- Name: automation_logs_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automation_logs_type_idx ON public.automation_logs USING btree ("automationType");


--
-- Name: budget_lines_budget_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX budget_lines_budget_idx ON public.budget_lines USING btree ("budgetId");


--
-- Name: chart_of_accounts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chart_of_accounts_company_idx ON public.chart_of_accounts USING btree ("companyId");


--
-- Name: chart_of_accounts_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chart_of_accounts_deleted_at_idx ON public.chart_of_accounts USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: crm_contacts_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_client_idx ON public.crm_contacts USING btree ("clientId");


--
-- Name: crm_contacts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_contacts_company_idx ON public.crm_contacts USING btree ("companyId");


--
-- Name: crm_pipeline_stages_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crm_pipeline_stages_company_idx ON public.crm_pipeline_stages USING btree ("companyId");


--
-- Name: cron_locks_job_name_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cron_locks_job_name_uq ON public.cron_locks USING btree (job_name);


--
-- Name: deduction_rules_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deduction_rules_company_idx ON public.deduction_rules USING btree ("companyId");


--
-- Name: employee_assignments_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_assignments_company_status_idx ON public.employee_assignments USING btree ("companyId", status);


--
-- Name: employee_contracts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_contracts_company_idx ON public.employee_contracts USING btree ("companyId");


--
-- Name: employee_contracts_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_contracts_employee_idx ON public.employee_contracts USING btree ("employeeId");


--
-- Name: employee_contracts_probation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_contracts_probation_idx ON public.employee_contracts USING btree ("probationEndDate") WHERE (("probationStatus")::text = 'active'::text);


--
-- Name: employee_documents_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_documents_company_idx ON public.employee_documents USING btree ("companyId");


--
-- Name: employee_documents_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_documents_employee_idx ON public.employee_documents USING btree ("employeeId");


--
-- Name: employee_documents_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_documents_expiry_idx ON public.employee_documents USING btree ("expiryDate");


--
-- Name: employee_violations_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_violations_deleted_at_idx ON public.employee_violations USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: eval_participants_cycle_evaluator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX eval_participants_cycle_evaluator_idx ON public.evaluation_participants USING btree ("cycleId", "evaluatorId");


--
-- Name: eval_participants_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_participants_cycle_idx ON public.evaluation_participants USING btree ("cycleId");


--
-- Name: eval_participants_evaluator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX eval_participants_evaluator_idx ON public.evaluation_participants USING btree ("evaluatorId");


--
-- Name: evaluation_cycles_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evaluation_cycles_company_idx ON public.evaluation_cycles USING btree ("companyId");


--
-- Name: evaluation_cycles_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evaluation_cycles_employee_idx ON public.evaluation_cycles USING btree ("employeeId");


--
-- Name: evaluation_summaries_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evaluation_summaries_company_idx ON public.evaluation_summaries USING btree ("companyId");


--
-- Name: evaluation_summaries_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX evaluation_summaries_cycle_idx ON public.evaluation_summaries USING btree ("cycleId");


--
-- Name: evaluation_summaries_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evaluation_summaries_employee_idx ON public.evaluation_summaries USING btree ("employeeId");


--
-- Name: expense_claims_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expense_claims_company_idx ON public.expense_claims USING btree ("companyId");


--
-- Name: expense_claims_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expense_claims_deleted_at_idx ON public.expense_claims USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: expense_claims_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expense_claims_employee_idx ON public.expense_claims USING btree ("employeeId");


--
-- Name: expense_claims_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expense_claims_status_idx ON public.expense_claims USING btree (status);


--
-- Name: fixed_assets_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fixed_assets_company_idx ON public.fixed_assets USING btree ("companyId");


--
-- Name: fleet_insurance_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fleet_insurance_expiry_idx ON public.fleet_insurance USING btree ("endDate");


--
-- Name: fleet_insurance_vehicle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fleet_insurance_vehicle_idx ON public.fleet_insurance USING btree ("vehicleId");


--
-- Name: fleet_violations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fleet_violations_company_idx ON public.fleet_violations USING btree ("companyId");


--
-- Name: fleet_violations_vehicle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fleet_violations_vehicle_idx ON public.fleet_violations USING btree ("vehicleId");


--
-- Name: hr_disc_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_disc_active_idx ON public.hr_discipline_regulation USING btree ("isActive") WHERE ("deletedAt" IS NULL);


--
-- Name: hr_disc_company_article_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hr_disc_company_article_unique ON public.hr_discipline_regulation USING btree ("companyId", section, "articleNumber") WHERE (("companyId" IS NOT NULL) AND ("deletedAt" IS NULL));


--
-- Name: hr_disc_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_disc_company_idx ON public.hr_discipline_regulation USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: hr_disc_section_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_disc_section_idx ON public.hr_discipline_regulation USING btree (section) WHERE ("deletedAt" IS NULL);


--
-- Name: hr_disc_template_article_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hr_disc_template_article_unique ON public.hr_discipline_regulation USING btree (section, "articleNumber") WHERE (("companyId" IS NULL) AND ("deletedAt" IS NULL));


--
-- Name: hr_memo_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_assignment_idx ON public.hr_inquiry_memos USING btree ("assignmentId") WHERE ("deletedAt" IS NULL);


--
-- Name: hr_memo_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_company_idx ON public.hr_inquiry_memos USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: hr_memo_events_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_events_action_idx ON public.hr_inquiry_memo_events USING btree (action);


--
-- Name: hr_memo_events_memo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_events_memo_idx ON public.hr_inquiry_memo_events USING btree ("memoId");


--
-- Name: hr_memo_incident_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_incident_date_idx ON public.hr_inquiry_memos USING btree ("incidentDate");


--
-- Name: hr_memo_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hr_memo_number_unique ON public.hr_inquiry_memos USING btree ("companyId", "memoNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: hr_memo_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_status_idx ON public.hr_inquiry_memos USING btree (status) WHERE ("deletedAt" IS NULL);


--
-- Name: hr_memo_violation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_violation_idx ON public.hr_inquiry_memos USING btree ("violationId") WHERE ("violationId" IS NOT NULL);


--
-- Name: idx_alert_fatigue_settings_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_fatigue_settings_assignment ON public.alert_fatigue_settings USING btree ("assignmentId");


--
-- Name: idx_alert_mute_rules_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_mute_rules_assignment ON public.alert_mute_rules USING btree ("assignmentId");


--
-- Name: idx_alert_mute_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_mute_rules_company ON public.alert_mute_rules USING btree ("companyId");


--
-- Name: idx_applicant_accounts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applicant_accounts_email ON public.applicant_accounts USING btree (email);


--
-- Name: idx_approval_actions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_actions_company ON public.approval_actions USING btree ("companyId");


--
-- Name: idx_approval_actions_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_actions_entity ON public.approval_actions USING btree ("entityType", "entityId");


--
-- Name: idx_audit_violations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_company ON public.audit_violations USING btree ("companyId");


--
-- Name: idx_audit_violations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_date ON public.audit_violations USING btree ("auditDate");


--
-- Name: idx_audit_violations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_department ON public.audit_violations USING btree (department);


--
-- Name: idx_audit_violations_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_priority ON public.audit_violations USING btree (priority);


--
-- Name: idx_audit_violations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_status ON public.audit_violations USING btree (status);


--
-- Name: idx_audit_violations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_violations_type ON public.audit_violations USING btree (type);


--
-- Name: idx_bank_guarantees_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_guarantees_company ON public.bank_guarantees USING btree ("companyId");


--
-- Name: idx_bank_guarantees_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_guarantees_deleted_at ON public.bank_guarantees USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_bank_guarantees_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_guarantees_expiry ON public.bank_guarantees USING btree ("companyId", "expiryDate");


--
-- Name: idx_bank_statements_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_statements_batch ON public.bank_statements USING btree ("importBatchId");


--
-- Name: idx_bank_statements_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_statements_company ON public.bank_statements USING btree ("companyId");


--
-- Name: idx_budget_approval_requests_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_approval_requests_deleted_at ON public.budget_approval_requests USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_business_rule_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rule_logs_company ON public.business_rule_logs USING btree ("companyId");


--
-- Name: idx_business_rule_logs_executed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rule_logs_executed ON public.business_rule_logs USING btree ("executedAt");


--
-- Name: idx_business_rule_logs_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rule_logs_rule ON public.business_rule_logs USING btree ("ruleId");


--
-- Name: idx_business_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rules_active ON public.business_rules USING btree ("isActive");


--
-- Name: idx_business_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rules_company ON public.business_rules USING btree ("companyId");


--
-- Name: idx_business_rules_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rules_trigger ON public.business_rules USING btree ("triggerEvent");


--
-- Name: idx_capa_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capa_company ON public.governance_capa USING btree ("companyId");


--
-- Name: idx_client_portal_accounts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_portal_accounts_client ON public.client_portal_accounts USING btree ("clientId", "companyId");


--
-- Name: idx_client_portal_accounts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_client_portal_accounts_email ON public.client_portal_accounts USING btree (email);


--
-- Name: idx_comp_actions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_actions_company ON public.policy_compliance_actions USING btree ("companyId");


--
-- Name: idx_crm_opportunities_converted_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_opportunities_converted_client ON public.crm_opportunities USING btree ("convertedClientId") WHERE ("convertedClientId" IS NOT NULL);


--
-- Name: idx_csat_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csat_assignee ON public.ticket_csat_ratings USING btree ("assigneeId");


--
-- Name: idx_csat_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_csat_company ON public.ticket_csat_ratings USING btree ("companyId");


--
-- Name: idx_custom_roles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_roles_company ON public.custom_roles USING btree ("companyId");


--
-- Name: idx_data_access_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_requests_company ON public.data_access_requests USING btree ("companyId");


--
-- Name: idx_data_access_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_requests_status ON public.data_access_requests USING btree (status);


--
-- Name: idx_delivery_log_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_channel ON public.notification_delivery_log USING btree (channel);


--
-- Name: idx_delivery_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_company ON public.notification_delivery_log USING btree ("companyId");


--
-- Name: idx_delivery_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_created ON public.notification_delivery_log USING btree ("createdAt");


--
-- Name: idx_delivery_log_notification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_notification ON public.notification_delivery_log USING btree ("notificationId");


--
-- Name: idx_delivery_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_log_status ON public.notification_delivery_log USING btree (status);


--
-- Name: idx_depreciation_entries_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_depreciation_entries_asset ON public.depreciation_entries USING btree ("assetId");


--
-- Name: idx_doc_entity_links_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_entity_links_entity ON public.document_entity_links USING btree ("entityType", "entityId");


--
-- Name: idx_doc_versions_docid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_versions_docid ON public.document_versions USING btree ("documentId");


--
-- Name: idx_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_category ON public.documents USING btree (category);


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_ea_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ea_manager_id ON public.employee_assignments USING btree ("managerId");


--
-- Name: idx_employee_assignments_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_manager_id ON public.employee_assignments USING btree ("managerId");


--
-- Name: idx_entity_comments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_comments_company ON public.entity_comments USING btree ("companyId");


--
-- Name: idx_entity_comments_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_comments_entity ON public.entity_comments USING btree ("entityType", "entityId");


--
-- Name: idx_entity_tags_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_tags_company ON public.entity_tags USING btree ("companyId");


--
-- Name: idx_entity_tags_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_tags_entity ON public.entity_tags USING btree ("entityType", "entityId");


--
-- Name: idx_entity_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_tags_tag ON public.entity_tags USING btree (tag, "companyId");


--
-- Name: idx_fallback_chains_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fallback_chains_company ON public.notification_fallback_chains USING btree ("companyId");


--
-- Name: idx_financial_periods_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_company ON public.financial_periods USING btree ("companyId");


--
-- Name: idx_financial_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_dates ON public.financial_periods USING btree ("companyId", "startDate", "endDate");


--
-- Name: idx_financial_periods_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_deleted_at ON public.financial_periods USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_financial_periods_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_status ON public.financial_periods USING btree ("companyId", status);


--
-- Name: idx_fixed_assets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fixed_assets_company ON public.fixed_assets USING btree ("companyId");


--
-- Name: idx_goods_receipts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipts_company ON public.goods_receipts USING btree ("companyId");


--
-- Name: idx_goods_receipts_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goods_receipts_po ON public.goods_receipts USING btree ("poId");


--
-- Name: idx_gov_integrations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gov_integrations_company ON public.gov_integrations USING btree ("companyId");


--
-- Name: idx_gov_integrations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gov_integrations_type ON public.gov_integrations USING btree (type);


--
-- Name: idx_gov_links_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gov_links_company ON public.gov_integration_links USING btree ("companyId");


--
-- Name: idx_gov_links_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gov_links_entity ON public.gov_integration_links USING btree ("entityType", "entityId");


--
-- Name: idx_gov_links_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gov_links_integration ON public.gov_integration_links USING btree ("integrationId");


--
-- Name: idx_gov_links_unique_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_gov_links_unique_entity ON public.gov_integration_links USING btree ("companyId", "integrationId", "entityType", "entityId");


--
-- Name: idx_grn_items_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_grn ON public.goods_receipt_items USING btree ("grnId");


--
-- Name: idx_grn_items_po_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_po_item ON public.goods_receipt_items USING btree ("poItemId");


--
-- Name: idx_integration_logs_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_logs_channel ON public.integration_logs USING btree (channel);


--
-- Name: idx_integration_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_logs_company ON public.integration_logs USING btree ("companyId");


--
-- Name: idx_integration_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_logs_status ON public.integration_logs USING btree (status);


--
-- Name: idx_integrations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_company ON public.integrations USING btree ("companyId");


--
-- Name: idx_intercompany_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercompany_from ON public.intercompany_transactions USING btree ("fromCompanyId");


--
-- Name: idx_intercompany_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercompany_to ON public.intercompany_transactions USING btree ("toCompanyId");


--
-- Name: idx_intercompany_transactions_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercompany_transactions_deleted_at ON public.intercompany_transactions USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_inv_payments_inv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_payments_inv ON public.invoice_payments USING btree ("invoiceId");


--
-- Name: idx_inv_payments_txref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inv_payments_txref ON public.invoice_payments USING btree ("transactionRef") WHERE ("transactionRef" IS NOT NULL);


--
-- Name: idx_job_titles_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_titles_category ON public.job_titles USING btree (category);


--
-- Name: idx_job_titles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_titles_company ON public.job_titles USING btree ("companyId");


--
-- Name: idx_journal_entries_reversal_of; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_reversal_of ON public.journal_entries USING btree ("reversalOfId") WHERE ("reversalOfId" IS NOT NULL);


--
-- Name: idx_judgments_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_judgments_case ON public.legal_judgments USING btree ("caseId");


--
-- Name: idx_judgments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_judgments_company ON public.legal_judgments USING btree ("companyId");


--
-- Name: idx_kb_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_company ON public.kb_articles USING btree ("companyId");


--
-- Name: idx_kb_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_status ON public.kb_articles USING btree (status);


--
-- Name: idx_late_rent_actions_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_late_rent_actions_contract ON public.late_rent_actions USING btree ("contractId");


--
-- Name: idx_late_rent_actions_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_late_rent_actions_payment ON public.late_rent_actions USING btree ("paymentId");


--
-- Name: idx_late_rent_actions_phase; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_late_rent_actions_phase ON public.late_rent_actions USING btree (phase);


--
-- Name: idx_legal_contracts_renewed_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_contracts_renewed_from ON public.legal_contracts USING btree ("renewedFromId") WHERE ("renewedFromId" IS NOT NULL);


--
-- Name: idx_legal_corr_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_corr_case ON public.legal_correspondence USING btree ("caseId");


--
-- Name: idx_legal_corr_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_corr_company ON public.legal_correspondence USING btree ("companyId");


--
-- Name: idx_notif_pref_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_pref_company ON public.notification_preferences USING btree ("companyId");


--
-- Name: idx_notif_pref_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_pref_user ON public.notification_preferences USING btree ("userId");


--
-- Name: idx_notif_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_templates_company ON public.notification_templates USING btree ("companyId");


--
-- Name: idx_notif_templates_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_templates_key ON public.notification_templates USING btree ("templateKey");


--
-- Name: idx_notif_webhooks_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_webhooks_active ON public.notification_webhooks USING btree ("isActive");


--
-- Name: idx_notif_webhooks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_webhooks_company ON public.notification_webhooks USING btree ("companyId");


--
-- Name: idx_password_reset_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_pending ON public.password_reset_requests USING btree (status, "createdAt");


--
-- Name: idx_payment_schedule_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_schedule_company ON public.contract_payment_schedule USING btree ("companyId");


--
-- Name: idx_payment_schedule_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_schedule_contract ON public.contract_payment_schedule USING btree ("contractId");


--
-- Name: idx_payment_schedule_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_schedule_due ON public.contract_payment_schedule USING btree ("dueDate");


--
-- Name: idx_payment_schedule_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_schedule_status ON public.contract_payment_schedule USING btree (status);


--
-- Name: idx_policy_module_links_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_module_links_module ON public.policy_module_links USING btree (module);


--
-- Name: idx_policy_module_links_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_module_links_policy ON public.policy_module_links USING btree ("policyId");


--
-- Name: idx_privacy_consent_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_consent_company ON public.privacy_consent_records USING btree ("companyId");


--
-- Name: idx_privacy_consent_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_privacy_consent_user ON public.privacy_consent_records USING btree ("userId");


--
-- Name: idx_processing_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_log_company ON public.processing_activities_log USING btree ("companyId");


--
-- Name: idx_processing_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_log_created ON public.processing_activities_log USING btree ("createdAt");


--
-- Name: idx_processing_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_processing_log_type ON public.processing_activities_log USING btree ("activityType");


--
-- Name: idx_projects_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company ON public.projects USING btree ("companyId");


--
-- Name: idx_property_buildings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_buildings_company ON public.property_buildings USING btree ("companyId");


--
-- Name: idx_property_owners_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_owners_company ON public.property_owners USING btree ("companyId");


--
-- Name: idx_public_announcements_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_announcements_active ON public.public_announcements USING btree ("isActive", "publishedAt");


--
-- Name: idx_push_subscriptions_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_assignment ON public.push_subscriptions USING btree ("assignmentId");


--
-- Name: idx_push_subscriptions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_company ON public.push_subscriptions USING btree ("companyId");


--
-- Name: idx_recurring_journal_runs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_journal_runs_parent ON public.recurring_journal_runs USING btree ("recurringJournalId");


--
-- Name: idx_recurring_journals_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_journals_company ON public.recurring_journals USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_recurring_journals_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recurring_journals_next_run ON public.recurring_journals USING btree ("nextRunDate") WHERE ((active = true) AND ("deletedAt" IS NULL));


--
-- Name: idx_refresh_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens USING btree (token);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree ("userId");


--
-- Name: idx_rent_payments_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rent_payments_contract ON public.rent_payments USING btree ("contractId");


--
-- Name: idx_rent_payments_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rent_payments_due ON public.rent_payments USING btree ("dueDate");


--
-- Name: idx_rent_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rent_payments_status ON public.rent_payments USING btree (status);


--
-- Name: idx_rfm_churn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_churn ON public.client_rfm_scores USING btree ("companyId", "churnRisk");


--
-- Name: idx_rfm_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_company ON public.client_rfm_scores USING btree ("companyId");


--
-- Name: idx_rfm_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_segment ON public.client_rfm_scores USING btree ("companyId", segment);


--
-- Name: idx_role_permissions_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);


--
-- Name: idx_routing_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_rules_company ON public.notification_routing_rules USING btree ("companyId");


--
-- Name: idx_routing_rules_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_rules_event ON public.notification_routing_rules USING btree ("eventCategory");


--
-- Name: idx_security_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_log_company ON public.security_log USING btree ("companyId");


--
-- Name: idx_security_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_log_created ON public.security_log USING btree ("createdAt" DESC);


--
-- Name: idx_security_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_security_log_user ON public.security_log USING btree ("userId");


--
-- Name: idx_sig_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sig_logs_company ON public.digital_signature_logs USING btree ("companyId");


--
-- Name: idx_sig_logs_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sig_logs_doc ON public.digital_signature_logs USING btree ("documentId");


--
-- Name: idx_sig_otps_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sig_otps_doc ON public.digital_signature_otps USING btree ("documentId");


--
-- Name: idx_store_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_order_items_order ON public.store_order_items USING btree ("orderId");


--
-- Name: idx_tenants_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_company ON public.tenants USING btree ("companyId");


--
-- Name: idx_tenants_national_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_national_id ON public.tenants USING btree ("nationalId");


--
-- Name: idx_ual_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ual_company ON public.user_activity_log USING btree ("companyId");


--
-- Name: idx_ual_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ual_created ON public.user_activity_log USING btree ("createdAt");


--
-- Name: idx_ual_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ual_user ON public.user_activity_log USING btree ("companyId", "userId");


--
-- Name: idx_umrah_pilgrim_passport_season; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_umrah_pilgrim_passport_season ON public.umrah_pilgrims USING btree ("companyId", "passportNumber", "seasonId");


--
-- Name: idx_wf_instances_assignee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instances_assignee ON public.workflow_instances USING btree ("currentAssignee");


--
-- Name: idx_wf_instances_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instances_company ON public.workflow_instances USING btree ("companyId");


--
-- Name: idx_wf_instances_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instances_ref ON public.workflow_instances USING btree ("refTable", "refId");


--
-- Name: idx_wf_instances_sla; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instances_sla ON public.workflow_instances USING btree ("slaStatus") WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_wf_instances_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_instances_status ON public.workflow_instances USING btree (status);


--
-- Name: idx_wf_step_actions_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wf_step_actions_instance ON public.workflow_step_actions USING btree ("instanceId");


--
-- Name: idx_zatca_log_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zatca_log_company ON public.zatca_submission_log USING btree ("companyId");


--
-- Name: idx_zatca_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zatca_log_entity ON public.zatca_submission_log USING btree ("entityType", "entityId");


--
-- Name: idx_zatca_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zatca_log_status ON public.zatca_submission_log USING btree (status);


--
-- Name: integration_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_logs_created_at_idx ON public.integration_logs USING btree ("createdAt");


--
-- Name: invoices_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_company_status_idx ON public.invoices USING btree ("companyId", status) WHERE ("deletedAt" IS NULL);


--
-- Name: invoices_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_deleted_at_idx ON public.invoices USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: invoices_due_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_due_date_idx ON public.invoices USING btree ("dueDate") WHERE ("deletedAt" IS NULL);


--
-- Name: invoices_ref_company_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invoices_ref_company_uq ON public.invoices USING btree ("companyId", ref) WHERE ("deletedAt" IS NULL);


--
-- Name: jet_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jet_company_idx ON public.journal_entry_templates USING btree ("companyId");


--
-- Name: jet_lines_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jet_lines_template_idx ON public.journal_entry_template_lines USING btree ("templateId");


--
-- Name: journal_entries_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_company_created_idx ON public.journal_entries USING btree ("companyId", "createdAt" DESC) WHERE ("deletedAt" IS NULL);


--
-- Name: journal_entries_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_company_idx ON public.journal_entries USING btree ("companyId");


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_date_idx ON public.journal_entries USING btree (date);


--
-- Name: journal_entries_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_deleted_at_idx ON public.journal_entries USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: journal_lines_journal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_lines_journal_idx ON public.journal_lines USING btree ("journalId");


--
-- Name: leave_balances_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_balances_company_idx ON public.leave_balances USING btree ("companyId");


--
-- Name: leave_balances_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_balances_employee_idx ON public.leave_balances USING btree ("employeeId");


--
-- Name: official_letters_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX official_letters_created_by_idx ON public.official_letters USING btree ("createdByAssignmentId");


--
-- Name: official_letters_status_sent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX official_letters_status_sent_idx ON public.official_letters USING btree (status, "sentAt");


--
-- Name: onboarding_tasks_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_tasks_company_idx ON public.onboarding_tasks USING btree ("companyId");


--
-- Name: onboarding_tasks_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onboarding_tasks_employee_idx ON public.onboarding_tasks USING btree ("employeeId");


--
-- Name: payroll_lines_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_lines_deleted_at_idx ON public.payroll_lines USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: payroll_runs_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_runs_deleted_at_idx ON public.payroll_runs USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: peer_evaluations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX peer_evaluations_company_idx ON public.peer_evaluations USING btree ("companyId");


--
-- Name: peer_evaluations_cycle_evaluator_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX peer_evaluations_cycle_evaluator_idx ON public.peer_evaluations USING btree ("cycleId", "evaluatorId");


--
-- Name: peer_evaluations_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX peer_evaluations_employee_idx ON public.peer_evaluations USING btree ("employeeId");


--
-- Name: performance_reviews_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX performance_reviews_company_idx ON public.performance_reviews USING btree ("companyId");


--
-- Name: performance_reviews_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX performance_reviews_employee_idx ON public.performance_reviews USING btree ("employeeId");


--
-- Name: permissions_user_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permissions_user_company_idx ON public.permissions USING btree ("userId", "companyId");


--
-- Name: permissions_user_perm_company_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_user_perm_company_uq ON public.permissions USING btree ("userId", permission, "companyId") WHERE ("companyId" IS NOT NULL);


--
-- Name: permissions_user_perm_global_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_user_perm_global_uq ON public.permissions USING btree ("userId", permission) WHERE ("companyId" IS NULL);


--
-- Name: proactive_rules_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proactive_rules_company_idx ON public.proactive_rules USING btree ("companyId");


--
-- Name: proactive_rules_name_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX proactive_rules_name_company_idx ON public.proactive_rules USING btree (name, "companyId");


--
-- Name: proactive_rules_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX proactive_rules_name_idx ON public.proactive_rules USING btree (name);


--
-- Name: property_buildings_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_buildings_company_idx ON public.property_buildings USING btree ("companyId");


--
-- Name: purchase_orders_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_company_status_idx ON public.purchase_orders USING btree ("companyId", status) WHERE ("deletedAt" IS NULL);


--
-- Name: purchase_orders_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_orders_deleted_at_idx ON public.purchase_orders USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: purchase_orders_ref_company_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_orders_ref_company_uq ON public.purchase_orders USING btree ("companyId", ref);


--
-- Name: purchase_requests_ref_company_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_requests_ref_company_uq ON public.purchase_requests USING btree ("companyId", ref);


--
-- Name: quality_checks_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quality_checks_company_idx ON public.quality_checks USING btree ("companyId");


--
-- Name: role_permissions_role_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_permissions_role_company_idx ON public.role_permissions USING btree (role, "companyId");


--
-- Name: role_permissions_role_perm_company_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_perm_company_uq ON public.role_permissions USING btree (role, permission, "companyId") WHERE ("companyId" IS NOT NULL);


--
-- Name: role_permissions_role_perm_global_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_permissions_role_perm_global_uq ON public.role_permissions USING btree (role, permission) WHERE ("companyId" IS NULL);


--
-- Name: salary_components_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX salary_components_company_idx ON public.salary_components USING btree ("companyId");


--
-- Name: settings_scope_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX settings_scope_id_idx ON public.settings USING btree (scope, "scopeId");


--
-- Name: settings_scoped_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settings_scoped_key_uq ON public.settings USING btree (scope, "scopeId", key) WHERE ("scopeId" IS NOT NULL);


--
-- Name: settings_system_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX settings_system_key_uq ON public.settings USING btree (scope, key) WHERE ("scopeId" IS NULL);


--
-- Name: stock_transfer_items_transfer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfer_items_transfer_idx ON public.stock_transfer_items USING btree ("transferId");


--
-- Name: stock_transfers_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_transfers_company_idx ON public.stock_transfers USING btree ("companyId");


--
-- Name: subsidiary_accounts_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subsidiary_accounts_company_idx ON public.subsidiary_accounts USING btree ("companyId");


--
-- Name: subsidiary_accounts_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subsidiary_accounts_entity_idx ON public.subsidiary_accounts USING btree ("companyId", "entityType", "entityId");


--
-- Name: system_evaluations_cycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_evaluations_cycle_idx ON public.system_evaluations USING btree ("cycleId");


--
-- Name: system_settings_key_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_key_uq ON public.system_settings USING btree (key) WHERE (("companyId" IS NULL) AND ("branchId" IS NULL));


--
-- Name: ticket_escalations_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_escalations_ticket_idx ON public.ticket_escalations USING btree ("ticketId");


--
-- Name: training_programs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_programs_company_idx ON public.training_programs USING btree ("companyId");


--
-- Name: uq_goods_receipts_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_goods_receipts_ref ON public.goods_receipts USING btree ("companyId", ref);


--
-- Name: user_roles_userId_roleKey_companyId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_roles_userId_roleKey_companyId_key" ON public.user_roles USING btree ("userId", "roleKey", "companyId");


--
-- Name: viol_memo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viol_memo_idx ON public.employee_violations USING btree ("inquiryMemoId") WHERE ("inquiryMemoId" IS NOT NULL);


--
-- Name: viol_regulation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX viol_regulation_idx ON public.employee_violations USING btree ("regulationId") WHERE ("regulationId" IS NOT NULL);


--
-- Name: accounting_mappings accounting_mappings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings
    ADD CONSTRAINT "accounting_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: accounting_mappings accounting_mappings_creditAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings
    ADD CONSTRAINT "accounting_mappings_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;


--
-- Name: accounting_mappings accounting_mappings_debitAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_mappings
    ADD CONSTRAINT "accounting_mappings_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;


--
-- Name: alert_fatigue_settings alert_fatigue_settings_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_fatigue_settings
    ADD CONSTRAINT "alert_fatigue_settings_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id) ON DELETE CASCADE;


--
-- Name: alert_fatigue_settings alert_fatigue_settings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_fatigue_settings
    ADD CONSTRAINT "alert_fatigue_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: alert_mute_rules alert_mute_rules_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mute_rules
    ADD CONSTRAINT "alert_mute_rules_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id) ON DELETE CASCADE;


--
-- Name: alert_mute_rules alert_mute_rules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mute_rules
    ADD CONSTRAINT "alert_mute_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: anonymous_upward_reviews anonymous_upward_reviews_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_upward_reviews
    ADD CONSTRAINT "anonymous_upward_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: anonymous_upward_reviews anonymous_upward_reviews_cycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_upward_reviews
    ADD CONSTRAINT "anonymous_upward_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE;


--
-- Name: anonymous_upward_reviews anonymous_upward_reviews_managerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymous_upward_reviews
    ADD CONSTRAINT "anonymous_upward_reviews_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: approval_actions approval_actions_actionBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions
    ADD CONSTRAINT "approval_actions_actionBy_fkey" FOREIGN KEY ("actionBy") REFERENCES public.users(id);


--
-- Name: approval_chain_steps approval_chain_steps_chainId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chain_steps
    ADD CONSTRAINT "approval_chain_steps_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES public.approval_chains(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_chainId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT "approval_requests_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES public.approval_chains(id);


--
-- Name: approval_requests approval_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT "approval_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: attendance attendance_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT "attendance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: bank_guarantees bank_guarantees_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_guarantees
    ADD CONSTRAINT "bank_guarantees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: bank_guarantees bank_guarantees_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_guarantees
    ADD CONSTRAINT "bank_guarantees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: bank_guarantees bank_guarantees_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_guarantees
    ADD CONSTRAINT "bank_guarantees_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.employee_assignments(id);


--
-- Name: bi_dashboards bi_dashboards_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_dashboards
    ADD CONSTRAINT "bi_dashboards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: bi_kpis bi_kpis_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_kpis
    ADD CONSTRAINT "bi_kpis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: bi_reports bi_reports_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bi_reports
    ADD CONSTRAINT "bi_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: branches branches_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: budget_lines budget_lines_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT "budget_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id);


--
-- Name: budget_lines budget_lines_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_lines
    ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: budgets budgets_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT "budgets_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: budgets budgets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT "budgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: budgets budgets_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT "budgets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: business_rule_logs business_rule_logs_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rule_logs
    ADD CONSTRAINT "business_rule_logs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES public.business_rules(id) ON DELETE SET NULL;


--
-- Name: business_rules business_rules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_rules
    ADD CONSTRAINT "business_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: chart_of_accounts chart_of_accounts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT "chart_of_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: client_portal_accounts client_portal_accounts_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_portal_accounts
    ADD CONSTRAINT "client_portal_accounts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_rfm_scores client_rfm_scores_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_rfm_scores
    ADD CONSTRAINT "client_rfm_scores_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: client_rfm_scores client_rfm_scores_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_rfm_scores
    ADD CONSTRAINT "client_rfm_scores_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: clients clients_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: contract_payment_schedule contract_payment_schedule_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule
    ADD CONSTRAINT "contract_payment_schedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contract_payment_schedule contract_payment_schedule_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule
    ADD CONSTRAINT "contract_payment_schedule_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.rental_contracts(id) ON DELETE CASCADE;


--
-- Name: crm_activities crm_activities_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_activities
    ADD CONSTRAINT "crm_activities_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public.crm_opportunities(id);


--
-- Name: crm_contacts crm_contacts_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT "crm_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: crm_contacts crm_contacts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT "crm_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: crm_contacts crm_contacts_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contacts
    ADD CONSTRAINT "crm_contacts_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;


--
-- Name: crm_opportunities crm_opportunities_pipelineStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opportunities
    ADD CONSTRAINT "crm_opportunities_pipelineStageId_fkey" FOREIGN KEY ("pipelineStageId") REFERENCES public.crm_pipeline_stages(id);


--
-- Name: crm_pipeline_stages crm_pipeline_stages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_pipeline_stages
    ADD CONSTRAINT "crm_pipeline_stages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cron_logs cron_logs_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cron_logs
    ADD CONSTRAINT "cron_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public.cron_jobs(id);


--
-- Name: data_access_requests data_access_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_requests
    ADD CONSTRAINT "data_access_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: data_access_requests data_access_requests_requesterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_requests
    ADD CONSTRAINT "data_access_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES public.employees(id);


--
-- Name: data_retention_policies data_retention_policies_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT "data_retention_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: deduction_rules deduction_rules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_rules
    ADD CONSTRAINT "deduction_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: departments departments_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT "departments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: departments departments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: depreciation_entries depreciation_entries_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_entries
    ADD CONSTRAINT "depreciation_entries_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public.fixed_assets(id);


--
-- Name: document_entity_links document_entity_links_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_entity_links
    ADD CONSTRAINT "document_entity_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_folders document_folders_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_folders
    ADD CONSTRAINT "document_folders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_templates document_templates_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT "document_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: document_templates document_templates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_templates
    ADD CONSTRAINT "document_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: employee_assignments employee_assignments_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: employee_assignments employee_assignments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: employee_assignments employee_assignments_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public.departments(id);


--
-- Name: employee_assignments employee_assignments_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: employee_assignments employee_assignments_jobTitleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES public.job_titles(id);


--
-- Name: employee_assignments employee_assignments_managerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments
    ADD CONSTRAINT "employee_assignments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES public.employees(id) ON DELETE SET NULL;


--
-- Name: employee_documents employee_documents_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT "employee_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: employee_documents employee_documents_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_documents employee_documents_uploadedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT "employee_documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES public.users(id);


--
-- Name: employee_of_month employee_of_month_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT "employee_of_month_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: employee_of_month employee_of_month_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT "employee_of_month_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: employee_of_month employee_of_month_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT "employee_of_month_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: employee_of_month employee_of_month_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_of_month
    ADD CONSTRAINT "employee_of_month_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: evaluation_cycles evaluation_cycles_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_cycles
    ADD CONSTRAINT "evaluation_cycles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: evaluation_cycles evaluation_cycles_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_cycles
    ADD CONSTRAINT "evaluation_cycles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: evaluation_cycles evaluation_cycles_initiatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_cycles
    ADD CONSTRAINT "evaluation_cycles_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES public.employees(id);


--
-- Name: evaluation_participants evaluation_participants_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_participants
    ADD CONSTRAINT "evaluation_participants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: evaluation_participants evaluation_participants_cycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_participants
    ADD CONSTRAINT "evaluation_participants_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE;


--
-- Name: evaluation_participants evaluation_participants_evaluatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_participants
    ADD CONSTRAINT "evaluation_participants_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: evaluation_summaries evaluation_summaries_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_summaries
    ADD CONSTRAINT "evaluation_summaries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: evaluation_summaries evaluation_summaries_cycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_summaries
    ADD CONSTRAINT "evaluation_summaries_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE;


--
-- Name: evaluation_summaries evaluation_summaries_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_summaries
    ADD CONSTRAINT "evaluation_summaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: expense_claims expense_claims_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims
    ADD CONSTRAINT "expense_claims_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: expense_claims expense_claims_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims
    ADD CONSTRAINT "expense_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: expense_claims expense_claims_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims
    ADD CONSTRAINT "expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: financial_periods financial_periods_closedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT "financial_periods_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES public.employee_assignments(id);


--
-- Name: financial_periods financial_periods_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT "financial_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: financial_periods financial_periods_lockedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT "financial_periods_lockedBy_fkey" FOREIGN KEY ("lockedBy") REFERENCES public.employee_assignments(id);


--
-- Name: financial_periods financial_periods_reopenedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT "financial_periods_reopenedBy_fkey" FOREIGN KEY ("reopenedBy") REFERENCES public.employee_assignments(id);


--
-- Name: fixed_assets fixed_assets_assignedTo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES public.employees(id);


--
-- Name: fixed_assets fixed_assets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: fleet_fuel_logs fleet_fuel_logs_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_fuel_logs
    ADD CONSTRAINT "fleet_fuel_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id);


--
-- Name: fleet_gps_tracking fleet_gps_tracking_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_gps_tracking
    ADD CONSTRAINT "fleet_gps_tracking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id);


--
-- Name: fleet_insurance fleet_insurance_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_insurance
    ADD CONSTRAINT "fleet_insurance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id);


--
-- Name: fleet_maintenance fleet_maintenance_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_maintenance
    ADD CONSTRAINT "fleet_maintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id);


--
-- Name: fleet_trips fleet_trips_driverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_trips
    ADD CONSTRAINT "fleet_trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public.fleet_drivers(id);


--
-- Name: fleet_trips fleet_trips_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_trips
    ADD CONSTRAINT "fleet_trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id);


--
-- Name: fleet_violations fleet_violations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_violations
    ADD CONSTRAINT "fleet_violations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: fleet_violations fleet_violations_driverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_violations
    ADD CONSTRAINT "fleet_violations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public.fleet_drivers(id) ON DELETE SET NULL;


--
-- Name: fleet_violations fleet_violations_vehicleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_violations
    ADD CONSTRAINT "fleet_violations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL;


--
-- Name: goods_receipt_items goods_receipt_items_grnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT "goods_receipt_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES public.goods_receipts(id) ON DELETE CASCADE;


--
-- Name: gov_integration_links gov_integration_links_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integration_links
    ADD CONSTRAINT "gov_integration_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: gov_integration_links gov_integration_links_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integration_links
    ADD CONSTRAINT "gov_integration_links_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public.gov_integrations(id) ON DELETE CASCADE;


--
-- Name: gov_integrations gov_integrations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gov_integrations
    ADD CONSTRAINT "gov_integrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: governance_audits governance_audits_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audits
    ADD CONSTRAINT "governance_audits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: governance_compliance governance_compliance_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_compliance
    ADD CONSTRAINT "governance_compliance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: governance_policies governance_policies_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT "governance_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: governance_policies governance_policies_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT "governance_policies_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.governance_policies(id);


--
-- Name: governance_risks governance_risks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_risks
    ADD CONSTRAINT "governance_risks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_discipline_regulation hr_discipline_regulation_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_discipline_regulation
    ADD CONSTRAINT "hr_discipline_regulation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: hr_inquiry_memo_events hr_inquiry_memo_events_memoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memo_events
    ADD CONSTRAINT "hr_inquiry_memo_events_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES public.hr_inquiry_memos(id) ON DELETE CASCADE;


--
-- Name: hr_inquiry_memos hr_inquiry_memos_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT "hr_inquiry_memos_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_inquiry_memos hr_inquiry_memos_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT "hr_inquiry_memos_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: hr_inquiry_memos hr_inquiry_memos_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT "hr_inquiry_memos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: hr_inquiry_memos hr_inquiry_memos_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT "hr_inquiry_memos_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: hr_inquiry_memos hr_inquiry_memos_regulationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_inquiry_memos
    ADD CONSTRAINT "hr_inquiry_memos_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES public.hr_discipline_regulation(id);


--
-- Name: hr_leave_balances hr_leave_balances_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT "hr_leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: hr_leave_balances hr_leave_balances_leaveTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_balances
    ADD CONSTRAINT "hr_leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES public.hr_leave_types(id);


--
-- Name: hr_leave_requests hr_leave_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_leave_requests hr_leave_requests_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: hr_leave_requests hr_leave_requests_leaveTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES public.hr_leave_types(id);


--
-- Name: hr_leave_types hr_leave_types_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT "hr_leave_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: integration_logs integration_logs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT "integration_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: integration_logs integration_logs_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT "integration_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT "integrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: intercompany_transactions intercompany_transactions_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT "intercompany_transactions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.employee_assignments(id);


--
-- Name: intercompany_transactions intercompany_transactions_fromCompanyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT "intercompany_transactions_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES public.companies(id);


--
-- Name: intercompany_transactions intercompany_transactions_fromJournalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT "intercompany_transactions_fromJournalId_fkey" FOREIGN KEY ("fromJournalId") REFERENCES public.journal_entries(id);


--
-- Name: intercompany_transactions intercompany_transactions_toCompanyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT "intercompany_transactions_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES public.companies(id);


--
-- Name: intercompany_transactions intercompany_transactions_toJournalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intercompany_transactions
    ADD CONSTRAINT "intercompany_transactions_toJournalId_fkey" FOREIGN KEY ("toJournalId") REFERENCES public.journal_entries(id);


--
-- Name: invoice_collection_stages invoice_collection_stages_invoice_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_collection_stages
    ADD CONSTRAINT invoice_collection_stages_invoice_id_fk FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_lines invoice_lines_invoice_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_lines
    ADD CONSTRAINT invoice_lines_invoice_id_fk FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: invoices invoices_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: invoices invoices_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.projects(id);


--
-- Name: job_applications job_applications_applicantAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT "job_applications_applicantAccountId_fkey" FOREIGN KEY ("applicantAccountId") REFERENCES public.applicant_accounts(id);


--
-- Name: job_applications job_applications_postingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_applications
    ADD CONSTRAINT "job_applications_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES public.job_postings(id);


--
-- Name: job_postings job_postings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_postings
    ADD CONSTRAINT "job_postings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: job_titles job_titles_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_titles
    ADD CONSTRAINT "job_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: journal_entries journal_entries_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.employee_assignments(id);


--
-- Name: journal_entries journal_entries_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: journal_entries journal_entries_postedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES public.users(id);


--
-- Name: journal_entries journal_entries_reviewedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES public.employee_assignments(id);


--
-- Name: journal_entry_template_lines journal_entry_template_lines_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_template_lines
    ADD CONSTRAINT "journal_entry_template_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;


--
-- Name: journal_entry_template_lines journal_entry_template_lines_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_template_lines
    ADD CONSTRAINT "journal_entry_template_lines_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.journal_entry_templates(id) ON DELETE CASCADE;


--
-- Name: journal_entry_templates journal_entry_templates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_templates
    ADD CONSTRAINT "journal_entry_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id);


--
-- Name: journal_lines journal_lines_journalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT "journal_lines_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES public.journal_entries(id);


--
-- Name: journal_lines journal_lines_journal_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_id_fk FOREIGN KEY ("journalId") REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: late_rent_actions late_rent_actions_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_rent_actions
    ADD CONSTRAINT "late_rent_actions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.rental_contracts(id);


--
-- Name: late_rent_actions late_rent_actions_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.late_rent_actions
    ADD CONSTRAINT "late_rent_actions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public.rent_payments(id);


--
-- Name: leave_approval_stages leave_approval_stages_request_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approval_stages
    ADD CONSTRAINT leave_approval_stages_request_id_fk FOREIGN KEY ("leaveRequestId") REFERENCES public.hr_leave_requests(id) ON DELETE CASCADE;


--
-- Name: leave_balances leave_balances_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT "leave_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: leave_balances leave_balances_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: leave_balances leave_balances_leaveTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES public.hr_leave_types(id) ON DELETE CASCADE;


--
-- Name: legal_correspondence legal_correspondence_caseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_correspondence
    ADD CONSTRAINT "legal_correspondence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES public.legal_cases(id) ON DELETE SET NULL;


--
-- Name: legal_judgments legal_judgments_caseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_judgments
    ADD CONSTRAINT "legal_judgments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES public.legal_cases(id) ON DELETE SET NULL;


--
-- Name: legal_sessions legal_sessions_caseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_sessions
    ADD CONSTRAINT "legal_sessions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES public.legal_cases(id);


--
-- Name: loan_accounts loan_accounts_company_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounts
    ADD CONSTRAINT loan_accounts_company_id_fk FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: loan_accounts loan_accounts_employee_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_accounts
    ADD CONSTRAINT loan_accounts_employee_id_fk FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: maintenance_requests maintenance_requests_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT "maintenance_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.rental_contracts(id);


--
-- Name: maintenance_requests maintenance_requests_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT "maintenance_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.property_units(id);


--
-- Name: marketing_campaigns marketing_campaigns_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT "marketing_campaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: marketing_campaigns marketing_campaigns_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT "marketing_campaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: notification_delivery_log notification_delivery_log_fallbackChainId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT "notification_delivery_log_fallbackChainId_fkey" FOREIGN KEY ("fallbackChainId") REFERENCES public.notification_fallback_chains(id);


--
-- Name: notification_delivery_log notification_delivery_log_parentDeliveryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_log
    ADD CONSTRAINT "notification_delivery_log_parentDeliveryId_fkey" FOREIGN KEY ("parentDeliveryId") REFERENCES public.notification_delivery_log(id);


--
-- Name: notification_fallback_chains notification_fallback_chains_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_fallback_chains
    ADD CONSTRAINT "notification_fallback_chains_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: notification_routing_rules notification_routing_rules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routing_rules
    ADD CONSTRAINT "notification_routing_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: notification_routing_rules notification_routing_rules_fallbackChainId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routing_rules
    ADD CONSTRAINT "notification_routing_rules_fallbackChainId_fkey" FOREIGN KEY ("fallbackChainId") REFERENCES public.notification_fallback_chains(id);


--
-- Name: notification_templates notification_templates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT "notification_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: notification_webhooks notification_webhooks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_webhooks
    ADD CONSTRAINT "notification_webhooks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: notifications notifications_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: password_reset_requests password_reset_requests_resolvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_requests
    ADD CONSTRAINT "password_reset_requests_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES public.users(id);


--
-- Name: payroll_lines payroll_lines_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_lines
    ADD CONSTRAINT "payroll_lines_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.payroll_runs(id);


--
-- Name: payroll_runs payroll_runs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT "payroll_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: peer_evaluations peer_evaluations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations
    ADD CONSTRAINT "peer_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: peer_evaluations peer_evaluations_cycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations
    ADD CONSTRAINT "peer_evaluations_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE;


--
-- Name: peer_evaluations peer_evaluations_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations
    ADD CONSTRAINT "peer_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: peer_evaluations peer_evaluations_evaluatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.peer_evaluations
    ADD CONSTRAINT "peer_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "performance_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_company_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT performance_reviews_company_id_fk FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_employee_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT performance_reviews_employee_id_fk FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: performance_reviews performance_reviews_reviewerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_reviews
    ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES public.employees(id);


--
-- Name: permissions permissions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: permissions permissions_grantedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "permissions_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES public.users(id);


--
-- Name: permissions permissions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: policy_module_links policy_module_links_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_module_links
    ADD CONSTRAINT "policy_module_links_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: policy_module_links policy_module_links_policyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_module_links
    ADD CONSTRAINT "policy_module_links_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES public.governance_policies(id) ON DELETE CASCADE;


--
-- Name: privacy_consent_records privacy_consent_records_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_records
    ADD CONSTRAINT "privacy_consent_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: privacy_consent_records privacy_consent_records_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.privacy_consent_records
    ADD CONSTRAINT "privacy_consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: proactive_rules proactive_rules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_rules
    ADD CONSTRAINT "proactive_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: processing_activities_log processing_activities_log_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_activities_log
    ADD CONSTRAINT "processing_activities_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: processing_activities_log processing_activities_log_performedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_activities_log
    ADD CONSTRAINT "processing_activities_log_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES public.employee_assignments(id);


--
-- Name: project_phases project_phases_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_phases
    ADD CONSTRAINT "project_phases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.projects(id);


--
-- Name: project_task_dependencies project_task_dependencies_dependsOnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_task_dependencies
    ADD CONSTRAINT "project_task_dependencies_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES public.project_tasks(id);


--
-- Name: project_task_dependencies project_task_dependencies_taskId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_task_dependencies
    ADD CONSTRAINT "project_task_dependencies_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES public.project_tasks(id);


--
-- Name: project_tasks project_tasks_phaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT "project_tasks_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES public.project_phases(id);


--
-- Name: project_tasks project_tasks_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT "project_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.projects(id);


--
-- Name: property_buildings property_buildings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_buildings
    ADD CONSTRAINT "property_buildings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: property_buildings property_buildings_managerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_buildings
    ADD CONSTRAINT "property_buildings_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES public.employees(id);


--
-- Name: property_buildings property_buildings_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_buildings
    ADD CONSTRAINT "property_buildings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.property_owners(id) ON DELETE SET NULL;


--
-- Name: property_owners property_owners_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_owners
    ADD CONSTRAINT "property_owners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: property_units property_units_buildingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_units
    ADD CONSTRAINT "property_units_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES public.property_buildings(id);


--
-- Name: property_units property_units_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_units
    ADD CONSTRAINT "property_units_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.property_owners(id) ON DELETE SET NULL;


--
-- Name: public_announcements public_announcements_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_announcements
    ADD CONSTRAINT "public_announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: public_announcements public_announcements_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_announcements
    ADD CONSTRAINT "public_announcements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: purchase_order_items purchase_order_items_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public.purchase_orders(id);


--
-- Name: purchase_orders purchase_orders_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: purchase_orders purchase_orders_requestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public.purchase_requests(id);


--
-- Name: purchase_orders purchase_orders_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id);


--
-- Name: purchase_request_items purchase_request_items_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT "purchase_request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.warehouse_products(id);


--
-- Name: purchase_request_items purchase_request_items_requestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT "purchase_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES public.purchase_requests(id);


--
-- Name: purchase_request_items purchase_request_items_request_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_request_items
    ADD CONSTRAINT purchase_request_items_request_id_fk FOREIGN KEY ("requestId") REFERENCES public.purchase_requests(id) ON DELETE CASCADE;


--
-- Name: purchase_requests purchase_requests_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requests
    ADD CONSTRAINT "purchase_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.suppliers(id);


--
-- Name: push_subscriptions push_subscriptions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "push_subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quality_checks quality_checks_checkedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks
    ADD CONSTRAINT "quality_checks_checkedBy_fkey" FOREIGN KEY ("checkedBy") REFERENCES public.employees(id);


--
-- Name: quality_checks quality_checks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks
    ADD CONSTRAINT "quality_checks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quality_checks quality_checks_movementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks
    ADD CONSTRAINT "quality_checks_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES public.warehouse_movements(id);


--
-- Name: quality_checks quality_checks_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_checks
    ADD CONSTRAINT "quality_checks_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.warehouse_products(id);


--
-- Name: recurring_journal_runs recurring_journal_runs_recurringJournalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_journal_runs
    ADD CONSTRAINT "recurring_journal_runs_recurringJournalId_fkey" FOREIGN KEY ("recurringJournalId") REFERENCES public.recurring_journals(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rent_payments rent_payments_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rent_payments
    ADD CONSTRAINT "rent_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.rental_contracts(id);


--
-- Name: rental_contracts rental_contracts_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts
    ADD CONSTRAINT "rental_contracts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public.property_owners(id) ON DELETE SET NULL;


--
-- Name: rental_contracts rental_contracts_renewedFromId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts
    ADD CONSTRAINT "rental_contracts_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES public.rental_contracts(id) ON DELETE SET NULL;


--
-- Name: rental_contracts rental_contracts_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts
    ADD CONSTRAINT "rental_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: rental_contracts rental_contracts_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rental_contracts
    ADD CONSTRAINT "rental_contracts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.property_units(id);


--
-- Name: request_types request_types_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_types
    ADD CONSTRAINT "request_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: requests requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT "requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: requests requests_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT "requests_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public.request_types(id);


--
-- Name: role_permissions role_permissions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: salary_components salary_components_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT "salary_components_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: scheduled_report_history scheduled_report_history_reportId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_report_history
    ADD CONSTRAINT "scheduled_report_history_reportId_fkey" FOREIGN KEY ("scheduledReportId") REFERENCES public.scheduled_reports(id);


--
-- Name: shifts shifts_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: shifts shifts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT "shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: stock_transfer_items stock_transfer_items_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT "stock_transfer_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.warehouse_products(id);


--
-- Name: stock_transfer_items stock_transfer_items_transferId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfer_items
    ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES public.stock_transfers(id) ON DELETE CASCADE;


--
-- Name: stock_transfers stock_transfers_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT "stock_transfers_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: stock_transfers stock_transfers_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT "stock_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: stock_transfers stock_transfers_receivedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT "stock_transfers_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES public.users(id);


--
-- Name: stock_transfers stock_transfers_requestedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_transfers
    ADD CONSTRAINT "stock_transfers_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES public.users(id);


--
-- Name: store_order_items store_order_items_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT "store_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public.store_orders(id) ON DELETE CASCADE;


--
-- Name: store_order_items store_order_items_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_order_items
    ADD CONSTRAINT "store_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.store_products(id);


--
-- Name: store_orders store_orders_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_orders
    ADD CONSTRAINT "store_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: store_products store_products_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT "store_products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: subsidiary_accounts subsidiary_accounts_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiary_accounts
    ADD CONSTRAINT "subsidiary_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE;


--
-- Name: subsidiary_accounts subsidiary_accounts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subsidiary_accounts
    ADD CONSTRAINT "subsidiary_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: system_evaluations system_evaluations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_evaluations
    ADD CONSTRAINT "system_evaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: system_evaluations system_evaluations_cycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_evaluations
    ADD CONSTRAINT "system_evaluations_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES public.evaluation_cycles(id) ON DELETE CASCADE;


--
-- Name: system_evaluations system_evaluations_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_evaluations
    ADD CONSTRAINT "system_evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: tenants tenants_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT "tenants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ticket_csat_ratings ticket_csat_ratings_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_csat_ratings
    ADD CONSTRAINT "ticket_csat_ratings_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_escalations ticket_escalations_escalatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_escalations
    ADD CONSTRAINT "ticket_escalations_escalatedBy_fkey" FOREIGN KEY ("escalatedBy") REFERENCES public.users(id);


--
-- Name: ticket_escalations ticket_escalations_escalatedTo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_escalations
    ADD CONSTRAINT "ticket_escalations_escalatedTo_fkey" FOREIGN KEY ("escalatedTo") REFERENCES public.employees(id);


--
-- Name: ticket_escalations ticket_escalations_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_escalations
    ADD CONSTRAINT "ticket_escalations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_replies ticket_replies_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT "ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id);


--
-- Name: training_enrollments training_enrollments_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments
    ADD CONSTRAINT "training_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES public.training_programs(id);


--
-- Name: training_programs training_programs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs
    ADD CONSTRAINT "training_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: umrah_agent_invoices umrah_agent_invoices_agentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agent_invoices
    ADD CONSTRAINT "umrah_agent_invoices_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES public.umrah_agents(id);


--
-- Name: umrah_agent_invoices umrah_agent_invoices_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agent_invoices
    ADD CONSTRAINT "umrah_agent_invoices_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_import_logs umrah_import_logs_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_logs
    ADD CONSTRAINT "umrah_import_logs_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_packages umrah_packages_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_packages
    ADD CONSTRAINT "umrah_packages_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_penalties umrah_penalties_agentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties
    ADD CONSTRAINT "umrah_penalties_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES public.umrah_agents(id);


--
-- Name: umrah_penalties umrah_penalties_pilgrimId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties
    ADD CONSTRAINT "umrah_penalties_pilgrimId_fkey" FOREIGN KEY ("pilgrimId") REFERENCES public.umrah_pilgrims(id);


--
-- Name: umrah_penalties umrah_penalties_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties
    ADD CONSTRAINT "umrah_penalties_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_pilgrims umrah_pilgrims_agentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims
    ADD CONSTRAINT "umrah_pilgrims_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES public.umrah_agents(id);


--
-- Name: umrah_pilgrims umrah_pilgrims_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims
    ADD CONSTRAINT "umrah_pilgrims_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES public.umrah_packages(id);


--
-- Name: umrah_pilgrims umrah_pilgrims_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims
    ADD CONSTRAINT "umrah_pilgrims_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_transport umrah_transport_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport
    ADD CONSTRAINT "umrah_transport_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: user_activity_log user_activity_log_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT "user_activity_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: user_roles user_roles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: warehouse_categories warehouse_categories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories
    ADD CONSTRAINT "warehouse_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.warehouse_categories(id);


--
-- Name: warehouse_movements warehouse_movements_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_movements
    ADD CONSTRAINT "warehouse_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.warehouse_products(id);


--
-- Name: warehouse_products warehouse_products_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_products
    ADD CONSTRAINT "warehouse_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.warehouse_categories(id);


--
-- Name: warehouse_stock_batches warehouse_stock_batches_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_batches
    ADD CONSTRAINT "warehouse_stock_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.warehouse_products(id);


--
-- Name: workflow_instances workflow_instances_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id);


--
-- Name: workflow_step_actions workflow_step_actions_instanceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_step_actions
    ADD CONSTRAINT "workflow_step_actions_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES public.workflow_instances(id) ON DELETE CASCADE;


--
-- Name: workflow_steps workflow_steps_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT "workflow_steps_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT "workflows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: zatca_settings zatca_settings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_settings
    ADD CONSTRAINT "zatca_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: zatca_submission_log zatca_submission_log_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_submission_log
    ADD CONSTRAINT "zatca_submission_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict N8aLHyPCVG3H1XKp9RfMpgRknKkoFHJHGlmbeKPbQWRw6wMnX9Pye24hbIZ7Bmw

