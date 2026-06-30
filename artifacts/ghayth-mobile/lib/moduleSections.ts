/**
 * Config-driven module → sections map for native mobile browse screens.
 *
 * Each ERP module exposes one or more "sections" (a list endpoint). The generic
 * list screen (`app/m/[module]/[section].tsx`) and the module hub
 * (`app/module/[key].tsx`) render entirely from this config — so adding a module
 * is data, not a new bespoke screen.
 *
 * Field names are *candidates*: the first present, non-empty value wins. This
 * keeps screens resilient to API field drift (e.g. `ref` vs `reference`).
 *
 * Endpoints are verified against routes/index.ts mounts. The server stays the
 * RBAC authority — every endpoint still 403s if a guard fails.
 */
import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type Tone = "default" | "success" | "warning" | "danger" | "info";

/**
 * One input field in a config-driven create/edit form. The generic form engine
 * (`app/m/[module]/[section]/form.tsx`) turns this into a real input + inline
 * Arabic validation. The server stays the final validator — the engine only
 * does light client-side checks (required / format) for fast feedback.
 */
export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "status"
  | "reference"
  | "file";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldDef {
  /** Body key sent to the API. */
  name: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /** Static options for `select` / `status`. */
  options?: FormFieldOption[];
  /** `reference` only: GET list endpoint whose rows become options. */
  refEndpoint?: string;
  /** `reference` only: first present field becomes the option label. */
  refLabelFields?: string[];
  /** `reference` only: row field used as the option value (default `id`). */
  refValueField?: string;
  /**
   * `reference` only: keep the selected value as a string in the create/edit
   * body instead of coercing numeric-looking values to a Number. Required for
   * code-based references (e.g. chart-of-accounts `code` like "5101") whose
   * server schema expects a string — without this the value is sent as a
   * number and the server rejects it ("Expected string, received number").
   */
  refValueIsString?: boolean;
  /**
   * `file` only: picks a document, uploads it to object storage via the
   * presigned-URL flow, then contributes `fileName` / `fileSize` / `mimeType` /
   * `storageKey` to the create body (the `/api/documents/upload` contract).
   */
}

/**
 * A dedicated server action button on the detail screen (e.g. approve / post /
 * reverse / submit). Unlike the generic status-change (a `PATCH { status }`),
 * an action hits a purpose-built endpoint so the server can run the real
 * business logic (GL posting, approval-chain, etc.). The client only invokes —
 * the server stays the sole authority and returns Arabic errors on any
 * authorization or state-machine failure.
 */
export interface SectionAction {
  /** Stable key (used for React keys + the in-flight spinner). */
  key: string;
  label: string;
  icon?: IoniconName;
  /** Endpoint to call for this record. */
  path: (id: string | number) => string;
  /** HTTP method (default POST). */
  method?: "POST" | "PATCH";
  /** Static JSON body sent with the call (e.g. `{ approved: true }`). */
  body?: Record<string, unknown>;
  /** Confirmation prompt shown before firing (sensitive ops). */
  confirm?: string;
  /** Success toast text (default: the action label). */
  successText?: string;
  /** Button tone (default primary). */
  tone?: "secondary" | "danger";
  /** Only show when the record's status is one of these values. */
  showWhenStatus?: string[];
  /** Row field holding the status to gate on (default `status`). */
  statusField?: string;
}

export interface SectionWriteConfig {
  /**
   * Module key gated against the user's granted modules to decide whether to
   * SHOW the create/edit/delete/status buttons. The server is still the final
   * authority — any disallowed call returns 403 and surfaces as Arabic text.
   */
  moduleKey: string;
  /** GET-by-id detail endpoint. Default `${endpoint}/${id}`. */
  detailPath?: (id: string | number) => string;
  /** Row field carrying the record id (default `id`). */
  idField?: string;
  /** POST create endpoint. Default = section.endpoint. */
  createEndpoint?: string;
  /** Fields rendered on the create form. Absent → no create button. */
  createFields?: FormFieldDef[];
  /** PATCH update endpoint. Default `${endpoint}/${id}`. */
  updatePath?: (id: string | number) => string;
  /** HTTP verb for the edit submit (default PATCH). Some routes use PUT. */
  updateMethod?: "PATCH" | "PUT";
  /** Fields rendered on the edit form. Absent → no edit button. */
  editFields?: FormFieldDef[];
  /**
   * Suppress the row → detail navigation (list stays browse + create only).
   * Used for sections whose server exposes a create endpoint but NO GET-by-id,
   * so a detail screen would 404. The create "+" button still shows.
   */
  noDetail?: boolean;
  /** DELETE endpoint. Default `${endpoint}/${id}`. */
  deletePath?: (id: string | number) => string;
  /** Show a confirm-guarded delete button on the detail screen. */
  canDelete?: boolean;
  /**
   * Allowed status values for the status-change action (PATCH `{ status }`).
   * The server enforces the state machine (409 on a disallowed transition).
   */
  statuses?: FormFieldOption[];
  /**
   * Dedicated server actions (approve / post / reverse / submit …) rendered as
   * gated buttons on the detail screen. These hit purpose-built endpoints, so
   * sensitive finance ops (GL posting, approval-chain) only ever run on the
   * server.
   */
  actions?: SectionAction[];
}

export interface ModuleSection {
  key: string;
  label: string;
  icon: IoniconName;
  /** Mounted GET list endpoint (paginated `?page=&limit=`). */
  endpoint: string;
  /** First present field becomes the row title. */
  titleFields: string[];
  /** Present fields joined with " · " under the title. */
  subtitleFields?: string[];
  /** Field holding a status string → rendered as a colored badge. */
  statusField?: string;
  /** First present field formatted as currency (ر.س). */
  amountFields?: string[];
  /** First present field formatted as an Arabic date, appended to subtitle. */
  dateFields?: string[];
  /** Config-driven write capabilities (detail/create/edit/delete/status). */
  write?: SectionWriteConfig;
  /** If set, tapping a row navigates to this route with `{ id }` param instead of generic /record. */
  detailRoute?: string;
  /** If set, the + button navigates to this dedicated create screen instead of the inline form. */
  createRoute?: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  sections: ModuleSection[];
}

