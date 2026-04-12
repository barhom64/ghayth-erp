# Overview

Ghayth ERP (غيث ERP) is a comprehensive, full-stack Arabic enterprise resource planning system for Al Door Group. It centralizes operations, enhances efficiency, and supports strategic decision-making across over 28 business modules (including HR, Finance, Fleet, Warehouse, Properties, Legal, Projects, CRM, Support, Governance, and Business Intelligence). The system provides a unified, user-friendly platform tailored to diverse business requirements, integrating core functions into a single solution. A behavioral intelligence layer offers advanced analytics, personalized recommendations, and proactive alerts across the entire system.

## Phase 3 Changes (Task #113)

- **Standalone Admin Pages**: `/admin/users` → `pages/admin/users.tsx` (user management + role assignment), `/admin/roles` → `pages/admin/roles.tsx` (module access + permissions matrix), `/admin/logs` → `pages/admin/logs.tsx` (audit log explorer with CSV export).
- **Manager Board**: New page at `/manager-board` (`pages/manager-board.tsx`) with team attendance summary, urgent pending requests with quick approve/reject, team tasks progress, and priority alerts.
- **Finance Cash Flow Dashboard**: New page at `/finance/cashflow` (`pages/finance/cashflow-dashboard.tsx`) with live spend ratios, budget vs actual progress bars, pending invoices, and financial alerts.
- **My Space Enhancements**: Visual leave balance progress bars with color-coded status (green/amber/red), monthly attendance progress indicator showing days present, month progress, and total late minutes.
- **Letters Routing Fix**: `communications/letters-create.tsx` now redirects to `/letters` instead of non-existent `/communications/letters` route.
- **Sidebar Updates**: Added "لوحة المدير" (minRoleLevel 40) and "لوحة التدفق النقدي" under Finance section.

# User Preferences

-   **Frontend Layout**:
    -   **Sidebar**: White light theme, expandable sub-menus for all 20+ modules, RTL (right-side), filtered by selected role.
    -   **Breadcrumbs**: Built into `sidebar-layout.tsx`, auto-generated from nav structure.
    -   **Topbar**: Page title with icon, Role dropdown (الصفة), Notification bell, Branch dropdown (الفرع).
    -   **Routing**: Modular route files in `routes/` directory, all use `React.lazy()` for performance.
    -   **No popups/modals for create/edit**: Create/edit operations use standalone full pages (navigated via `<Link>`), not Sheet/Dialog popups. `QuickPreviewDialog` (read-only preview) and `AlertDialog` (delete confirmations) are the only allowed dialog patterns.
-   **RTL Arabic layout**: `dir="rtl"`, `lang="ar"`.
-   **Pagination**: All list pages use `?page=X&limit=20` query params, including HR tabs (attendance, leaves, payroll).
-   **Error/Empty States**: All tables should show Arabic error messages with retry buttons and descriptive empty states with icons.
-   **`lib/formatters.ts`**: `formatDateAr()` (Arabic date like "١٤ يناير ٢٠٢٦"), `formatNumber()` (Arabic-Indic numerals), `formatCurrency()` (ر.س symbol).
-   **404 Page**: Arabic design with CloudRain icon, Arabic numerals (٤٠٤), navigation buttons.

# System Architecture

The project is structured as a pnpm workspace monorepo.

**Stack:**
-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API framework**: Express 5
-   **Database**: PostgreSQL (raw queries via `pg` pool)
-   **Authentication**: JWT with refresh tokens
-   **Validation**: Zod
-   **API codegen**: Orval (from OpenAPI spec)
-   **Frontend**: React, Vite, TailwindCSS, shadcn/ui

**Architectural Artifacts:**
-   `artifacts/api-server`: Express 5 REST API.
-   `artifacts/ghayth-erp`: React+Vite frontend.
-   `artifacts/client-portal`: Client self-service portal with separate auth.

**Shared Libraries:**
-   `lib/api-spec`: OpenAPI specification and Orval codegen.
-   `lib/api-client-react`: Generated React Query hooks.
-   `lib/api-zod`: Generated Zod schemas.
-   `lib/db`: Drizzle ORM schema and PostgreSQL pool.

