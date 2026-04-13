/**
 * Typed errors — P0.3 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * Before this module, routes threw anonymous `Error` instances (or Postgres
 * errors) and `classifyDbError` guessed how to present them. Anything that
 * didn't match one of the hardcoded regex arms fell through to "حدث خطأ غير
 * متوقع" — a generic message users could not act on and engineers could not
 * trace.
 *
 * The five classes below give route handlers a vocabulary for explicit
 * failures: "I know why this is failing and I want the client to know too."
 * `handleRouteError` recognises them before it falls back to the DB-error
 * classifier, so a thrown `ConflictError("المورد مكرر")` lands as
 *   { error: "المورد مكرر", code: "CONFLICT", status: 409 }
 * without going through any pattern-matching.
 *
 * Adoption is opt-in — every existing call site still works. Routes migrated
 * to the unified pattern (per the plan) replace their custom error plumbing
 * with one of these classes.
 */

export interface TypedErrorOptions {
  /** Form field that the error is attached to, when applicable. */
  field?: string;
  /** Short guidance for the user on how to recover. */
  fix?: string;
  /** Structured extras for logs / telemetry. */
  meta?: Record<string, unknown>;
  /** Underlying cause (for server logs — never serialised to clients). */
  cause?: unknown;
}

export abstract class TypedError extends Error {
  public abstract readonly status: number;
  public abstract readonly code: string;
  public readonly field?: string;
  public readonly fix?: string;
  public readonly meta?: Record<string, unknown>;

  constructor(message: string, options: TypedErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.field = options.field;
    this.fix = options.fix;
    this.meta = options.meta;
    if (options.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }

  /** Shape sent back to clients. Never leaks `cause`. */
  public toResponse(): { error: string; code: string; field?: string; fix?: string; meta?: Record<string, unknown> } {
    return {
      error: this.message,
      code: this.code,
      ...(this.field ? { field: this.field } : {}),
      ...(this.fix ? { fix: this.fix } : {}),
      ...(this.meta ? { meta: this.meta } : {}),
    };
  }
}

/** 422 — user input failed validation. `field` points at the offending form field. */
export class ValidationError extends TypedError {
  public readonly status = 422;
  public readonly code = "VALIDATION_ERROR";
}

/** 404 — the requested resource was not found (or soft-deleted / out of scope). */
export class NotFoundError extends TypedError {
  public readonly status = 404;
  public readonly code = "NOT_FOUND";
}

/** 409 — the requested change conflicts with current state (wrong status, duplicate, race). */
export class ConflictError extends TypedError {
  public readonly status = 409;
  public readonly code = "CONFLICT";
}

/** 403 — the caller is authenticated but lacks the permission / scope for this action. */
export class ForbiddenError extends TypedError {
  public readonly status = 403;
  public readonly code = "FORBIDDEN";
}

/**
 * 502 — an external integration (ZATCA, Absher, payment gateway, email, …) failed.
 * Distinct from DB errors so the client can show "the third-party provider is
 * unavailable" instead of suggesting the user retry their own input.
 */
export class IntegrationError extends TypedError {
  public readonly status = 502;
  public readonly code = "INTEGRATION_ERROR";
}

/** True when `err` is one of our typed error classes. */
export function isTypedError(err: unknown): err is TypedError {
  return err instanceof TypedError;
}

export function classifyDbError(err: unknown): { status: number; message: string } {
  const e = err as any;
  const msg = e?.message ?? String(err);
  const code = e?.code ?? "";
  if (e?.statusCode && typeof e.statusCode === "number") {
    return { status: e.statusCode, message: msg };
  }

  if (msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("network") || code === "ECONNREFUSED") {
    return { status: 503, message: "انقطع الاتصال بقاعدة البيانات، يرجى المحاولة لاحقاً" };
  }

  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint") || msg.includes("already exists")) {
    const detail = e?.detail ?? "";
    if (detail.includes("empNumber") || detail.includes("emp_number")) return { status: 409, message: "الرقم الوظيفي مستخدم مسبقاً، يرجى اختيار رقم آخر" };
    if (detail.includes("email")) return { status: 409, message: "البريد الإلكتروني مستخدم مسبقاً" };
    if (detail.includes("phone")) return { status: 409, message: "رقم الهاتف مستخدم مسبقاً" };
    if (detail.includes("nationalId") || detail.includes("national_id")) return { status: 409, message: "رقم الهوية مستخدم مسبقاً" };
    if (detail.includes("plateNumber") || detail.includes("plate_number")) return { status: 409, message: "رقم اللوحة مستخدم مسبقاً" };
    if (detail.includes("licenseNumber") || detail.includes("license_number")) return { status: 409, message: "رقم الرخصة مستخدم مسبقاً" };
    if (detail.includes("caseNumber") || detail.includes("case_number")) return { status: 409, message: "رقم القضية مستخدم مسبقاً" };
    if (detail.includes("sku")) return { status: 409, message: "رمز المنتج (SKU) مستخدم مسبقاً" };
    if (detail.includes("ref")) return { status: 409, message: "الرقم المرجعي مستخدم مسبقاً" };
    return { status: 409, message: "البيانات مكررة، يرجى التحقق والمحاولة مجدداً" };
  }