export const MODULE_SECTIONS: Record<string, ModuleDef> = {
  hr: {
    key: "hr",
    label: "الموارد البشرية",
    sections: [
      {
        key: "employees", label: "الموظفون", icon: "people-outline", endpoint: "/api/employees",
        titleFields: ["name", "fullName"], subtitleFields: ["jobTitle", "empNumber", "branchName"], statusField: "status",
        detailRoute: "/hr/employee-detail", createRoute: "/hr/employee-new",
        write: {
          moduleKey: "hr",
          canDelete: true,
          statuses: [
            { value: "active", label: "نشط" },
            { value: "inactive", label: "غير نشط" },
            { value: "suspended", label: "موقوف" },
          ],
          createFields: [
            { name: "name", label: "اسم الموظف", type: "text", required: true },
            { name: "phone", label: "رقم الجوال", type: "text", required: true, placeholder: "05XXXXXXXX" },
            { name: "nationalId", label: "رقم الهوية / الإقامة", type: "text", required: true },
            { name: "nationality", label: "الجنسية", type: "text", required: true, placeholder: "سعودي" },
            {
              name: "departmentId", label: "الإدارة", type: "reference", required: true,
              refEndpoint: "/api/settings/departments", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "jobTitle", label: "المسمى الوظيفي", type: "text", required: true },
            {
              name: "contractType", label: "نوع العقد", type: "select", required: true,
              options: [
                { value: "full_time", label: "دوام كامل" },
                { value: "part_time", label: "دوام جزئي" },
                { value: "temporary", label: "مؤقت" },
                { value: "seasonal", label: "موسمي" },
              ],
            },
            {
              name: "branchId", label: "الفرع", type: "reference",
              refEndpoint: "/api/settings/branches", refLabelFields: ["name", "branchName"], refValueField: "id",
            },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "salary", label: "الراتب الأساسي", type: "currency", required: true },
            { name: "hireDate", label: "تاريخ التعيين", type: "date" },
          ],
          editFields: [
            { name: "name", label: "اسم الموظف", type: "text", required: true },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "jobTitle", label: "المسمى الوظيفي", type: "text" },
            { name: "salary", label: "الراتب الأساسي", type: "currency" },
            {
              name: "departmentId", label: "الإدارة", type: "reference",
              refEndpoint: "/api/settings/departments", refLabelFields: ["name"], refValueField: "id",
            },
            {
              name: "branchId", label: "الفرع", type: "reference",
              refEndpoint: "/api/settings/branches", refLabelFields: ["name", "branchName"], refValueField: "id",
            },
          ],
        },
      },
      {
        key: "attendance", label: "الحضور والانصراف", icon: "time-outline", endpoint: "/api/hr/attendance",
        titleFields: ["employeeName"], subtitleFields: ["empNumber", "branchName"], statusField: "status", dateFields: ["date"],
        write: {
          moduleKey: "hr",
          detailPath: (id) => `/api/hr/attendance/${id}`,
          statuses: [
            { value: "present", label: "حاضر" },
            { value: "absent", label: "غائب" },
            { value: "late", label: "متأخر" },
            { value: "on_leave", label: "في إجازة" },
          ],
          editFields: [
            {
              name: "status", label: "الحالة", type: "select",
              options: [
                { value: "present", label: "حاضر" },
                { value: "absent", label: "غائب" },
                { value: "late", label: "متأخر" },
                { value: "on_leave", label: "في إجازة" },
              ],
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "leave-requests", label: "طلبات الإجازة", icon: "calendar-outline", endpoint: "/api/hr/leave-requests",
        titleFields: ["employeeName"], subtitleFields: ["leaveType", "empNumber"], statusField: "status", dateFields: ["startDate", "createdAt"], detailRoute: "/hr/leave-request-detail", createRoute: "/hr/leave-request-new",
        write: {
          moduleKey: "hr",
          detailPath: (id) => `/api/hr/leaves/${id}`,
          canDelete: true,
          createFields: [
            {
              name: "leaveTypeId", label: "نوع الإجازة", type: "reference", required: true,
              refEndpoint: "/api/hr/leave-types", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date", required: true },
            { name: "reason", label: "السبب", type: "textarea" },
          ],
          editFields: [
            { name: "reason", label: "السبب", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/hr/leave-requests/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد طلب الإجازة؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending"] },
            { key: "reject", label: "رفض الطلب", icon: "close-circle-outline", method: "PATCH", path: (id) => `/api/hr/leave-requests/${id}/approve`, body: { approved: false }, confirm: "هل تريد رفض طلب الإجازة؟", successText: "تم رفض الطلب", tone: "danger", showWhenStatus: ["pending"] },
          ],
        },
      },
      { key: "payroll", label: "مسيّرات الرواتب", icon: "wallet-outline", endpoint: "/api/hr/payroll", titleFields: ["period", "reference"], subtitleFields: ["employeeCount"], statusField: "status", amountFields: ["totalNet"], dateFields: ["createdAt"], detailRoute: "/hr/payroll-detail" },
      { key: "performance", label: "تقييم الأداء", icon: "stats-chart-outline", endpoint: "/api/hr/performance", titleFields: ["employeeName"], subtitleFields: ["period"], statusField: "status", dateFields: ["createdAt"], detailRoute: "/hr/evaluation-detail" },
      {
        key: "loans", label: "السلف والقروض", icon: "card-outline", endpoint: "/api/hr/loans",
        titleFields: ["loanNumber"], subtitleFields: ["employeeName", "empNumber"], statusField: "status", amountFields: ["amount"], dateFields: ["createdAt"],
        detailRoute: "/hr/loan-detail", createRoute: "/hr/loan-new",
        write: {
          moduleKey: "hr",
          detailPath: (id) => `/api/hr/loans/${id}`,
          createFields: [
            {
              name: "assignmentId", label: "الموظف", type: "reference", required: true,
              refEndpoint: "/api/employees", refLabelFields: ["name", "fullName"], refValueField: "activeAssignmentId",
            },
            { name: "amount", label: "مبلغ السلفة", type: "currency", required: true },
            { name: "installmentCount", label: "عدد الأقساط", type: "number", required: true, placeholder: "12" },
            {
              name: "loanType", label: "نوع السلفة", type: "select",
              options: [
                { value: "personal", label: "شخصية" },
                { value: "emergency", label: "طارئة" },
                { value: "housing", label: "سكنية" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "reason", label: "السبب", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد السلفة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/hr/loans/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد السلفة؟", successText: "تم اعتماد السلفة", showWhenStatus: ["pending"] },
            { key: "reject", label: "رفض السلفة", icon: "close-circle-outline", method: "PATCH", path: (id) => `/api/hr/loans/${id}/reject`, confirm: "هل تريد رفض السلفة؟", successText: "تم رفض السلفة", tone: "danger", showWhenStatus: ["pending"] },
          ],
        },
      },
      {
        key: "overtime", label: "العمل الإضافي", icon: "alarm-outline", endpoint: "/api/hr/overtime",
        titleFields: ["requestNumber"], subtitleFields: ["employeeName", "empNumber"], statusField: "status", amountFields: ["totalAmount"], dateFields: ["overtimeDate"],
        detailRoute: "/hr/overtime-detail", createRoute: "/hr/overtime-new",
        write: {
          moduleKey: "hr",
          createEndpoint: "/api/hr/overtime",
          createFields: [
            { name: "overtimeDate", label: "التاريخ", type: "date", required: true },
            { name: "startTime", label: "وقت البداية", type: "text", required: true, placeholder: "08:00" },
            { name: "endTime", label: "وقت الانتهاء", type: "text", required: true, placeholder: "11:00" },
            { name: "hours", label: "عدد الساعات", type: "number", required: true },
            { name: "reason", label: "السبب", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/hr/overtime/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد طلب الوقت الإضافي؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending"] },
            { key: "reject", label: "رفض الطلب", icon: "close-circle-outline", method: "PATCH", path: (id) => `/api/hr/overtime/${id}/reject`, body: { approved: false }, confirm: "هل تريد رفض طلب الوقت الإضافي؟", successText: "تم رفض الطلب", tone: "danger", showWhenStatus: ["pending"] },
          ],
        },
      },
      { key: "exit", label: "إنهاء الخدمة", icon: "exit-outline", endpoint: "/api/hr/transfers", titleFields: ["transferNumber", "exitNumber"], subtitleFields: ["employeeName", "exitType"], statusField: "status", amountFields: ["netSettlement"], dateFields: ["requestDate"], detailRoute: "/hr/exit-request-detail", createRoute: "/hr/exit-request-new" },
      {
        key: "violations", label: "المخالفات التأديبية", icon: "warning-outline", endpoint: "/api/hr/violations",
        titleFields: ["ref", "violationType", "typeLabel"], subtitleFields: ["employeeName"], statusField: "status", amountFields: ["penaltyAmount"], dateFields: ["incidentDate"],
        detailRoute: "/hr/violation-detail", createRoute: "/hr/discipline-new",
        write: {
          moduleKey: "hr",
          createFields: [
            {
              name: "employeeId", label: "الموظف", type: "reference", required: true,
              refEndpoint: "/api/hr/employees", refLabelFields: ["name", "nameAr"], refValueField: "id",
            },
            { name: "incidentDate", label: "تاريخ المخالفة", type: "date", required: true },
            {
              name: "violationType", label: "نوع المخالفة", type: "select", required: true,
              options: [
                { value: "absence", label: "غياب بدون إذن" },
                { value: "tardiness", label: "تأخر متكرر" },
                { value: "misconduct", label: "سلوك غير لائق" },
                { value: "policy_violation", label: "مخالفة سياسات العمل" },
                { value: "damage", label: "إتلاف ممتلكات" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "description", label: "وصف المخالفة", type: "textarea", required: true },
            {
              name: "action", label: "الإجراء المتخذ", type: "select", required: true,
              options: [
                { value: "warning", label: "إنذار" },
                { value: "deduction", label: "خصم من الراتب" },
                { value: "suspension", label: "إيقاف عن العمل" },
                { value: "termination", label: "إنهاء الخدمة" },
              ],
            },
            { name: "penaltyAmount", label: "مبلغ الخصم", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "contracts", label: "عقود الموظفين", icon: "document-text-outline", endpoint: "/api/hr/contracts",
        titleFields: ["ref"], subtitleFields: ["employeeName", "contractType"], statusField: "approvalStatus", amountFields: ["salary"], dateFields: ["startDate"],
        detailRoute: "/hr/contract-detail", createRoute: "/hr/contract-new",
        write: {
          moduleKey: "hr",
          detailPath: (id) => `/api/hr/contracts/${id}`,
          createFields: [
            {
              name: "employeeId", label: "الموظف", type: "reference", required: true,
              refEndpoint: "/api/employees", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
            {
              name: "contractType", label: "نوع العقد", type: "select", required: true,
              options: [
                { value: "full_time", label: "دوام كامل" },
                { value: "part_time", label: "دوام جزئي" },
                { value: "temporary", label: "مؤقت" },
                { value: "seasonal", label: "موسمي" },
              ],
            },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "salary", label: "الراتب الأساسي", type: "currency" },
            { name: "housingAllowance", label: "بدل السكن", type: "currency" },
            { name: "transportAllowance", label: "بدل النقل", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "submit", label: "إرسال للاعتماد", icon: "send-outline", method: "POST", path: (id) => `/api/hr/contracts/${id}/submit`, confirm: "هل تريد إرسال العقد للاعتماد؟", successText: "تم إرسال العقد للاعتماد", statusField: "approvalStatus", showWhenStatus: ["draft"] },
            { key: "approve", label: "اعتماد العقد", icon: "checkmark-circle-outline", method: "POST", path: (id) => `/api/hr/contracts/${id}/approve`, confirm: "هل تريد اعتماد العقد؟", successText: "تم اعتماد العقد", statusField: "approvalStatus", showWhenStatus: ["pending_approval"] },
            { key: "reject", label: "رفض العقد", icon: "close-circle-outline", method: "POST", path: (id) => `/api/hr/contracts/${id}/reject`, confirm: "هل تريد رفض العقد؟", successText: "تم رفض العقد", tone: "danger", statusField: "approvalStatus", showWhenStatus: ["pending_approval"] },
          ],
        },
      },
      { key: "payroll", label: "مسيرات الرواتب", icon: "cash-outline", endpoint: "/api/hr/payroll", detailRoute: "/hr/payroll-detail", titleFields: ["ref", "batchName"], subtitleFields: ["period", "month"], statusField: "status", amountFields: ["totalNet", "totalAmount"], dateFields: ["createdAt"],
        write: { moduleKey: "hr", actions: [
          { key: "approve", label: "اعتماد المسيرة", icon: "checkmark-circle-outline", method: "POST", path: (id) => `/api/hr/payroll/${id}/approve`, confirm: "هل تريد اعتماد مسيرة الرواتب؟", successText: "تم اعتماد المسيرة", showWhenStatus: ["draft", "pending"] },
          { key: "post", label: "ترحيل المسيرة", icon: "git-commit-outline", method: "POST", path: (id) => `/api/hr/payroll/${id}/post`, confirm: "سيتم ترحيل المسيرة محاسبيًا. متابعة؟", successText: "تم ترحيل المسيرة", showWhenStatus: ["approved"] },
        ] } },
      { key: "payslips", label: "كشوف الرواتب", icon: "document-text-outline", endpoint: "/api/hr/payroll/slips", detailRoute: "/hr/payslip-detail", titleFields: ["employeeName"], subtitleFields: ["period", "month"], statusField: "status", amountFields: ["netSalary"] },
      { key: "exit-requests", label: "طلبات إنهاء الخدمة", icon: "log-out-outline", endpoint: "/api/hr/transfers", detailRoute: "/hr/exit-request-detail", createRoute: "/hr/exit-request-new", titleFields: ["employeeName"], subtitleFields: ["exitType", "reason"], statusField: "status", dateFields: ["requestDate"],
        write: { moduleKey: "hr", actions: [
          { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/hr/transfers/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد طلب إنهاء الخدمة؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending"] },
        ] } },
      { key: "gratuity", label: "مكافأة نهاية الخدمة", icon: "ribbon-outline", endpoint: "/api/hr/gratuity", detailRoute: "/hr/gratuity-detail", createRoute: "/hr/gratuity-new", titleFields: ["employeeName"], subtitleFields: ["yearsOfService"], statusField: "status", amountFields: ["gratuityAmount", "totalAmount"], dateFields: ["lastWorkingDay"] },
      { key: "delegations", label: "التفويضات", icon: "swap-horizontal-outline", endpoint: "/api/hr/delegations", detailRoute: "/hr/delegation-detail", createRoute: "/hr/delegation-new", titleFields: ["delegatorName"], subtitleFields: ["delegateeName", "scope"], statusField: "status", dateFields: ["fromDate", "toDate"],
        write: { moduleKey: "hr", createFields: [
          { name: "delegatorId", label: "المفوِّض", type: "reference", required: true, refEndpoint: "/api/hr/employees", refLabelFields: ["name"], refValueField: "id" },
          { name: "delegateeId", label: "المفوَّض إليه", type: "reference", required: true, refEndpoint: "/api/hr/employees", refLabelFields: ["name"], refValueField: "id" },
          { name: "scope", label: "نطاق التفويض", type: "text", required: true },
          { name: "fromDate", label: "تاريخ البداية", type: "date", required: true },
          { name: "toDate", label: "تاريخ الانتهاء", type: "date", required: true },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "evaluations", label: "تقييمات الأداء", icon: "star-outline", endpoint: "/api/hr/evaluations", titleFields: ["employeeName"], subtitleFields: ["period", "evaluatorName"], statusField: "status", amountFields: ["score"], dateFields: ["evaluationDate"], detailRoute: "/hr/evaluation-detail", createRoute: "/hr/evaluation-new" },
      { key: "official-letters", label: "الخطابات الرسمية", icon: "mail-outline", endpoint: "/api/hr/official-letters", titleFields: ["subject", "letterNumber"], subtitleFields: ["employeeName", "type"], statusField: "status", dateFields: ["createdAt"], detailRoute: "/hr/official-letter-detail", createRoute: "/hr/official-letter-new",
        write: { moduleKey: "hr", createFields: [
          { name: "subject", label: "الموضوع", type: "text", required: true },
          { name: "type", label: "نوع الخطاب", type: "select", required: true, options: [{ value: "experience", label: "خطاب خبرة" }, { value: "salary", label: "خطاب راتب" }, { value: "employment", label: "خطاب تعريف بالعمل" }, { value: "noc", label: "شهادة عدم ممانعة" }, { value: "other", label: "أخرى" }] },
          { name: "employeeId", label: "الموظف", type: "text", required: true },
          { name: "addressedTo", label: "موجّه إلى", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "excuse-requests", label: "طلبات الاستئذان", icon: "hand-left-outline", endpoint: "/api/hr/excuse-requests", titleFields: ["employeeName"], subtitleFields: ["excuseType"], statusField: "status", dateFields: ["excuseDate"], detailRoute: "/hr/excuse-request-detail", createRoute: "/hr/excuse-request-new",
        write: { moduleKey: "hr", actions: [
          { key: "approve", label: "اعتماد الاستئذان", icon: "checkmark-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/hr/excuse-requests/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد طلب الاستئذان؟", successText: "تم اعتماد الاستئذان", showWhenStatus: ["pending"] },
        ] } },
      { key: "training", label: "البرامج التدريبية", icon: "school-outline", endpoint: "/api/hr/training/programs", titleFields: ["title"], subtitleFields: ["provider", "category"], statusField: "status", amountFields: ["cost"], dateFields: ["startDate"], detailRoute: "/hr/training-detail", createRoute: "/hr/training-enrollment-new",
        write: { moduleKey: "hr", createFields: [
          { name: "title", label: "عنوان البرنامج", type: "text", required: true },
          { name: "provider", label: "مزود التدريب", type: "text" },
          { name: "category", label: "التصنيف", type: "select", options: [{ value: "technical", label: "تقني" }, { value: "soft_skills", label: "مهارات شخصية" }, { value: "leadership", label: "قيادة" }, { value: "compliance", label: "امتثال" }, { value: "other", label: "أخرى" }] },
          { name: "startDate", label: "تاريخ البدء", type: "date" },
          { name: "endDate", label: "تاريخ الانتهاء", type: "date" },
          { name: "cost", label: "التكلفة", type: "currency" },
          { name: "seats", label: "عدد المقاعد", type: "number" },
          { name: "description", label: "الوصف", type: "textarea" },
        ] } },
      { key: "recruitment", label: "الوظائف الشاغرة", icon: "person-add-outline", endpoint: "/api/hr/recruitment/postings", titleFields: ["title"], subtitleFields: ["department", "location"], statusField: "status", dateFields: ["closingDate"], detailRoute: "/hr/recruitment-detail", createRoute: "/hr/recruitment-new",
        write: { moduleKey: "hr", createFields: [
          { name: "title", label: "المسمى الوظيفي", type: "text", required: true },
          { name: "department", label: "القسم", type: "text", required: true },
          { name: "location", label: "الموقع", type: "text" },
          { name: "type", label: "نوع التوظيف", type: "select", options: [{ value: "full_time", label: "دوام كامل" }, { value: "part_time", label: "دوام جزئي" }, { value: "contract", label: "عقد محدد" }, { value: "internship", label: "تدريب" }] },
          { name: "closingDate", label: "آخر موعد للتقديم", type: "date" },
          { name: "vacancies", label: "عدد الشواغر", type: "number" },
          { name: "description", label: "وصف الوظيفة", type: "textarea" },
        ] } },
      {
        key: "discipline", label: "المخالفات التأديبية", icon: "warning-outline", endpoint: "/api/hr/discipline/memos", titleFields: ["memoNumber"], subtitleFields: ["employeeName", "incidentType"], statusField: "status", dateFields: ["incidentDate"], detailRoute: "/hr/discipline-detail", createRoute: "/hr/discipline-new",
        write: { moduleKey: "hr", createFields: [
          { name: "employeeId", label: "الموظف", type: "text", required: true },
          { name: "incidentDate", label: "تاريخ الحادثة", type: "date", required: true },
          { name: "incidentType", label: "نوع المخالفة", type: "select", required: true, options: [{ value: "attendance", label: "غياب/تأخر" }, { value: "behavior", label: "سلوك مخل" }, { value: "performance", label: "إخلال بالعمل" }, { value: "policy", label: "مخالفة لوائح" }, { value: "other", label: "أخرى" }] },
          { name: "description", label: "وصف المخالفة", type: "textarea", required: true },
          { name: "action", label: "الإجراء المتخذ", type: "select", options: [{ value: "warning", label: "إنذار كتابي" }, { value: "final_warning", label: "إنذار نهائي" }, { value: "deduction", label: "خصم من الراتب" }, { value: "suspension", label: "إيقاف مؤقت" }] },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] },
      },
      {
        key: "legal-entities", label: "الكيانات القانونية", icon: "business-outline", endpoint: "/api/org/legal-entities", titleFields: ["nameAr", "nameEn"], subtitleFields: ["crNumber", "vatNumber"],
        write: { moduleKey: "hr", createFields: [
          { name: "nameAr", label: "الاسم بالعربي", type: "text", required: true },
          { name: "nameEn", label: "الاسم بالإنجليزية", type: "text" },
          { name: "crNumber", label: "رقم السجل التجاري", type: "text" },
          { name: "vatNumber", label: "الرقم الضريبي", type: "text" },
          { name: "city", label: "المدينة", type: "text" },
        ] },
      },
      {
        key: "positions", label: "المناصب الوظيفية", icon: "id-card-outline", endpoint: "/api/org/positions", titleFields: ["labelAr", "labelEn"], subtitleFields: ["positionKey", "level"],
        write: { moduleKey: "hr", createFields: [
          { name: "labelAr", label: "المسمى بالعربي", type: "text", required: true },
          { name: "labelEn", label: "المسمى بالإنجليزية", type: "text" },
          { name: "positionKey", label: "رمز المنصب", type: "text", required: true },
          { name: "level", label: "المستوى الوظيفي", type: "number" },
          { name: "description", label: "الوصف", type: "textarea" },
        ] },
      },
      {
        key: "teams", label: "الفِرق", icon: "people-circle-outline", endpoint: "/api/org/teams", titleFields: ["name"], subtitleFields: ["departmentName", "leaderName"],
        write: { moduleKey: "hr", createFields: [
          { name: "name", label: "اسم الفريق", type: "text", required: true },
          { name: "description", label: "الوصف", type: "textarea" },
        ] },
      },
      {
        key: "committees", label: "اللجان", icon: "git-merge-outline", endpoint: "/api/org/committees", titleFields: ["name"], subtitleFields: ["type", "chairName"], dateFields: ["startDate"],
        write: { moduleKey: "hr", createFields: [
          { name: "name", label: "اسم اللجنة", type: "text", required: true },
          { name: "type", label: "نوع اللجنة", type: "select", options: [{ value: "permanent", label: "دائمة" }, { value: "temporary", label: "مؤقتة" }, { value: "advisory", label: "استشارية" }] },
          { name: "startDate", label: "تاريخ التأسيس", type: "date" },
          { name: "purpose", label: "الغرض من اللجنة", type: "textarea" },
        ] },
      },
    ],
  },
  finance: {
    key: "finance",
    label: "المالية",
    sections: [
      {
        key: "invoices", label: "الفواتير", icon: "receipt-outline", endpoint: "/api/finance/invoices",
        titleFields: ["ref", "invoiceNumber", "number"], subtitleFields: ["clientName", "customerName"], statusField: "status", amountFields: ["total", "amount"], dateFields: ["issueDate", "createdAt", "date"],
        detailRoute: "/finance/invoice-detail", createRoute: "/finance/invoice-new",
        write: {
          moduleKey: "finance",
          detailPath: (id) => `/api/finance/invoices/${id}`,
          actions: [
            { key: "approve", label: "اعتماد الفاتورة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/finance/invoices/${id}/approve`, confirm: "هل تريد اعتماد الفاتورة؟", successText: "تم اعتماد الفاتورة", showWhenStatus: ["pending", "submitted", "pending_approval"] },
            { key: "reject", label: "رفض الفاتورة", icon: "close-circle-outline", method: "PATCH", path: (id) => `/api/finance/invoices/${id}/reject`, confirm: "هل تريد رفض الفاتورة؟", successText: "تم رفض الفاتورة", tone: "danger", showWhenStatus: ["pending", "submitted", "pending_approval"] },
            { key: "post", label: "ترحيل إلى دفتر الأستاذ", icon: "git-commit-outline", method: "POST", path: (id) => `/api/finance/invoices/${id}/post`, confirm: "سيتم ترحيل الفاتورة محاسبيًا إلى دفتر الأستاذ. متابعة؟", successText: "تم ترحيل الفاتورة", showWhenStatus: ["approved"] },
          ],
        },
      },
      {
        key: "journal", label: "القيود اليومية", icon: "book-outline", endpoint: "/api/finance/journal",
        titleFields: ["ref", "entryNumber"], subtitleFields: ["description"], statusField: "status", amountFields: ["totalAmount", "amount", "total"], dateFields: ["date", "createdAt"],
        detailRoute: "/finance/journal-detail", createRoute: "/finance/journal-new",
        write: {
          moduleKey: "finance",
          detailPath: (id) => `/api/finance/journal/${id}`,
          actions: [
            { key: "approve", label: "اعتماد القيد", icon: "checkmark-circle-outline", method: "POST", path: (id) => `/api/finance/journal/${id}/approve`, confirm: "هل تريد اعتماد القيد؟", successText: "تم اعتماد القيد", showWhenStatus: ["pending", "draft", "pending_approval"] },
            { key: "post", label: "ترحيل القيد", icon: "git-commit-outline", method: "POST", path: (id) => `/api/finance/journal/${id}/post`, confirm: "سيتم ترحيل القيد إلى دفتر الأستاذ. متابعة؟", successText: "تم ترحيل القيد", showWhenStatus: ["approved", "pending"] },
            { key: "reverse", label: "عكس القيد", icon: "arrow-undo-outline", method: "POST", path: (id) => `/api/finance/journal/${id}/reverse`, confirm: "سيتم إنشاء قيد عكسي. متابعة؟", successText: "تم عكس القيد", tone: "danger", showWhenStatus: ["posted"] },
          ],
        },
      },
      {
        key: "expenses", label: "المصروفات", icon: "trending-down-outline", endpoint: "/api/finance/expenses",
        titleFields: ["ref", "description"], subtitleFields: ["accountName", "expenseType"], statusField: "status", amountFields: ["amount"], dateFields: ["createdAt"],
        detailRoute: "/finance/expense-detail", createRoute: "/hr/expense-new",
        write: {
          moduleKey: "finance",
          detailPath: (id) => `/api/finance/expenses/${id}`,
          canDelete: true,
          createFields: [
            {
              name: "accountCode", label: "حساب المصروف", type: "reference", required: true,
              refEndpoint: "/api/finance/accounts", refLabelFields: ["name", "accountName"], refValueField: "code",
              refValueIsString: true,
            },
            { name: "amount", label: "المبلغ", type: "currency", required: true },
            { name: "description", label: "البيان", type: "text", required: true },
            { name: "costCenter", label: "مركز التكلفة", type: "text", required: true },
            {
              name: "paymentMethod", label: "طريقة الدفع", type: "select",
              options: [
                { value: "cash", label: "نقدًا" },
                { value: "bank", label: "تحويل بنكي" },
                { value: "card", label: "بطاقة" },
              ],
            },
            {
              name: "sourceAccountCode", label: "مصدر الصرف (الصندوق / البنك)", type: "reference", required: true,
              refEndpoint: "/api/finance/accounts", refLabelFields: ["name", "accountName"], refValueField: "code",
              refValueIsString: true,
            },
            { name: "expenseType", label: "نوع المصروف", type: "text" },
          ],
          actions: [
            { key: "approve", label: "اعتماد المصروف", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/finance/expenses/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد المصروف؟", successText: "تم اعتماد المصروف", showWhenStatus: ["pending", "draft"] },
          ],
        },
      },
      {
        key: "vouchers", label: "سندات الصرف", icon: "cash-outline", endpoint: "/api/finance/vouchers",
        titleFields: ["ref"], subtitleFields: ["payee", "description"], statusField: "status", amountFields: ["amount"], dateFields: ["createdAt"],
        detailRoute: "/finance/voucher-detail", createRoute: "/finance/voucher-new",
        write: {
          moduleKey: "finance",
          createFields: [
            { name: "payee", label: "المستفيد", type: "text", required: true },
            { name: "amount", label: "المبلغ", type: "currency", required: true },
            { name: "description", label: "البيان", type: "text", required: true },
            {
              name: "paymentMethod", label: "طريقة الصرف", type: "select",
              options: [
                { value: "cash", label: "نقدًا" },
                { value: "bank", label: "تحويل بنكي" },
                { value: "check", label: "شيك" },
              ],
            },
            {
              name: "bankAccountId", label: "حساب الصرف", type: "reference",
              refEndpoint: "/api/finance/bank-accounts", refLabelFields: ["bankName", "accountName"], refValueField: "id",
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد السند", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/finance/vouchers/${id}/approve`, confirm: "هل تريد اعتماد سند الصرف؟", successText: "تم اعتماد السند", showWhenStatus: ["draft", "pending"] },
          ],
        },
      },
      {
        key: "customer-advances", label: "دفعات العملاء المقدمة", icon: "arrow-down-circle-outline", endpoint: "/api/finance/customer-advances",
        detailRoute: "/finance/customer-advance-detail", createRoute: "/finance/customer-advance-new", titleFields: ["ref"], subtitleFields: ["clientName", "method"], statusField: "status", amountFields: ["amount"], dateFields: ["receivedDate"],
        write: {
          moduleKey: "finance",
          createFields: [
            {
              name: "clientId", label: "العميل", type: "reference", required: true,
              refEndpoint: "/api/clients", refLabelFields: ["name", "nameAr"], refValueField: "id",
            },
            { name: "amount", label: "المبلغ المستلم", type: "currency", required: true },
            { name: "receivedDate", label: "تاريخ الاستلام", type: "date", required: true },
            {
              name: "method", label: "طريقة الاستلام", type: "select",
              options: [
                { value: "cash", label: "نقدًا" },
                { value: "bank", label: "تحويل بنكي" },
                { value: "check", label: "شيك" },
              ],
            },
            { name: "reference", label: "رقم المرجع", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      { key: "collection", label: "التحصيل", icon: "alert-circle-outline", endpoint: "/api/finance/collection", titleFields: ["ref"], subtitleFields: ["clientName", "currentStageName"], statusField: "status", amountFields: ["total"], dateFields: ["dueDate"], detailRoute: "/finance/collection-detail", createRoute: "/finance/collection-new" },
      {
        key: "purchase-orders", label: "أوامر الشراء", icon: "cart-outline", endpoint: "/api/finance/purchase-orders",
        titleFields: ["ref", "orderNumber", "poNumber"], subtitleFields: ["supplierName", "vendorName"], statusField: "status", amountFields: ["totalAmount", "total", "amount"], dateFields: ["createdAt", "date"],
        detailRoute: "/finance/purchase-order-detail", createRoute: "/finance/purchase-order-new",
        write: {
          moduleKey: "finance",
          detailPath: (id) => `/api/finance/purchase-orders/${id}`,
          actions: [
            { key: "approve", label: "اعتماد أمر الشراء", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/finance/purchase-orders/${id}/approve`, confirm: "هل تريد اعتماد أمر الشراء؟", successText: "تم اعتماد أمر الشراء", showWhenStatus: ["pending", "submitted", "pending_approval"] },
            { key: "reject", label: "رفض أمر الشراء", icon: "close-circle-outline", method: "PATCH", path: (id) => `/api/finance/purchase-orders/${id}/reject`, confirm: "هل تريد رفض أمر الشراء؟", successText: "تم رفض أمر الشراء", tone: "danger", showWhenStatus: ["pending", "submitted", "pending_approval"] },
          ],
        },
      },
      { key: "purchase-requests", label: "طلبات الشراء", icon: "clipboard-outline", endpoint: "/api/finance/purchase-requests", titleFields: ["ref"], subtitleFields: ["supplierName", "requestedByName"], statusField: "status", amountFields: ["totalAmount"], dateFields: ["createdAt"], detailRoute: "/finance/purchase-request-detail", createRoute: "/finance/purchase-request-new",
        write: { moduleKey: "finance", createFields: [
          { name: "vendorId", label: "المورد", type: "text", required: true },
          { name: "totalAmount", label: "إجمالي المبلغ", type: "currency", required: true },
          { name: "currency", label: "العملة", type: "select", options: [{ value: "SAR", label: "ريال سعودي" }, { value: "USD", label: "دولار أمريكي" }, { value: "EUR", label: "يورو" }] },
          { name: "neededBy", label: "مطلوب بحلول", type: "date" },
          { name: "description", label: "وصف الطلب", type: "textarea", required: true },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ],
        actions: [
          { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/finance/purchase-requests/${id}/approve`, confirm: "هل تريد اعتماد طلب الشراء؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending", "submitted"] },
          { key: "reject", label: "رفض الطلب", icon: "close-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/finance/purchase-requests/${id}/reject`, confirm: "هل تريد رفض طلب الشراء؟", successText: "تم رفض الطلب", tone: "danger" as const, showWhenStatus: ["pending", "submitted"] },
        ] } },
      { key: "vendor-invoices", label: "فواتير الموردين", icon: "documents-outline", endpoint: "/api/finance/vendor-invoices", titleFields: ["ref", "supplierInvoiceRef"], subtitleFields: ["supplierName"], statusField: "status", amountFields: ["totalAmount"], dateFields: ["invoicedDate"], detailRoute: "/finance/vendor-invoice-detail", createRoute: "/finance/vendor-invoice-new",
        write: { moduleKey: "finance", createFields: [
          { name: "vendorId", label: "المورد", type: "text", required: true },
          { name: "supplierInvoiceRef", label: "رقم فاتورة المورد", type: "text", required: true },
          { name: "totalAmount", label: "إجمالي المبلغ", type: "currency", required: true },
          { name: "currency", label: "العملة", type: "select", options: [{ value: "SAR", label: "ريال سعودي" }, { value: "USD", label: "دولار أمريكي" }, { value: "EUR", label: "يورو" }] },
          { name: "invoicedDate", label: "تاريخ الفاتورة", type: "date", required: true },
          { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ],
        actions: [
          { key: "approve", label: "اعتماد الفاتورة", icon: "checkmark-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/finance/vendor-invoices/${id}/approve`, confirm: "هل تريد اعتماد فاتورة المورد؟", successText: "تم الاعتماد", showWhenStatus: ["pending", "submitted"] },
          { key: "post", label: "ترحيل إلى دفتر الأستاذ", icon: "git-commit-outline" as never, method: "POST" as const, path: (id: string | number) => `/api/finance/vendor-invoices/${id}/post`, confirm: "سيتم ترحيل الفاتورة محاسبيًا. متابعة؟", successText: "تم الترحيل", showWhenStatus: ["approved"] },
        ] } },
      { key: "vendor-advances", label: "دفعات الموردين المقدمة", icon: "arrow-up-circle-outline", endpoint: "/api/finance/vendor-advances", detailRoute: "/finance/vendor-advance-detail", createRoute: "/finance/vendor-advance-new", titleFields: ["ref"], subtitleFields: ["supplierName", "method"], statusField: "status", amountFields: ["amount"], dateFields: ["paidDate"],
        write: { moduleKey: "finance", createFields: [
          { name: "vendorId", label: "المورد", type: "reference", required: true, refEndpoint: "/api/finance/vendors", refLabelFields: ["name"], refValueField: "id" },
          { name: "amount", label: "المبلغ", type: "currency", required: true },
          { name: "paidDate", label: "تاريخ الدفع", type: "date", required: true },
          { name: "method", label: "طريقة الدفع", type: "select", required: true, options: [{ value: "bank_transfer", label: "تحويل بنكي" }, { value: "check", label: "شيك" }, { value: "cash", label: "نقد" }] },
          { name: "bankAccountId", label: "الحساب البنكي", type: "reference", refEndpoint: "/api/finance/bank-accounts", refLabelFields: ["bankName", "accountNumber"], refValueField: "id" },
          { name: "reference", label: "رقم المرجع", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      {
        key: "vendors", label: "الموردون", icon: "business-outline", endpoint: "/api/finance/vendors",
        titleFields: ["name", "vendorName"], subtitleFields: ["taxNumber", "phone"], statusField: "status", amountFields: ["balance"],
        detailRoute: "/finance/vendor-detail", createRoute: "/finance/vendor-new",
        write: {
          moduleKey: "finance",
          detailPath: (id) => `/api/finance/vendors/${id}`,
          canDelete: true,
          createFields: [
            { name: "name", label: "اسم المورد", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "taxNumber", label: "الرقم الضريبي", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم المورد", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "taxNumber", label: "الرقم الضريبي", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
        },
      },
      {
        key: "vendor-contracts", label: "عقود الموردين", icon: "document-attach-outline", endpoint: "/api/finance/vendor-contracts",
        detailRoute: "/finance/vendor-contract-detail", createRoute: "/finance/vendor-contract-new", titleFields: ["title", "ref"], subtitleFields: ["vendorName"], statusField: "status", amountFields: ["contractValue"], dateFields: ["startDate"],
        write: {
          moduleKey: "finance",
          createFields: [
            { name: "title", label: "عنوان العقد", type: "text", required: true },
            {
              name: "vendorId", label: "المورد", type: "reference", required: true,
              refEndpoint: "/api/finance/vendors", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "contractValue", label: "قيمة العقد", type: "currency" },
            {
              name: "contractType", label: "نوع العقد", type: "select",
              options: [
                { value: "service", label: "خدمات" },
                { value: "supply", label: "توريد" },
                { value: "maintenance", label: "صيانة" },
                { value: "consulting", label: "استشارات" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      { key: "accounts", label: "شجرة الحسابات", icon: "git-branch-outline", endpoint: "/api/finance/accounts", titleFields: ["name", "accountName"], subtitleFields: ["code", "type"], statusField: "status", amountFields: ["balance"] },
      { key: "budget", label: "الموازنات", icon: "pie-chart-outline", endpoint: "/api/finance/budget", titleFields: ["accountName"], subtitleFields: ["accountCode", "period"], statusField: "status", amountFields: ["amount"] },
      { key: "cost-centers", label: "مراكز التكلفة", icon: "layers-outline", endpoint: "/api/finance/cost-centers", titleFields: ["name"], subtitleFields: ["code"], statusField: "status" },
      {
        key: "custodies", label: "العُهد", icon: "briefcase-outline", endpoint: "/api/finance/custodies", titleFields: ["ref"], subtitleFields: ["employeeName", "description"], statusField: "status", amountFields: ["amount"], dateFields: ["date"], detailRoute: "/finance/custody-detail", createRoute: "/finance/custody-new",
        write: {
          moduleKey: "finance",
          createFields: [
            { name: "employeeId", label: "الموظف", type: "text", required: true },
            { name: "amount", label: "المبلغ", type: "text", required: true },
            { name: "description", label: "البيان", type: "text", required: true },
            { name: "date", label: "التاريخ", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "salary-advances", label: "سلف الرواتب", icon: "wallet-outline", endpoint: "/api/finance/salary-advances", titleFields: ["ref"], subtitleFields: ["employeeName"], statusField: "status", amountFields: ["amount"], dateFields: ["createdAt"], detailRoute: "/finance/salary-advance-detail", createRoute: "/finance/salary-advance-new",
        write: {
          moduleKey: "finance",
          createFields: [
            { name: "employeeId", label: "الموظف", type: "text", required: true },
            { name: "amount", label: "المبلغ", type: "text", required: true },
            { name: "reason", label: "السبب", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد السلفة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/finance/salary-advances/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد سلفة الراتب؟", successText: "تم الاعتماد", showWhenStatus: ["pending"] },
          ],
        },
      },
      { key: "recurring-journals", label: "القيود الدورية", icon: "repeat-outline", endpoint: "/api/finance/recurring-journals", titleFields: ["name"], subtitleFields: ["frequency"], dateFields: ["nextRunDate"] },
      { key: "obligations", label: "الالتزامات", icon: "checkmark-circle-outline", endpoint: "/api/obligations", titleFields: ["title"], subtitleFields: ["obligationType", "entityType"], statusField: "status", dateFields: ["dueAt"], detailRoute: "/finance/obligation-detail", createRoute: "/finance/obligation-new",
        write: { moduleKey: "finance", createFields: [
          { name: "title", label: "عنوان الالتزام", type: "text", required: true },
          { name: "obligationType", label: "نوع الالتزام", type: "select", required: true, options: [{ value: "payment", label: "دفعة" }, { value: "contract", label: "عقد" }, { value: "regulatory", label: "تنظيمي" }, { value: "other", label: "أخرى" }] },
          { name: "amount", label: "المبلغ", type: "currency" },
          { name: "dueAt", label: "تاريخ الاستحقاق", type: "date", required: true },
          { name: "entityType", label: "نوع الجهة", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "bank-reconciliation", label: "تسوية البنوك", icon: "swap-horizontal-outline", endpoint: "/api/finance/bank-reconciliation", titleFields: ["ref", "bankAccount"], subtitleFields: ["bankName"], statusField: "status", dateFields: ["statementDate"] },
      { key: "fixed-assets", label: "الأصول الثابتة", icon: "home-outline", endpoint: "/api/finance/fixed-assets", titleFields: ["name", "assetCode"], subtitleFields: ["category", "location"], statusField: "status", amountFields: ["acquisitionCost", "bookValue"], dateFields: ["acquisitionDate"], detailRoute: "/finance/fixed-asset-detail", createRoute: "/finance/fixed-asset-disposal-new",
        write: { moduleKey: "finance", createFields: [
          { name: "name", label: "اسم الأصل", type: "text", required: true },
          { name: "category", label: "التصنيف", type: "select", required: true, options: [{ value: "equipment", label: "معدات" }, { value: "vehicle", label: "مركبة" }, { value: "furniture", label: "أثاث" }, { value: "electronics", label: "إلكترونيات" }, { value: "building", label: "مبنى" }, { value: "other", label: "أخرى" }] },
          { name: "acquisitionCost", label: "تكلفة الاقتناء", type: "currency", required: true },
          { name: "acquisitionDate", label: "تاريخ الاقتناء", type: "date", required: true },
          { name: "location", label: "الموقع", type: "text" },
          { name: "serialNumber", label: "الرقم التسلسلي", type: "text" },
          { name: "usefulLifeYears", label: "العمر الإنتاجي (سنوات)", type: "number" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "ar-aging", label: "تقادم الذمم المدينة", icon: "trending-up-outline", endpoint: "/api/finance/ar-aging", titleFields: ["clientName"], subtitleFields: ["bucket"], amountFields: ["balance", "overdue"] },
      { key: "ap-aging", label: "تقادم الذمم الدائنة", icon: "trending-down-outline", endpoint: "/api/finance/ap-aging", titleFields: ["supplierName", "vendorName"], subtitleFields: ["bucket"], amountFields: ["balance", "overdue"] },
      { key: "bad-debt", label: "مخصص الديون المشكوك فيها", icon: "alert-circle-outline", endpoint: "/api/finance/bad-debt", titleFields: ["clientName"], subtitleFields: ["agingBucket"], amountFields: ["amount", "provision"], dateFields: ["dueDate"] },
      { key: "cash-flow", label: "بيان التدفقات النقدية", icon: "cash-outline", endpoint: "/api/finance/cash-flow-statement", titleFields: ["period", "label"], subtitleFields: ["category"], amountFields: ["amount"] },
      {
        key: "bank-accounts", label: "الحسابات البنكية", icon: "card-outline", endpoint: "/api/finance/bank-accounts", detailRoute: "/finance/bank-account-detail", titleFields: ["bankName", "accountName"], subtitleFields: ["iban", "currency"], statusField: "status", amountFields: ["balance"],
        write: { moduleKey: "finance", createFields: [
          { name: "bankName", label: "اسم البنك", type: "text", required: true },
          { name: "accountName", label: "اسم الحساب", type: "text", required: true },
          { name: "iban", label: "رقم الآيبان", type: "text", required: true },
          { name: "accountNumber", label: "رقم الحساب", type: "text" },
          { name: "currency", label: "العملة", type: "select", options: [{ value: "SAR", label: "ريال سعودي" }, { value: "USD", label: "دولار أمريكي" }, { value: "EUR", label: "يورو" }, { value: "GBP", label: "جنيه إسترليني" }] },
          { name: "openingBalance", label: "الرصيد الافتتاحي", type: "currency" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] },
      },
      { key: "tax-returns", label: "الإقرارات الضريبية", icon: "document-text-outline", endpoint: "/api/finance/tax-returns", titleFields: ["period", "ref"], subtitleFields: ["type"], statusField: "status", amountFields: ["vatAmount", "totalAmount"], dateFields: ["dueDate"] },
      { key: "fiscal-periods", label: "الفترات المالية", icon: "calendar-outline", endpoint: "/api/finance/fiscal-periods-v2", titleFields: ["name", "period"], subtitleFields: ["year"], statusField: "status", dateFields: ["startDate", "endDate"] },
      {
        key: "commitments", label: "الالتزامات التعاقدية", icon: "link-outline", endpoint: "/api/finance/commitments",
        detailRoute: "/finance/commitment-detail", createRoute: "/finance/commitment-new", titleFields: ["ref", "description"], subtitleFields: ["counterparty", "type"], statusField: "status", amountFields: ["amount"], dateFields: ["startDate"],
        write: {
          moduleKey: "finance",
          createFields: [
            { name: "description", label: "وصف الالتزام", type: "text", required: true },
            { name: "counterparty", label: "الطرف المقابل", type: "text", required: true },
            { name: "amount", label: "القيمة", type: "currency", required: true },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            {
              name: "type", label: "النوع", type: "select",
              options: [
                { value: "lease", label: "إيجار" },
                { value: "service", label: "خدمات" },
                { value: "loan", label: "قرض" },
                { value: "other", label: "أخرى" },
              ],
            },
          ],
        },
      },
    ],
  },
  fleet: {
    key: "fleet",
    label: "الأسطول",
    sections: [
      {
        key: "vehicles", label: "المركبات", icon: "car-outline", endpoint: "/api/fleet/vehicles", detailRoute: "/fleet/vehicle-detail", createRoute: "/fleet/vehicle-new",
        titleFields: ["plateNumber", "plate"], subtitleFields: ["make", "model"], statusField: "status", dateFields: ["expiryDate"],
        write: {
          moduleKey: "fleet",
          canDelete: true,
          statuses: [
            { value: "available", label: "متاحة" },
            { value: "in_use", label: "قيد الاستخدام" },
            { value: "maintenance", label: "صيانة" },
            { value: "out_of_service", label: "خارج الخدمة" },
          ],
          createFields: [
            { name: "plateNumber", label: "رقم اللوحة", type: "text", required: true, placeholder: "أ ب ج ١٢٣٤" },
            { name: "make", label: "الصنع", type: "text", required: true, placeholder: "تويوتا" },
            { name: "model", label: "الطراز", type: "text", required: true, placeholder: "هايلكس" },
            { name: "year", label: "سنة الصنع", type: "number", placeholder: "2024" },
            { name: "color", label: "اللون", type: "text" },
            {
              name: "fuelType", label: "نوع الوقود", type: "select",
              options: [
                { value: "gasoline", label: "بنزين" },
                { value: "diesel", label: "ديزل" },
                { value: "electric", label: "كهرباء" },
                { value: "hybrid", label: "هجين" },
                { value: "lpg", label: "غاز" },
              ],
            },
            { name: "vinNumber", label: "رقم الهيكل (VIN)", type: "text" },
            { name: "currentMileage", label: "العداد الحالي (كم)", type: "number" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "plateNumber", label: "رقم اللوحة", type: "text", required: true },
            { name: "make", label: "الصنع", type: "text", required: true },
            { name: "model", label: "الطراز", type: "text", required: true },
            { name: "year", label: "سنة الصنع", type: "number" },
            { name: "color", label: "اللون", type: "text" },
            {
              name: "fuelType", label: "نوع الوقود", type: "select",
              options: [
                { value: "gasoline", label: "بنزين" },
                { value: "diesel", label: "ديزل" },
                { value: "electric", label: "كهرباء" },
                { value: "hybrid", label: "هجين" },
                { value: "lpg", label: "غاز" },
              ],
            },
            {
              name: "assignedDriverId", label: "السائق المخصّص", type: "reference",
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "trips", label: "الرحلات", icon: "navigate-outline", endpoint: "/api/fleet/trips", titleFields: ["destination", "ref", "origin"], subtitleFields: ["driverName", "vehiclePlate"], statusField: "status", dateFields: ["tripDate", "startTime", "date"], detailRoute: "/fleet/trip-detail", createRoute: "/fleet/trip-new",
        write: {
          moduleKey: "fleet",
          createFields: [
            { name: "vehicleId", label: "المركبة", type: "text", required: true },
            { name: "driverId", label: "السائق", type: "text" },
            { name: "origin", label: "نقطة الانطلاق", type: "text", required: true },
            { name: "destination", label: "الوجهة", type: "text", required: true },
            { name: "tripDate", label: "تاريخ الرحلة", type: "date", required: true },
            { name: "startOdometer", label: "قراءة العداد (بداية)", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "rental-contracts", label: "عقود التأجير", icon: "document-text-outline", endpoint: "/api/fleet/rental-contracts",
        titleFields: ["contractNumber", "ref"], subtitleFields: ["customerName", "clientName"], statusField: "status", amountFields: ["totalAmount", "total"], dateFields: ["startDate"],
        write: {
          moduleKey: "fleet",
          noDetail: true,
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            {
              name: "clientId", label: "العميل", type: "reference", required: true,
              refEndpoint: "/api/clients", refLabelFields: ["name", "clientName"], refValueField: "id",
            },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "dailyRate", label: "السعر اليومي", type: "currency" },
            { name: "totalAmount", label: "الإجمالي", type: "currency" },
            { name: "securityDeposit", label: "مبلغ التأمين", type: "currency" },
            {
              name: "paymentTerms", label: "شروط الدفع", type: "select",
              options: [
                { value: "daily", label: "يومي" },
                { value: "weekly", label: "أسبوعي" },
                { value: "monthly", label: "شهري" },
                { value: "quarterly", label: "ربع سنوي" },
                { value: "one_time", label: "دفعة واحدة" },
              ],
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "fuel-logs", label: "سجلات الوقود", icon: "flame-outline", endpoint: "/api/fleet/fuel-logs",
        detailRoute: "/fleet/fuel-log-detail", createRoute: "/fleet/fuel-log-new",
        titleFields: ["vehiclePlate", "ref"], subtitleFields: ["driverName", "stationName"], amountFields: ["totalCost", "cost", "amount", "total"], dateFields: ["fuelDate", "date", "createdAt"],
        write: {
          moduleKey: "fleet",
          canDelete: true,
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference",
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            { name: "liters", label: "عدد اللترات", type: "number", required: true },
            { name: "costPerLiter", label: "سعر اللتر", type: "currency" },
            { name: "fuelDate", label: "تاريخ التعبئة", type: "date" },
            { name: "mileageAtFuel", label: "قراءة العداد (كم)", type: "number" },
            { name: "stationName", label: "المحطة", type: "text" },
            {
              name: "fuelType", label: "نوع الوقود", type: "select",
              options: [
                { value: "gasoline", label: "بنزين" },
                { value: "diesel", label: "ديزل" },
              ],
            },
            {
              name: "driverId", label: "السائق", type: "reference",
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
          ],
          editFields: [
            { name: "liters", label: "عدد اللترات", type: "number", required: true },
            { name: "costPerLiter", label: "سعر اللتر", type: "currency" },
            { name: "stationName", label: "المحطة", type: "text" },
          ],
        },
      },
      {
        key: "drivers", label: "السائقون", icon: "person-outline", endpoint: "/api/fleet/drivers",
        titleFields: ["name", "fullName"], subtitleFields: ["phone", "licenseNumber"], statusField: "status",
        detailRoute: "/fleet/driver-detail", createRoute: "/fleet/driver-new",
        write: {
          moduleKey: "fleet",
          canDelete: true,
          statuses: [
            { value: "available", label: "متاح" },
            { value: "on_trip", label: "في رحلة" },
            { value: "off_duty", label: "خارج الدوام" },
            { value: "suspended", label: "موقوف" },
          ],
          createFields: [
            { name: "name", label: "اسم السائق", type: "text", required: true },
            { name: "phone", label: "رقم الجوال", type: "text", required: true, placeholder: "05XXXXXXXX" },
            { name: "licenseNumber", label: "رقم الرخصة", type: "text", required: true },
            { name: "licenseExpiry", label: "تاريخ انتهاء الرخصة", type: "date" },
            { name: "nationalId", label: "رقم الهوية", type: "text" },
            { name: "iqamaNumber", label: "رقم الإقامة", type: "text" },
            {
              name: "licenseClass", label: "فئة الرخصة", type: "select",
              options: [
                { value: "private", label: "خصوصي" },
                { value: "light_trans", label: "نقل خفيف" },
                { value: "medium", label: "متوسط" },
                { value: "heavy", label: "نقل ثقيل" },
                { value: "public_trans", label: "نقل عام" },
                { value: "motorcycle", label: "دراجة نارية" },
                { value: "equipment", label: "معدات" },
              ],
            },
            {
              name: "licenseOrigin", label: "مصدر الرخصة", type: "select",
              options: [
                { value: "saudi", label: "سعودية" },
                { value: "gcc", label: "خليجية" },
                { value: "international", label: "دولية" },
                { value: "temporary", label: "مؤقتة" },
              ],
            },
            {
              name: "driverServiceProfile", label: "نوع الخدمة", type: "select",
              options: [
                { value: "cargo_driver", label: "سائق شحن" },
                { value: "umrah_driver", label: "سائق عمرة" },
                { value: "passenger_driver", label: "سائق ركاب" },
                { value: "rental_driver", label: "سائق تأجير" },
                { value: "mixed", label: "متعدد" },
              ],
            },
            {
              name: "employeeId", label: "الموظف المرتبط", type: "reference",
              refEndpoint: "/api/employees", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
          ],
          editFields: [
            { name: "name", label: "اسم السائق", type: "text", required: true },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "licenseNumber", label: "رقم الرخصة", type: "text" },
            { name: "licenseExpiry", label: "تاريخ انتهاء الرخصة", type: "date" },
          ],
        },
      },
      {
        key: "maintenance", label: "الصيانة", icon: "build-outline", endpoint: "/api/fleet/maintenance",
        titleFields: ["type", "description"], subtitleFields: ["vehiclePlate"], statusField: "status", amountFields: ["cost"], dateFields: ["serviceDate"],
        detailRoute: "/fleet/maintenance-detail", createRoute: "/fleet/maintenance-new",
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            { name: "type", label: "نوع الصيانة", type: "text", required: true },
            { name: "description", label: "الوصف", type: "text", required: true },
            { name: "cost", label: "التكلفة", type: "currency" },
            { name: "mileageAtService", label: "العداد عند الصيانة (كم)", type: "number" },
            { name: "serviceDate", label: "تاريخ الصيانة", type: "date" },
            { name: "nextServiceDate", label: "تاريخ الصيانة القادمة", type: "date" },
            { name: "performedBy", label: "نفّذها", type: "text" },
          ],
          editFields: [
            { name: "type", label: "نوع الصيانة", type: "text", required: true },
            { name: "description", label: "الوصف", type: "text" },
            { name: "cost", label: "التكلفة", type: "currency" },
            { name: "nextServiceDate", label: "تاريخ الصيانة القادمة", type: "date" },
          ],
          actions: [
            { key: "complete", label: "إنهاء الصيانة", icon: "checkmark-circle-outline", method: "POST", path: (id) => `/api/fleet/maintenance/${id}/complete`, confirm: "هل تريد إنهاء الصيانة؟", successText: "تم إنهاء الصيانة", showWhenStatus: ["scheduled", "in_progress"] },
            { key: "cancel", label: "إلغاء الصيانة", icon: "close-circle-outline", method: "POST", path: (id) => `/api/fleet/maintenance/${id}/cancel`, body: { reason: "أُلغيت من تطبيق الجوال" }, confirm: "هل تريد إلغاء الصيانة؟", successText: "تم إلغاء الصيانة", tone: "danger", showWhenStatus: ["scheduled", "in_progress"] },
          ],
        },
      },
      {
        key: "insurance", label: "وثائق التأمين", icon: "shield-checkmark-outline", endpoint: "/api/fleet/insurance",
        detailRoute: "/fleet/insurance-detail", createRoute: "/fleet/insurance-new",
        titleFields: ["policyNumber", "provider"], subtitleFields: ["vehiclePlate", "provider"], amountFields: ["premium"], dateFields: ["endDate"],
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            { name: "provider", label: "شركة التأمين", type: "text", required: true },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date", required: true },
            { name: "type", label: "نوع التأمين", type: "text" },
            { name: "policyNumber", label: "رقم الوثيقة", type: "text" },
            { name: "premium", label: "قسط التأمين", type: "currency" },
            { name: "coverageAmount", label: "مبلغ التغطية", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "provider", label: "شركة التأمين", type: "text", required: true },
            { name: "policyNumber", label: "رقم الوثيقة", type: "text" },
            { name: "premium", label: "قسط التأمين", type: "currency" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      { key: "alerts", label: "التنبيهات", icon: "notifications-outline", endpoint: "/api/fleet/alerts", titleFields: ["alertType", "description"], subtitleFields: ["vehiclePlate", "severity"], statusField: "status", dateFields: ["resolvedAt"] },
      {
        key: "traffic-violations", label: "المخالفات المرورية", icon: "warning-outline", endpoint: "/api/fleet/traffic-violations",
        detailRoute: "/fleet/violation-detail", createRoute: "/fleet/violation-new",
        titleFields: ["violationNumber", "violationType"], subtitleFields: ["vehiclePlate", "driverName"], statusField: "status", amountFields: ["fineAmount"], dateFields: ["violationDate"],
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            { name: "violationType", label: "نوع المخالفة", type: "text", required: true },
            {
              name: "driverId", label: "السائق", type: "reference",
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
            { name: "violationDate", label: "تاريخ المخالفة", type: "date" },
            { name: "fineAmount", label: "قيمة الغرامة", type: "currency" },
            { name: "location", label: "الموقع", type: "text" },
            { name: "violationNumber", label: "رقم المخالفة", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "pay", label: "سداد الغرامة", icon: "cash-outline", method: "PATCH", path: (id) => `/api/fleet/traffic-violations/${id}/pay`, confirm: "هل تريد تسجيل سداد الغرامة؟", successText: "تم تسجيل السداد", showWhenStatus: ["pending", "disputed"] },
            { key: "dispute", label: "الاعتراض على المخالفة", icon: "alert-circle-outline", method: "PATCH", path: (id) => `/api/fleet/traffic-violations/${id}`, body: { status: "disputed" }, confirm: "هل تريد تسجيل اعتراض على المخالفة؟", successText: "تم تسجيل الاعتراض", showWhenStatus: ["pending"] },
          ],
        },
      },
      {
        key: "cargo-manifests", label: "بيانات الشحن", icon: "cube-outline", endpoint: "/api/cargo/manifests",
        detailRoute: "/fleet/cargo-manifest-detail", createRoute: "/fleet/cargo-manifest-new", titleFields: ["manifestNumber", "ref"], subtitleFields: ["linkedCustomerName", "vehiclePlate", "driverName"], statusField: "status", amountFields: ["freightRevenue"], dateFields: ["pickupDate"],
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "model"], refValueField: "id",
            },
            {
              name: "driverId", label: "السائق", type: "reference", required: true,
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "pickupDate", label: "تاريخ الاستلام", type: "date", required: true },
            { name: "pickupLocation", label: "موقع الاستلام", type: "text", required: true },
            { name: "deliveryLocation", label: "موقع التسليم", type: "text", required: true },
            { name: "cargoDescription", label: "وصف البضاعة", type: "textarea" },
            { name: "freightRevenue", label: "قيمة الشحن", type: "currency" },
            {
              name: "linkedCustomerId", label: "العميل", type: "reference",
              refEndpoint: "/api/clients", refLabelFields: ["name"], refValueField: "id",
            },
          ],
        },
      },
      {
        key: "transport-bookings", label: "حجوزات النقل", icon: "bus-outline", endpoint: "/api/transport/bookings",
        titleFields: ["bookingNumber", "fromLocationText"], subtitleFields: ["linkedCustomerName", "toLocationText"], statusField: "status", dateFields: ["requestedPickupDate"],
        detailRoute: "/fleet/transport-booking-detail", createRoute: "/fleet/trip-new",
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "linkedCustomerId", label: "العميل", type: "reference", required: true,
              refEndpoint: "/api/clients", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "fromLocationText", label: "من (موقع الانطلاق)", type: "text", required: true },
            { name: "toLocationText", label: "إلى (الوجهة)", type: "text", required: true },
            { name: "requestedPickupDate", label: "تاريخ الاستلام المطلوب", type: "date", required: true },
            { name: "passengerCount", label: "عدد الركاب", type: "number" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "transport-dispatch", label: "أوامر التشغيل", icon: "git-network-outline", endpoint: "/api/transport/dispatch-orders",
        titleFields: ["bookingNumber", "fromLocationText"], subtitleFields: ["vehiclePlate", "driverName"], statusField: "status", dateFields: ["scheduledStartAt"],
        detailRoute: "/fleet/transport-dispatch-detail",
        write: {
          moduleKey: "fleet",
          createFields: [
            {
              name: "bookingId", label: "الحجز", type: "reference", required: true,
              refEndpoint: "/api/transport/bookings", refLabelFields: ["bookingNumber", "fromLocationText"], refValueField: "id",
            },
            {
              name: "vehicleId", label: "المركبة", type: "reference", required: true,
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "model"], refValueField: "id",
            },
            {
              name: "driverId", label: "السائق", type: "reference", required: true,
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "scheduledStartAt", label: "وقت الانطلاق المجدول", type: "date", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
    ],
  },
  warehouse: {
    key: "warehouse",
    label: "المستودع",
    sections: [
      {
        key: "products", label: "المنتجات", icon: "cube-outline", endpoint: "/api/warehouse/products",
        titleFields: ["name", "productName"], subtitleFields: ["sku", "categoryName"], statusField: "status",
        detailRoute: "/warehouse/product-detail", createRoute: "/warehouse/product-new",
        write: {
          moduleKey: "warehouse",
          canDelete: true,
          createFields: [
            { name: "name", label: "اسم المنتج", type: "text", required: true },
            { name: "sku", label: "رمز المنتج (SKU)", type: "text", required: true },
            { name: "costPrice", label: "سعر التكلفة", type: "currency" },
            { name: "sellPrice", label: "سعر البيع", type: "currency" },
            { name: "unit", label: "الوحدة", type: "text" },
            { name: "minStock", label: "الحد الأدنى للمخزون", type: "number" },
            { name: "maxStock", label: "الحد الأقصى للمخزون", type: "number" },
            { name: "currentStock", label: "المخزون الحالي", type: "number" },
            { name: "location", label: "الموقع", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم المنتج", type: "text", required: true },
            { name: "sku", label: "رمز المنتج (SKU)", type: "text", required: true },
            { name: "costPrice", label: "سعر التكلفة", type: "currency" },
            { name: "sellPrice", label: "سعر البيع", type: "currency" },
            { name: "minStock", label: "الحد الأدنى للمخزون", type: "number" },
            { name: "maxStock", label: "الحد الأقصى للمخزون", type: "number" },
            { name: "location", label: "الموقع", type: "text" },
          ],
        },
      },
      {
        key: "movements", label: "حركات المخزون", icon: "swap-horizontal-outline", endpoint: "/api/warehouse/movements",
        detailRoute: "/warehouse/movement-detail", createRoute: "/warehouse/movement-new",
        titleFields: ["ref", "movementNumber"], subtitleFields: ["type", "fromWarehouse", "toWarehouse"], statusField: "status", dateFields: ["date", "createdAt"],
        write: {
          moduleKey: "warehouse",
          createFields: [
            {
              name: "productId", label: "المنتج", type: "reference", required: true,
              refEndpoint: "/api/warehouse/products", refLabelFields: ["name", "productName"], refValueField: "id",
            },
            {
              name: "type", label: "نوع الحركة", type: "select", required: true,
              options: [
                { value: "in", label: "إدخال" },
                { value: "out", label: "إخراج" },
                { value: "return", label: "مرتجع" },
                { value: "transfer_in", label: "تحويل وارد" },
                { value: "transfer_out", label: "تحويل صادر" },
                { value: "adjustment_in", label: "تسوية إضافة" },
                { value: "adjustment_out", label: "تسوية خصم" },
              ],
            },
            { name: "quantity", label: "الكمية", type: "number", required: true },
            { name: "unitCost", label: "تكلفة الوحدة", type: "currency" },
            { name: "reference", label: "المرجع", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "suppliers", label: "الموردون", icon: "business-outline", endpoint: "/api/warehouse/suppliers",
        detailRoute: "/warehouse/supplier-detail", createRoute: "/warehouse/supplier-new",
        titleFields: ["name"], subtitleFields: ["contactPerson", "phone"],
        write: {
          moduleKey: "warehouse",
          canDelete: true,
          createFields: [
            { name: "name", label: "اسم المورد", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "taxNumber", label: "الرقم الضريبي", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
            { name: "paymentTerms", label: "مدة السداد (أيام)", type: "number" },
          ],
          editFields: [
            { name: "name", label: "اسم المورد", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
        },
      },
      { key: "categories", label: "تصنيفات المنتجات", icon: "list-outline", endpoint: "/api/warehouse/categories", titleFields: ["name"], subtitleFields: ["parentName", "code"],
        write: { moduleKey: "warehouse", createFields: [
          { name: "name", label: "اسم التصنيف", type: "text", required: true },
          { name: "code", label: "الرمز", type: "text" },
          { name: "description", label: "الوصف", type: "textarea" },
        ] } },
      { key: "purchase-orders", label: "أوامر شراء المستودع", icon: "cart-outline", endpoint: "/api/warehouse/purchase-orders", detailRoute: "/finance/purchase-order-detail", titleFields: ["ref", "poNumber"], subtitleFields: ["supplierName"], statusField: "status", amountFields: ["totalAmount"], dateFields: ["orderDate"],
        write: { moduleKey: "warehouse", createFields: [
          { name: "supplierId", label: "المورد", type: "reference", required: true, refEndpoint: "/api/warehouse/suppliers", refLabelFields: ["name"], refValueField: "id" },
          { name: "orderDate", label: "تاريخ الطلب", type: "date", required: true },
          { name: "expectedDeliveryDate", label: "تاريخ التسليم المتوقع", type: "date" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ], actions: [
          { key: "approve", label: "اعتماد أمر الشراء", icon: "checkmark-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/warehouse/purchase-orders/${id}/approve`, confirm: "هل تريد اعتماد أمر الشراء؟", successText: "تم الاعتماد", showWhenStatus: ["pending", "draft"] },
        ] } },
      { key: "cycle-counts", label: "جرد المخزون", icon: "calculator-outline", endpoint: "/api/warehouse/cycle-counts", titleFields: ["ref", "cycle"], subtitleFields: ["location", "status"], statusField: "status", dateFields: ["startDate"], detailRoute: "/warehouse/cycle-count-detail", createRoute: "/warehouse/cycle-count-new",
        write: { moduleKey: "warehouse", createFields: [
          { name: "location", label: "الموقع / المستودع", type: "text", required: true },
          { name: "startDate", label: "تاريخ البدء", type: "date", required: true },
          { name: "countType", label: "نوع الجرد", type: "select", options: [{ value: "full", label: "جرد شامل" }, { value: "partial", label: "جرد جزئي" }, { value: "spot", label: "عينة عشوائية" }] },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ],
        actions: [
          { key: "start", label: "بدء الجرد", icon: "play-circle-outline" as never, method: "POST" as const, path: (id: string | number) => `/api/warehouse/cycle-counts/${id}/start`, confirm: "هل تريد بدء عملية الجرد؟", successText: "تم بدء الجرد", showWhenStatus: ["pending", "draft"] },
          { key: "complete", label: "إنهاء الجرد", icon: "checkmark-done-circle-outline" as never, method: "POST" as const, path: (id: string | number) => `/api/warehouse/cycle-counts/${id}/complete`, confirm: "هل تريد إنهاء وتأكيد نتائج الجرد؟", successText: "تم إنهاء الجرد", showWhenStatus: ["in_progress"] },
        ] } },
    ],
  },
  operations: {
    key: "operations",
    label: "العمليات والمشاريع",
    sections: [
      { key: "projects", label: "المشاريع", icon: "briefcase-outline", endpoint: "/api/projects", titleFields: ["name", "projectName"], subtitleFields: ["code"], statusField: "status", amountFields: ["budget"], dateFields: ["startDate"], detailRoute: "/projects/project-detail", createRoute: "/projects/project-new",
        write: { moduleKey: "operations", createFields: [
          { name: "name", label: "اسم المشروع", type: "text", required: true },
          { name: "clientId", label: "العميل", type: "reference", refEndpoint: "/api/clients", refLabelFields: ["name"], refValueField: "id" },
          { name: "budget", label: "الميزانية", type: "currency" },
          { name: "startDate", label: "تاريخ البداية", type: "date" },
          { name: "endDate", label: "تاريخ الانتهاء المتوقع", type: "date" },
          { name: "description", label: "الوصف", type: "textarea" },
        ] } },
      {
        key: "tasks", label: "المهام", icon: "checkbox-outline", endpoint: "/api/tasks", titleFields: ["title", "name"], subtitleFields: ["assigneeName", "priority"], statusField: "status", dateFields: ["dueDate"], detailRoute: "/projects/task-detail", createRoute: "/projects/task-new",
        write: {
          moduleKey: "operations",
          createFields: [
            { name: "title", label: "عنوان المهمة", type: "text", required: true },
            { name: "projectId", label: "المشروع", type: "text" },
            { name: "assigneeId", label: "المسؤول", type: "text" },
            { name: "priority", label: "الأولوية", type: "select", options: [{ label: "عالية", value: "high" }, { label: "متوسطة", value: "medium" }, { label: "منخفضة", value: "low" }] },
            { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          actions: [
            { key: "complete", label: "إغلاق المهمة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/tasks/${id}`, body: { status: "done" }, confirm: "هل تريد إغلاق المهمة؟", successText: "تم إغلاق المهمة", showWhenStatus: ["todo", "in_progress", "review"] },
          ],
        },
      },
      {
        key: "milestones", label: "المعالم والإنجازات", icon: "flag-outline", endpoint: "/api/projects/milestones", titleFields: ["title", "name"], subtitleFields: ["projectName"], statusField: "status", amountFields: ["budget"], dateFields: ["dueDate"], detailRoute: "/projects/milestone-detail", createRoute: "/projects/milestone-new",
        write: {
          moduleKey: "operations",
          createFields: [
            { name: "name", label: "اسم المعلم", type: "text", required: true },
            { name: "projectId", label: "المشروع", type: "text", required: true },
            { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "issues", label: "المشاكل والعوائق", icon: "alert-circle-outline", endpoint: "/api/projects/issues", titleFields: ["title", "description"], subtitleFields: ["projectName", "severity"], statusField: "status", dateFields: ["createdAt"], detailRoute: "/projects/issue-detail", createRoute: "/projects/issue-new",
        write: {
          moduleKey: "operations",
          createFields: [
            { name: "title", label: "وصف المشكلة", type: "text", required: true },
            { name: "projectId", label: "المشروع", type: "text", required: true },
            { name: "priority", label: "الأولوية", type: "select", options: [{ label: "حرجة", value: "critical" }, { label: "عالية", value: "high" }, { label: "متوسطة", value: "medium" }, { label: "منخفضة", value: "low" }] },
            { name: "impact", label: "الأثر", type: "textarea" },
            { name: "description", label: "التفاصيل", type: "textarea" },
          ],
          actions: [
            { key: "resolve", label: "إغلاق المشكلة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/projects/issues/${id}`, body: { status: "resolved" }, confirm: "هل تريد إغلاق المشكلة؟", successText: "تم إغلاق المشكلة", showWhenStatus: ["open", "in_progress"] },
          ],
        },
      },
      { key: "operations-center", label: "مركز العمليات", icon: "construct-outline", endpoint: "/api/operations-center/dashboard", titleFields: ["title", "summary"], subtitleFields: ["status", "assigneeName"], statusField: "status", dateFields: ["date"] },
    ],
  },
  umrah: {
    key: "umrah",
    label: "العمرة",
    sections: [
      {
        key: "pilgrims", label: "المعتمرون", icon: "people-outline", endpoint: "/api/umrah/pilgrims", detailRoute: "/umrah/pilgrim-detail", createRoute: "/umrah/pilgrim-new",
        titleFields: ["name", "fullName"], subtitleFields: ["passportNumber", "groupName"], statusField: "status",
        write: {
          moduleKey: "umrah",
          canDelete: true,
          createFields: [
            { name: "fullName", label: "الاسم الكامل", type: "text", required: true },
            { name: "passportNumber", label: "رقم الجواز", type: "text", required: true },
            { name: "nationality", label: "الجنسية", type: "text" },
            { name: "gender", label: "الجنس", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            {
              name: "seasonId", label: "الموسم", type: "reference",
              refEndpoint: "/api/umrah/seasons", refLabelFields: ["title"], refValueField: "id",
            },
            {
              name: "groupId", label: "المجموعة", type: "reference",
              refEndpoint: "/api/umrah/groups", refLabelFields: ["name", "groupNumber"], refValueField: "id",
            },
            {
              name: "agentId", label: "الوكيل", type: "reference",
              refEndpoint: "/api/umrah/agents", refLabelFields: ["name"], refValueField: "id",
            },
            {
              name: "packageId", label: "الباقة", type: "reference",
              refEndpoint: "/api/umrah/packages", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "arrivalDate", label: "تاريخ الوصول", type: "date" },
            { name: "departureDate", label: "تاريخ المغادرة", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "fullName", label: "الاسم الكامل", type: "text", required: true },
            { name: "passportNumber", label: "رقم الجواز", type: "text" },
            { name: "nationality", label: "الجنسية", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "groups", label: "المجموعات", icon: "albums-outline", endpoint: "/api/umrah/groups",
        titleFields: ["name", "groupNumber"], subtitleFields: ["pilgrimCount"], statusField: "status", dateFields: ["arrivalDate"],
        detailRoute: "/umrah/group-detail", createRoute: "/umrah/group-new",
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "seasonId", label: "الموسم", type: "reference", required: true,
              refEndpoint: "/api/umrah/seasons", refLabelFields: ["title"], refValueField: "id",
            },
            { name: "name", label: "اسم المجموعة", type: "text" },
            { name: "nuskGroupNumber", label: "رقم مجموعة نسك", type: "text" },
            {
              name: "agentId", label: "الوكيل", type: "reference",
              refEndpoint: "/api/umrah/agents", refLabelFields: ["name"], refValueField: "id",
            },
            {
              name: "subAgentId", label: "الوكيل الفرعي", type: "reference",
              refEndpoint: "/api/umrah/sub-agents", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "mutamerCount", label: "عدد المعتمرين", type: "number" },
            { name: "programDuration", label: "مدة البرنامج (أيام)", type: "number" },
          ],
        },
      },
      {
        key: "seasons", label: "المواسم", icon: "moon-outline", endpoint: "/api/umrah/seasons",
        titleFields: ["title"], subtitleFields: ["notes"], statusField: "status", dateFields: ["startDate"],
        write: {
          moduleKey: "umrah",
          createFields: [
            { name: "title", label: "اسم الموسم", type: "text", required: true },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "اسم الموسم", type: "text", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "packages", label: "الباقات", icon: "cube-outline", endpoint: "/api/umrah/packages",
        detailRoute: "/umrah/package-detail",
        titleFields: ["name"], subtitleFields: ["seasonTitle", "duration"], amountFields: ["sellPrice"],
        write: {
          moduleKey: "umrah",
          createFields: [
            { name: "name", label: "اسم الباقة", type: "text", required: true },
            {
              name: "seasonId", label: "الموسم", type: "reference", required: true,
              refEndpoint: "/api/umrah/seasons", refLabelFields: ["title"], refValueField: "id",
            },
            { name: "sellPrice", label: "سعر البيع", type: "currency" },
            { name: "costPrice", label: "سعر التكلفة", type: "currency" },
            { name: "duration", label: "المدة (أيام)", type: "number" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم الباقة", type: "text", required: true },
            { name: "sellPrice", label: "سعر البيع", type: "currency" },
            { name: "costPrice", label: "سعر التكلفة", type: "currency" },
            { name: "duration", label: "المدة (أيام)", type: "number" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "agents", label: "الوكلاء", icon: "person-outline", endpoint: "/api/umrah/agents",
        detailRoute: "/umrah/agent-detail", createRoute: "/umrah/agent-new",
        titleFields: ["name"], subtitleFields: ["country", "phone"], statusField: "status",
        write: {
          moduleKey: "umrah",
          createFields: [
            { name: "name", label: "اسم الوكيل", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "country", label: "الدولة", type: "text" },
            { name: "profitMargin", label: "هامش الربح (%)", type: "number" },
            { name: "contractRef", label: "مرجع العقد", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم الوكيل", type: "text", required: true },
            { name: "contactPerson", label: "الشخص المسؤول", type: "text" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "country", label: "الدولة", type: "text" },
          ],
        },
      },
      {
        key: "sub-agents", label: "الوكلاء الفرعيون", icon: "people-circle-outline", endpoint: "/api/umrah/sub-agents",
        detailRoute: "/umrah/sub-agent-detail", createRoute: "/umrah/sub-agent-new",
        titleFields: ["name"], subtitleFields: ["country", "agentName"],
        write: {
          moduleKey: "umrah",
          createFields: [
            { name: "nuskCode", label: "كود نسك", type: "text", required: true },
            { name: "name", label: "اسم الوكيل الفرعي", type: "text", required: true },
            {
              name: "agentId", label: "الوكيل الرئيسي", type: "reference",
              refEndpoint: "/api/umrah/agents", refLabelFields: ["name"], refValueField: "id",
            },
            {
              name: "clientId", label: "العميل", type: "reference",
              refEndpoint: "/api/clients", refLabelFields: ["name", "clientName"], refValueField: "id",
            },
            { name: "defaultPricePerMutamer", label: "السعر الافتراضي للمعتمر", type: "currency" },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "country", label: "الدولة", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم الوكيل الفرعي", type: "text", required: true },
            { name: "phone", label: "رقم الجوال", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "country", label: "الدولة", type: "text" },
          ],
        },
      },
      {
        key: "transport", label: "النقل", icon: "bus-outline", endpoint: "/api/umrah/transport",
        detailRoute: "/umrah/transport-detail", createRoute: "/umrah/transport-new",
        titleFields: ["fromLocation", "toLocation"], subtitleFields: ["vehiclePlate", "driverName"], statusField: "status", amountFields: ["cost"], dateFields: ["tripDate"],
        write: {
          moduleKey: "umrah",
          createFields: [
            { name: "tripDate", label: "تاريخ الرحلة", type: "date", required: true },
            { name: "fromLocation", label: "من", type: "text", required: true },
            { name: "toLocation", label: "إلى", type: "text", required: true },
            {
              name: "seasonId", label: "الموسم", type: "reference",
              refEndpoint: "/api/umrah/seasons", refLabelFields: ["title"], refValueField: "id",
            },
            {
              name: "vehicleId", label: "المركبة", type: "reference",
              refEndpoint: "/api/fleet/vehicles", refLabelFields: ["plateNumber", "plate"], refValueField: "id",
            },
            {
              name: "driverId", label: "السائق", type: "reference",
              refEndpoint: "/api/fleet/drivers", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
            { name: "capacity", label: "السعة", type: "number" },
            { name: "cost", label: "التكلفة", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "hotels", label: "الفنادق", icon: "bed-outline", endpoint: "/api/umrah/hotels",
        titleFields: ["name"], subtitleFields: ["city", "contactPhone"],
        write: {
          moduleKey: "umrah",
          noDetail: true,
          createFields: [
            { name: "name", label: "اسم الفندق", type: "text", required: true },
            { name: "city", label: "المدينة", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
            { name: "starRating", label: "تصنيف النجوم", type: "number" },
            { name: "contactName", label: "اسم جهة الاتصال", type: "text" },
            { name: "contactPhone", label: "هاتف جهة الاتصال", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "violations", label: "المخالفات", icon: "warning-outline", endpoint: "/api/umrah/violations",
        titleFields: ["type"], subtitleFields: ["mutamerName", "agentName"], statusField: "status", amountFields: ["penaltyAmount"], dateFields: ["detectedAt"],
        detailRoute: "/umrah/violation-detail", createRoute: "/umrah/violation-new",
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "pilgrimId", label: "المعتمر", type: "reference", required: true,
              refEndpoint: "/api/umrah/pilgrims", refLabelFields: ["name", "nameAr"], refValueField: "id",
            },
            { name: "detectedAt", label: "تاريخ الاكتشاف", type: "date", required: true },
            {
              name: "type", label: "نوع المخالفة", type: "select", required: true,
              options: [
                { value: "visa_violation", label: "مخالفة تأشيرة" },
                { value: "stay_violation", label: "مخالفة إقامة" },
                { value: "conduct_violation", label: "مخالفة سلوكية" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "penaltyAmount", label: "مبلغ الغرامة", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "penalties", label: "الغرامات", icon: "alert-circle-outline", endpoint: "/api/umrah/penalties",
        titleFields: ["type"], subtitleFields: ["pilgrimName", "agentName"], statusField: "status", amountFields: ["amount"], dateFields: ["createdAt"],
        detailRoute: "/umrah/penalty-detail", createRoute: "/umrah/penalty-new",
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "pilgrimId", label: "المعتمر", type: "reference", required: true,
              refEndpoint: "/api/umrah/pilgrims", refLabelFields: ["name", "nameAr"], refValueField: "id",
            },
            {
              name: "type", label: "نوع الغرامة", type: "select", required: true,
              options: [
                { value: "overstay", label: "تجاوز مدة الإقامة" },
                { value: "no_show", label: "عدم الحضور" },
                { value: "cancellation", label: "إلغاء" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "amount", label: "مبلغ الغرامة", type: "currency", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "invoices", label: "فواتير المبيعات", icon: "receipt-outline", endpoint: "/api/umrah/invoices",
        titleFields: ["ref"], subtitleFields: ["subAgentName", "clientName"], statusField: "status", amountFields: ["total"], dateFields: ["createdAt"],
        detailRoute: "/umrah/invoice-detail", createRoute: "/umrah/invoice-new",
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "groupId", label: "المجموعة", type: "reference", required: true,
              refEndpoint: "/api/umrah/groups", refLabelFields: ["name", "groupNumber"], refValueField: "id",
            },
            {
              name: "subAgentId", label: "الوكيل الفرعي", type: "reference",
              refEndpoint: "/api/umrah/sub-agents", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "total", label: "الإجمالي", type: "currency", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد الفاتورة", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/umrah/invoices/${id}/approve`, confirm: "هل تريد اعتماد الفاتورة؟", successText: "تم اعتماد الفاتورة", showWhenStatus: ["draft", "pending"] },
          ],
        },
      },
      { key: "nusk-invoices", label: "فواتير نُسك", icon: "documents-outline", endpoint: "/api/umrah/nusk-invoices", titleFields: ["nuskInvoiceNumber"], subtitleFields: ["agentName"], statusField: "nuskStatus", amountFields: ["totalAmount"], dateFields: ["createdAt"], detailRoute: "/umrah/nusk-invoice-detail", createRoute: "/umrah/nusk-invoice-new",
        write: { moduleKey: "umrah", createFields: [
          { name: "groupId", label: "المجموعة", type: "reference", required: true, refEndpoint: "/api/umrah/groups", refLabelFields: ["name", "groupCode"], refValueField: "id" },
          { name: "agentId", label: "الوكيل", type: "reference", required: true, refEndpoint: "/api/umrah/agents", refLabelFields: ["name"], refValueField: "id" },
          { name: "totalAmount", label: "المبلغ الإجمالي", type: "currency", required: true },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ], actions: [
          { key: "approve", label: "اعتماد الفاتورة", icon: "checkmark-circle-outline" as never, method: "PATCH" as const, path: (id: string | number) => `/api/umrah/nusk-invoices/${id}/approve`, confirm: "هل تريد اعتماد فاتورة نُسك؟", successText: "تم الاعتماد", showWhenStatus: ["draft", "pending"] },
        ] } },
      {
        key: "payments", label: "المدفوعات", icon: "cash-outline", endpoint: "/api/umrah/payments",
        titleFields: ["reference"], subtitleFields: ["subAgentName", "method"], amountFields: ["sarAmount"], dateFields: ["paymentDate"],
        detailRoute: "/umrah/payment-detail", createRoute: "/umrah/payment-new",
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "subAgentId", label: "الوكيل الفرعي", type: "reference",
              refEndpoint: "/api/umrah/sub-agents", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "paymentDate", label: "تاريخ الدفع", type: "date", required: true },
            { name: "sarAmount", label: "المبلغ (ريال)", type: "currency", required: true },
            {
              name: "method", label: "طريقة الدفع", type: "select",
              options: [
                { value: "bank_transfer", label: "تحويل بنكي" },
                { value: "cash", label: "نقدًا" },
                { value: "check", label: "شيك" },
              ],
            },
            { name: "reference", label: "رقم المرجع", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "agent-invoices", label: "فواتير الوكلاء", icon: "receipt-outline", endpoint: "/api/umrah/agent-invoices",
        detailRoute: "/umrah/agent-invoice-detail", createRoute: "/umrah/agent-invoice-new", titleFields: ["ref", "invoiceNumber"], subtitleFields: ["agentName"], statusField: "status", amountFields: ["total", "amount"], dateFields: ["date", "createdAt"],
        write: {
          moduleKey: "umrah",
          createFields: [
            {
              name: "agentId", label: "الوكيل", type: "reference", required: true,
              refEndpoint: "/api/umrah/agents", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "date", label: "تاريخ الفاتورة", type: "date", required: true },
            { name: "total", label: "الإجمالي", type: "currency", required: true },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "approve", label: "اعتماد", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/umrah/agent-invoices/${id}/approve`, confirm: "هل تريد اعتماد الفاتورة؟", successText: "تم", showWhenStatus: ["draft", "pending"] },
          ],
        },
      },
    ],
  },
  crm: {
    key: "crm",
    label: "العملاء",
    sections: [
      {
        key: "clients", label: "العملاء", icon: "person-outline", endpoint: "/api/clients",
        titleFields: ["name", "clientName"], subtitleFields: ["phone", "email"], statusField: "status",
        detailRoute: "/crm/client-detail", createRoute: "/crm/client-new",
        write: {
          moduleKey: "crm",
          canDelete: true,
          createFields: [
            { name: "name", label: "اسم العميل", type: "text", required: true },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            {
              name: "classification", label: "التصنيف", type: "select",
              options: [
                { value: "regular", label: "عادي" },
                { value: "vip", label: "مميّز" },
                { value: "prospect", label: "محتمل" },
                { value: "wholesale", label: "جملة" },
                { value: "new", label: "جديد" },
                { value: "inactive", label: "غير نشط" },
              ],
            },
            {
              name: "type", label: "النوع", type: "select",
              options: [
                { value: "individual", label: "فرد" },
                { value: "company", label: "شركة" },
                { value: "government", label: "جهة حكومية" },
              ],
            },
            { name: "nationality", label: "الجنسية", type: "text" },
            { name: "source", label: "المصدر", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم العميل", type: "text", required: true },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            {
              name: "classification", label: "التصنيف", type: "select",
              options: [
                { value: "regular", label: "عادي" },
                { value: "vip", label: "مميّز" },
                { value: "prospect", label: "محتمل" },
                { value: "wholesale", label: "جملة" },
                { value: "new", label: "جديد" },
                { value: "inactive", label: "غير نشط" },
              ],
            },
            { name: "source", label: "المصدر", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "opportunities", label: "الفرص البيعية", icon: "trending-up-outline", endpoint: "/api/crm/opportunities", detailRoute: "/crm/opportunity-detail", createRoute: "/crm/opportunity-new",
        titleFields: ["title", "name"], subtitleFields: ["clientName"], statusField: "status", amountFields: ["estimatedValue", "value"], dateFields: ["closingDate"],
        write: {
          moduleKey: "crm",
          canDelete: true,
          createFields: [
            { name: "title", label: "عنوان الفرصة", type: "text", required: true },
            {
              name: "clientId", label: "العميل", type: "reference",
              refEndpoint: "/api/clients", refLabelFields: ["name", "clientName"], refValueField: "id",
            },
            { name: "contactName", label: "اسم جهة الاتصال", type: "text" },
            { name: "contactPhone", label: "جوال جهة الاتصال", type: "text" },
            { name: "contactEmail", label: "بريد جهة الاتصال", type: "text" },
            {
              name: "stage", label: "المرحلة", type: "select",
              options: [
                { value: "lead", label: "عميل محتمل" },
                { value: "qualified", label: "مؤهّل" },
                { value: "proposal", label: "عرض سعر" },
                { value: "negotiation", label: "تفاوض" },
              ],
            },
            { name: "value", label: "القيمة المتوقعة", type: "currency" },
            { name: "probability", label: "احتمال الإغلاق (%)", type: "number" },
            { name: "expectedCloseDate", label: "تاريخ الإغلاق المتوقع", type: "date" },
            { name: "source", label: "المصدر", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان الفرصة", type: "text", required: true },
            { name: "value", label: "القيمة المتوقعة", type: "currency" },
            { name: "probability", label: "احتمال الإغلاق (%)", type: "number" },
            { name: "expectedCloseDate", label: "تاريخ الإغلاق المتوقع", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "convert", label: "تحويل إلى صفقة", icon: "swap-horizontal-outline", method: "POST", path: (id) => `/api/crm/opportunities/${id}/convert`, confirm: "هل تريد تحويل الفرصة إلى صفقة ناجحة؟", successText: "تم تحويل الفرصة" },
          ],
        },
      },
      { key: "leads", label: "العملاء المحتملون", icon: "person-add-outline", endpoint: "/api/crm/pipeline", titleFields: ["name", "clientName", "leadName"], subtitleFields: ["phone", "source", "email"], statusField: "status", dateFields: ["createdAt"], detailRoute: "/crm/lead-detail", createRoute: "/crm/lead-new",
        write: { moduleKey: "crm", createFields: [
          { name: "name", label: "الاسم", type: "text", required: true },
          { name: "phone", label: "الجوال", type: "text" },
          { name: "email", label: "البريد الإلكتروني", type: "text" },
          { name: "source", label: "المصدر", type: "select", options: [{ value: "call", label: "اتصال" }, { value: "website", label: "الموقع" }, { value: "referral", label: "إحالة" }, { value: "social", label: "وسائل التواصل" }, { value: "exhibition", label: "معرض" }, { value: "other", label: "أخرى" }] },
          { name: "interest", label: "اهتمامات العميل", type: "textarea" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "activities", label: "الأنشطة والمتابعات", icon: "checkmark-circle-outline", endpoint: "/api/crm/activities", detailRoute: "/crm/activity-detail", createRoute: "/crm/activity-new", titleFields: ["title", "subject", "activityType"], subtitleFields: ["relatedName", "assigneeName"], statusField: "status", dateFields: ["dueDate", "createdAt"],
        write: { moduleKey: "crm", createFields: [
          { name: "title", label: "عنوان النشاط", type: "text", required: true },
          { name: "activityType", label: "نوع النشاط", type: "select", required: true, options: [{ value: "call", label: "اتصال" }, { value: "meeting", label: "اجتماع" }, { value: "email", label: "بريد إلكتروني" }, { value: "visit", label: "زيارة" }, { value: "task", label: "مهمة" }] },
          { name: "relatedType", label: "متعلق بـ", type: "select", options: [{ value: "opportunity", label: "فرصة بيعية" }, { value: "client", label: "عميل" }, { value: "lead", label: "عميل محتمل" }] },
          { name: "relatedId", label: "معرف الكيان", type: "text" },
          { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      {
        key: "contracts", label: "العقود التجارية", icon: "document-text-outline", endpoint: "/api/crm/contracts",
        detailRoute: "/crm/contract-detail", createRoute: "/crm/contract-new", titleFields: ["title", "ref"], subtitleFields: ["clientName"], statusField: "status", amountFields: ["value"], dateFields: ["startDate"],
        write: {
          moduleKey: "crm",
          createFields: [
            { name: "title", label: "عنوان العقد", type: "text", required: true },
            {
              name: "clientId", label: "العميل", type: "reference", required: true,
              refEndpoint: "/api/clients", refLabelFields: ["name", "nameAr"], refValueField: "id",
            },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "value", label: "قيمة العقد", type: "currency" },
            {
              name: "type", label: "نوع العقد", type: "select",
              options: [
                { value: "service", label: "خدمات" },
                { value: "supply", label: "توريد" },
                { value: "maintenance", label: "صيانة" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
    ],
  },
  documents: {
    key: "documents",
    label: "المستندات",
    sections: [
      {
        key: "documents", label: "المستندات", icon: "document-text-outline", endpoint: "/api/documents",
        detailRoute: "/documents/document-detail", createRoute: "/documents/document-new",
        titleFields: ["name", "title"], subtitleFields: ["type", "category"], statusField: "status", dateFields: ["createdAt"],
        write: {
          moduleKey: "documents",
          createEndpoint: "/api/documents/upload",
          canDelete: true,
          createFields: [
            { name: "title", label: "عنوان المستند", type: "text", required: true },
            { name: "file", label: "الملف", type: "file", required: true },
            {
              name: "category", label: "التصنيف", type: "select",
              options: [
                { value: "hr", label: "الموارد البشرية" },
                { value: "finance", label: "المالية" },
                { value: "legal", label: "قانوني" },
                { value: "contracts", label: "العقود" },
                { value: "compliance", label: "الامتثال" },
                { value: "operations", label: "العمليات" },
                { value: "fleet", label: "الأسطول" },
                { value: "properties", label: "العقارات" },
                { value: "umrah", label: "العمرة" },
                { value: "marketing", label: "التسويق" },
                { value: "general", label: "عام" },
              ],
            },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان المستند", type: "text", required: true },
            {
              name: "category", label: "التصنيف", type: "select",
              options: [
                { value: "hr", label: "الموارد البشرية" },
                { value: "finance", label: "المالية" },
                { value: "legal", label: "قانوني" },
                { value: "contracts", label: "العقود" },
                { value: "compliance", label: "الامتثال" },
                { value: "operations", label: "العمليات" },
                { value: "fleet", label: "الأسطول" },
                { value: "properties", label: "العقارات" },
                { value: "umrah", label: "العمرة" },
                { value: "marketing", label: "التسويق" },
                { value: "general", label: "عام" },
              ],
            },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "folders", label: "المجلدات", icon: "folder-outline", endpoint: "/api/documents/folders",
        titleFields: ["name"], dateFields: ["createdAt"],
        write: {
          moduleKey: "documents",
          noDetail: true,
          createFields: [
            { name: "name", label: "اسم المجلد", type: "text", required: true },
            { name: "color", label: "اللون", type: "text", placeholder: "#3b82f6" },
          ],
        },
      },
      {
        key: "templates", label: "القوالب", icon: "copy-outline", endpoint: "/api/documents/templates",
        titleFields: ["title"], subtitleFields: ["category"], dateFields: ["createdAt"],
        detailRoute: "/documents/template-detail", createRoute: "/documents/template-new",
        write: {
          moduleKey: "documents",
          createFields: [
            { name: "title", label: "عنوان القالب", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
    ],
  },
  support: {
    key: "support",
    label: "الدعم",
    sections: [
      { key: "sla", label: "اتفاقيات مستوى الخدمة", icon: "speedometer-outline", endpoint: "/api/support/sla", titleFields: ["name", "title"], subtitleFields: ["category", "priority"], statusField: "status",
        write: { moduleKey: "support", createFields: [
          { name: "name", label: "اسم الاتفاقية", type: "text", required: true },
          { name: "category", label: "التصنيف", type: "text" },
          { name: "priority", label: "الأولوية", type: "select", options: [{ value: "low", label: "منخفضة" }, { value: "medium", label: "متوسطة" }, { value: "high", label: "عالية" }, { value: "critical", label: "حرجة" }] },
          { name: "responseTimeHours", label: "وقت الاستجابة (ساعات)", type: "number" },
          { name: "resolutionTimeHours", label: "وقت الحل (ساعات)", type: "number" },
          { name: "description", label: "الوصف", type: "textarea" },
        ] } },
      {
        key: "categories", label: "تصنيفات الدعم", icon: "list-outline", endpoint: "/api/support/categories",
        titleFields: ["name"], subtitleFields: ["parentName"],
        write: {
          moduleKey: "support",
          createFields: [
            { name: "name", label: "اسم التصنيف", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "tickets", label: "التذاكر", icon: "help-buoy-outline", endpoint: "/api/support/tickets",
        titleFields: ["subject", "title"], subtitleFields: ["ticketNumber", "clientName", "priority"], statusField: "status", dateFields: ["createdAt"],
        detailRoute: "/support/ticket-detail", createRoute: "/support/ticket-new",
        write: {
          moduleKey: "support",
          statuses: [
            { value: "open", label: "مفتوحة" },
            { value: "in_progress", label: "قيد المعالجة" },
            { value: "resolved", label: "تم الحل" },
            { value: "closed", label: "مغلقة" },
          ],
          createFields: [
            { name: "subject", label: "عنوان التذكرة", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            {
              name: "priority", label: "الأولوية", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "urgent", label: "عاجلة" },
              ],
            },
            {
              name: "clientId", label: "العميل", type: "reference",
              refEndpoint: "/api/clients", refLabelFields: ["name", "clientName"], refValueField: "id",
            },
          ],
          editFields: [
            { name: "subject", label: "عنوان التذكرة", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            {
              name: "priority", label: "الأولوية", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "urgent", label: "عاجلة" },
              ],
            },
          ],
        },
      },
    ],
  },
  marketing: {
    key: "marketing",
    label: "التسويق",
    sections: [
      {
        key: "campaigns", label: "الحملات", icon: "megaphone-outline", endpoint: "/api/marketing/campaigns",
        detailRoute: "/crm/campaign-detail", createRoute: "/crm/campaign-new",
        titleFields: ["name", "title"], statusField: "status", amountFields: ["budget"], dateFields: ["startDate"],
        write: {
          moduleKey: "marketing",
          createFields: [
            { name: "name", label: "اسم الحملة", type: "text", required: true },
            { name: "type", label: "النوع", type: "text" },
            { name: "channel", label: "القناة", type: "text" },
            { name: "startDate", label: "تاريخ البداية", type: "date" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "budget", label: "الميزانية", type: "currency" },
            { name: "targetAudience", label: "الجمهور المستهدف", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم الحملة", type: "text", required: true },
            { name: "budget", label: "الميزانية", type: "currency" },
            { name: "startDate", label: "تاريخ البداية", type: "date" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "leads", label: "قائمة الجمهور المستهدف", icon: "people-outline", endpoint: "/api/marketing/leads",
        detailRoute: "/crm/lead-detail", createRoute: "/crm/lead-new", titleFields: ["name", "email"], subtitleFields: ["source", "campaign"], statusField: "status", dateFields: ["createdAt"],
        write: {
          moduleKey: "marketing",
          createFields: [
            { name: "name", label: "الاسم", type: "text", required: true },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "phone", label: "رقم الهاتف", type: "text" },
            {
              name: "source", label: "المصدر", type: "select",
              options: [
                { value: "website", label: "الموقع الإلكتروني" },
                { value: "social", label: "التواصل الاجتماعي" },
                { value: "referral", label: "إحالة" },
                { value: "event", label: "فعالية" },
                { value: "other", label: "أخرى" },
              ],
            },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "email-campaigns", label: "حملات البريد", icon: "mail-outline", endpoint: "/api/marketing/email-campaigns",
        detailRoute: "/crm/email-campaign-detail", createRoute: "/crm/email-campaign-new", titleFields: ["name", "subject"], subtitleFields: ["listName"], statusField: "status", dateFields: ["scheduledAt"],
        write: {
          moduleKey: "marketing",
          createFields: [
            { name: "name", label: "اسم الحملة", type: "text", required: true },
            { name: "subject", label: "عنوان البريد", type: "text", required: true },
            { name: "scheduledAt", label: "موعد الإرسال", type: "date" },
            { name: "bodyHtml", label: "محتوى الرسالة", type: "textarea" },
          ],
          actions: [
            { key: "send", label: "إرسال الحملة", icon: "send-outline", method: "POST", path: (id) => `/api/marketing/email-campaigns/${id}/send`, confirm: "هل تريد إرسال الحملة الآن؟", successText: "تم إرسال الحملة", showWhenStatus: ["draft", "scheduled"] },
          ],
        },
      },
    ],
  },
  property: {
    key: "property",
    label: "العقارات",
    sections: [
      {
        key: "units", label: "الوحدات العقارية", icon: "home-outline", endpoint: "/api/properties/units",
        titleFields: ["unitNumber", "name"], subtitleFields: ["buildingName", "type"], statusField: "status", detailRoute: "/properties/unit-detail", createRoute: "/properties/unit-new",
        write: {
          moduleKey: "property",
          canDelete: true,
          createFields: [
            { name: "unitNumber", label: "رقم الوحدة", type: "text", required: true },
            {
              name: "buildingId", label: "المبنى", type: "reference",
              refEndpoint: "/api/properties/buildings", refLabelFields: ["name"], refValueField: "id",
            },
            { name: "type", label: "النوع", type: "text" },
            { name: "area", label: "المساحة (م²)", type: "number" },
            { name: "bedrooms", label: "عدد الغرف", type: "number" },
            { name: "bathrooms", label: "عدد دورات المياه", type: "number" },
            { name: "floor", label: "الدور", type: "number" },
            { name: "monthlyRent", label: "الإيجار الشهري", type: "currency" },
            { name: "usageType", label: "نوع الاستخدام", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
          editFields: [
            { name: "unitNumber", label: "رقم الوحدة", type: "text", required: true },
            { name: "type", label: "النوع", type: "text" },
            { name: "area", label: "المساحة (م²)", type: "number" },
            { name: "monthlyRent", label: "الإيجار الشهري", type: "currency" },
          ],
        },
      },
      {
        key: "contracts", label: "عقود الإيجار", icon: "document-text-outline", endpoint: "/api/properties/contracts",
        titleFields: ["contractNumber", "ref"], subtitleFields: ["tenantName", "clientName"], statusField: "status", amountFields: ["totalAmount", "total"], dateFields: ["startDate"],
        detailRoute: "/properties/contract-detail", createRoute: "/properties/contract-new",
        write: {
          moduleKey: "property",
          createFields: [
            {
              name: "unitId", label: "الوحدة", type: "reference", required: true,
              refEndpoint: "/api/properties/units", refLabelFields: ["unitNumber", "name"], refValueField: "id",
            },
            { name: "tenantName", label: "اسم المستأجر", type: "text", required: true },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date", required: true },
            { name: "tenantPhone", label: "جوال المستأجر", type: "text" },
            { name: "tenantEmail", label: "بريد المستأجر", type: "text" },
            { name: "tenantIdNumber", label: "هوية المستأجر", type: "text" },
            { name: "monthlyRent", label: "الإيجار الشهري", type: "currency" },
            { name: "depositAmount", label: "مبلغ التأمين", type: "currency" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "tenantName", label: "اسم المستأجر", type: "text", required: true },
            { name: "tenantPhone", label: "جوال المستأجر", type: "text" },
            { name: "monthlyRent", label: "الإيجار الشهري", type: "currency" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "renew", label: "تجديد العقد", icon: "refresh-outline", method: "POST", path: (id) => `/api/properties/contracts/${id}/renew`, confirm: "هل تريد تجديد العقد؟", successText: "تم تجديد العقد", showWhenStatus: ["active", "expired"] },
            { key: "terminate", label: "إنهاء العقد", icon: "close-circle-outline", method: "POST", path: (id) => `/api/properties/contracts/${id}/terminate`, body: { reason: "أُنهي من تطبيق الجوال" }, confirm: "هل تريد إنهاء العقد؟", successText: "تم إنهاء العقد", tone: "danger", showWhenStatus: ["active", "draft"] },
          ],
        },
      },
      {
        key: "buildings", label: "المباني", icon: "business-outline", endpoint: "/api/properties/buildings",
        titleFields: ["name"], subtitleFields: ["city", "type"], statusField: "status",
        detailRoute: "/properties/property-detail", createRoute: "/properties/property-new",
        write: {
          moduleKey: "property",
          canDelete: true,
          createFields: [
            { name: "name", label: "اسم المبنى", type: "text", required: true },
            { name: "city", label: "المدينة", type: "text" },
            { name: "type", label: "النوع", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
            { name: "deedNumber", label: "رقم الصك", type: "text" },
            { name: "totalUnits", label: "عدد الوحدات", type: "number" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "name", label: "اسم المبنى", type: "text", required: true },
            { name: "city", label: "المدينة", type: "text" },
            { name: "type", label: "النوع", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
        },
      },
      {
        key: "maintenance-requests", label: "طلبات الصيانة", icon: "build-outline", endpoint: "/api/properties/maintenance-requests",
        titleFields: ["category", "description"], subtitleFields: ["unitNumber", "tenantName"], statusField: "status", amountFields: ["estimatedCost"], dateFields: ["createdAt"], detailRoute: "/properties/maintenance-request-detail", createRoute: "/properties/maintenance-new",
        write: {
          moduleKey: "property",
          detailPath: (id) => `/api/properties/maintenance/${id}`,
          createFields: [
            {
              name: "unitId", label: "الوحدة", type: "reference", required: true,
              refEndpoint: "/api/properties/units", refLabelFields: ["unitNumber", "name"], refValueField: "id",
            },
            { name: "description", label: "وصف العطل", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            {
              name: "priority", label: "الأولوية", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "urgent", label: "عاجلة" },
              ],
            },
            { name: "tenantName", label: "اسم المستأجر", type: "text" },
            { name: "tenantPhone", label: "جوال المستأجر", type: "text" },
            { name: "estimatedCost", label: "التكلفة التقديرية", type: "currency" },
          ],
          actions: [
            { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline", method: "PATCH", path: (id) => `/api/properties/maintenance-requests/${id}/approve`, body: { approved: true }, confirm: "هل تريد اعتماد طلب الصيانة؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending", "open", "returned"] },
            { key: "complete", label: "إنهاء الطلب", icon: "construct-outline", method: "POST", path: (id) => `/api/properties/maintenance-requests/${id}/complete`, body: { zeroCostConfirmed: true }, confirm: "هل تريد إنهاء طلب الصيانة؟", successText: "تم إنهاء الطلب", showWhenStatus: ["approved", "assigned", "in_progress"] },
          ],
        },
      },
      { key: "tenants", label: "المستأجرون", icon: "person-outline", endpoint: "/api/properties/tenants", titleFields: ["name", "tenantName"], subtitleFields: ["phone", "email", "nationalId"], statusField: "status", detailRoute: "/properties/tenant-detail", createRoute: "/properties/tenant-new",
        write: { moduleKey: "property", createFields: [
          { name: "name", label: "اسم المستأجر", type: "text", required: true },
          { name: "nationalId", label: "رقم الهوية", type: "text", required: true },
          { name: "phone", label: "الجوال", type: "text", required: true },
          { name: "email", label: "البريد الإلكتروني", type: "text" },
          { name: "nationality", label: "الجنسية", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "payments", label: "دفعات الإيجار", icon: "cash-outline", endpoint: "/api/properties/payments", detailRoute: "/properties/payment-detail", createRoute: "/properties/payment-new", titleFields: ["ref", "reference"], subtitleFields: ["tenantName", "unitName"], statusField: "status", amountFields: ["amount"], dateFields: ["dueDate", "paidDate"],
        write: { moduleKey: "property", createFields: [
          { name: "contractId", label: "رقم العقد", type: "text", required: true },
          { name: "amount", label: "المبلغ", type: "currency", required: true },
          { name: "dueDate", label: "تاريخ الاستحقاق", type: "date", required: true },
          { name: "paidDate", label: "تاريخ السداد", type: "date" },
          { name: "paymentMethod", label: "طريقة الدفع", type: "select", options: [{ value: "bank_transfer", label: "تحويل بنكي" }, { value: "cash", label: "نقدي" }, { value: "check", label: "شيك" }, { value: "card", label: "بطاقة" }] },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "owners", label: "الملاك", icon: "people-circle-outline", endpoint: "/api/properties/owners", detailRoute: "/properties/owner-detail", createRoute: "/properties/owner-new", titleFields: ["name", "ownerName"], subtitleFields: ["phone", "email"], statusField: "status",
        write: { moduleKey: "property", createFields: [
          { name: "name", label: "اسم المالك", type: "text", required: true },
          { name: "nationalId", label: "رقم الهوية", type: "text" },
          { name: "phone", label: "الجوال", type: "text", required: true },
          { name: "email", label: "البريد الإلكتروني", type: "text" },
          { name: "bankAccount", label: "رقم الحساب البنكي", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "inspections", label: "عمليات الفحص", icon: "eye-outline", endpoint: "/api/properties/inspections", detailRoute: "/properties/inspection-detail", createRoute: "/properties/inspection-new", titleFields: ["ref", "type"], subtitleFields: ["unitName", "inspectorName"], statusField: "status", dateFields: ["inspectionDate"],
        write: { moduleKey: "property", createFields: [
          { name: "unitId", label: "الوحدة", type: "text", required: true },
          { name: "inspectionDate", label: "تاريخ الفحص", type: "date", required: true },
          { name: "type", label: "نوع الفحص", type: "select", options: [{ value: "move_in", label: "دخول" }, { value: "move_out", label: "خروج" }, { value: "routine", label: "دوري" }, { value: "maintenance", label: "صيانة" }] },
          { name: "inspectorName", label: "اسم المفتش", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
    ],
  },
  legal: {
    key: "legal",
    label: "الشؤون القانونية",
    sections: [
      {
        key: "cases", label: "القضايا", icon: "hammer-outline", endpoint: "/api/legal/cases",
        titleFields: ["title", "caseNumber"], subtitleFields: ["court", "caseNumber"], statusField: "status", dateFields: ["filingDate"],
        detailRoute: "/legal/case-detail", createRoute: "/legal/case-new",
        write: {
          moduleKey: "legal",
          createFields: [
            { name: "title", label: "عنوان القضية", type: "text", required: true },
            { name: "caseType", label: "نوع القضية", type: "text" },
            { name: "caseNumber", label: "رقم القضية", type: "text" },
            { name: "court", label: "المحكمة", type: "text" },
            { name: "filingDate", label: "تاريخ القيد", type: "date" },
            { name: "opposingParty", label: "الطرف الخصم", type: "text" },
            { name: "lawyerName", label: "المحامي", type: "text" },
            {
              name: "priority", label: "الأولوية", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
              ],
            },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان القضية", type: "text", required: true },
            { name: "court", label: "المحكمة", type: "text" },
            { name: "lawyerName", label: "المحامي", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          actions: [
            { key: "close", label: "إغلاق القضية", icon: "lock-closed-outline", method: "POST", path: (id) => `/api/legal/cases/${id}/close`, body: { closureReason: "أُغلقت من تطبيق الجوال" }, confirm: "هل تريد إغلاق القضية؟", successText: "تم إغلاق القضية", tone: "danger", showWhenStatus: ["open", "in_progress", "judgment", "execution"] },
          ],
        },
      },
      {
        key: "contracts", label: "العقود القانونية", icon: "document-text-outline", endpoint: "/api/legal/contracts",
        titleFields: ["title", "contractNumber"], subtitleFields: ["contractNumber"], statusField: "status", dateFields: ["expiryDate"], detailRoute: "/legal/contract-detail", createRoute: "/legal/contract-new",
        write: {
          moduleKey: "legal",
          createFields: [
            { name: "title", label: "عنوان العقد", type: "text", required: true },
            { name: "partyName", label: "اسم الطرف الآخر", type: "text", required: true },
            { name: "startDate", label: "تاريخ البداية", type: "date", required: true },
            { name: "endDate", label: "تاريخ النهاية", type: "date", required: true },
            { name: "value", label: "قيمة العقد", type: "currency" },
            { name: "ref", label: "المرجع", type: "text" },
            { name: "contractType", label: "نوع العقد", type: "text" },
            { name: "partyContact", label: "بيانات التواصل", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان العقد", type: "text", required: true },
            { name: "partyName", label: "اسم الطرف الآخر", type: "text" },
            { name: "value", label: "قيمة العقد", type: "currency" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          actions: [
            { key: "terminate", label: "إنهاء العقد", icon: "close-circle-outline", method: "POST", path: (id) => `/api/legal/contracts/${id}/terminate`, body: { reason: "أُنهي من تطبيق الجوال" }, confirm: "هل تريد إنهاء العقد؟", successText: "تم إنهاء العقد", tone: "danger", showWhenStatus: ["active", "draft"] },
          ],
        },
      },
      { key: "sessions", label: "جلسات التقاضي", icon: "calendar-outline", endpoint: "/api/legal/sessions/upcoming", detailRoute: "/legal/session-detail", createRoute: "/legal/session-new", titleFields: ["caseTitle", "caseNumber"], subtitleFields: ["location", "court"], statusField: "status", dateFields: ["sessionDate"],
        write: { moduleKey: "legal", createFields: [
          { name: "caseId", label: "القضية", type: "text", required: true },
          { name: "sessionDate", label: "تاريخ الجلسة", type: "date", required: true },
          { name: "location", label: "مكان الجلسة", type: "text" },
          { name: "court", label: "المحكمة", type: "text" },
          { name: "notes", label: "ملاحظات", type: "textarea" },
        ] } },
      { key: "judgments", label: "الأحكام", icon: "ribbon-outline", endpoint: "/api/legal/judgments", titleFields: ["caseTitle", "ref"], subtitleFields: ["court", "judgmentType"], statusField: "status", dateFields: ["judgmentDate"], detailRoute: "/legal/judgment-detail", createRoute: "/legal/judgment-new",
        write: { moduleKey: "legal", createFields: [
          { name: "caseId", label: "القضية", type: "text", required: true },
          { name: "judgmentDate", label: "تاريخ الحكم", type: "date", required: true },
          { name: "judgmentType", label: "نوع الحكم", type: "select", options: [{ value: "in_favor", label: "لصالحنا" }, { value: "against", label: "ضدنا" }, { value: "partial", label: "جزئي" }, { value: "dismissed", label: "مرفوض" }] },
          { name: "court", label: "المحكمة", type: "text" },
          { name: "summary", label: "ملخص الحكم", type: "textarea" },
          { name: "appealDeadline", label: "آخر موعد للاستئناف", type: "date" },
        ] } },
    ],
  },
  requests: {
    key: "requests",
    label: "الطلبات",
    sections: [
      {
        key: "requests", label: "الطلبات", icon: "file-tray-full-outline", endpoint: "/api/requests",
        detailRoute: "/requests/request-detail", createRoute: "/requests/request-new",
        titleFields: ["ref", "type", "title"], subtitleFields: ["requesterName", "type"], statusField: "status", dateFields: ["createdAt"],
        write: {
          moduleKey: "requests",
          createFields: [
            { name: "title", label: "عنوان الطلب", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea", required: true },
            {
              name: "priority", label: "الأولوية", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "critical", label: "حرجة" },
              ],
            },
          ],
          actions: [
            { key: "approve", label: "اعتماد الطلب", icon: "checkmark-circle-outline", method: "POST", path: (id) => `/api/requests/${id}/approve`, confirm: "هل تريد اعتماد الطلب؟", successText: "تم اعتماد الطلب", showWhenStatus: ["pending", "submitted", "in_review", "open"] },
            { key: "reject", label: "رفض الطلب", icon: "close-circle-outline", method: "POST", path: (id) => `/api/requests/${id}/reject`, body: { notes: "رُفض من تطبيق الجوال" }, confirm: "هل تريد رفض الطلب؟", successText: "تم رفض الطلب", tone: "danger", showWhenStatus: ["pending", "submitted", "in_review", "open"] },
            { key: "return", label: "إرجاع الطلب", icon: "arrow-undo-outline", method: "POST", path: (id) => `/api/requests/${id}/return`, body: { notes: "أُرجع من تطبيق الجوال" }, confirm: "هل تريد إرجاع الطلب لصاحبه؟", successText: "تم إرجاع الطلب", showWhenStatus: ["pending", "submitted", "in_review", "open"] },
          ],
        },
      },
      {
        key: "catalog", label: "كتالوج الخدمات", icon: "list-outline", endpoint: "/api/requests/catalog",
        titleFields: ["title"], subtitleFields: ["category", "type"],
        write: {
          moduleKey: "requests",
          createFields: [
            { name: "title", label: "اسم الخدمة", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea" },
            {
              name: "type", label: "النوع", type: "select",
              options: [
                { value: "it", label: "تقنية المعلومات" },
                { value: "hr", label: "الموارد البشرية" },
                { value: "facility", label: "خدمات المنشأة" },
                { value: "finance", label: "المالية" },
                { value: "other", label: "أخرى" },
              ],
            },
          ],
        },
      },
    ],
  },
  governance: {
    key: "governance",
    label: "الحوكمة",
    sections: [
      {
        key: "policies", label: "السياسات", icon: "ribbon-outline", endpoint: "/api/governance/policies",
        titleFields: ["title", "name"], subtitleFields: ["version"], statusField: "status", dateFields: ["effectiveDate"], detailRoute: "/governance/policy-detail", createRoute: "/governance/policy-new",
        write: {
          moduleKey: "governance",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "active", label: "نشطة" },
            { value: "archived", label: "مؤرشفة" },
          ],
          createFields: [
            { name: "title", label: "عنوان السياسة", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
            { name: "effectiveDate", label: "تاريخ السريان", type: "date" },
            { name: "expiryDate", label: "تاريخ الانتهاء", type: "date" },
          ],
          editFields: [
            { name: "title", label: "عنوان السياسة", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          actions: [
            { key: "new-version", label: "إصدار نسخة جديدة", icon: "duplicate-outline", method: "POST", path: (id) => `/api/governance/policies/${id}/new-version`, confirm: "هل تريد إنشاء نسخة جديدة من السياسة؟", successText: "تم إنشاء نسخة جديدة" },
          ],
        },
      },
      {
        key: "risks", label: "المخاطر", icon: "alert-circle-outline", endpoint: "/api/governance/risks",
        titleFields: ["title"], subtitleFields: ["category", "severity"], statusField: "status", detailRoute: "/governance/risk-detail", createRoute: "/governance/risk-new",
        write: {
          moduleKey: "governance",
          createFields: [
            { name: "title", label: "عنوان المخاطرة", type: "text", required: true },
            {
              name: "severity", label: "الخطورة", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "critical", label: "حرجة" },
              ],
            },
            { name: "likelihood", label: "الاحتمالية", type: "text" },
            { name: "impact", label: "الأثر", type: "text" },
            { name: "mitigationPlan", label: "خطة المعالجة", type: "textarea" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان المخاطرة", type: "text", required: true },
            {
              name: "severity", label: "الخطورة", type: "select",
              options: [
                { value: "low", label: "منخفضة" },
                { value: "medium", label: "متوسطة" },
                { value: "high", label: "عالية" },
                { value: "critical", label: "حرجة" },
              ],
            },
            { name: "mitigationPlan", label: "خطة المعالجة", type: "textarea" },
          ],
        },
      },
      {
        key: "audits", label: "عمليات التدقيق", icon: "search-outline", endpoint: "/api/governance/audits",
        titleFields: ["title"], subtitleFields: ["type"], statusField: "status", dateFields: ["startDate"], detailRoute: "/governance/audit-detail", createRoute: "/governance/audit-new",
        write: {
          moduleKey: "governance",
          createFields: [
            { name: "title", label: "عنوان التدقيق", type: "text", required: true },
            { name: "scope", label: "النطاق", type: "textarea" },
            { name: "auditorName", label: "اسم المدقق", type: "text" },
            { name: "startDate", label: "تاريخ البداية", type: "date" },
            { name: "endDate", label: "تاريخ النهاية", type: "date" },
            { name: "findings", label: "النتائج", type: "textarea" },
          ],
          editFields: [
            { name: "title", label: "عنوان التدقيق", type: "text", required: true },
            { name: "findings", label: "النتائج", type: "textarea" },
          ],
        },
      },
      {
        key: "compliance", label: "الامتثال", icon: "shield-checkmark-outline", endpoint: "/api/governance/compliance",
        detailRoute: "/governance/compliance-detail", createRoute: "/governance/compliance-new",
        titleFields: ["title"], subtitleFields: ["framework", "category"], statusField: "status", dateFields: ["nextReviewDate"],
        write: {
          moduleKey: "governance",
          createFields: [
            { name: "regulation", label: "اللائحة / النظام", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea" },
            { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
            { name: "responsiblePerson", label: "المسؤول", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
          editFields: [
            { name: "regulation", label: "اللائحة / النظام", type: "text", required: true },
            { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
            { name: "responsiblePerson", label: "المسؤول", type: "text" },
            { name: "notes", label: "ملاحظات", type: "textarea" },
          ],
        },
      },
      {
        key: "capa", label: "الإجراءات التصحيحية", icon: "construct-outline", endpoint: "/api/governance/capa",
        titleFields: ["title"], subtitleFields: ["source", "priority"], statusField: "status", dateFields: ["targetDate"], detailRoute: "/governance/capa-detail", createRoute: "/governance/capa-new",
        write: {
          moduleKey: "governance",
          noDetail: true,
          createFields: [
            { name: "finding", label: "الملاحظة / المخالفة", type: "text", required: true },
            { name: "rootCause", label: "السبب الجذري", type: "textarea" },
            { name: "correctiveAction", label: "الإجراء التصحيحي", type: "textarea" },
            { name: "preventiveAction", label: "الإجراء الوقائي", type: "textarea" },
            { name: "responsiblePerson", label: "المسؤول", type: "text" },
            { name: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
            {
              name: "auditId", label: "التدقيق المرتبط", type: "reference",
              refEndpoint: "/api/governance/audits", refLabelFields: ["title"], refValueField: "id",
            },
          ],
        },
      },
      {
        key: "kpis", label: "مؤشرات الأداء", icon: "speedometer-outline", endpoint: "/api/governance/kpis",
        titleFields: ["title", "name"], subtitleFields: ["category", "unit"], statusField: "status", amountFields: ["current", "target"],
        write: {
          moduleKey: "governance",
          createFields: [
            { name: "title", label: "اسم المؤشر", type: "text", required: true },
            { name: "category", label: "التصنيف", type: "text", required: true },
            { name: "unit", label: "وحدة القياس", type: "text" },
            { name: "target", label: "القيمة المستهدفة", type: "number", required: true },
            {
              name: "frequency", label: "دورية القياس", type: "select",
              options: [
                { value: "daily", label: "يومي" },
                { value: "weekly", label: "أسبوعي" },
                { value: "monthly", label: "شهري" },
                { value: "quarterly", label: "ربع سنوي" },
                { value: "annually", label: "سنوي" },
              ],
            },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
    ],
  },
  bi: {
    key: "bi",
    label: "تحليلات الأعمال",
    sections: [
      {
        key: "reports", label: "التقارير التحليلية", icon: "analytics-outline", endpoint: "/api/bi/reports",
        titleFields: ["name", "title"], subtitleFields: ["category"], dateFields: ["lastRun"],
        write: {
          moduleKey: "bi",
          noDetail: true,
          createFields: [
            { name: "title", label: "عنوان التقرير", type: "text", required: true },
            { name: "type", label: "النوع", type: "text", required: true },
            { name: "query", label: "الاستعلام", type: "textarea", required: true },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "dashboards", label: "اللوحات", icon: "grid-outline", endpoint: "/api/bi/dashboards",
        titleFields: ["title", "name"], subtitleFields: ["category"],
        write: {
          moduleKey: "bi",
          noDetail: true,
          createFields: [
            { name: "title", label: "عنوان اللوحة", type: "text", required: true },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      {
        key: "kpis", label: "مؤشرات الأداء", icon: "speedometer-outline", endpoint: "/api/bi/kpis",
        titleFields: ["title", "name"], subtitleFields: ["metricCode"], statusField: "status", amountFields: ["currentValue"],
        write: {
          moduleKey: "bi",
          noDetail: true,
          createFields: [
            { name: "name", label: "اسم المؤشر", type: "text", required: true },
            { name: "module", label: "الوحدة", type: "text", required: true },
            { name: "formula", label: "المعادلة", type: "textarea", required: true },
            { name: "target", label: "القيمة المستهدفة", type: "number" },
            { name: "unit", label: "الوحدة القياسية", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
    ],
  },
  reports: {
    key: "reports",
    label: "التقارير",
    sections: [
      { key: "reports", label: "التقارير", icon: "bar-chart-outline", endpoint: "/api/bi/reports", titleFields: ["name", "title"], subtitleFields: ["category"], dateFields: ["lastRun"] },
    ],
  },
  admin: {
    key: "admin",
    label: "إدارة النظام",
    sections: [
      {
        key: "users", label: "المستخدمون", icon: "person-circle-outline", endpoint: "/api/admin/users",
        detailRoute: "/admin/user-detail", createRoute: "/admin/user-new",
        titleFields: ["name", "fullName", "email"], subtitleFields: ["email", "role"], statusField: "status",
        write: {
          moduleKey: "admin",
          noDetail: true,
          createFields: [
            { name: "email", label: "البريد الإلكتروني", type: "text", required: true },
            { name: "role", label: "الدور", type: "text", placeholder: "employee" },
            { name: "password", label: "كلمة المرور", type: "text", placeholder: "8 أحرف على الأقل (تُولّد تلقائيًا إن تُركت فارغة)" },
            {
              name: "employeeId", label: "الموظف المرتبط", type: "reference",
              refEndpoint: "/api/employees", refLabelFields: ["name", "fullName"], refValueField: "id",
            },
          ],
        },
      },
      { key: "roles", label: "الأدوار والصلاحيات", icon: "key-outline", endpoint: "/api/admin/roles", titleFields: ["name"], subtitleFields: ["slug", "level"] },
      { key: "audit-logs", label: "سجلات التدقيق", icon: "eye-outline", endpoint: "/api/audit-logs", titleFields: ["action", "event"], subtitleFields: ["userName", "entityType"], dateFields: ["createdAt"] },
      { key: "activity-log", label: "سجل الأنشطة", icon: "list-outline", endpoint: "/api/activity-log", titleFields: ["event", "description"], subtitleFields: ["userName", "module"], dateFields: ["createdAt"] },
      {
        key: "job-titles", label: "المسميات الوظيفية", icon: "id-card-outline", endpoint: "/api/admin/job-titles",
        titleFields: ["title", "name"], subtitleFields: ["level", "department"],
        write: {
          moduleKey: "admin",
          createFields: [
            { name: "title", label: "المسمى الوظيفي", type: "text", required: true },
            { name: "level", label: "المستوى الوظيفي", type: "text" },
            { name: "department", label: "القسم", type: "text" },
            { name: "description", label: "الوصف", type: "textarea" },
          ],
        },
      },
      { key: "integrations", label: "التكاملات", icon: "git-merge-outline", endpoint: "/api/admin/integrations", titleFields: ["name", "provider"], subtitleFields: ["type", "status"], statusField: "status" },
      { key: "companies", label: "الشركات", icon: "business-outline", endpoint: "/api/settings/companies", titleFields: ["name"], subtitleFields: ["taxNumber", "crNumber"], statusField: "status" },
      { key: "event-monitor", label: "مراقب الأحداث", icon: "pulse-outline", endpoint: "/api/admin/event-outbox", titleFields: ["eventType", "event"], subtitleFields: ["entityType", "status"], statusField: "status", dateFields: ["createdAt"] },
      { key: "posting-failures", label: "أخطاء الترحيل", icon: "warning-outline", endpoint: "/api/admin/posting-failures", titleFields: ["error", "message"], subtitleFields: ["source", "entityType"], statusField: "status", dateFields: ["failedAt"] },
    ],
  },
  settings: {
    key: "settings",
    label: "الإعدادات",
    sections: [
      {
        key: "branches", label: "الفروع", icon: "git-network-outline", endpoint: "/api/settings/branches",
        titleFields: ["name", "branchName"], subtitleFields: ["code"], statusField: "status",
        write: {
          moduleKey: "settings",
          updateMethod: "PUT",
          createFields: [
            { name: "name", label: "اسم الفرع", type: "text", required: true },
            { name: "nameEn", label: "الاسم بالإنجليزية", type: "text" },
            { name: "city", label: "المدينة", type: "text" },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
            { name: "taxNumber", label: "الرقم الضريبي", type: "text" },
            { name: "crNumber", label: "رقم السجل التجاري", type: "text" },
          ],
          editFields: [
            { name: "name", label: "اسم الفرع", type: "text", required: true },
            { name: "nameEn", label: "الاسم بالإنجليزية", type: "text" },
            { name: "city", label: "المدينة", type: "text" },
            { name: "phone", label: "الهاتف", type: "text" },
            { name: "email", label: "البريد الإلكتروني", type: "text" },
            { name: "address", label: "العنوان", type: "textarea" },
          ],
        },
      },
      { key: "companies", label: "الشركات", icon: "business-outline", endpoint: "/api/settings/companies", titleFields: ["name"], subtitleFields: ["taxNumber", "registrationNumber"], statusField: "status" },
      {
        key: "departments", label: "الإدارات", icon: "git-network-outline", endpoint: "/api/settings/departments",
        titleFields: ["name"], subtitleFields: ["code", "branchName"],
        write: {
          moduleKey: "settings",
          noDetail: true,
          createFields: [
            { name: "name", label: "اسم الإدارة", type: "text", required: true },
            { name: "nameEn", label: "الاسم بالإنجليزية", type: "text" },
            {
              name: "manager", label: "المدير", type: "reference",
              refEndpoint: "/api/employees", refLabelFields: ["name", "fullName"], refValueField: "id",
              refValueIsString: true,
            },
          ],
        },
      },
      { key: "numbering", label: "تسلسل الترقيم", icon: "code-slash-outline", endpoint: "/api/numbering", titleFields: ["label", "prefix"], subtitleFields: ["module", "lastNumber"] },
      { key: "custom-fields", label: "الحقول المخصصة", icon: "code-outline", endpoint: "/api/custom-fields", titleFields: ["label", "name"], subtitleFields: ["entityType", "type"], statusField: "status" },
    ],
  },
  comms: {
    key: "comms",
    label: "التواصل والمراسلات",
    sections: [
      {
        key: "correspondence", label: "المراسلات الرسمية", icon: "mail-outline", endpoint: "/api/correspondence",
        titleFields: ["subject", "ref"], subtitleFields: ["direction", "recipientName"], statusField: "status", dateFields: ["createdAt"],
        write: {
          moduleKey: "comms",
          createFields: [
            { name: "subject", label: "الموضوع", type: "text", required: true },
            {
              name: "direction", label: "الاتجاه", type: "select", required: true,
              options: [
                { value: "outgoing", label: "صادر" },
                { value: "incoming", label: "وارد" },
              ],
            },
            { name: "recipientName", label: "المرسَل إليه", type: "text" },
            { name: "content", label: "المحتوى", type: "textarea" },
          ],
          actions: [
            { key: "send", label: "إرسال", icon: "send-outline", method: "POST", path: (id) => `/api/correspondence/${id}/send`, confirm: "هل تريد إرسال المراسلة؟", successText: "تم الإرسال", showWhenStatus: ["draft"] },
          ],
        },
      },
      { key: "inbox", label: "صندوق الوارد", icon: "mail-unread-outline", endpoint: "/api/inbox", titleFields: ["subject", "from"], subtitleFields: ["mailboxName", "from"], statusField: "status", dateFields: ["receivedAt", "createdAt"] },
      { key: "conversations", label: "المحادثات", icon: "chatbubbles-outline", endpoint: "/api/inbox/conversations", titleFields: ["subject", "clientName"], subtitleFields: ["channel", "status"], statusField: "status", dateFields: ["lastMessageAt", "updatedAt"], detailRoute: "/comms/conversation",
        write: { moduleKey: "comms", createFields: [
          { name: "clientId", label: "العميل", type: "reference", refEndpoint: "/api/clients", refLabelFields: ["name"], refValueField: "id" },
          { name: "subject", label: "الموضوع", type: "text", required: true },
          { name: "channel", label: "القناة", type: "select", required: true, options: [{ value: "email", label: "بريد إلكتروني" }, { value: "whatsapp", label: "واتساب" }, { value: "sms", label: "رسالة نصية" }, { value: "phone", label: "مكالمة هاتفية" }] },
          { name: "body", label: "نص الرسالة", type: "textarea", required: true },
        ] } },
      { key: "mailboxes", label: "صناديق البريد", icon: "server-outline", endpoint: "/api/mailboxes", titleFields: ["name", "email"], subtitleFields: ["type", "email"], statusField: "status",
        write: { moduleKey: "comms", createFields: [
          { name: "name", label: "اسم الصندوق", type: "text", required: true },
          { name: "email", label: "عنوان البريد", type: "text", required: true },
          { name: "type", label: "النوع", type: "select", required: true, options: [{ value: "imap", label: "IMAP" }, { value: "smtp", label: "SMTP" }, { value: "exchange", label: "Exchange" }] },
        ] } },
    ],
  },
};

export function getModuleDef(key: string | undefined | null): ModuleDef | undefined {
  if (!key) return undefined;
  return MODULE_SECTIONS[key];
}

export function getSection(moduleKey: string, sectionKey: string): ModuleSection | undefined {
  return MODULE_SECTIONS[moduleKey]?.sections.find((s) => s.key === sectionKey);
}

/** Module keys that now have native screens (drives `built` flags in modules.ts). */
export const NATIVE_MODULE_KEYS = Object.keys(MODULE_SECTIONS);

// ─── Field extraction ───────────────────────────────────────────────────────

export function pickField(row: Record<string, unknown>, fields?: string[]): string | null {
  if (!fields) return null;
  for (const f of fields) {
    const v = row[f];
    if (v !== null && v !== undefined && v !== "") return String(v);
  }
  return null;
}

// ─── Status → Arabic label + tone ────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  active: { label: "نشط", tone: "success" },
  inactive: { label: "غير نشط", tone: "default" },
  suspended: { label: "موقوف", tone: "danger" },
  pending: { label: "معلّق", tone: "warning" },
  pending_approval: { label: "قيد الاعتماد", tone: "warning" },
  approved: { label: "معتمد", tone: "success" },
  rejected: { label: "مرفوض", tone: "danger" },
  cancelled: { label: "ملغي", tone: "default" },
  canceled: { label: "ملغي", tone: "default" },
  draft: { label: "مسودة", tone: "default" },
  posted: { label: "مرحّل", tone: "success" },
  reversed: { label: "معكوس", tone: "danger" },
  paid: { label: "مدفوع", tone: "success" },
  unpaid: { label: "غير مدفوع", tone: "warning" },
  partial: { label: "مدفوع جزئيًا", tone: "warning" },
  overdue: { label: "متأخر السداد", tone: "danger" },
  open: { label: "مفتوح", tone: "info" },
  closed: { label: "مغلق", tone: "default" },
  in_progress: { label: "قيد التنفيذ", tone: "info" },
  inprogress: { label: "قيد التنفيذ", tone: "info" },
  resolved: { label: "تم الحل", tone: "success" },
  completed: { label: "مكتمل", tone: "success" },
  new: { label: "جديد", tone: "info" },
  won: { label: "ناجحة", tone: "success" },
  lost: { label: "خاسرة", tone: "danger" },
  expired: { label: "منتهٍ", tone: "danger" },
  available: { label: "متاح", tone: "success" },
  occupied: { label: "مشغول", tone: "warning" },
  maintenance: { label: "صيانة", tone: "warning" },
  scheduled: { label: "مجدول", tone: "info" },
  // حالات الحضور
  present: { label: "حاضر", tone: "success" },
  absent: { label: "غائب", tone: "danger" },
  late: { label: "متأخر", tone: "warning" },
  on_leave: { label: "إجازة", tone: "info" },
  excused: { label: "مستأذن", tone: "info" },
  holiday: { label: "إجازة رسمية", tone: "default" },
  // حالات إضافية
  submitted: { label: "مُرسَل", tone: "warning" },
  under_review: { label: "قيد المراجعة", tone: "warning" },
  on_trip: { label: "في رحلة", tone: "info" },
  off_duty: { label: "خارج الدوام", tone: "default" },
  in_use: { label: "قيد الاستخدام", tone: "info" },
  out_of_service: { label: "خارج الخدمة", tone: "danger" },
};

export function statusBadge(raw: string | null): { label: string; tone: Tone } | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return STATUS_MAP[key] ?? { label: raw, tone: "info" };
}

// ─── Write-capability resolvers ──────────────────────────────────────────────

/** A section is write-enabled if it carries a `write` config. */
export function getSectionWrite(section: ModuleSection): SectionWriteConfig | null {
  return section.write ?? null;
}

/** GET-by-id detail endpoint for a section (default `${endpoint}/${id}`). */
export function detailEndpointFor(section: ModuleSection, id: string | number): string {
  return section.write?.detailPath?.(id) ?? `${section.endpoint}/${id}`;
}

/** POST create endpoint (default = list endpoint). */
export function createEndpointFor(section: ModuleSection): string {
  return section.write?.createEndpoint ?? section.endpoint;
}

/** PATCH update endpoint for a record (default `${endpoint}/${id}`). */
export function updateEndpointFor(section: ModuleSection, id: string | number): string {
  return section.write?.updatePath?.(id) ?? `${section.endpoint}/${id}`;
}

/** DELETE endpoint for a record (default `${endpoint}/${id}`). */
export function deleteEndpointFor(section: ModuleSection, id: string | number): string {
  return section.write?.deletePath?.(id) ?? `${section.endpoint}/${id}`;
}

/** Row field carrying the record id (default `id`). */
export function idFieldFor(section: ModuleSection): string {
  return section.write?.idField ?? "id";
}

/** Pull the record id out of a list/detail row. */
export function recordId(section: ModuleSection, row: Record<string, unknown>): string | null {
  const v = row[idFieldFor(section)];
  if (v === null || v === undefined) return null;
  return String(v);
}
