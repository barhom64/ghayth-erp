// ============================================================================
// hrEnums.ts
// مصدر واحد لقوائم الحالات والأنواع في وحدة الموارد البشرية (الباك إند).
// يقابل ملف src/lib/hr-type-maps.ts في الفرونت إند للحفاظ على التطابق التام.
// أي تغيير في القيم أو التسميات يجب أن يحدث هنا فقط.
// ============================================================================

// ── حالات السلف ─────────────────────────────────────────────────────
export const LOAN_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  ACTIVE: "active",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

// ── أنواع السلف (يقابل LOAN_TYPES في الفرونت) ─────────────────────
export const LOAN_TYPES = {
  SALARY_ADVANCE: "salary_advance",
  PERSONAL: "personal",
  EMERGENCY: "emergency",
  HOUSING: "housing",
  VEHICLE: "vehicle",
  EDUCATION: "education",
} as const;

// ── حالات نهاية الخدمة ─────────────────────────────────────────────
export const EXIT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

// ── أنواع نهاية الخدمة (يقابل EXIT_TYPES في الفرونت) ──────────────
export const EXIT_TYPES = {
  RESIGNATION: "resignation",
  TERMINATION: "termination",
  END_OF_SERVICE: "end_of_service",
  CONTRACT_END: "contract_end",
  RETIREMENT: "retirement",
  MUTUAL: "mutual",
} as const;

// ── حالات طلبات الوقت الإضافي ──────────────────────────────────────
export const OVERTIME_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  PAID: "paid",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

// ── حالات محاضر التحقيق ─────────────────────────────────────────────
export const DISCIPLINE_STATUS = {
  DRAFT: "draft",
  PENDING_EMPLOYEE: "pending_employee",
  PENDING_MANAGER: "pending_manager",
  PENDING_HR_DECISION: "pending_hr_decision",
  PENDING_GM: "pending_gm",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPEALED: "appealed",
  CANCELLED: "cancelled",
} as const;

// ── أنواع الوقائع (يقابل INCIDENT_LABELS في الفرونت) ──────────────
export const INCIDENT_TYPES = {
  LATE: "late",
  EARLY_LEAVE: "early_leave",
  ABSENCE: "absence",
  BEHAVIOR: "behavior",
  ORGANIZATION: "organization",
  GPS_OUT_OF_RANGE: "gps_out_of_range",
  CUSTOM: "custom",
} as const;

// ── حالات طلبات الإجازة ────────────────────────────────────────────
export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "returned",
  CANCELLED: "cancelled",
} as const;

// ── أنواع الإجازات (يقابل LEAVE_TYPES في الفرونت) ─────────────────
export const LEAVE_TYPES = {
  ANNUAL: "annual",
  SICK: "sick",
  PERSONAL: "personal",
  UNPAID: "unpaid",
  MATERNITY: "maternity",
  PATERNITY: "paternity",
  EMERGENCY: "emergency",
} as const;

// ── حالات الحضور ────────────────────────────────────────────────────
export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LATE: "late",
  LEAVE: "leave",
  HOLIDAY: "holiday",
} as const;

// ── مستويات العقوبات (يقابل PENALTY_LEVELS في الفرونت) ────────────
export const PENALTY_LEVELS = {
  VERBAL_WARNING: 1,
  WRITTEN_WARNING_1: 2,
  WRITTEN_WARNING_2: 3,
  SALARY_DEDUCTION: 4,
  TEMPORARY_SUSPENSION: 5,
} as const;

// ── بادئات أرقام السجلات (تطابق بيانات الإنتاج الحالية) ──────────
export const NUMBER_PREFIXES = {
  LOAN: "LOAN",
  OVERTIME: "OT",
  EXIT: "EXIT",
  MEMO: "MEMO",
  LETTER: "LTR",
} as const;

// ── جداول HR (لاستخدام موحد في rawQuery) ──────────────────────────
export const HR_TABLES = {
  LOANS: "hr_employee_loans",
  LOAN_INSTALLMENTS: "hr_loan_installments",
  OVERTIME: "hr_overtime_requests",
  EXIT: "hr_exit_requests",
  EXIT_CLEARANCE: "hr_exit_clearance",
  DISCIPLINE_MEMOS: "hr_inquiry_memos",
  DISCIPLINE_REGULATION: "hr_discipline_regulation",
  ATTENDANCE: "hr_attendance",
  LEAVE_REQUESTS: "hr_leave_requests",
  LEAVE_TYPES: "hr_leave_types",
} as const;