**Core Infrastructure & Features:**
-   **Behavioral Intelligence Layer**: User activity logging, RFM scoring, churn prediction, personalized recommendations, KPIs, and smart alerts.
-   **Error Handling**: Centralized Express error middleware and React `ErrorBoundary`.
-   **Approval Enforcement**: Workflow engine with state machine transitions, mandatory pre-approval validation, and audit logging.
-   **Event System**: In-process TypeScript EventEmitter for audit logging and notifications.
-   **Scoped Query Helper**: Auto-injects `companyId` and `branchId` for data isolation.
-   **Company Bootstrap**: Atomic provisioning of default data for new companies.
-   **Multi-Filter System**: Frontend supports cascading 3-level filtering (Companies → Branches → Roles).
-   **Command Palette**: Global command palette for navigation, quick actions, and API entity search.
-   **HR Module Enhancements**: KPI dashboard, comprehensive forms (payroll, attendance, leaves, performance, shifts), and reorganized sidebar.
-   **Command Center & My Space Portal**: Role-adaptive dashboards and employee self-service.
-   **Action Center**: Manager decision hub for pending approvals and escalations.
-   **Operations Center**: Unified operational command center with SLA monitoring and live activity feed.
-   **Daily Close Workflow**: Checklist with server-side validation and persistent logging.
-   **Settings Engine**: 3-level hierarchy (system → company → branch) for configuration.
-   **Role System**: Backend-driven multi-role system with granular permissions and tenant isolation.
-   **Request Catalog**: Unified request center showing available request types based on user role.
-   **Approval System**: Generic approval chain engine with workflow management.
-   **Audit Logging**: Evidence-grade audit system with before/after state capture.
-   **Impact Preview**: API endpoint showing financial, administrative, and reporting impact before actions.
-   **Asset Lifecycle System**: Full lifecycle management for property units and fleet vehicles.
-   **DB Migrations**: Idempotent SQL migrations auto-run on server startup.
-   **Security**: JWT_SECRET enforcement, CORS origin whitelist, rate limiting, soft delete for financial records, atomic payroll transactions.
-   **Printing & Letterhead System**: Reusable `PrintLayout` component and dynamic PDF generation.
-   **HR State Engine**: Operational status tracking, impact preview for HR actions, and action chaining.
-   **Operations Engines**: Specialized engines for communications, documents, legal cases, and request conversions.
-   **Accounting Engine**: Enhanced chart of accounts, mappings, journal entry templates, analytical dimensions, and automated entries.
-   **Automated Workflows**: Specialized workflows for Fleet, Properties, Legal, Projects, Support, CRM, and HR employee lifecycle.
-   **Financial Reports System**: Comprehensive reports including trial balance, income statement, balance sheet, entity statement, and general ledger with export options.
-   **ZATCA E-Invoicing Integration**: Full integration with Saudi Arabia's ZATCA for e-invoicing compliance, including TLV QR code encoder, UBL 2.1 XML generator, and submission logging.
-   **Financial Forms**: Enhanced expense/voucher forms with classification, cost centers, VAT, and mandatory attachments.
-   **Smart Auto-Description**: Automatic Arabic description generation for financial entries.
-   **Smart Alerts & KPI Engine**: Real-action checks and metrics with rolling windows and performance scores.
-   **Unified Workflow & Business Rules Engines**: Configurable approval chains and if-then automation.
-   **BI Dashboards & Analytics**: Module-specific KPI dashboards, operational analytics, and admin reports.
-   **Proactive Automation & Daily Self-Audit**: Automated tasks, requests, and daily system checks.
-   **Validation Guards**: Strict business validation on sensitive operations.
-   **Umrah Management Module**: Complete Umrah operations system for seasons, agents, pilgrims, packages, transport, penalties, and invoicing.
-   **Enhanced Tasks System**: Tasks support entity linking (maintenance, legal, contracts, clients) with auto-generation and cross-module visibility.
-   **Enhanced Property Operations**: Properties API with occupancy/collection stats, operations dashboard, and maintenance request lifecycle including validation for closure.
-   **Property Management Restructure**: Reorganized navigation and data model for buildings, units, tenants, owners, contracts, payments, and maintenance.
-   **Ejar Compliance Upgrade**: Full Saudi rental regulation compliance with extended fields for properties, units, tenants, and contracts, including an auto-generated payment schedule.
-   **Financial Data Integrity**: Payroll runs are atomic transactions; salary allowances sourced from `salary_components`.
-   **Financial Algorithms Module**: AR/AP aging reports, bank reconciliation, fixed asset depreciation (straight-line/declining), weighted average inventory costing, and rounding differences.
-   **Government Integration Infrastructure**: Infrastructure for Saudi government system integration (Muqeem, TAM, Absher Business) with dedicated database fields, API routes, and cron jobs for expiry alerts.
-   **Cron Scheduler**: 42 action-taking jobs for alerts, escalations, reporting, and automation.
-   **Migration 032**: Adds `deletedAt` soft-delete columns to 22 tables, `subtype`/`accountSubtype`/`nature` to `chart_of_accounts`.
-   **Technical Debt Cleanup (Task #112)**:
    -   **EventBus DLQ**: `eventBus.ts` extended with Dead Letter Queue (`pushToDLQ`, `safeEmitEvent`, `flushDLQ`) — failed events no longer silently swallowed.
    -   **Pagination Helper**: `paginationHelper.ts` with `parsePagination()` enforcing max 100 records per page.
    -   **Finance Sub-Modules**: `finance-collection.ts` (6-stage collection pipeline), `finance-budget.ts` (budget CRUD + 4-level validation + fiscal period close), `finance-accounts.ts` (CoA, journal, ledger, summary), `finance-vendors.ts` (vendors, stats, receivables, commitments) — all mounted before monolithic `financeRouter` fallback.
    -   **HR Sub-Module**: `hr-attendance.ts` (17-step check-in logic with GPS, overtime, late penalty tiers, early-departure detection) — mounted before monolithic `hrRouter` fallback.
    -   **Drizzle ORM Schema**: `lib/db/src/schema/index.ts` fully populated with 22 tables, correct column types, FK references, and indexes.
    -   **BI N+1 Fix**: `/bi/overview` now executes a single correlated-subquery SQL instead of 7 sequential `rawQuery` calls.
    -   **DB Indexes Migration**: `lib/db/migrations/add_performance_indexes.sql` with 50+ `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statements covering all high-traffic tables.
-   **Client 360°**: Enhanced client view with comprehensive data.
-   **Notification Engine**: Enterprise-grade multi-channel notification system with DB-driven routing rules, per-user preferences, editable templates, fallback/escalation chains, outbound webhooks, and unified delivery tracking.
-   **System Monitoring**: Admin dashboard for health and security metrics.
-   **Enhanced Policies**: Governance policies with versions and module links.
-   **Document Management System (DMS)**: Full DMS with object storage, workflow, and multi-versioning.
-   **UX Enhancements**: Advanced filters, entity timelines, document management, copy/duplicate, permission guards, autocomplete, auto-draft, keyboard shortcuts, policy banners, delete confirm with impact, unsaved changes warning, quick preview, file attachments, and data-level scoping.
-   **Form-DB Alignment**: All create forms aligned with DB schema, converting empty strings to `null`.
-   **Frontend Structure**: `wouter` for routing, unified list page template, and reusable components.
-   **Comprehensive Audit Fixes (April 2026)**:
    -   **5 Finance Pages Fixed**: `project-costing`, `journal-manual`, `intercompany`, `cash-flow-forecast`, `bank-guarantees` — all had broken imports using non-existent `useApi`, `PageHeader`, `DataTable`, `Modal` components. Rewritten to use correct `useApiQuery`/`apiFetch`, `Card`, `Dialog`, `Badge`, `useToast` patterns.
    -   **email_queue Migration**: Added `updatedAt` column (migration 065).
    -   **communications.ts Fix**: `scope.assignmentId` → `scope.activeAssignmentId`.
    -   **ApprovalChainType Fix**: Added `"procurement"` to type union.
    -   **settings.tsx Fix**: Replaced undefined `ALL_MODULE_KEYS` with `allModules` local variable; added `{all:true}` handling for owner roles.

# External Dependencies

-   **Database**: PostgreSQL
-   **Authentication**: `bcryptjs`, `jsonwebtoken`
-   **Validation**: `zod`, `drizzle-zod`
-   **API Codegen**: Orval
-   **Frontend Frameworks**: React, Vite
-   **UI Library**: TailwindCSS, shadcn/ui
-   **Maps**: Leaflet, react-leaflet
-   **Object Storage**: Replit Object Storage (GCS-backed) via `@google-cloud/storage`