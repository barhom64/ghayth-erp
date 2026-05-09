-- Migration 125: Add missing companyId indexes for multi-tenant query performance
DO $migr$ BEGIN
  IF to_regclass('public.alert_fatigue_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alert_fatigue_settings' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alert_fatigue_settings_companyId ON public."alert_fatigue_settings" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.alert_mute_rules') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alert_mute_rules' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_alert_mute_rules_companyId ON public."alert_mute_rules" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.attendance_deductions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_deductions' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_deductions_companyId ON public."attendance_deductions" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.attendance_policies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_policies' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_policies_companyId ON public."attendance_policies" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.audit_logs_archive') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs_archive' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_archive_companyId ON public."audit_logs_archive" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.audit_umrah_access') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_umrah_access' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_umrah_access_companyId ON public."audit_umrah_access" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.bi_dashboards') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bi_dashboards' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bi_dashboards_companyId ON public."bi_dashboards" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.bi_kpis') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bi_kpis' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bi_kpis_companyId ON public."bi_kpis" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.bi_reports') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bi_reports' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bi_reports_companyId ON public."bi_reports" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.branches') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='branches' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_branches_companyId ON public."branches" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.clients') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_companyId ON public."clients" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.collection_follow_ups') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collection_follow_ups' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_collection_follow_ups_companyId ON public."collection_follow_ups" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.communications_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='communications_log' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_communications_log_companyId ON public."communications_log" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.crm_contacts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_contacts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_crm_contacts_companyId ON public."crm_contacts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.customer_advances') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_advances' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_advances_companyId ON public."customer_advances" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.daily_close_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='daily_close_log' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_daily_close_log_companyId ON public."daily_close_log" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.daily_closures') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='daily_closures' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_daily_closures_companyId ON public."daily_closures" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.data_retention_policies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='data_retention_policies' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_data_retention_policies_companyId ON public."data_retention_policies" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.departments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='departments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_departments_companyId ON public."departments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.depreciation_entries') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='depreciation_entries' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_depreciation_entries_companyId ON public."depreciation_entries" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.digital_signature_otps') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='digital_signature_otps' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_digital_signature_otps_companyId ON public."digital_signature_otps" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.document_folders') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_folders' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_folders_companyId ON public."document_folders" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.document_templates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_templates' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_templates_companyId ON public."document_templates" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.documents') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documents_companyId ON public."documents" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.email_queue') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='email_queue' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_email_queue_companyId ON public."email_queue" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_commission_calculations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_commission_calculations' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_commission_calculations_companyId ON public."employee_commission_calculations" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_commission_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_commission_plans' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_companyId ON public."employee_commission_plans" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_development_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_development_plans' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_development_plans_companyId ON public."employee_development_plans" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_kpi_snapshots') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_kpi_snapshots' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_kpi_snapshots_companyId ON public."employee_kpi_snapshots" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_monthly_attendance') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_monthly_attendance' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_monthly_attendance_companyId ON public."employee_monthly_attendance" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_of_month') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_of_month' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_of_month_companyId ON public."employee_of_month" ("companyId")';
  END IF;
