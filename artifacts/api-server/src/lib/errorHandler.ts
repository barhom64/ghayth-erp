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
  console.error(`[ERROR] ${logContext}:`, err);
  const { status, message } = classifyDbError(err);
  if (res.headersSent) return;
  res.status(status).json({ error: message });
}
