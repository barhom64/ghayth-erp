

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
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


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
-- Name: audit_archive id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_archive ALTER COLUMN id SET DEFAULT nextval('public.audit_archive_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: audit_umrah_access id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_umrah_access ALTER COLUMN id SET DEFAULT nextval('public.audit_umrah_access_id_seq'::regclass);


--
-- Name: audit_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_violations ALTER COLUMN id SET DEFAULT nextval('public.audit_violations_id_seq'::regclass);


--
-- Name: auto_detection_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_detection_log ALTER COLUMN id SET DEFAULT nextval('public.auto_detection_log_id_seq'::regclass);


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
-- Name: company_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents ALTER COLUMN id SET DEFAULT nextval('public.company_documents_id_seq'::regclass);


--
-- Name: contract_payment_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule ALTER COLUMN id SET DEFAULT nextval('public.contract_payment_schedule_id_seq'::regclass);


--
-- Name: correspondence id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correspondence ALTER COLUMN id SET DEFAULT nextval('public.correspondence_id_seq'::regclass);


--
-- Name: cost_centers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers ALTER COLUMN id SET DEFAULT nextval('public.cost_centers_id_seq'::regclass);


--
-- Name: credit_memos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos ALTER COLUMN id SET DEFAULT nextval('public.credit_memos_id_seq'::regclass);


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
-- Name: customer_advances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances ALTER COLUMN id SET DEFAULT nextval('public.customer_advances_id_seq'::regclass);


--
-- Name: daily_close_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_close_log ALTER COLUMN id SET DEFAULT nextval('public.daily_close_log_id_seq'::regclass);


--
-- Name: data_access_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_access_requests ALTER COLUMN id SET DEFAULT nextval('public.data_access_requests_id_seq'::regclass);


--
-- Name: data_retention_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies ALTER COLUMN id SET DEFAULT nextval('public.data_retention_policies_id_seq'::regclass);


--
-- Name: debit_memos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos ALTER COLUMN id SET DEFAULT nextval('public.debit_memos_id_seq'::regclass);


--
-- Name: delegations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations ALTER COLUMN id SET DEFAULT nextval('public.delegations_id_seq'::regclass);


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
-- Name: discipline_memos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_memos ALTER COLUMN id SET DEFAULT nextval('public.discipline_memos_id_seq'::regclass);


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
-- Name: dunning_letters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters ALTER COLUMN id SET DEFAULT nextval('public.dunning_letters_id_seq'::regclass);


--
-- Name: email_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue ALTER COLUMN id SET DEFAULT nextval('public.email_queue_id_seq'::regclass);


--
-- Name: employee_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_assignments ALTER COLUMN id SET DEFAULT nextval('public.employee_assignments_id_seq'::regclass);


--
-- Name: employee_commission_calculations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_calculations ALTER COLUMN id SET DEFAULT nextval('public.employee_commission_calculations_id_seq'::regclass);


--
-- Name: employee_commission_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_plans ALTER COLUMN id SET DEFAULT nextval('public.employee_commission_plans_id_seq'::regclass);


--
-- Name: employee_commission_tiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_tiers ALTER COLUMN id SET DEFAULT nextval('public.employee_commission_tiers_id_seq'::regclass);


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
-- Name: employee_kpi_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_kpi_snapshots ALTER COLUMN id SET DEFAULT nextval('public.employee_kpi_snapshots_id_seq'::regclass);


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
-- Name: event_dlq id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dlq ALTER COLUMN id SET DEFAULT nextval('public.event_dlq_id_seq'::regclass);


--
-- Name: event_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs ALTER COLUMN id SET DEFAULT nextval('public.event_logs_id_seq'::regclass);


--
-- Name: expense_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_claims ALTER COLUMN id SET DEFAULT nextval('public.expense_claims_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: feature_catalog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_catalog ALTER COLUMN id SET DEFAULT nextval('public.feature_catalog_id_seq'::regclass);


--
-- Name: financial_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods ALTER COLUMN id SET DEFAULT nextval('public.financial_periods_id_seq'::regclass);


--
-- Name: financial_posting_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_posting_failures ALTER COLUMN id SET DEFAULT nextval('public.financial_posting_failures_id_seq'::regclass);


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
-- Name: fx_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates ALTER COLUMN id SET DEFAULT nextval('public.fx_rates_id_seq'::regclass);


--
-- Name: fx_revaluation_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_lines ALTER COLUMN id SET DEFAULT nextval('public.fx_revaluation_lines_id_seq'::regclass);


--
-- Name: fx_revaluation_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_log ALTER COLUMN id SET DEFAULT nextval('public.fx_revaluation_log_id_seq'::regclass);


--
-- Name: fx_revaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluations ALTER COLUMN id SET DEFAULT nextval('public.fx_revaluations_id_seq'::regclass);


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
-- Name: hr_employee_loans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans ALTER COLUMN id SET DEFAULT nextval('public.hr_employee_loans_id_seq'::regclass);


--
-- Name: hr_excuse_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_excuse_requests ALTER COLUMN id SET DEFAULT nextval('public.hr_excuse_requests_id_seq'::regclass);


--
-- Name: hr_exit_clearance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_clearance ALTER COLUMN id SET DEFAULT nextval('public.hr_exit_clearance_id_seq'::regclass);


--
-- Name: hr_exit_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests ALTER COLUMN id SET DEFAULT nextval('public.hr_exit_requests_id_seq'::regclass);


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
-- Name: hr_loan_installments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_installments ALTER COLUMN id SET DEFAULT nextval('public.hr_loan_installments_id_seq'::regclass);


--
-- Name: hr_overtime_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests ALTER COLUMN id SET DEFAULT nextval('public.hr_overtime_requests_id_seq'::regclass);


--
-- Name: hr_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations ALTER COLUMN id SET DEFAULT nextval('public.hr_violations_id_seq'::regclass);


--
-- Name: import_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches ALTER COLUMN id SET DEFAULT nextval('public.import_batches_id_seq'::regclass);


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
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


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
-- Name: mudad_settlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mudad_settlements ALTER COLUMN id SET DEFAULT nextval('public.mudad_settlements_id_seq'::regclass);


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
-- Name: obligations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligations ALTER COLUMN id SET DEFAULT nextval('public.obligations_id_seq'::regclass);


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
-- Name: payment_run_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_run_items ALTER COLUMN id SET DEFAULT nextval('public.payment_run_items_id_seq'::regclass);


--
-- Name: payment_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_runs ALTER COLUMN id SET DEFAULT nextval('public.payment_runs_id_seq'::regclass);


--
-- Name: payroll_deductions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions ALTER COLUMN id SET DEFAULT nextval('public.payroll_deductions_id_seq'::regclass);


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
-- Name: proactive_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_rules ALTER COLUMN id SET DEFAULT nextval('public.proactive_rules_id_seq'::regclass);


--
-- Name: processing_activities_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_activities_log ALTER COLUMN id SET DEFAULT nextval('public.processing_activities_log_id_seq'::regclass);


--
-- Name: product_abc_classification id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_abc_classification ALTER COLUMN id SET DEFAULT nextval('public.product_abc_classification_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


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
-- Name: property_contracts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contracts ALTER COLUMN id SET DEFAULT nextval('public.property_contracts_id_seq'::regclass);


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
-- Name: purchase_order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_lines_id_seq'::regclass);


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
-- Name: rbac_approval_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_approval_limits ALTER COLUMN id SET DEFAULT nextval('public.rbac_approval_limits_id_seq'::regclass);


--
-- Name: rbac_field_policies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_field_policies ALTER COLUMN id SET DEFAULT nextval('public.rbac_field_policies_id_seq'::regclass);


--
-- Name: rbac_jit_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_jit_requests ALTER COLUMN id SET DEFAULT nextval('public.rbac_jit_requests_id_seq'::regclass);


--
-- Name: rbac_role_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants ALTER COLUMN id SET DEFAULT nextval('public.rbac_role_grants_id_seq'::regclass);


--
-- Name: rbac_role_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_history ALTER COLUMN id SET DEFAULT nextval('public.rbac_role_history_id_seq'::regclass);


--
-- Name: rbac_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles ALTER COLUMN id SET DEFAULT nextval('public.rbac_roles_id_seq'::regclass);


--
-- Name: rbac_sod_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_sod_rules ALTER COLUMN id SET DEFAULT nextval('public.rbac_sod_rules_id_seq'::regclass);


--
-- Name: rbac_user_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_grants ALTER COLUMN id SET DEFAULT nextval('public.rbac_user_grants_id_seq'::regclass);


--
-- Name: rbac_user_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles ALTER COLUMN id SET DEFAULT nextval('public.rbac_user_roles_id_seq'::regclass);


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
-- Name: salary_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history ALTER COLUMN id SET DEFAULT nextval('public.salary_history_id_seq'::regclass);


--
-- Name: saudization_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saudization_snapshots ALTER COLUMN id SET DEFAULT nextval('public.saudization_snapshots_id_seq'::regclass);


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
-- Name: smart_recommendations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_recommendations ALTER COLUMN id SET DEFAULT nextval('public.smart_recommendations_id_seq'::regclass);


--
-- Name: sms_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_queue ALTER COLUMN id SET DEFAULT nextval('public.sms_queue_id_seq'::regclass);


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
-- Name: system_stops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_stops ALTER COLUMN id SET DEFAULT nextval('public.system_stops_id_seq'::regclass);


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
-- Name: ticket_replies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies ALTER COLUMN id SET DEFAULT nextval('public.ticket_replies_id_seq'::regclass);


--
-- Name: training_courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses ALTER COLUMN id SET DEFAULT nextval('public.training_courses_id_seq'::regclass);


--
-- Name: training_enrollments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments ALTER COLUMN id SET DEFAULT nextval('public.training_enrollments_id_seq'::regclass);


--
-- Name: training_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants ALTER COLUMN id SET DEFAULT nextval('public.training_participants_id_seq'::regclass);


--
-- Name: training_programs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs ALTER COLUMN id SET DEFAULT nextval('public.training_programs_id_seq'::regclass);


--
-- Name: trainings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings ALTER COLUMN id SET DEFAULT nextval('public.trainings_id_seq'::regclass);


--
-- Name: umrah_agent_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agent_invoices ALTER COLUMN id SET DEFAULT nextval('public.umrah_agent_invoices_id_seq'::regclass);


--
-- Name: umrah_agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_agents ALTER COLUMN id SET DEFAULT nextval('public.umrah_agents_id_seq'::regclass);


--
-- Name: umrah_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_groups ALTER COLUMN id SET DEFAULT nextval('public.umrah_groups_id_seq'::regclass);


--
-- Name: umrah_import_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_batches ALTER COLUMN id SET DEFAULT nextval('public.umrah_import_batches_id_seq'::regclass);


--
-- Name: umrah_import_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_changes ALTER COLUMN id SET DEFAULT nextval('public.umrah_import_changes_id_seq'::regclass);


--
-- Name: umrah_import_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_logs ALTER COLUMN id SET DEFAULT nextval('public.umrah_import_logs_id_seq'::regclass);


--
-- Name: umrah_nusk_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_nusk_invoices ALTER COLUMN id SET DEFAULT nextval('public.umrah_nusk_invoices_id_seq'::regclass);


--
-- Name: umrah_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_packages ALTER COLUMN id SET DEFAULT nextval('public.umrah_packages_id_seq'::regclass);


--
-- Name: umrah_payment_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payment_allocations ALTER COLUMN id SET DEFAULT nextval('public.umrah_payment_allocations_id_seq'::regclass);


--
-- Name: umrah_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payments ALTER COLUMN id SET DEFAULT nextval('public.umrah_payments_id_seq'::regclass);


--
-- Name: umrah_penalties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_penalties ALTER COLUMN id SET DEFAULT nextval('public.umrah_penalties_id_seq'::regclass);


--
-- Name: umrah_pilgrims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pilgrims ALTER COLUMN id SET DEFAULT nextval('public.umrah_pilgrims_id_seq'::regclass);


--
-- Name: umrah_pricing id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pricing ALTER COLUMN id SET DEFAULT nextval('public.umrah_pricing_id_seq'::regclass);


--
-- Name: umrah_sales_invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoice_items ALTER COLUMN id SET DEFAULT nextval('public.umrah_sales_invoice_items_id_seq'::regclass);


--
-- Name: umrah_sales_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoices ALTER COLUMN id SET DEFAULT nextval('public.umrah_sales_invoices_id_seq'::regclass);


--
-- Name: umrah_seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_seasons ALTER COLUMN id SET DEFAULT nextval('public.umrah_seasons_id_seq'::regclass);


--
-- Name: umrah_sub_agents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sub_agents ALTER COLUMN id SET DEFAULT nextval('public.umrah_sub_agents_id_seq'::regclass);


--
-- Name: umrah_transport id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport ALTER COLUMN id SET DEFAULT nextval('public.umrah_transport_id_seq'::regclass);


--
-- Name: umrah_violations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_violations ALTER COLUMN id SET DEFAULT nextval('public.umrah_violations_id_seq'::regclass);


--
-- Name: user_activity_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log ALTER COLUMN id SET DEFAULT nextval('public.user_activity_log_id_seq'::regclass);


--
-- Name: user_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles ALTER COLUMN id SET DEFAULT nextval('public.user_roles_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vouchers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);


--
-- Name: warehouse_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories ALTER COLUMN id SET DEFAULT nextval('public.warehouse_categories_id_seq'::regclass);


--
-- Name: warehouse_cycle_count_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_count_lines ALTER COLUMN id SET DEFAULT nextval('public.warehouse_cycle_count_lines_id_seq'::regclass);


--
-- Name: warehouse_cycle_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_counts ALTER COLUMN id SET DEFAULT nextval('public.warehouse_cycle_counts_id_seq'::regclass);


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
-- Name: warehouse_stock_lots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_lots ALTER COLUMN id SET DEFAULT nextval('public.warehouse_stock_lots_id_seq'::regclass);


--
-- Name: warehouse_stock_serials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_serials ALTER COLUMN id SET DEFAULT nextval('public.warehouse_stock_serials_id_seq'::regclass);


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
-- Name: workflow_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_requests ALTER COLUMN id SET DEFAULT nextval('public.workflow_requests_id_seq'::regclass);


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
-- Name: wps_run_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_run_lines ALTER COLUMN id SET DEFAULT nextval('public.wps_run_lines_id_seq'::regclass);


--
-- Name: wps_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_runs ALTER COLUMN id SET DEFAULT nextval('public.wps_runs_id_seq'::regclass);


--
-- Name: zatca_retry_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_retry_queue ALTER COLUMN id SET DEFAULT nextval('public.zatca_retry_queue_id_seq'::regclass);


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
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


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
-- Name: audit_archive audit_archive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_archive
    ADD CONSTRAINT audit_archive_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_umrah_access audit_umrah_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_umrah_access
    ADD CONSTRAINT audit_umrah_access_pkey PRIMARY KEY (id);


--
-- Name: audit_violations audit_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_violations
    ADD CONSTRAINT audit_violations_pkey PRIMARY KEY (id);


--
-- Name: auto_detection_log auto_detection_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_detection_log
    ADD CONSTRAINT auto_detection_log_pkey PRIMARY KEY (id);


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
-- Name: company_documents company_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_documents
    ADD CONSTRAINT company_documents_pkey PRIMARY KEY (id);


--
-- Name: contract_payment_schedule contract_payment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_payment_schedule
    ADD CONSTRAINT contract_payment_schedule_pkey PRIMARY KEY (id);


--
-- Name: correspondence correspondence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correspondence
    ADD CONSTRAINT correspondence_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_companyId_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT "cost_centers_companyId_code_key" UNIQUE ("companyId", code);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: credit_memos credit_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT credit_memos_pkey PRIMARY KEY (id);


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
-- Name: customer_advances customer_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances
    ADD CONSTRAINT customer_advances_pkey PRIMARY KEY (id);


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
-- Name: debit_memos debit_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT debit_memos_pkey PRIMARY KEY (id);


--
-- Name: delegations delegations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT delegations_pkey PRIMARY KEY (id);


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
-- Name: discipline_memos discipline_memos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_memos
    ADD CONSTRAINT discipline_memos_pkey PRIMARY KEY (id);


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
-- Name: dunning_letters dunning_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters
    ADD CONSTRAINT dunning_letters_pkey PRIMARY KEY (id);


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
-- Name: employee_commission_calculations employee_commission_calculations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_calculations
    ADD CONSTRAINT employee_commission_calculations_pkey PRIMARY KEY (id);


--
-- Name: employee_commission_plans employee_commission_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_plans
    ADD CONSTRAINT employee_commission_plans_pkey PRIMARY KEY (id);


--
-- Name: employee_commission_tiers employee_commission_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commission_tiers
    ADD CONSTRAINT employee_commission_tiers_pkey PRIMARY KEY (id);


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
-- Name: employee_kpi_snapshots employee_kpi_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_kpi_snapshots
    ADD CONSTRAINT employee_kpi_snapshots_pkey PRIMARY KEY (id);


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
-- Name: event_dlq event_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_dlq
    ADD CONSTRAINT event_dlq_pkey PRIMARY KEY (id);


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
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: feature_catalog feature_catalog_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_catalog
    ADD CONSTRAINT feature_catalog_feature_key_key UNIQUE (feature_key);


--
-- Name: feature_catalog feature_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_catalog
    ADD CONSTRAINT feature_catalog_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: financial_posting_failures financial_posting_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_posting_failures
    ADD CONSTRAINT financial_posting_failures_pkey PRIMARY KEY (id);


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
-- Name: fx_rates fx_rates_companyId_rateDate_fromCurrency_toCurrency_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT "fx_rates_companyId_rateDate_fromCurrency_toCurrency_type_key" UNIQUE ("companyId", "rateDate", "fromCurrency", "toCurrency", type);


--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (id);


--
-- Name: fx_revaluation_lines fx_revaluation_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_lines
    ADD CONSTRAINT fx_revaluation_lines_pkey PRIMARY KEY (id);


--
-- Name: fx_revaluation_log fx_revaluation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_log
    ADD CONSTRAINT fx_revaluation_log_pkey PRIMARY KEY (id);


--
-- Name: fx_revaluations fx_revaluations_companyId_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluations
    ADD CONSTRAINT "fx_revaluations_companyId_period_key" UNIQUE ("companyId", period);


--
-- Name: fx_revaluations fx_revaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluations
    ADD CONSTRAINT fx_revaluations_pkey PRIMARY KEY (id);


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
-- Name: hr_employee_loans hr_employee_loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT hr_employee_loans_pkey PRIMARY KEY (id);


--
-- Name: hr_excuse_requests hr_excuse_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_excuse_requests
    ADD CONSTRAINT hr_excuse_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_exit_clearance hr_exit_clearance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_clearance
    ADD CONSTRAINT hr_exit_clearance_pkey PRIMARY KEY (id);


--
-- Name: hr_exit_requests hr_exit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT hr_exit_requests_pkey PRIMARY KEY (id);


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
-- Name: hr_loan_installments hr_loan_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_installments
    ADD CONSTRAINT hr_loan_installments_pkey PRIMARY KEY (id);


--
-- Name: hr_overtime_requests hr_overtime_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT hr_overtime_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_violations hr_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations
    ADD CONSTRAINT hr_violations_pkey PRIMARY KEY (id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


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
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


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
-- Name: mudad_settlements mudad_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mudad_settlements
    ADD CONSTRAINT mudad_settlements_pkey PRIMARY KEY (id);


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
-- Name: obligations obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_pkey PRIMARY KEY (id);


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
-- Name: payment_run_items payment_run_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_run_items
    ADD CONSTRAINT payment_run_items_pkey PRIMARY KEY (id);


--
-- Name: payment_runs payment_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_runs
    ADD CONSTRAINT payment_runs_pkey PRIMARY KEY (id);


--
-- Name: payroll_deductions payroll_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT payroll_deductions_pkey PRIMARY KEY (id);


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
-- Name: product_abc_classification product_abc_classification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_abc_classification
    ADD CONSTRAINT product_abc_classification_pkey PRIMARY KEY (id);


--
-- Name: product_valuation_settings product_valuation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_valuation_settings
    ADD CONSTRAINT product_valuation_settings_pkey PRIMARY KEY ("productId");


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


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
-- Name: property_contracts property_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contracts
    ADD CONSTRAINT property_contracts_pkey PRIMARY KEY (id);


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
-- Name: purchase_order_lines purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id);


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
-- Name: rbac_approval_limits rbac_approval_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_approval_limits
    ADD CONSTRAINT rbac_approval_limits_pkey PRIMARY KEY (id);


--
-- Name: rbac_approval_limits rbac_approval_limits_role_id_feature_key_action_currency_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_approval_limits
    ADD CONSTRAINT rbac_approval_limits_role_id_feature_key_action_currency_key UNIQUE (role_id, feature_key, action, currency);


--
-- Name: rbac_cache_version rbac_cache_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_cache_version
    ADD CONSTRAINT rbac_cache_version_pkey PRIMARY KEY ("companyId");


--
-- Name: rbac_field_policies rbac_field_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_field_policies
    ADD CONSTRAINT rbac_field_policies_pkey PRIMARY KEY (id);


--
-- Name: rbac_field_policies rbac_field_policies_role_id_feature_key_field_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_field_policies
    ADD CONSTRAINT rbac_field_policies_role_id_feature_key_field_name_key UNIQUE (role_id, feature_key, field_name);


--
-- Name: rbac_jit_requests rbac_jit_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_jit_requests
    ADD CONSTRAINT rbac_jit_requests_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_grants rbac_role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants
    ADD CONSTRAINT rbac_role_grants_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_grants rbac_role_grants_role_id_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants
    ADD CONSTRAINT rbac_role_grants_role_id_feature_key_key UNIQUE (role_id, feature_key);


--
-- Name: rbac_role_history rbac_role_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_history
    ADD CONSTRAINT rbac_role_history_pkey PRIMARY KEY (id);


--
-- Name: rbac_roles rbac_roles_companyId_role_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT "rbac_roles_companyId_role_key_key" UNIQUE ("companyId", role_key);


--
-- Name: rbac_roles rbac_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_sod_rules rbac_sod_rules_companyId_rule_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_sod_rules
    ADD CONSTRAINT "rbac_sod_rules_companyId_rule_key_key" UNIQUE ("companyId", rule_key);


--
-- Name: rbac_sod_rules rbac_sod_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_sod_rules
    ADD CONSTRAINT rbac_sod_rules_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_grants rbac_user_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_grants
    ADD CONSTRAINT rbac_user_grants_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_roles rbac_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles
    ADD CONSTRAINT rbac_user_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_roles rbac_user_roles_userId_companyId_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles
    ADD CONSTRAINT "rbac_user_roles_userId_companyId_role_id_key" UNIQUE ("userId", "companyId", role_id);


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
-- Name: salary_history salary_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history
    ADD CONSTRAINT salary_history_pkey PRIMARY KEY (id);


--
-- Name: saudization_snapshots saudization_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saudization_snapshots
    ADD CONSTRAINT saudization_snapshots_pkey PRIMARY KEY (id);


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
-- Name: smart_recommendations smart_recommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_recommendations
    ADD CONSTRAINT smart_recommendations_pkey PRIMARY KEY (id);


--
-- Name: sms_queue sms_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_queue
    ADD CONSTRAINT sms_queue_pkey PRIMARY KEY (id);


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
-- Name: system_stops system_stops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_stops
    ADD CONSTRAINT system_stops_pkey PRIMARY KEY (id);


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
-- Name: ticket_replies ticket_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_pkey PRIMARY KEY (id);


--
-- Name: training_courses training_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses
    ADD CONSTRAINT training_courses_pkey PRIMARY KEY (id);


--
-- Name: training_enrollments training_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments
    ADD CONSTRAINT training_enrollments_pkey PRIMARY KEY (id);


--
-- Name: training_participants training_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT training_participants_pkey PRIMARY KEY (id);


--
-- Name: training_programs training_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs
    ADD CONSTRAINT training_programs_pkey PRIMARY KEY (id);


--
-- Name: trainings trainings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT trainings_pkey PRIMARY KEY (id);


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
-- Name: umrah_groups umrah_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_groups
    ADD CONSTRAINT umrah_groups_pkey PRIMARY KEY (id);


--
-- Name: umrah_import_batches umrah_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_batches
    ADD CONSTRAINT umrah_import_batches_pkey PRIMARY KEY (id);


--
-- Name: umrah_import_changes umrah_import_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_changes
    ADD CONSTRAINT umrah_import_changes_pkey PRIMARY KEY (id);


--
-- Name: umrah_import_logs umrah_import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_logs
    ADD CONSTRAINT umrah_import_logs_pkey PRIMARY KEY (id);


--
-- Name: umrah_nusk_invoices umrah_nusk_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_nusk_invoices
    ADD CONSTRAINT umrah_nusk_invoices_pkey PRIMARY KEY (id);


--
-- Name: umrah_packages umrah_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_packages
    ADD CONSTRAINT umrah_packages_pkey PRIMARY KEY (id);


--
-- Name: umrah_payment_allocations umrah_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payment_allocations
    ADD CONSTRAINT umrah_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: umrah_payments umrah_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payments
    ADD CONSTRAINT umrah_payments_pkey PRIMARY KEY (id);


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
-- Name: umrah_pricing umrah_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_pricing
    ADD CONSTRAINT umrah_pricing_pkey PRIMARY KEY (id);


--
-- Name: umrah_sales_invoice_items umrah_sales_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoice_items
    ADD CONSTRAINT umrah_sales_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: umrah_sales_invoices umrah_sales_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoices
    ADD CONSTRAINT umrah_sales_invoices_pkey PRIMARY KEY (id);


--
-- Name: umrah_seasons umrah_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_seasons
    ADD CONSTRAINT umrah_seasons_pkey PRIMARY KEY (id);


--
-- Name: umrah_sub_agents umrah_sub_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sub_agents
    ADD CONSTRAINT umrah_sub_agents_pkey PRIMARY KEY (id);


--
-- Name: umrah_transport umrah_transport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport
    ADD CONSTRAINT umrah_transport_pkey PRIMARY KEY (id);


--
-- Name: umrah_violations umrah_violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_violations
    ADD CONSTRAINT umrah_violations_pkey PRIMARY KEY (id);


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
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


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
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: warehouse_categories warehouse_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories
    ADD CONSTRAINT warehouse_categories_pkey PRIMARY KEY (id);


--
-- Name: warehouse_cycle_count_lines warehouse_cycle_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_count_lines
    ADD CONSTRAINT warehouse_cycle_count_lines_pkey PRIMARY KEY (id);


--
-- Name: warehouse_cycle_counts warehouse_cycle_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_counts
    ADD CONSTRAINT warehouse_cycle_counts_pkey PRIMARY KEY (id);


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
-- Name: warehouse_stock_lots warehouse_stock_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_lots
    ADD CONSTRAINT warehouse_stock_lots_pkey PRIMARY KEY (id);


--
-- Name: warehouse_stock_serials warehouse_stock_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_serials
    ADD CONSTRAINT warehouse_stock_serials_pkey PRIMARY KEY (id);


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
-- Name: workflow_requests workflow_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_requests
    ADD CONSTRAINT workflow_requests_pkey PRIMARY KEY (id);


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
-- Name: wps_run_lines wps_run_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_run_lines
    ADD CONSTRAINT wps_run_lines_pkey PRIMARY KEY (id);


--
-- Name: wps_runs wps_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_runs
    ADD CONSTRAINT wps_runs_pkey PRIMARY KEY (id);


--
-- Name: wps_settings wps_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_settings
    ADD CONSTRAINT wps_settings_pkey PRIMARY KEY ("companyId");


--
-- Name: zatca_icv_counters zatca_icv_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_icv_counters
    ADD CONSTRAINT zatca_icv_counters_pkey PRIMARY KEY ("companyId");


--
-- Name: zatca_retry_queue zatca_retry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_retry_queue
    ADD CONSTRAINT zatca_retry_queue_pkey PRIMARY KEY (id);


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
-- Name: company_documents_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_documents_company_idx ON public.company_documents USING btree ("companyId");


--
-- Name: company_documents_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_documents_expiry_idx ON public.company_documents USING btree ("expiryDate") WHERE ((status)::text = 'active'::text);


--
-- Name: correspondence_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX correspondence_company_idx ON public.correspondence USING btree ("companyId");


--
-- Name: correspondence_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX correspondence_direction_idx ON public.correspondence USING btree ("companyId", direction);


--
-- Name: correspondence_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX correspondence_entity_idx ON public.correspondence USING btree ("entityType", "entityId");


--
-- Name: correspondence_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX correspondence_ref_idx ON public.correspondence USING btree (ref);


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
-- Name: employee_assignments_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_assignments_company_status_idx ON public.employee_assignments USING btree ("companyId", status);


--
-- Name: employee_contracts_approval_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_contracts_approval_idx ON public.employee_contracts USING btree ("approvalStatus");


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
-- Name: employee_contracts_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_contracts_ref_idx ON public.employee_contracts USING btree (ref);


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
-- Name: event_dlq_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_dlq_company_idx ON public.event_dlq USING btree ("companyId", "createdAt" DESC);


--
-- Name: event_dlq_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_dlq_event_idx ON public.event_dlq USING btree ("eventName") WHERE ("resolvedAt" IS NULL);


--
-- Name: event_dlq_unresolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_dlq_unresolved_idx ON public.event_dlq USING btree ("createdAt" DESC) WHERE ("resolvedAt" IS NULL);


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
-- Name: hr_memo_appeal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hr_memo_appeal_idx ON public.hr_inquiry_memos USING btree (status) WHERE (status = 'appeal_pending'::text);


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
-- Name: idx_activity_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_company ON public.activity_logs USING btree ("companyId", "createdAt");


--
-- Name: idx_alert_fatigue_settings_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_fatigue_settings_assignment ON public.alert_fatigue_settings USING btree ("assignmentId");


--
-- Name: idx_alert_fatigue_settings_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_fatigue_settings_companyid ON public.alert_fatigue_settings USING btree ("companyId");


--
-- Name: idx_alert_mute_rules_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_mute_rules_assignment ON public.alert_mute_rules USING btree ("assignmentId");


--
-- Name: idx_alert_mute_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_mute_rules_company ON public.alert_mute_rules USING btree ("companyId");


--
-- Name: idx_alert_mute_rules_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alert_mute_rules_companyid ON public.alert_mute_rules USING btree ("companyId");


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
-- Name: idx_approval_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_company ON public.approval_requests USING btree ("companyId");


--
-- Name: idx_approval_requests_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_company_status ON public.approval_requests USING btree ("companyId", status);


--
-- Name: idx_approval_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_status ON public.approval_requests USING btree (status);


--
-- Name: idx_attendance_deductions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_deductions_companyid ON public.attendance_deductions USING btree ("companyId");


--
-- Name: idx_attendance_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_deletedat ON public.attendance USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_attendance_policies_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_policies_companyid ON public.attendance_policies USING btree ("companyId");


--
-- Name: idx_audit_archive_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_archive_company ON public.audit_archive USING btree ("companyId", "createdAt");


--
-- Name: idx_audit_logs_archive_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_archive_companyid ON public.audit_logs_archive USING btree ("companyId");


--
-- Name: idx_audit_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company ON public.audit_logs USING btree ("companyId");


--
-- Name: idx_audit_logs_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_company_date ON public.audit_logs USING btree ("companyId", "createdAt");


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree ("createdAt");


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity, "entityId");


--
-- Name: idx_audit_umrah_access_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_umrah_access_company ON public.audit_umrah_access USING btree ("companyId", "createdAt" DESC);


--
-- Name: idx_audit_umrah_access_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_umrah_access_companyid ON public.audit_umrah_access USING btree ("companyId");


--
-- Name: idx_audit_umrah_access_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_umrah_access_user ON public.audit_umrah_access USING btree ("userId", "createdAt" DESC);


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
-- Name: idx_auto_detection_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auto_detection_company ON public.auto_detection_log USING btree ("companyId", "ruleType");


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
-- Name: idx_bi_dashboards_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bi_dashboards_companyid ON public.bi_dashboards USING btree ("companyId");


--
-- Name: idx_bi_kpis_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bi_kpis_companyid ON public.bi_kpis USING btree ("companyId");


--
-- Name: idx_bi_reports_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bi_reports_companyid ON public.bi_reports USING btree ("companyId");


--
-- Name: idx_branches_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_companyid ON public.branches USING btree ("companyId");


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
-- Name: idx_business_rules_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rules_deletedat ON public.business_rules USING btree ("deletedAt");


--
-- Name: idx_business_rules_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_rules_trigger ON public.business_rules USING btree ("triggerEvent");


--
-- Name: idx_capa_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capa_company ON public.governance_capa USING btree ("companyId");


--
-- Name: idx_chart_of_accounts_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chart_of_accounts_deletedat ON public.chart_of_accounts USING btree ("deletedAt");


--
-- Name: idx_client_portal_accounts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_portal_accounts_client ON public.client_portal_accounts USING btree ("clientId", "companyId");


--
-- Name: idx_client_portal_accounts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_client_portal_accounts_email ON public.client_portal_accounts USING btree (email);


--
-- Name: idx_clients_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_company ON public.clients USING btree ("companyId");


--
-- Name: idx_clients_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_companyid ON public.clients USING btree ("companyId");


--
-- Name: idx_collection_follow_ups_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_follow_ups_companyid ON public.collection_follow_ups USING btree ("companyId");


--
-- Name: idx_communications_log_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_log_companyid ON public.communications_log USING btree ("companyId");


--
-- Name: idx_communications_log_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_communications_log_deletedat ON public.communications_log USING btree ("deletedAt");


--
-- Name: idx_comp_actions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comp_actions_company ON public.policy_compliance_actions USING btree ("companyId");


--
-- Name: idx_company_documents_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_documents_company ON public.company_documents USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_correspondence_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_correspondence_company ON public.correspondence USING btree ("companyId", status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_cost_centers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_centers_company ON public.cost_centers USING btree ("companyId");


--
-- Name: idx_cost_centers_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_centers_entity ON public.cost_centers USING btree ("relatedEntityType", "relatedEntityId");


--
-- Name: idx_credit_memos_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_memos_company ON public.credit_memos USING btree ("companyId");


--
-- Name: idx_credit_memos_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_memos_invoice ON public.credit_memos USING btree ("invoiceId");


--
-- Name: idx_crm_contacts_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_contacts_companyid ON public.crm_contacts USING btree ("companyId");


--
-- Name: idx_crm_opportunities_converted_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_opportunities_converted_client ON public.crm_opportunities USING btree ("convertedClientId") WHERE ("convertedClientId" IS NOT NULL);


--
-- Name: idx_cron_jobs_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_jobs_companyid ON public.cron_jobs USING btree ("companyId");


--
-- Name: idx_cron_logs_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cron_logs_companyid ON public.cron_logs USING btree ("companyId");


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
-- Name: idx_customer_advances_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_advances_client ON public.customer_advances USING btree ("clientId");


--
-- Name: idx_customer_advances_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_advances_company ON public.customer_advances USING btree ("companyId");


--
-- Name: idx_customer_advances_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_advances_companyid ON public.customer_advances USING btree ("companyId");


--
-- Name: idx_cycle_counts_warehouse_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cycle_counts_warehouse_status ON public.warehouse_cycle_counts USING btree ("warehouseId", status);


--
-- Name: idx_cycle_lines_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cycle_lines_cycle ON public.warehouse_cycle_count_lines USING btree ("cycleCountId");


--
-- Name: idx_daily_close_log_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_close_log_companyid ON public.daily_close_log USING btree ("companyId");


--
-- Name: idx_data_access_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_requests_company ON public.data_access_requests USING btree ("companyId");


--
-- Name: idx_data_access_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_access_requests_status ON public.data_access_requests USING btree (status);


--
-- Name: idx_data_retention_policies_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_retention_policies_companyid ON public.data_retention_policies USING btree ("companyId");


--
-- Name: idx_debit_memos_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_memos_company ON public.debit_memos USING btree ("companyId");


--
-- Name: idx_debit_memos_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debit_memos_invoice ON public.debit_memos USING btree ("invoiceId");


--
-- Name: idx_delegations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delegations_company ON public.delegations USING btree ("companyId");


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
-- Name: idx_departments_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_companyid ON public.departments USING btree ("companyId");


--
-- Name: idx_depreciation_entries_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_depreciation_entries_asset ON public.depreciation_entries USING btree ("assetId");


--
-- Name: idx_depreciation_entries_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_depreciation_entries_companyid ON public.depreciation_entries USING btree ("companyId");


--
-- Name: idx_digital_signature_otps_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_digital_signature_otps_companyid ON public.digital_signature_otps USING btree ("companyId");


--
-- Name: idx_discipline_memos_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discipline_memos_company ON public.discipline_memos USING btree ("companyId");


--
-- Name: idx_discipline_memos_violation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discipline_memos_violation ON public.discipline_memos USING btree ("violationId");


--
-- Name: idx_doc_entity_links_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_entity_links_entity ON public.document_entity_links USING btree ("entityType", "entityId");


--
-- Name: idx_doc_versions_docid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_versions_docid ON public.document_versions USING btree ("documentId");


--
-- Name: idx_document_folders_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_folders_companyid ON public.document_folders USING btree ("companyId");


--
-- Name: idx_document_templates_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_templates_companyid ON public.document_templates USING btree ("companyId");


--
-- Name: idx_document_templates_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_templates_deletedat ON public.document_templates USING btree ("deletedAt");


--
-- Name: idx_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_category ON public.documents USING btree (category);


--
-- Name: idx_documents_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_companyid ON public.documents USING btree ("companyId");


--
-- Name: idx_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_status ON public.documents USING btree (status);


--
-- Name: idx_dunning_letters_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dunning_letters_invoice ON public.dunning_letters USING btree ("invoiceId");


--
-- Name: idx_ea_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ea_manager_id ON public.employee_assignments USING btree ("managerId");


--
-- Name: idx_ecc_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecc_plan ON public.employee_commission_calculations USING btree ("planId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_ecp_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecp_company ON public.employee_commission_plans USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_ect_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ect_plan ON public.employee_commission_tiers USING btree ("planId");


--
-- Name: idx_email_queue_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_queue_companyid ON public.email_queue USING btree ("companyId");


--
-- Name: idx_employee_assignments_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_branch ON public.employee_assignments USING btree ("branchId");


--
-- Name: idx_employee_assignments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_company ON public.employee_assignments USING btree ("companyId");


--
-- Name: idx_employee_assignments_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_department ON public.employee_assignments USING btree ("departmentId");


--
-- Name: idx_employee_assignments_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_employee ON public.employee_assignments USING btree ("employeeId");


--
-- Name: idx_employee_assignments_jobtitle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_jobtitle ON public.employee_assignments USING btree ("jobTitleId");


--
-- Name: idx_employee_assignments_manager_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_manager_id ON public.employee_assignments USING btree ("managerId");


--
-- Name: idx_employee_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_assignments_status ON public.employee_assignments USING btree (status);


--
-- Name: idx_employee_commission_calculations_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_commission_calculations_companyid ON public.employee_commission_calculations USING btree ("companyId");


--
-- Name: idx_employee_commission_calculations_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_commission_calculations_deletedat ON public.employee_commission_calculations USING btree ("deletedAt");


--
-- Name: idx_employee_commission_plans_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_commission_plans_companyid ON public.employee_commission_plans USING btree ("companyId");


--
-- Name: idx_employee_commission_plans_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_commission_plans_deletedat ON public.employee_commission_plans USING btree ("deletedAt");


--
-- Name: idx_employee_contracts_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_employee_contracts_ref ON public.employee_contracts USING btree ("companyId", ref) WHERE ((ref IS NOT NULL) AND ("deletedAt" IS NULL));


--
-- Name: idx_employee_development_plans_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_development_plans_companyid ON public.employee_development_plans USING btree ("companyId");


--
-- Name: idx_employee_development_plans_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_development_plans_deletedat ON public.employee_development_plans USING btree ("deletedAt");


--
-- Name: idx_employee_kpi_snapshots_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_kpi_snapshots_company ON public.employee_kpi_snapshots USING btree ("companyId");


--
-- Name: idx_employee_kpi_snapshots_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_kpi_snapshots_companyid ON public.employee_kpi_snapshots USING btree ("companyId");


--
-- Name: idx_employee_monthly_attendance_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_monthly_attendance_companyid ON public.employee_monthly_attendance USING btree ("companyId");


--
-- Name: idx_employee_of_month_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_of_month_companyid ON public.employee_of_month USING btree ("companyId");


--
-- Name: idx_employee_transfers_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_transfers_companyid ON public.employee_transfers USING btree ("companyId");


--
-- Name: idx_employee_violations_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_violations_deletedat ON public.employee_violations USING btree ("deletedAt");


--
-- Name: idx_employees_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_active ON public.employees USING btree ("companyId");


--
-- Name: idx_employees_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_branch ON public.employees USING btree ("branchId");


--
-- Name: idx_employees_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_company ON public.employees USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


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
-- Name: idx_evaluation_participants_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evaluation_participants_companyid ON public.evaluation_participants USING btree ("companyId");


--
-- Name: idx_event_logs_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_company_date ON public.event_logs USING btree ("companyId", "createdAt");


--
-- Name: idx_excuse_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excuse_assignment ON public.hr_excuse_requests USING btree ("assignmentId", status);


--
-- Name: idx_excuse_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excuse_company_date ON public.hr_excuse_requests USING btree ("companyId", "excuseDate");


--
-- Name: idx_expenses_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_company ON public.expenses USING btree ("companyId", status);


--
-- Name: idx_expenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);


--
-- Name: idx_fallback_chains_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fallback_chains_company ON public.notification_fallback_chains USING btree ("companyId");


--
-- Name: idx_feature_catalog_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feature_catalog_module ON public.feature_catalog USING btree (module_key);


--
-- Name: idx_feature_catalog_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feature_catalog_parent ON public.feature_catalog USING btree (parent_key);


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
-- Name: idx_fleet_preventive_plans_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fleet_preventive_plans_companyid ON public.fleet_preventive_plans USING btree ("companyId");


--
-- Name: idx_fleet_traffic_violations_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fleet_traffic_violations_companyid ON public.fleet_traffic_violations USING btree ("companyId");


--
-- Name: idx_fleet_traffic_violations_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fleet_traffic_violations_deletedat ON public.fleet_traffic_violations USING btree ("deletedAt");


--
-- Name: idx_fleet_trips_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fleet_trips_client ON public.fleet_trips USING btree ("clientId");


--
-- Name: idx_fpf_company_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fpf_company_resolved ON public.financial_posting_failures USING btree ("companyId", resolved, "createdAt" DESC);


--
-- Name: idx_fx_rates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rates_company ON public.fx_rates USING btree ("companyId");


--
-- Name: idx_fx_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rates_lookup ON public.fx_rates USING btree ("companyId", "fromCurrency", "toCurrency", "effectiveDate" DESC);


--
-- Name: idx_fx_revaluation_lines_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_revaluation_lines_entity ON public.fx_revaluation_lines USING btree ("entityType", "entityId");


--
-- Name: idx_fx_revaluation_log_company_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_revaluation_log_company_period ON public.fx_revaluation_log USING btree ("companyId", "periodId");


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
-- Name: idx_governance_audits_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_audits_companyid ON public.governance_audits USING btree ("companyId");


--
-- Name: idx_governance_audits_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_audits_deletedat ON public.governance_audits USING btree ("deletedAt");


--
-- Name: idx_governance_capa_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_capa_companyid ON public.governance_capa USING btree ("companyId");


--
-- Name: idx_governance_compliance_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_compliance_companyid ON public.governance_compliance USING btree ("companyId");


--
-- Name: idx_governance_compliance_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_compliance_deletedat ON public.governance_compliance USING btree ("deletedAt");


--
-- Name: idx_governance_policies_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_policies_companyid ON public.governance_policies USING btree ("companyId");


--
-- Name: idx_governance_policies_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_policies_deletedat ON public.governance_policies USING btree ("deletedAt");


--
-- Name: idx_governance_risks_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_risks_companyid ON public.governance_risks USING btree ("companyId");


--
-- Name: idx_governance_risks_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_governance_risks_deletedat ON public.governance_risks USING btree ("deletedAt");


--
-- Name: idx_grn_items_grn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_grn ON public.goods_receipt_items USING btree ("grnId");


--
-- Name: idx_grn_items_po_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grn_items_po_item ON public.goods_receipt_items USING btree ("poItemId");


--
-- Name: idx_hr_employee_loans_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_employee_loans_assignment ON public.hr_employee_loans USING btree ("assignmentId");


--
-- Name: idx_hr_employee_loans_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_employee_loans_company ON public.hr_employee_loans USING btree ("companyId");


--
-- Name: idx_hr_employee_loans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_employee_loans_status ON public.hr_employee_loans USING btree (status);


--
-- Name: idx_hr_excuse_requests_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_excuse_requests_companyid ON public.hr_excuse_requests USING btree ("companyId");


--
-- Name: idx_hr_exit_clearance_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_exit_clearance_companyid ON public.hr_exit_clearance USING btree ("companyId");


--
-- Name: idx_hr_exit_clearance_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_exit_clearance_request ON public.hr_exit_clearance USING btree ("exitRequestId");


--
-- Name: idx_hr_exit_requests_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_exit_requests_assignment ON public.hr_exit_requests USING btree ("assignmentId");


--
-- Name: idx_hr_exit_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_exit_requests_company ON public.hr_exit_requests USING btree ("companyId");


--
-- Name: idx_hr_exit_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_exit_requests_status ON public.hr_exit_requests USING btree (status);


--
-- Name: idx_hr_leave_balances_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_leave_balances_companyid ON public.hr_leave_balances USING btree ("companyId");


--
-- Name: idx_hr_leave_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_leave_requests_company ON public.hr_leave_requests USING btree ("companyId");


--
-- Name: idx_hr_leave_requests_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_leave_requests_employee ON public.hr_leave_requests USING btree ("employeeId");


--
-- Name: idx_hr_leave_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_leave_requests_status ON public.hr_leave_requests USING btree (status);


--
-- Name: idx_hr_leave_types_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_leave_types_companyid ON public.hr_leave_types USING btree ("companyId");


--
-- Name: idx_hr_loan_installments_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_loan_installments_companyid ON public.hr_loan_installments USING btree ("companyId");


--
-- Name: idx_hr_loan_installments_loan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_loan_installments_loan ON public.hr_loan_installments USING btree ("loanId");


--
-- Name: idx_hr_loan_installments_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_loan_installments_period ON public.hr_loan_installments USING btree (period);


--
-- Name: idx_hr_overtime_requests_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_overtime_requests_assignment ON public.hr_overtime_requests USING btree ("assignmentId");


--
-- Name: idx_hr_overtime_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_overtime_requests_company ON public.hr_overtime_requests USING btree ("companyId");


--
-- Name: idx_hr_overtime_requests_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_overtime_requests_date ON public.hr_overtime_requests USING btree ("overtimeDate");


--
-- Name: idx_hr_overtime_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_overtime_requests_status ON public.hr_overtime_requests USING btree (status);


--
-- Name: idx_hr_violations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_violations_company ON public.hr_violations USING btree ("companyId");


--
-- Name: idx_hr_violations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hr_violations_status ON public.hr_violations USING btree (status);


--
-- Name: idx_import_batches_company_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_company_entity ON public.import_batches USING btree ("companyId", "entityKey", "uploadedAt" DESC);


--
-- Name: idx_import_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_status ON public.import_batches USING btree ("companyId", status) WHERE ("deletedAt" IS NULL);


--
-- Name: idx_integration_logs_archive_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_logs_archive_companyid ON public.integration_logs_archive USING btree ("companyId");


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
-- Name: idx_integrations_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_companyid ON public.integrations USING btree ("companyId");


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
-- Name: idx_intercompany_transactions_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intercompany_transactions_deletedat ON public.intercompany_transactions USING btree ("deletedAt");


--
-- Name: idx_inv_payments_inv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inv_payments_inv ON public.invoice_payments USING btree ("invoiceId");


--
-- Name: idx_inv_payments_txref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inv_payments_txref ON public.invoice_payments USING btree ("transactionRef") WHERE ("transactionRef" IS NOT NULL);


--
-- Name: idx_inventory_counts_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_counts_companyid ON public.inventory_counts USING btree ("companyId");


--
-- Name: idx_invoice_collection_stages_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_collection_stages_companyid ON public.invoice_collection_stages USING btree ("companyId");


--
-- Name: idx_invoice_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items USING btree ("invoiceId");


--
-- Name: idx_invoice_payments_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_companyid ON public.invoice_payments USING btree ("companyId");


--
-- Name: idx_invoices_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_active ON public.invoices USING btree ("companyId");


--
-- Name: idx_invoices_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_branch ON public.invoices USING btree ("branchId");


--
-- Name: idx_invoices_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client ON public.invoices USING btree ("clientId");


--
-- Name: idx_invoices_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_company ON public.invoices USING btree ("companyId");


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree ("dueDate");


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_job_applications_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_applications_deletedat ON public.job_applications USING btree ("deletedAt");


--
-- Name: idx_job_titles_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_titles_category ON public.job_titles USING btree (category);


--
-- Name: idx_job_titles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_titles_company ON public.job_titles USING btree ("companyId");


--
-- Name: idx_job_titles_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_titles_companyid ON public.job_titles USING btree ("companyId");


--
-- Name: idx_journal_entries_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_approved_by ON public.journal_entries USING btree ("approvedBy");


--
-- Name: idx_journal_entries_posted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_posted_by ON public.journal_entries USING btree ("postedBy");


--
-- Name: idx_journal_entries_reversal_of; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_reversal_of ON public.journal_entries USING btree ("reversalOfId") WHERE ("reversalOfId" IS NOT NULL);


--
-- Name: idx_journal_lines_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_client ON public.journal_lines USING btree ("clientId") WHERE ("clientId" IS NOT NULL);


--
-- Name: idx_journal_lines_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_driver ON public.journal_lines USING btree ("driverId") WHERE ("driverId" IS NOT NULL);


--
-- Name: idx_journal_lines_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_product ON public.journal_lines USING btree ("productId") WHERE ("productId" IS NOT NULL);


--
-- Name: idx_journal_lines_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_lines_vendor ON public.journal_lines USING btree ("vendorId") WHERE ("vendorId" IS NOT NULL);


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
-- Name: idx_kpi_snapshots_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kpi_snapshots_companyid ON public.kpi_snapshots USING btree ("companyId");


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
-- Name: idx_legal_correspondence_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_correspondence_companyid ON public.legal_correspondence USING btree ("companyId");


--
-- Name: idx_legal_judgments_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_legal_judgments_companyid ON public.legal_judgments USING btree ("companyId");


--
-- Name: idx_loan_accounts_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loan_accounts_companyid ON public.loan_accounts USING btree ("companyId");


--
-- Name: idx_lots_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lots_expiry ON public.warehouse_stock_lots USING btree ("expiryDate") WHERE (((status)::text = 'active'::text) AND ("deletedAt" IS NULL));


--
-- Name: idx_lots_picker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lots_picker ON public.warehouse_stock_lots USING btree ("companyId", "productId", "warehouseId", status, "receivedDate") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_maintenance_requests_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_requests_companyid ON public.maintenance_requests USING btree ("companyId");


--
-- Name: idx_marketing_campaigns_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_campaigns_companyid ON public.marketing_campaigns USING btree ("companyId");


--
-- Name: idx_mudad_company_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mudad_company_period ON public.mudad_settlements USING btree ("companyId", period);


--
-- Name: idx_mudad_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mudad_employee ON public.mudad_settlements USING btree ("employeeId");


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
-- Name: idx_notification_log_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_log_companyid ON public.notification_log USING btree ("companyId");


--
-- Name: idx_notification_webhooks_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_webhooks_companyid ON public.notification_webhooks USING btree ("companyId");


--
-- Name: idx_notifications_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_companyid ON public.notifications USING btree ("companyId");


--
-- Name: idx_obligations_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_obligations_dedupe ON public.obligations USING btree ("companyId", "dedupeKey") WHERE ("dedupeKey" IS NOT NULL);


--
-- Name: idx_obligations_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_obligations_entity ON public.obligations USING btree ("companyId", "entityType", "entityId");


--
-- Name: idx_obligations_scan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_obligations_scan ON public.obligations USING btree (status, "dueAt");


--
-- Name: idx_password_reset_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_pending ON public.password_reset_requests USING btree (status, "createdAt");


--
-- Name: idx_payment_run_items_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_run_items_run ON public.payment_run_items USING btree ("runId");


--
-- Name: idx_payment_runs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_runs_company ON public.payment_runs USING btree ("companyId");


--
-- Name: idx_payment_runs_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_runs_companyid ON public.payment_runs USING btree ("companyId");


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
-- Name: idx_payroll_deductions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_deductions_company ON public.payroll_deductions USING btree ("companyId");


--
-- Name: idx_payroll_deductions_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_deductions_employee ON public.payroll_deductions USING btree ("employeeId");


--
-- Name: idx_payroll_lines_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_lines_run ON public.payroll_lines USING btree ("runId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_payroll_runs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_runs_company ON public.payroll_runs USING btree ("companyId", period, "deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_pbx_calls_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbx_calls_companyid ON public.pbx_calls USING btree ("companyId");


--
-- Name: idx_permissions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_permissions_companyid ON public.permissions USING btree ("companyId");


--
-- Name: idx_policy_compliance_actions_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_compliance_actions_deletedat ON public.policy_compliance_actions USING btree ("deletedAt");


--
-- Name: idx_policy_module_links_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_module_links_companyid ON public.policy_module_links USING btree ("companyId");


--
-- Name: idx_policy_module_links_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_module_links_module ON public.policy_module_links USING btree (module);


--
-- Name: idx_policy_module_links_policy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_module_links_policy ON public.policy_module_links USING btree ("policyId");


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
-- Name: idx_products_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_company ON public.products USING btree ("companyId");


--
-- Name: idx_project_costs_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_costs_companyid ON public.project_costs USING btree ("companyId");


--
-- Name: idx_project_milestones_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_milestones_companyid ON public.project_milestones USING btree ("companyId");


--
-- Name: idx_project_resources_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_resources_companyid ON public.project_resources USING btree ("companyId");


--
-- Name: idx_project_risks_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_risks_companyid ON public.project_risks USING btree ("companyId");


--
-- Name: idx_projects_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_company ON public.projects USING btree ("companyId");


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_property_buildings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_buildings_company ON public.property_buildings USING btree ("companyId");


--
-- Name: idx_property_contracts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_contracts_company ON public.property_contracts USING btree ("companyId");


--
-- Name: idx_property_contracts_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_contracts_companyid ON public.property_contracts USING btree ("companyId");


--
-- Name: idx_property_inspections_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_inspections_companyid ON public.property_inspections USING btree ("companyId");


--
-- Name: idx_property_owners_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_owners_company ON public.property_owners USING btree ("companyId");


--
-- Name: idx_property_owners_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_owners_deletedat ON public.property_owners USING btree ("deletedAt");


--
-- Name: idx_property_security_deposits_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_property_security_deposits_companyid ON public.property_security_deposits USING btree ("companyId");


--
-- Name: idx_public_announcements_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_announcements_active ON public.public_announcements USING btree ("isActive", "publishedAt");


--
-- Name: idx_public_holidays_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_holidays_companyid ON public.public_holidays USING btree ("companyId");


--
-- Name: idx_public_holidays_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_holidays_deletedat ON public.public_holidays USING btree ("deletedAt");


--
-- Name: idx_purchase_order_lines_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_lines_po ON public.purchase_order_lines USING btree ("purchaseOrderId");


--
-- Name: idx_purchase_orders_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_branch ON public.purchase_orders USING btree ("branchId");


--
-- Name: idx_purchase_orders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_company ON public.purchase_orders USING btree ("companyId");


--
-- Name: idx_purchase_orders_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_request ON public.purchase_orders USING btree ("requestId");


--
-- Name: idx_purchase_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_purchase_orders_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders USING btree ("supplierId");


--
-- Name: idx_purchase_requests_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_requests_companyid ON public.purchase_requests USING btree ("companyId");


--
-- Name: idx_push_subscriptions_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_assignment ON public.push_subscriptions USING btree ("assignmentId");


--
-- Name: idx_push_subscriptions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_company ON public.push_subscriptions USING btree ("companyId");


--
-- Name: idx_push_subscriptions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_companyid ON public.push_subscriptions USING btree ("companyId");


--
-- Name: idx_rbac_approval_limits_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_approval_limits_role ON public.rbac_approval_limits USING btree (role_id);


--
-- Name: idx_rbac_field_policies_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_field_policies_lookup ON public.rbac_field_policies USING btree (role_id, feature_key);


--
-- Name: idx_rbac_jit_requests_expiring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_jit_requests_expiring ON public.rbac_jit_requests USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND ((status)::text = 'approved'::text));


--
-- Name: idx_rbac_jit_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_jit_requests_pending ON public.rbac_jit_requests USING btree ("companyId", status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_rbac_jit_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_jit_requests_user ON public.rbac_jit_requests USING btree ("userId", "companyId", status);


--
-- Name: idx_rbac_role_grants_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_role_grants_feature ON public.rbac_role_grants USING btree (feature_key);


--
-- Name: idx_rbac_role_grants_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_role_grants_role ON public.rbac_role_grants USING btree (role_id);


--
-- Name: idx_rbac_role_history_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_role_history_company ON public.rbac_role_history USING btree ("companyId");


--
-- Name: idx_rbac_role_history_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_role_history_role ON public.rbac_role_history USING btree (role_id);


--
-- Name: idx_rbac_roles_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_roles_company ON public.rbac_roles USING btree ("companyId");


--
-- Name: idx_rbac_roles_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_roles_template ON public.rbac_roles USING btree (is_template) WHERE (is_template = true);


--
-- Name: idx_rbac_user_grants_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_grants_expiry ON public.rbac_user_grants USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_rbac_user_grants_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_grants_lookup ON public.rbac_user_grants USING btree ("userId", "companyId");


--
-- Name: idx_rbac_user_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_roles_user ON public.rbac_user_roles USING btree ("userId", "companyId");


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
-- Name: idx_rental_contracts_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rental_contracts_deletedat ON public.rental_contracts USING btree ("deletedAt");


--
-- Name: idx_request_types_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_types_companyid ON public.request_types USING btree ("companyId");


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
-- Name: idx_roles_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_companyid ON public.roles USING btree ("companyId");


--
-- Name: idx_routing_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_rules_company ON public.notification_routing_rules USING btree ("companyId");


--
-- Name: idx_routing_rules_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_rules_event ON public.notification_routing_rules USING btree ("eventCategory");


--
-- Name: idx_salary_history_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_history_employee ON public.salary_history USING btree ("employeeId", "createdAt" DESC);


--
-- Name: idx_scheduled_reports_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_reports_companyid ON public.scheduled_reports USING btree ("companyId");


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
-- Name: idx_serials_product_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_serials_product_status ON public.warehouse_stock_serials USING btree ("productId", status) WHERE ("deletedAt" IS NULL);


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
-- Name: idx_sla_definitions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sla_definitions_companyid ON public.sla_definitions USING btree ("companyId");


--
-- Name: idx_smart_alerts_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_alerts_companyid ON public.smart_alerts USING btree ("companyId");


--
-- Name: idx_sms_queue_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_queue_companyid ON public.sms_queue USING btree ("companyId");


--
-- Name: idx_store_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_order_items_order ON public.store_order_items USING btree ("orderId");


--
-- Name: idx_store_orders_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_store_orders_journal ON public.store_orders USING btree ("journalEntryId") WHERE ("journalEntryId" IS NOT NULL);


--
-- Name: idx_support_tickets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_company ON public.support_tickets USING btree ("companyId");


--
-- Name: idx_support_tickets_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_invoice ON public.support_tickets USING btree ("invoiceId");


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_system_evaluations_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_evaluations_companyid ON public.system_evaluations USING btree ("companyId");


--
-- Name: idx_system_settings_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_companyid ON public.system_settings USING btree ("companyId");


--
-- Name: idx_system_stops_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_stops_active ON public.system_stops USING btree ("companyId", active) WHERE (active = true);


--
-- Name: idx_system_stops_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_stops_companyid ON public.system_stops USING btree ("companyId");


--
-- Name: idx_tasks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company ON public.tasks USING btree ("companyId");


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_technicians_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technicians_companyid ON public.technicians USING btree ("companyId");


--
-- Name: idx_tenants_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_company ON public.tenants USING btree ("companyId");


--
-- Name: idx_tenants_national_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_national_id ON public.tenants USING btree ("nationalId");


--
-- Name: idx_ticket_csat_ratings_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_csat_ratings_companyid ON public.ticket_csat_ratings USING btree ("companyId");


--
-- Name: idx_training_courses_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_courses_company ON public.training_courses USING btree ("companyId");


--
-- Name: idx_training_enrollments_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_enrollments_deletedat ON public.training_enrollments USING btree ("deletedAt");


--
-- Name: idx_training_participants_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_participants_employee ON public.training_participants USING btree ("employeeId");


--
-- Name: idx_training_participants_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_training_participants_training ON public.training_participants USING btree ("trainingId");


--
-- Name: idx_trainings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_company ON public.trainings USING btree ("companyId");


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
-- Name: idx_umrah_agent_invoices_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_agent_invoices_agent ON public.umrah_agent_invoices USING btree ("agentId");


--
-- Name: idx_umrah_agent_invoices_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_agent_invoices_company ON public.umrah_agent_invoices USING btree ("companyId");


--
-- Name: idx_umrah_agent_invoices_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_agent_invoices_companyid ON public.umrah_agent_invoices USING btree ("companyId");


--
-- Name: idx_umrah_agent_invoices_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_agent_invoices_season ON public.umrah_agent_invoices USING btree ("seasonId");


--
-- Name: idx_umrah_import_batches_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_batches_company ON public.umrah_import_batches USING btree ("companyId");


--
-- Name: idx_umrah_import_batches_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_batches_companyid ON public.umrah_import_batches USING btree ("companyId");


--
-- Name: idx_umrah_import_batches_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_batches_season ON public.umrah_import_batches USING btree ("seasonId");


--
-- Name: idx_umrah_import_changes_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_changes_batch ON public.umrah_import_changes USING btree ("batchId");


--
-- Name: idx_umrah_import_changes_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_changes_entity ON public.umrah_import_changes USING btree ("entityType", "entityId");


--
-- Name: idx_umrah_import_logs_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_import_logs_companyid ON public.umrah_import_logs USING btree ("companyId");


--
-- Name: idx_umrah_invoices_journal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_invoices_journal ON public.umrah_agent_invoices USING btree ("journalEntryId") WHERE ("journalEntryId" IS NOT NULL);


--
-- Name: idx_umrah_nusk_invoices_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_nusk_invoices_companyid ON public.umrah_nusk_invoices USING btree ("companyId");


--
-- Name: idx_umrah_nusk_invoices_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_nusk_invoices_deletedat ON public.umrah_nusk_invoices USING btree ("deletedAt");


--
-- Name: idx_umrah_packages_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_packages_companyid ON public.umrah_packages USING btree ("companyId");


--
-- Name: idx_umrah_packages_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_packages_deletedat ON public.umrah_packages USING btree ("deletedAt");


--
-- Name: idx_umrah_payment_alloc_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_payment_alloc_invoice ON public.umrah_payment_allocations USING btree ("invoiceId");


--
-- Name: idx_umrah_payment_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_umrah_payment_ref ON public.umrah_payments USING btree ("companyId", ref) WHERE ((ref IS NOT NULL) AND ("deletedAt" IS NULL));


--
-- Name: idx_umrah_payment_sub_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_payment_sub_agent ON public.umrah_payments USING btree ("companyId", "subAgentId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_payments_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_payments_companyid ON public.umrah_payments USING btree ("companyId");


--
-- Name: idx_umrah_payments_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_payments_deletedat ON public.umrah_payments USING btree ("deletedAt");


--
-- Name: idx_umrah_penalties_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_penalties_agent ON public.umrah_penalties USING btree ("agentId");


--
-- Name: idx_umrah_penalties_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_penalties_company ON public.umrah_penalties USING btree ("companyId");


--
-- Name: idx_umrah_penalties_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_penalties_companyid ON public.umrah_penalties USING btree ("companyId");


--
-- Name: idx_umrah_penalties_pilgrim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_penalties_pilgrim ON public.umrah_penalties USING btree ("pilgrimId");


--
-- Name: idx_umrah_penalties_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_penalties_season ON public.umrah_penalties USING btree ("seasonId");


--
-- Name: idx_umrah_pilgrim_passport_season; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_umrah_pilgrim_passport_season ON public.umrah_pilgrims USING btree ("companyId", "passportNumber", "seasonId");


--
-- Name: idx_umrah_pilgrims_nusk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pilgrims_nusk ON public.umrah_pilgrims USING btree ("companyId", "nuskNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_pilgrims_passport_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pilgrims_passport_hash ON public.umrah_pilgrims USING btree ("passportNumber_hash") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_pilgrims_visa_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pilgrims_visa_expiry ON public.umrah_pilgrims USING btree ("visaExpiry") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_pilgrims_visa_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pilgrims_visa_hash ON public.umrah_pilgrims USING btree ("visaNumber_hash") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_pricing_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pricing_company ON public.umrah_pricing USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_pricing_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pricing_companyid ON public.umrah_pricing USING btree ("companyId");


--
-- Name: idx_umrah_pricing_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_pricing_deletedat ON public.umrah_pricing USING btree ("deletedAt");


--
-- Name: idx_umrah_sales_inv_items; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sales_inv_items ON public.umrah_sales_invoice_items USING btree ("invoiceId");


--
-- Name: idx_umrah_sales_inv_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_umrah_sales_inv_ref ON public.umrah_sales_invoices USING btree ("companyId", ref) WHERE ((ref IS NOT NULL) AND ("deletedAt" IS NULL));


--
-- Name: idx_umrah_sales_inv_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sales_inv_season ON public.umrah_sales_invoices USING btree ("companyId", "seasonId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_sales_inv_sub_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sales_inv_sub_agent ON public.umrah_sales_invoices USING btree ("companyId", "subAgentId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_sales_invoices_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sales_invoices_companyid ON public.umrah_sales_invoices USING btree ("companyId");


--
-- Name: idx_umrah_sales_invoices_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sales_invoices_deletedat ON public.umrah_sales_invoices USING btree ("deletedAt");


--
-- Name: idx_umrah_seasons_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_seasons_companyid ON public.umrah_seasons USING btree ("companyId");


--
-- Name: idx_umrah_sub_agents_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sub_agents_company ON public.umrah_sub_agents USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_sub_agents_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sub_agents_companyid ON public.umrah_sub_agents USING btree ("companyId");


--
-- Name: idx_umrah_sub_agents_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_sub_agents_deletedat ON public.umrah_sub_agents USING btree ("deletedAt");


--
-- Name: idx_umrah_transport_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_transport_companyid ON public.umrah_transport USING btree ("companyId");


--
-- Name: idx_umrah_transport_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_transport_deletedat ON public.umrah_transport USING btree ("deletedAt");


--
-- Name: idx_umrah_violations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_violations_company ON public.umrah_violations USING btree ("companyId") WHERE ("deletedAt" IS NULL);


--
-- Name: idx_umrah_violations_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_violations_companyid ON public.umrah_violations USING btree ("companyId");


--
-- Name: idx_umrah_violations_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_violations_deletedat ON public.umrah_violations USING btree ("deletedAt");


--
-- Name: idx_user_roles_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_companyid ON public.user_roles USING btree ("companyId");


--
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree ("userId", "expiresAt");


--
-- Name: idx_vouchers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_company ON public.vouchers USING btree ("companyId", type, "createdAt");


--
-- Name: idx_warehouse_categories_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_categories_companyid ON public.warehouse_categories USING btree ("companyId");


--
-- Name: idx_warehouse_categories_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warehouse_categories_deletedat ON public.warehouse_categories USING btree ("deletedAt");


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
-- Name: idx_whatsapp_queue_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_queue_companyid ON public.whatsapp_queue USING btree ("companyId");


--
-- Name: idx_workflow_definitions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_definitions_companyid ON public.workflow_definitions USING btree ("companyId");


--
-- Name: idx_workflow_instances_deletedat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_instances_deletedat ON public.workflow_instances USING btree ("deletedAt");


--
-- Name: idx_workflow_requests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_requests_company ON public.workflow_requests USING btree ("companyId");


--
-- Name: idx_workflow_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_requests_type ON public.workflow_requests USING btree ("requestType");


--
-- Name: idx_workflows_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_companyid ON public.workflows USING btree ("companyId");


--
-- Name: idx_wps_lines_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wps_lines_employee ON public.wps_run_lines USING btree ("employeeId");


--
-- Name: idx_wps_lines_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wps_lines_run ON public.wps_run_lines USING btree ("wpsRunId");


--
-- Name: idx_wps_runs_status_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wps_runs_status_period ON public.wps_runs USING btree (status, period);


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
-- Name: idx_zatca_retry_queue_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zatca_retry_queue_due ON public.zatca_retry_queue USING btree ("nextAttemptAt") WHERE (attempts < 5);


--
-- Name: idx_zatca_settings_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zatca_settings_companyid ON public.zatca_settings USING btree ("companyId");


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
-- Name: journal_entries_companyid_sourcekey_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX journal_entries_companyid_sourcekey_uq ON public.journal_entries USING btree ("companyId", "sourceKey") WHERE (("sourceKey" IS NOT NULL) AND ("deletedAt" IS NULL));


--
-- Name: journal_entries_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_date_idx ON public.journal_entries USING btree (date);


--
-- Name: journal_entries_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_deleted_at_idx ON public.journal_entries USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


--
-- Name: journal_entries_deletedat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_entries_deletedat_idx ON public.journal_entries USING btree ("deletedAt") WHERE ("deletedAt" IS NULL);


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
-- Name: official_letters_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX official_letters_branch_idx ON public.official_letters USING btree ("branchId");


--
-- Name: official_letters_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX official_letters_created_by_idx ON public.official_letters USING btree ("createdByAssignmentId");


--
-- Name: official_letters_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX official_letters_ref_idx ON public.official_letters USING btree (ref);


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
-- Name: requests_branch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_branch_idx ON public.requests USING btree ("branchId");


--
-- Name: requests_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_ref_idx ON public.requests USING btree (ref);


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
-- Name: training_programs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX training_programs_company_idx ON public.training_programs USING btree ("companyId");


--
-- Name: umrah_agents_company_nusk_agent_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX umrah_agents_company_nusk_agent_uq ON public.umrah_agents USING btree ("companyId", "nuskAgentNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: umrah_groups_company_nusk_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX umrah_groups_company_nusk_group_idx ON public.umrah_groups USING btree ("companyId", "nuskGroupNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: umrah_pilgrims_company_nusknum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX umrah_pilgrims_company_nusknum_idx ON public.umrah_pilgrims USING btree ("companyId", "nuskNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: umrah_sub_agents_company_nuskcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX umrah_sub_agents_company_nuskcode_idx ON public.umrah_sub_agents USING btree ("companyId", "nuskCode") WHERE ("deletedAt" IS NULL);


--
-- Name: uq_abc_company_product_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_abc_company_product_period ON public.product_abc_classification USING btree ("companyId", "productId", period);


--
-- Name: uq_fx_rates_company_pair_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_fx_rates_company_pair_date ON public.fx_rates USING btree ("companyId", "fromCurrency", "toCurrency", "effectiveDate");


--
-- Name: uq_goods_receipts_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_goods_receipts_ref ON public.goods_receipts USING btree ("companyId", ref);


--
-- Name: uq_invoices_company_icv; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_invoices_company_icv ON public.invoices USING btree ("companyId", "zatcaIcv") WHERE ("zatcaIcv" IS NOT NULL);


--
-- Name: uq_lots_company_product_warehouse_lotnum; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_lots_company_product_warehouse_lotnum ON public.warehouse_stock_lots USING btree ("companyId", "productId", "warehouseId", "lotNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: uq_saudization_company_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_saudization_company_period ON public.saudization_snapshots USING btree ("companyId", period);


--
-- Name: uq_serials_company_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_serials_company_serial ON public.warehouse_stock_serials USING btree ("companyId", "serialNumber") WHERE ("deletedAt" IS NULL);


--
-- Name: uq_wps_runs_company_period_bank; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_wps_runs_company_period_bank ON public.wps_runs USING btree ("companyId", period, "bankCode");


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
-- Name: audit_umrah_access audit_umrah_access_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_umrah_access
    ADD CONSTRAINT "audit_umrah_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: cost_centers cost_centers_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT "cost_centers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.cost_centers(id);


--
-- Name: credit_memos credit_memos_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT "credit_memos_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: credit_memos credit_memos_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT "credit_memos_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: credit_memos credit_memos_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT "credit_memos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: credit_memos credit_memos_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT "credit_memos_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: credit_memos credit_memos_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_memos
    ADD CONSTRAINT "credit_memos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id);


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
-- Name: customer_advances customer_advances_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances
    ADD CONSTRAINT "customer_advances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: customer_advances customer_advances_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances
    ADD CONSTRAINT "customer_advances_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: customer_advances customer_advances_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances
    ADD CONSTRAINT "customer_advances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: customer_advances customer_advances_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_advances
    ADD CONSTRAINT "customer_advances_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


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
-- Name: debit_memos debit_memos_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT "debit_memos_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: debit_memos debit_memos_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT "debit_memos_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: debit_memos debit_memos_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT "debit_memos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: debit_memos debit_memos_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT "debit_memos_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: debit_memos debit_memos_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debit_memos
    ADD CONSTRAINT "debit_memos_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id);


--
-- Name: delegations delegations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT "delegations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: delegations delegations_delegateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT "delegations_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES public.employees(id);


--
-- Name: delegations delegations_delegatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delegations
    ADD CONSTRAINT "delegations_delegatorId_fkey" FOREIGN KEY ("delegatorId") REFERENCES public.employees(id);


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
-- Name: discipline_memos discipline_memos_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_memos
    ADD CONSTRAINT "discipline_memos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: discipline_memos discipline_memos_issuedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_memos
    ADD CONSTRAINT "discipline_memos_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES public.users(id);


--
-- Name: discipline_memos discipline_memos_violationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discipline_memos
    ADD CONSTRAINT "discipline_memos_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES public.employee_violations(id);


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
-- Name: dunning_letters dunning_letters_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters
    ADD CONSTRAINT "dunning_letters_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: dunning_letters dunning_letters_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters
    ADD CONSTRAINT "dunning_letters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: dunning_letters dunning_letters_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters
    ADD CONSTRAINT "dunning_letters_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id);


--
-- Name: dunning_letters dunning_letters_sentBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dunning_letters
    ADD CONSTRAINT "dunning_letters_sentBy_fkey" FOREIGN KEY ("sentBy") REFERENCES public.users(id);


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
-- Name: employee_kpi_snapshots employee_kpi_snapshots_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_kpi_snapshots
    ADD CONSTRAINT "employee_kpi_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: employee_kpi_snapshots employee_kpi_snapshots_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_kpi_snapshots
    ADD CONSTRAINT "employee_kpi_snapshots_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


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
-- Name: expenses expenses_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: fx_rates fx_rates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT "fx_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: fx_revaluation_lines fx_revaluation_lines_revaluationLogId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_lines
    ADD CONSTRAINT "fx_revaluation_lines_revaluationLogId_fkey" FOREIGN KEY ("revaluationLogId") REFERENCES public.fx_revaluation_log(id) ON DELETE CASCADE;


--
-- Name: fx_revaluation_log fx_revaluation_log_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_log
    ADD CONSTRAINT "fx_revaluation_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: fx_revaluation_log fx_revaluation_log_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_log
    ADD CONSTRAINT "fx_revaluation_log_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public.journal_entries(id);


--
-- Name: fx_revaluation_log fx_revaluation_log_periodId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluation_log
    ADD CONSTRAINT "fx_revaluation_log_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES public.financial_periods(id);


--
-- Name: fx_revaluations fx_revaluations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluations
    ADD CONSTRAINT "fx_revaluations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: fx_revaluations fx_revaluations_postedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_revaluations
    ADD CONSTRAINT "fx_revaluations_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES public.users(id);


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
-- Name: hr_employee_loans hr_employee_loans_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: hr_employee_loans hr_employee_loans_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_employee_loans hr_employee_loans_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: hr_employee_loans hr_employee_loans_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_employee_loans hr_employee_loans_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: hr_exit_clearance hr_exit_clearance_clearedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_clearance
    ADD CONSTRAINT "hr_exit_clearance_clearedBy_fkey" FOREIGN KEY ("clearedBy") REFERENCES public.users(id);


--
-- Name: hr_exit_clearance hr_exit_clearance_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_clearance
    ADD CONSTRAINT "hr_exit_clearance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_exit_clearance hr_exit_clearance_exitRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_clearance
    ADD CONSTRAINT "hr_exit_clearance_exitRequestId_fkey" FOREIGN KEY ("exitRequestId") REFERENCES public.hr_exit_requests(id);


--
-- Name: hr_exit_requests hr_exit_requests_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT "hr_exit_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: hr_exit_requests hr_exit_requests_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT "hr_exit_requests_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_exit_requests hr_exit_requests_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT "hr_exit_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: hr_exit_requests hr_exit_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT "hr_exit_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_exit_requests hr_exit_requests_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_requests
    ADD CONSTRAINT "hr_exit_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


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
-- Name: hr_loan_installments hr_loan_installments_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_installments
    ADD CONSTRAINT "hr_loan_installments_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_loan_installments hr_loan_installments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_installments
    ADD CONSTRAINT "hr_loan_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_loan_installments hr_loan_installments_loanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_installments
    ADD CONSTRAINT "hr_loan_installments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES public.hr_employee_loans(id);


--
-- Name: hr_overtime_requests hr_overtime_requests_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT "hr_overtime_requests_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public.users(id);


--
-- Name: hr_overtime_requests hr_overtime_requests_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT "hr_overtime_requests_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_overtime_requests hr_overtime_requests_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT "hr_overtime_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: hr_overtime_requests hr_overtime_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT "hr_overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_overtime_requests hr_overtime_requests_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_overtime_requests
    ADD CONSTRAINT "hr_overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: hr_violations hr_violations_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations
    ADD CONSTRAINT "hr_violations_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public.employee_assignments(id);


--
-- Name: hr_violations hr_violations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations
    ADD CONSTRAINT "hr_violations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: hr_violations hr_violations_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations
    ADD CONSTRAINT "hr_violations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: hr_violations hr_violations_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_violations
    ADD CONSTRAINT "hr_violations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: import_batches import_batches_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT "import_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: invoice_items invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON DELETE CASCADE;


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
-- Name: mudad_settlements mudad_settlements_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mudad_settlements
    ADD CONSTRAINT "mudad_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: payment_run_items payment_run_items_runId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_run_items
    ADD CONSTRAINT "payment_run_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES public.payment_runs(id) ON DELETE CASCADE;


--
-- Name: payment_runs payment_runs_branchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_runs
    ADD CONSTRAINT "payment_runs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id);


--
-- Name: payment_runs payment_runs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_runs
    ADD CONSTRAINT "payment_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: payment_runs payment_runs_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_runs
    ADD CONSTRAINT "payment_runs_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public.users(id);


--
-- Name: payroll_deductions payroll_deductions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT "payroll_deductions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: payroll_deductions payroll_deductions_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_deductions
    ADD CONSTRAINT "payroll_deductions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


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
-- Name: product_abc_classification product_abc_classification_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_abc_classification
    ADD CONSTRAINT "product_abc_classification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: products products_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: property_contracts property_contracts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contracts
    ADD CONSTRAINT "property_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: property_contracts property_contracts_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contracts
    ADD CONSTRAINT "property_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public.tenants(id);


--
-- Name: property_contracts property_contracts_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_contracts
    ADD CONSTRAINT "property_contracts_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public.property_units(id);


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
-- Name: purchase_order_lines purchase_order_lines_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_lines
    ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


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
-- Name: rbac_approval_limits rbac_approval_limits_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_approval_limits
    ADD CONSTRAINT rbac_approval_limits_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_field_policies rbac_field_policies_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_field_policies
    ADD CONSTRAINT rbac_field_policies_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_role_grants rbac_role_grants_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants
    ADD CONSTRAINT rbac_role_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_roles rbac_roles_parent_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_parent_role_id_fkey FOREIGN KEY (parent_role_id) REFERENCES public.rbac_roles(id) ON DELETE SET NULL;


--
-- Name: rbac_user_roles rbac_user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles
    ADD CONSTRAINT rbac_user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


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
-- Name: saudization_snapshots saudization_snapshots_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saudization_snapshots
    ADD CONSTRAINT "saudization_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: smart_recommendations smart_recommendations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_recommendations
    ADD CONSTRAINT "smart_recommendations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


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
-- Name: ticket_replies ticket_replies_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT "ticket_replies_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id);


--
-- Name: training_courses training_courses_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_courses
    ADD CONSTRAINT "training_courses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: training_enrollments training_enrollments_programId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_enrollments
    ADD CONSTRAINT "training_enrollments_programId_fkey" FOREIGN KEY ("programId") REFERENCES public.training_programs(id);


--
-- Name: training_participants training_participants_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT "training_participants_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public.training_courses(id);


--
-- Name: training_participants training_participants_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT "training_participants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: training_participants training_participants_trainingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_participants
    ADD CONSTRAINT "training_participants_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES public.trainings(id);


--
-- Name: training_programs training_programs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_programs
    ADD CONSTRAINT "training_programs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: trainings trainings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainings
    ADD CONSTRAINT "trainings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: umrah_import_changes umrah_import_changes_batchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_import_changes
    ADD CONSTRAINT "umrah_import_changes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES public.umrah_import_batches(id) ON DELETE CASCADE;


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
-- Name: umrah_payment_allocations umrah_payment_allocations_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payment_allocations
    ADD CONSTRAINT "umrah_payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.umrah_sales_invoices(id);


--
-- Name: umrah_payment_allocations umrah_payment_allocations_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payment_allocations
    ADD CONSTRAINT "umrah_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public.umrah_payments(id) ON DELETE CASCADE;


--
-- Name: umrah_payments umrah_payments_subAgentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_payments
    ADD CONSTRAINT "umrah_payments_subAgentId_fkey" FOREIGN KEY ("subAgentId") REFERENCES public.umrah_sub_agents(id);


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
-- Name: umrah_sales_invoice_items umrah_sales_invoice_items_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoice_items
    ADD CONSTRAINT "umrah_sales_invoice_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public.umrah_groups(id);


--
-- Name: umrah_sales_invoice_items umrah_sales_invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoice_items
    ADD CONSTRAINT "umrah_sales_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.umrah_sales_invoices(id) ON DELETE CASCADE;


--
-- Name: umrah_sales_invoices umrah_sales_invoices_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoices
    ADD CONSTRAINT "umrah_sales_invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public.clients(id);


--
-- Name: umrah_sales_invoices umrah_sales_invoices_seasonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoices
    ADD CONSTRAINT "umrah_sales_invoices_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES public.umrah_seasons(id);


--
-- Name: umrah_sales_invoices umrah_sales_invoices_subAgentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_sales_invoices
    ADD CONSTRAINT "umrah_sales_invoices_subAgentId_fkey" FOREIGN KEY ("subAgentId") REFERENCES public.umrah_sub_agents(id);


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
-- Name: user_sessions user_sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id);


--
-- Name: users users_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.employees(id);


--
-- Name: vouchers vouchers_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT "vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: warehouse_categories warehouse_categories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_categories
    ADD CONSTRAINT "warehouse_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.warehouse_categories(id);


--
-- Name: warehouse_cycle_count_lines warehouse_cycle_count_lines_adjustmentJournalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_count_lines
    ADD CONSTRAINT "warehouse_cycle_count_lines_adjustmentJournalEntryId_fkey" FOREIGN KEY ("adjustmentJournalEntryId") REFERENCES public.journal_entries(id);


--
-- Name: warehouse_cycle_count_lines warehouse_cycle_count_lines_cycleCountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_count_lines
    ADD CONSTRAINT "warehouse_cycle_count_lines_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES public.warehouse_cycle_counts(id) ON DELETE CASCADE;


--
-- Name: warehouse_cycle_count_lines warehouse_cycle_count_lines_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_count_lines
    ADD CONSTRAINT "warehouse_cycle_count_lines_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public.warehouse_stock_lots(id);


--
-- Name: warehouse_cycle_counts warehouse_cycle_counts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_cycle_counts
    ADD CONSTRAINT "warehouse_cycle_counts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: warehouse_stock_lots warehouse_stock_lots_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_lots
    ADD CONSTRAINT "warehouse_stock_lots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: warehouse_stock_serials warehouse_stock_serials_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_serials
    ADD CONSTRAINT "warehouse_stock_serials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: warehouse_stock_serials warehouse_stock_serials_lotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_stock_serials
    ADD CONSTRAINT "warehouse_stock_serials_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES public.warehouse_stock_lots(id);


--
-- Name: workflow_instances workflow_instances_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_instances
    ADD CONSTRAINT "workflow_instances_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public.workflow_definitions(id);


--
-- Name: workflow_requests workflow_requests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_requests
    ADD CONSTRAINT "workflow_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


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
-- Name: wps_run_lines wps_run_lines_wpsRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_run_lines
    ADD CONSTRAINT "wps_run_lines_wpsRunId_fkey" FOREIGN KEY ("wpsRunId") REFERENCES public.wps_runs(id) ON DELETE CASCADE;


--
-- Name: wps_runs wps_runs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_runs
    ADD CONSTRAINT "wps_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: wps_settings wps_settings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wps_settings
    ADD CONSTRAINT "wps_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: zatca_icv_counters zatca_icv_counters_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_icv_counters
    ADD CONSTRAINT "zatca_icv_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: zatca_retry_queue zatca_retry_queue_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_retry_queue
    ADD CONSTRAINT "zatca_retry_queue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id);


--
-- Name: zatca_retry_queue zatca_retry_queue_submissionLogId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zatca_retry_queue
    ADD CONSTRAINT "zatca_retry_queue_submissionLogId_fkey" FOREIGN KEY ("submissionLogId") REFERENCES public.zatca_submission_log(id);


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
-- Print Engine v2 — tables and document_templates columns added by
-- migrations 171_print_engine_foundations.sql + 172_print_engine_seed.sql.
-- Mirrored here so check:schema-drift sees them in information_schema
-- without having to boot the api-server (which is the place that runs
-- the migrations).
--

ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "entityType" character varying(60);
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "paperSize" character varying(20) DEFAULT 'A4';
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "mode" character varying(10) DEFAULT 'preset';
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "presetKey" character varying(40);
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "layoutJson" jsonb;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "cssOverrides" text;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "headerOverride" jsonb;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "footerOverride" jsonb;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "isThermal" boolean DEFAULT false;
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS "createdBy" integer;

CREATE TABLE IF NOT EXISTS public.print_template_assignments (
    id serial PRIMARY KEY,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "entityType" character varying(60) NOT NULL,
    "templateId" integer NOT NULL,
    "isDefault" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdBy" integer
);

ALTER TABLE ONLY public.print_template_assignments
    ADD CONSTRAINT "print_template_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.print_template_assignments
    ADD CONSTRAINT "print_template_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.print_template_assignments
    ADD CONSTRAINT "print_template_assignments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.document_templates(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.print_jobs (
    id serial PRIMARY KEY,
    "jobId" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "userId" integer,
    "entityType" character varying(60) NOT NULL,
    "entityId" character varying(64) NOT NULL,
    "templateId" integer,
    "format" character varying(20) NOT NULL,
    "paperSize" character varying(20),
    "copyNumber" integer DEFAULT 1 NOT NULL,
    "isReprint" boolean DEFAULT false NOT NULL,
    "watermark" character varying(120),
    "pdfStorageKey" text,
    "pdfBytes" integer,
    "status" character varying(24) DEFAULT 'rendering' NOT NULL,
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    "errorMessage" text,
    "ipAddress" character varying(64),
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT "print_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT "print_jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT "print_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.document_templates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.print_reprint_requests (
    id serial PRIMARY KEY,
    "companyId" integer NOT NULL,
    "branchId" integer,
    "entityType" character varying(60) NOT NULL,
    "entityId" character varying(64) NOT NULL,
    "requestedBy" integer,
    "reason" text,
    "status" character varying(24) DEFAULT 'pending' NOT NULL,
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    "rejectedReason" text,
    "resultJobId" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.print_reprint_requests
    ADD CONSTRAINT "print_reprint_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.print_reprint_requests
    ADD CONSTRAINT "print_reprint_requests_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- Name: umrah_transport_pilgrims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport_pilgrims ALTER COLUMN id SET DEFAULT nextval('public.umrah_transport_pilgrims_id_seq'::regclass);


--
-- Name: umrah_transport_pilgrims umrah_transport_pilgrims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport_pilgrims
    ADD CONSTRAINT umrah_transport_pilgrims_pkey PRIMARY KEY (id);


--
-- Name: umrah_transport_pilgrims umrah_transport_pilgrims_transportId_pilgrimId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.umrah_transport_pilgrims
    ADD CONSTRAINT "umrah_transport_pilgrims_transportId_pilgrimId_key" UNIQUE ("transportId", "pilgrimId");


--
-- Name: idx_umrah_transport_pilgrims_transport; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_transport_pilgrims_transport ON public.umrah_transport_pilgrims USING btree ("transportId");


--
-- Name: idx_umrah_transport_pilgrims_pilgrim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_umrah_transport_pilgrims_pilgrim ON public.umrah_transport_pilgrims USING btree ("pilgrimId");


--
-- PostgreSQL database dump complete
--

\unrestrict H0CUdY3LSk7vOjI6ZlPwPxuZAuIfbBetcRNTuwn8AO71HecXOYoIPEMfp1mVHFf

