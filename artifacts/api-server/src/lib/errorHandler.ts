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

/**
 * Classified DB-error shape returned by `classifyDbError`. Extended from the
 * original `{ status, message }` to also carry `code` + `field` + `fix` so
 * `handleRouteError` can forward a fully-typed response to the client
 * without losing the structured fields the frontend needs to highlight the
 * right form input.
 *
 * This is the fix for the user-reported "every action says 'حدث خطأ'" —
 * even when pg had already told us that the problem was e.g. a duplicate
 * email, the old code threw the `code` + `field` away and shipped just a
 * generic string. Now the client gets `{ code: "CONFLICT", field: "email" }`
 * and `useApiMutation.onFieldError` can light up the input.
 */
export interface ClassifiedError {
  status: number;
  message: string;
  code?: string;
  field?: string;
  fix?: string;
}

export function classifyDbError(err: unknown): ClassifiedError {
  const e = err as any;
  const msg = e?.message ?? String(err);
  const code = e?.code ?? "";
  if (e?.statusCode && typeof e.statusCode === "number") {
    return { status: e.statusCode, message: msg };
  }

  if (msg.includes("Failed to fetch") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("network") || code === "ECONNREFUSED") {
    return {
      status: 503,
      message: "انقطع الاتصال بقاعدة البيانات، يرجى المحاولة لاحقاً",
      code: "DB_UNAVAILABLE",
    };
  }

  // 23505 — unique-key violation. Now returns `code: CONFLICT` + the
  // specific form `field` we think was duplicated, so the frontend can
  // light up that input without another round-trip.
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint") || msg.includes("already exists")) {
    const detail = e?.detail ?? "";
    const base = { status: 409, code: "CONFLICT" as const };
    if (detail.includes("empNumber") || detail.includes("emp_number")) {
      return { ...base, message: "الرقم الوظيفي مستخدم مسبقاً", field: "empNumber", fix: "اختر رقماً وظيفياً آخر أو اترك الحقل ليُنشأ تلقائياً." };
    }
    if (detail.includes("email")) {
      return { ...base, message: "البريد الإلكتروني مستخدم مسبقاً", field: "email", fix: "تحقّق من صحة البريد أو استخدم بريداً آخر." };
    }
    if (detail.includes("phone")) {
      return { ...base, message: "رقم الهاتف مستخدم مسبقاً", field: "phone", fix: "تحقّق من الرقم أو استخدم رقماً مختلفاً." };
    }
    if (detail.includes("nationalId") || detail.includes("national_id")) {
      return { ...base, message: "رقم الهوية مستخدم مسبقاً", field: "nationalId", fix: "الرقم مرتبط بموظف آخر. تحقّق من بياناته أولاً." };
    }
    if (detail.includes("plateNumber") || detail.includes("plate_number")) {
      return { ...base, message: "رقم اللوحة مستخدم مسبقاً", field: "plateNumber", fix: "تحقّق من أن المركبة غير مسجّلة مسبقاً." };
    }
    if (detail.includes("licenseNumber") || detail.includes("license_number")) {
      return { ...base, message: "رقم الرخصة مستخدم مسبقاً", field: "licenseNumber" };
    }
    if (detail.includes("caseNumber") || detail.includes("case_number")) {
      return { ...base, message: "رقم القضية مستخدم مسبقاً", field: "caseNumber" };
    }
    if (detail.includes("sku")) {
      return { ...base, message: "رمز المنتج (SKU) مستخدم مسبقاً", field: "sku" };
    }
    if (detail.includes("ref")) {
      return { ...base, message: "الرقم المرجعي مستخدم مسبقاً", field: "ref" };
    }
    return { ...base, message: "البيانات مكررة، يرجى التحقق والمحاولة مجدداً" };
  }

  // 23503 — foreign-key violation. Most FK failures correspond to a specific
  // form field (clientId, employeeId, branchId, …) so we forward both the
  // field name and a human-readable message the client can show inline.
  if (code === "23503" || msg.includes("foreign key") || msg.includes("violates foreign key constraint")) {
    const detail = e?.detail ?? "";
    const base = { status: 400, code: "VALIDATION_ERROR" as const };
    if (detail.includes("clientId") || detail.includes("client")) {
      return { ...base, message: "العميل المحدد غير موجود أو محذوف", field: "clientId", fix: "اختر عميلاً موجوداً أو أنشئ عميلاً جديداً." };
    }
    if (detail.includes("managerId") || detail.includes("manager_id")) {
      return { ...base, message: "المدير المحدد غير موجود", field: "managerId", fix: "تحقق من وجود المدير أو اختر مديراً آخر." };
    }
    if (detail.includes("employeeId") || detail.includes("employee")) {
      return { ...base, message: "الموظف المحدد غير موجود أو محذوف", field: "employeeId" };
    }
    if (detail.includes("branchId") || detail.includes("branch")) {
      return { ...base, message: "الفرع المحدد غير موجود أو محذوف", field: "branchId" };
    }
    if (detail.includes("companyId") || detail.includes("company")) {
      return { ...base, message: "الشركة المحددة غير موجودة", field: "companyId" };
    }
    if (detail.includes("departmentId") || detail.includes("department")) {
      return { ...base, message: "القسم المحدد غير موجود", field: "departmentId", fix: "تحقق من اسم القسم أو اختره من القائمة." };
    }
    if (detail.includes("vehicleId") || detail.includes("vehicle")) {
      return { ...base, message: "المركبة المحددة غير موجودة", field: "vehicleId" };
    }
    if (detail.includes("productId") || detail.includes("product")) {
      return { ...base, message: "المنتج المحدد غير موجود", field: "productId" };
    }
    return { ...base, message: "مرجع غير صالح، يرجى التحقق من البيانات المدخلة" };
  }

  // 23502 — NOT-NULL violation. Maps the column → arabic field label so the
  // message is useful even without field highlighting.
  if (code === "23502" || msg.includes("not-null constraint") || msg.includes("null value in column")) {
    const colMatch = msg.match(/column "([^"]+)"/);
    if (colMatch) {
      const col = colMatch[1]!;
      const colNames: Record<string, string> = {
        name: "الاسم", email: "البريد الإلكتروني", phone: "الهاتف",
        title: "العنوان", description: "الوصف", amount: "المبلغ",
        total: "الإجمالي", status: "الحالة", "startDate": "تاريخ البداية",
        "endDate": "تاريخ النهاية", "companyId": "الشركة", "branchId": "الفرع",
        "employeeId": "الموظف", "departmentId": "القسم", "managerId": "المدير",
        "jobTitle": "المسمى الوظيفي", "hireDate": "تاريخ التعيين",
        "nationalId": "رقم الهوية", "contractType": "نوع العقد",
      };
      return {
        status: 400,
        code: "VALIDATION_ERROR",
        message: `الحقل "${colNames[col] ?? col}" مطلوب ولا يمكن أن يكون فارغاً`,
        field: col,
        fix: "أدخل قيمة لهذا الحقل قبل الحفظ.",
      };
    }
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "بيانات ناقصة، يرجى ملء جميع الحقول المطلوبة",
    };
  }

  // 23514 — CHECK constraint. Comes from e.g. status enum guards. We can't
  // know which column without parsing the message, but we can report it as
  // a VALIDATION_ERROR so the frontend treats it like a field problem.
  if (code === "23514" || msg.includes("check constraint") || msg.includes("violates check constraint")) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "القيمة المدخلة غير صالحة — تجاوز النطاق المسموح",
      fix: "تحقّق من القيمة وحاول مجدداً.",
    };
  }

  if (code === "42703" || (msg.includes("column") && msg.includes("does not exist"))) {
    return {
      status: 500,
      code: "SERVER_ERROR",
      message: "خطأ في هيكل قاعدة البيانات، يرجى التواصل مع الدعم الفني",
    };
  }

  if (code === "42601" || msg.includes("syntax error")) {
    return {
      status: 500,
      code: "SERVER_ERROR",
      message: "خطأ في الاستعلام، يرجى التواصل مع الدعم الفني",
    };
  }

  if (msg.includes("timeout") || msg.includes("timed out") || code === "57014") {
    return {
      status: 504,
      code: "TIMEOUT",
      message: "انتهت مهلة الاستجابة، يرجى المحاولة مجدداً",
    };
  }

  if (msg.includes("permission denied") || msg.includes("42501")) {
    return {
      status: 403,
      code: "FORBIDDEN",
      message: "غير مصرح بالوصول لهذه البيانات",
    };
  }

  return {
    status: 500,
    code: "SERVER_ERROR",
    message: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً",
  };
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

  try {
    const e: any = err;
    const safeFields = e && typeof e === "object"
      ? { message: e.message, code: e.code, detail: e.detail, hint: e.hint, table: e.table, column: e.column, constraint: e.constraint, position: e.position, where: e.where }
      : { message: String(e) };
    console.error(`[ERROR] ${logContext}:`, JSON.stringify(safeFields), e?.stack ?? "");
  } catch {
    console.error(`[ERROR] ${logContext}: <unprintable error>`);
  }
  const { status, message, code, field, fix } = classifyDbError(err);
  if (res.headersSent) return;
  // Forward the full typed shape the client expects. Legacy consumers that
  // read only `.error` still work (the field is always present); new
  // consumers that check `.code` + `.field` finally have something to read
  // when a pg error bubbles up.
  res.status(status).json({
    error: message,
    ...(code ? { code } : {}),
    ...(field ? { field } : {}),
    ...(fix ? { fix } : {}),
  });
}