END $migr$;
-- skipped: employee_salary_components table does not exist in this schema
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_salary_components_companyId ON public.employee_salary_components ("companyId");
DO $migr$ BEGIN
  IF to_regclass('public.employee_transfers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_transfers' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_transfers_companyId ON public."employee_transfers" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.evaluation_participants') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='evaluation_participants' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_evaluation_participants_companyId ON public."evaluation_participants" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.fleet_preventive_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fleet_preventive_plans' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fleet_preventive_plans_companyId ON public."fleet_preventive_plans" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.fleet_traffic_violations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fleet_traffic_violations' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fleet_traffic_violations_companyId ON public."fleet_traffic_violations" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_audits') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_audits' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_audits_companyId ON public."governance_audits" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_capa') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_capa' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_capa_companyId ON public."governance_capa" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_compliance') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_compliance' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_compliance_companyId ON public."governance_compliance" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_policies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_policies' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_policies_companyId ON public."governance_policies" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_risks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_risks' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_risks_companyId ON public."governance_risks" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_excuse_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_excuse_requests' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_excuse_requests_companyId ON public."hr_excuse_requests" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_exit_clearance') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_exit_clearance' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_exit_clearance_companyId ON public."hr_exit_clearance" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_leave_balances') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_balances' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_leave_balances_companyId ON public."hr_leave_balances" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_leave_types') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_leave_types' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_leave_types_companyId ON public."hr_leave_types" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.hr_loan_installments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='hr_loan_installments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_hr_loan_installments_companyId ON public."hr_loan_installments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.integration_logs_archive') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_logs_archive' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_integration_logs_archive_companyId ON public."integration_logs_archive" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.integrations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='integrations' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_integrations_companyId ON public."integrations" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.inventory_counts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_counts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_inventory_counts_companyId ON public."inventory_counts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.invoice_collection_stages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_collection_stages' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoice_collection_stages_companyId ON public."invoice_collection_stages" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.invoice_payments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_payments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoice_payments_companyId ON public."invoice_payments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.job_titles') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='job_titles' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_titles_companyId ON public."job_titles" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.kpi_snapshots') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='kpi_snapshots' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_companyId ON public."kpi_snapshots" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.legal_correspondence') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='legal_correspondence' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_legal_correspondence_companyId ON public."legal_correspondence" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.legal_judgments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='legal_judgments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_legal_judgments_companyId ON public."legal_judgments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.loan_accounts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='loan_accounts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_loan_accounts_companyId ON public."loan_accounts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.maintenance_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='maintenance_requests' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_maintenance_requests_companyId ON public."maintenance_requests" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.marketing_campaigns') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='marketing_campaigns' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_companyId ON public."marketing_campaigns" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.notification_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_log' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notification_log_companyId ON public."notification_log" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.notification_webhooks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_webhooks' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notification_webhooks_companyId ON public."notification_webhooks" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.notifications') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_companyId ON public."notifications" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.payment_runs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_runs' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_runs_companyId ON public."payment_runs" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.pbx_calls') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pbx_calls' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pbx_calls_companyId ON public."pbx_calls" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.permissions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='permissions' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_permissions_companyId ON public."permissions" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.policy_module_links') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policy_module_links' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_policy_module_links_companyId ON public."policy_module_links" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.project_costs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_costs' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_project_costs_companyId ON public."project_costs" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.project_milestones') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_milestones' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_project_milestones_companyId ON public."project_milestones" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.project_resources') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_resources' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_project_resources_companyId ON public."project_resources" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.project_risks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='project_risks' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_project_risks_companyId ON public."project_risks" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.property_contracts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='property_contracts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_property_contracts_companyId ON public."property_contracts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.property_inspections') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='property_inspections' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_property_inspections_companyId ON public."property_inspections" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.property_security_deposits') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='property_security_deposits' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_property_security_deposits_companyId ON public."property_security_deposits" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.public_holidays') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_holidays' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_public_holidays_companyId ON public."public_holidays" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.purchase_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_requests' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_purchase_requests_companyId ON public."purchase_requests" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='push_subscriptions' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_companyId ON public."push_subscriptions" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.request_types') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request_types' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_request_types_companyId ON public."request_types" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.scheduled_reports') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scheduled_reports' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_scheduled_reports_companyId ON public."scheduled_reports" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.sla_definitions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sla_definitions' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sla_definitions_companyId ON public."sla_definitions" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.smart_alerts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='smart_alerts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_smart_alerts_companyId ON public."smart_alerts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.sms_queue') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sms_queue' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sms_queue_companyId ON public."sms_queue" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.stock_transfers') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_transfers' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_stock_transfers_companyId ON public."stock_transfers" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.system_evaluations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_evaluations' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_system_evaluations_companyId ON public."system_evaluations" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.system_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_settings' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_system_settings_companyId ON public."system_settings" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.system_stops') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='system_stops' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_system_stops_companyId ON public."system_stops" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.technicians') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='technicians' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_technicians_companyId ON public."technicians" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.ticket_csat_ratings') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_csat_ratings' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ticket_csat_ratings_companyId ON public."ticket_csat_ratings" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_agent_invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_agent_invoices' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_agent_invoices_companyId ON public."umrah_agent_invoices" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_import_batches') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_import_batches' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_companyId ON public."umrah_import_batches" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_import_logs') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_import_logs' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_import_logs_companyId ON public."umrah_import_logs" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_nusk_invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_nusk_invoices' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_companyId ON public."umrah_nusk_invoices" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_packages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_packages' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_packages_companyId ON public."umrah_packages" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_payments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_payments' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_payments_companyId ON public."umrah_payments" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_penalties') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_penalties' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_penalties_companyId ON public."umrah_penalties" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_pricing') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_pricing' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_pricing_companyId ON public."umrah_pricing" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_sales_invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_sales_invoices' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_sales_invoices_companyId ON public."umrah_sales_invoices" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_seasons') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_seasons' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_seasons_companyId ON public."umrah_seasons" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_sub_agents') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_sub_agents' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_companyId ON public."umrah_sub_agents" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_transport') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_transport' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_transport_companyId ON public."umrah_transport" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_violations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_violations' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_violations_companyId ON public."umrah_violations" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_roles_companyId ON public."user_roles" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.user_shortcuts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_shortcuts' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_user_shortcuts_companyId ON public."user_shortcuts" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.warehouse_categories') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouse_categories' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_warehouse_categories_companyId ON public."warehouse_categories" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.whatsapp_queue') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_queue' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_companyId ON public."whatsapp_queue" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.workflow_definitions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_definitions' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_definitions_companyId ON public."workflow_definitions" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.workflows') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflows' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflows_companyId ON public."workflows" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.zatca_settings') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='zatca_settings' AND column_name='companyId') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_zatca_settings_companyId ON public."zatca_settings" ("companyId")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.attendance') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_attendance_deletedAt ON public."attendance" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.budget_approval_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_approval_requests' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_budget_approval_requests_deletedAt ON public."budget_approval_requests" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.business_rules') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='business_rules' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_business_rules_deletedAt ON public."business_rules" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.chart_of_accounts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chart_of_accounts' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_deletedAt ON public."chart_of_accounts" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.communications_log') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='communications_log' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_communications_log_deletedAt ON public."communications_log" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.document_templates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_templates' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_document_templates_deletedAt ON public."document_templates" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_commission_calculations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_commission_calculations' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_commission_calculations_deletedAt ON public."employee_commission_calculations" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_commission_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_commission_plans' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_commission_plans_deletedAt ON public."employee_commission_plans" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_development_plans') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_development_plans' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_development_plans_deletedAt ON public."employee_development_plans" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.employee_violations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employee_violations' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_violations_deletedAt ON public."employee_violations" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.fleet_traffic_violations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fleet_traffic_violations' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_fleet_traffic_violations_deletedAt ON public."fleet_traffic_violations" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.gov_integration_links') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gov_integration_links' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_gov_integration_links_deletedAt ON public."gov_integration_links" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_audits') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_audits' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_audits_deletedAt ON public."governance_audits" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_compliance') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_compliance' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_compliance_deletedAt ON public."governance_compliance" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_policies') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_policies' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_policies_deletedAt ON public."governance_policies" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.governance_risks') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='governance_risks' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_governance_risks_deletedAt ON public."governance_risks" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.intercompany_transactions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='intercompany_transactions' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_deletedAt ON public."intercompany_transactions" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.job_applications') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='job_applications' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_job_applications_deletedAt ON public."job_applications" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.legal_sessions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='legal_sessions' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_legal_sessions_deletedAt ON public."legal_sessions" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.policy_compliance_actions') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='policy_compliance_actions' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_policy_compliance_actions_deletedAt ON public."policy_compliance_actions" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.property_owners') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='property_owners' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_property_owners_deletedAt ON public."property_owners" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.public_holidays') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_holidays' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_public_holidays_deletedAt ON public."public_holidays" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.rental_contracts') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_contracts' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rental_contracts_deletedAt ON public."rental_contracts" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.training_enrollments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='training_enrollments' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_training_enrollments_deletedAt ON public."training_enrollments" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_import_batches') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_import_batches' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_deletedAt ON public."umrah_import_batches" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_nusk_invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_nusk_invoices' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_deletedAt ON public."umrah_nusk_invoices" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_packages') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_packages' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_packages_deletedAt ON public."umrah_packages" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_payments') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_payments' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_payments_deletedAt ON public."umrah_payments" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_pricing') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_pricing' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_pricing_deletedAt ON public."umrah_pricing" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_sales_invoices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_sales_invoices' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_sales_invoices_deletedAt ON public."umrah_sales_invoices" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_sub_agents') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_sub_agents' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_sub_agents_deletedAt ON public."umrah_sub_agents" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_transport') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_transport' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_transport_deletedAt ON public."umrah_transport" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.umrah_violations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='umrah_violations' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_umrah_violations_deletedAt ON public."umrah_violations" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.warehouse_categories') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouse_categories' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_warehouse_categories_deletedAt ON public."warehouse_categories" ("deletedAt")';
  END IF;
END $migr$;
DO $migr$ BEGIN
  IF to_regclass('public.workflow_instances') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_instances' AND column_name='deletedAt') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_instances_deletedAt ON public."workflow_instances" ("deletedAt")';
  END IF;
END $migr$;