  if (code === "23503" || msg.includes("foreign key") || msg.includes("violates foreign key constraint")) {
    const detail = e?.detail ?? "";
    if (detail.includes("clientId") || detail.includes("client")) return { status: 400, message: "العميل المحدد غير موجود أو محذوف" };
    if (detail.includes("employeeId") || detail.includes("employee")) return { status: 400, message: "الموظف المحدد غير موجود أو محذوف" };
    if (detail.includes("branchId") || detail.includes("branch")) return { status: 400, message: "الفرع المحدد غير موجود أو محذوف" };
    if (detail.includes("companyId") || detail.includes("company")) return { status: 400, message: "الشركة المحددة غير موجودة" };
    if (detail.includes("departmentId") || detail.includes("department")) return { status: 400, message: "القسم المحدد غير موجود" };
    if (detail.includes("vehicleId") || detail.includes("vehicle")) return { status: 400, message: "المركبة المحددة غير موجودة" };
    if (detail.includes("productId") || detail.includes("product")) return { status: 400, message: "المنتج المحدد غير موجود" };
    return { status: 400, message: "مرجع غير صالح، يرجى التحقق من البيانات المدخلة" };
  }

  if (code === "23502" || msg.includes("not-null constraint") || msg.includes("null value in column")) {
    const colMatch = msg.match(/column "([^"]+)"/);
    if (colMatch) {
      const col = colMatch[1];
      const colNames: Record<string, string> = {
        name: "الاسم", email: "البريد الإلكتروني", phone: "الهاتف",
        title: "العنوان", description: "الوصف", amount: "المبلغ",
        total: "الإجمالي", status: "الحالة", "startDate": "تاريخ البداية",
        "endDate": "تاريخ النهاية", "companyId": "الشركة", "branchId": "الفرع",
      };
      return { status: 400, message: `الحقل "${colNames[col] ?? col}" مطلوب ولا يمكن أن يكون فارغاً` };
    }
    return { status: 400, message: "بيانات ناقصة، يرجى ملء جميع الحقول المطلوبة" };
  }

  if (code === "23514" || msg.includes("check constraint") || msg.includes("violates check constraint")) {
    return { status: 400, message: "القيمة المدخلة غير صالحة — تجاوز النطاق المسموح" };
  }

  if (code === "42703" || msg.includes("column") && msg.includes("does not exist")) {
    return { status: 500, message: "خطأ في هيكل قاعدة البيانات، يرجى التواصل مع الدعم الفني" };
  }

  if (code === "42601" || msg.includes("syntax error")) {
    return { status: 500, message: "خطأ في الاستعلام، يرجى التواصل مع الدعم الفني" };
  }

  if (msg.includes("timeout") || msg.includes("timed out") || code === "57014") {
    return { status: 504, message: "انتهت مهلة الاستجابة، يرجى المحاولة مجدداً" };
  }

  if (msg.includes("permission denied") || msg.includes("42501")) {
    return { status: 403, message: "غير مصرح بالوصول لهذه البيانات" };
  }

  return { status: 500, message: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً" };
}

export function validationError(
  res: any,
  error: string,
  field: string,
  fix: string
): void {
  res.status(422).json({ error, field, fix });
}

export function handleRouteError(err: unknown, res: any, logContext: string): void {
  // Typed errors win — the route handler has already said exactly what the
  // client should see, so we skip DB error classification entirely.
  if (isTypedError(err)) {
    // Log with structured context so the underlying cause (if any) is still
    // visible to the operator even though we never ship it to the client.
    const underlying = (err as any).cause;
    if (underlying !== undefined) {
      console.error(`[ERROR] ${logContext}:`, err.message, err.code, err.meta ?? "", underlying);
    } else {
      console.error(`[ERROR] ${logContext}:`, err.message, err.code, err.meta ?? "");
    }
    if (res.headersSent) return;
    res.status(err.status).json(err.toResponse());
    return;
  }

  console.error(`[ERROR] ${logContext}:`, err);
  const { status, message } = classifyDbError(err);
  if (res.headersSent) return;
  res.status(status).json({ error: message });
}
