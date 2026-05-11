// importAdapters.ts
// ---------------------------------------------------------------------------
// One adapter per importable entity. Adding a new entity = new entry here +
// optional Arabic header aliases. The engine itself (genericImportEngine.ts)
// stays generic.
//
// Conventions:
//   - `headerMap` keys are pipe-separated aliases ("اسم|الاسم|name") so we
//     accept the most common variants from operator-supplied templates.
//   - `uniqueField` is the natural key used for upsert-style detection.
//     Leave undefined for append-only entities (e.g. expenses).
//   - `compareFields` defines which DB columns we diff against the file —
//     anything not listed here will not trigger an "update" even if the
//     spreadsheet contains a different value.
//   - `hasCompanyId` reflects schema reality: employees has NO companyId
//     column (multi-tenancy goes through employee_assignments) so it is
//     `false`; everything else is `true`.

export type ImportEntity =
  | "clients"
  | "suppliers"
  | "products"
  | "employees"
  | "expenses"
  | "invoices";

export type FieldType = "string" | "number" | "integer" | "boolean" | "date";

export interface ImportAdapter {
  table: string;
  headerMap: Record<string, string>;
  fieldTypes: Record<string, FieldType>;
  enumMaps?: Record<string, Record<string, string>>;
  required: string[];
  uniqueField?: string;
  compareFields: string[];
  hasCompanyId: boolean;
  hasBranchId: boolean;
  defaults?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Shared enum maps (Arabic labels → DB values)
// ---------------------------------------------------------------------------

const STATUS_GENERIC: Record<string, string> = {
  "نشط": "active",
  "نشطة": "active",
  "active": "active",
  "غير نشط": "inactive",
  "inactive": "inactive",
  "معلق": "pending",
  "pending": "pending",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
  "cancelled": "cancelled",
};

const CLIENT_TYPE: Record<string, string> = {
  "فرد": "individual",
  "أفراد": "individual",
  "individual": "individual",
  "شركة": "company",
  "company": "company",
  "حكومي": "government",
  "government": "government",
};

const CLIENT_CLASSIFICATION: Record<string, string> = {
  "محتمل": "prospect",
  "prospect": "prospect",
  "نشط": "active",
  "active": "active",
  "VIP": "vip",
  "vip": "vip",
  "مميز": "vip",
  "محظور": "blacklisted",
  "blacklisted": "blacklisted",
};

const EMPLOYEE_GENDER: Record<string, string> = {
  "ذكر": "male",
  "male": "male",
  "أنثى": "female",
  "انثى": "female",
  "female": "female",
};

const INVOICE_STATUS: Record<string, string> = {
  "مسودة": "draft",
  "draft": "draft",
  "صادرة": "issued",
  "issued": "issued",
  "مدفوعة": "paid",
  "paid": "paid",
  "متأخرة": "overdue",
  "overdue": "overdue",
  "ملغاة": "cancelled",
  "ملغية": "cancelled",
  "cancelled": "cancelled",
};

const EXPENSE_STATUS: Record<string, string> = {
  "معلق": "pending",
  "pending": "pending",
  "معتمد": "approved",
  "approved": "approved",
  "مرفوض": "rejected",
  "rejected": "rejected",
  "مدفوع": "paid",
  "paid": "paid",
};

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

const CLIENTS: ImportAdapter = {
  table: "clients",
  headerMap: {
    "الكود|كود العميل|code": "code",
    "الاسم|اسم العميل|name": "name",
    "النوع|نوع العميل|type": "type",
    "الهاتف|رقم الهاتف|phone": "phone",
    "البريد|البريد الإلكتروني|email": "email",
    "الجنسية|nationality": "nationality",
    "اللغة|language": "language",
    "التصنيف|classification": "classification",
    "المصدر|source": "source",
    "ملاحظات|notes": "notes",
  },
  fieldTypes: {
    code: "string",
    name: "string",
    type: "string",
    phone: "string",
    email: "string",
    nationality: "string",
    language: "string",
    classification: "string",
    source: "string",
    notes: "string",
  },
  enumMaps: {
    type: CLIENT_TYPE,
    classification: CLIENT_CLASSIFICATION,
  },
  required: ["name"],
  uniqueField: "code",
  compareFields: ["name", "type", "phone", "email", "nationality", "classification", "notes"],
  hasCompanyId: true,
  hasBranchId: false,
  defaults: { type: "individual", language: "ar", classification: "prospect", source: "import" },
};

const SUPPLIERS: ImportAdapter = {
  table: "suppliers",
  headerMap: {
    "الاسم|اسم المورد|name": "name",
    "جهة الاتصال|الشخص المسؤول|contact|contactPerson": "contactPerson",
    "الهاتف|phone": "phone",
    "البريد|email": "email",
    "العنوان|address": "address",
    "الرقم الضريبي|taxNumber|vat": "taxNumber",
    "شروط الدفع|paymentTerms": "paymentTerms",
    "التصنيف|category": "category",
    "الحالة|status": "status",
  },
  fieldTypes: {
    name: "string",
    contactPerson: "string",
    phone: "string",
    email: "string",
    address: "string",
    taxNumber: "string",
    paymentTerms: "integer",
    category: "string",
    status: "string",
  },
  enumMaps: {
    status: STATUS_GENERIC,
  },
  required: ["name"],
  uniqueField: "taxNumber",
  compareFields: ["name", "contactPerson", "phone", "email", "address", "paymentTerms", "category", "status"],
  hasCompanyId: true,
  hasBranchId: false,
  defaults: { paymentTerms: 30, status: "active" },
};

const PRODUCTS: ImportAdapter = {
  table: "warehouse_products",
  headerMap: {
    "كود الصنف|sku|الكود": "sku",
    "اسم الصنف|name|الاسم": "name",
    "الوصف|description": "description",
    "الوحدة|unit": "unit",
    "الحد الأدنى|minStock": "minStock",
    "الحد الأعلى|maxStock": "maxStock",
    "تكلفة الشراء|costPrice|سعر التكلفة": "costPrice",
    "سعر البيع|sellPrice": "sellPrice",
    "الموقع|location": "location",
    "الحالة|status": "status",
    "طريقة التكلفة|costingMethod": "costingMethod",
  },
  fieldTypes: {
    sku: "string",
    name: "string",
    description: "string",
    unit: "string",
    minStock: "integer",
    maxStock: "integer",
    costPrice: "number",
    sellPrice: "number",
    location: "string",
    status: "string",
    costingMethod: "string",
  },
  enumMaps: {
    status: STATUS_GENERIC,
  },
  required: ["name"],
  uniqueField: "sku",
  compareFields: ["name", "description", "unit", "minStock", "maxStock", "costPrice", "sellPrice", "location", "status"],
  hasCompanyId: true,
  hasBranchId: true,
  defaults: { unit: "piece", minStock: 0, maxStock: 99999, status: "active", costingMethod: "weighted_average" },
};

// employees has NO companyId column — multi-tenancy via employee_assignments.
// We therefore restrict matching to the natural keys nationalId / empNumber
// which are application-globally unique.
const EMPLOYEES: ImportAdapter = {
  table: "employees",
  headerMap: {
    "الرقم الوطني|الهوية|nationalId": "nationalId",
    "رقم الموظف|empNumber": "empNumber",
    "الاسم|name|الاسم العربي": "name",
    "الاسم الانجليزي|nameEn": "nameEn",
    "الهاتف|phone": "phone",
    "البريد|email": "email",
    "الجنس|gender": "gender",
    "الجنسية|nationality": "nationality",
    "تاريخ الميلاد|dateOfBirth": "dateOfBirth",
    "رقم الإقامة|iqamaNumber": "iqamaNumber",
    "انتهاء الإقامة|iqamaExpiry": "iqamaExpiry",
    "رقم الجواز|passportNumber": "passportNumber",
    "انتهاء الجواز|passportExpiry": "passportExpiry",
    "رقم التأمينات|gosiNumber": "gosiNumber",
    "البنك|bankName": "bankName",
    "حساب البنك|bankAccount": "bankAccount",
    "الايبان|iban": "iban",
    "الحالة|status": "status",
  },
  fieldTypes: {
    nationalId: "string",
    empNumber: "string",
    name: "string",
    nameEn: "string",
    phone: "string",
    email: "string",
    gender: "string",
    nationality: "string",
    dateOfBirth: "date",
    iqamaNumber: "string",
    iqamaExpiry: "date",
    passportNumber: "string",
    passportExpiry: "date",
    gosiNumber: "string",
    bankName: "string",
    bankAccount: "string",
    iban: "string",
    status: "string",
  },
  enumMaps: {
    gender: EMPLOYEE_GENDER,
    status: STATUS_GENERIC,
  },
  required: ["name"],
  uniqueField: "nationalId",
  compareFields: ["name", "nameEn", "phone", "email", "gender", "nationality", "dateOfBirth", "iqamaNumber", "iqamaExpiry", "passportNumber", "passportExpiry", "gosiNumber", "bankName", "bankAccount", "iban", "status"],
  hasCompanyId: false,
  hasBranchId: false,
  defaults: { status: "active" },
};

// expenses are append-only — no uniqueField means every imported row is
// inserted as a new expense. Useful for bulk-loading historical receipts.
const EXPENSES: ImportAdapter = {
  table: "expenses",
  headerMap: {
    "المرجع|ref|الرقم": "ref",
    "الوصف|description|البيان": "description",
    "المبلغ|amount": "amount",
    "التصنيف|category|البند": "category",
    "الموظف|employeeId": "employeeId",
    "الحالة|status": "status",
  },
  fieldTypes: {
    ref: "string",
    description: "string",
    amount: "number",
    category: "string",
    employeeId: "integer",
    status: "string",
  },
  enumMaps: {
    status: EXPENSE_STATUS,
  },
  required: ["amount", "description"],
  // No uniqueField → always insert. Operators who need dedup should use
  // ref + a future "skip if exists" flag.
  compareFields: [],
  hasCompanyId: true,
  hasBranchId: true,
  defaults: { status: "pending" },
};

// Invoices import handles HEADER rows only (no line items). Adding lines
// requires a separate adapter that joins by ref — out of scope for v1.
const INVOICES: ImportAdapter = {
  table: "invoices",
  headerMap: {
    "رقم الفاتورة|ref|invoiceRef": "ref",
    "العميل|clientId": "clientId",
    "الوصف|description": "description",
    "المجموع الفرعي|subtotal": "subtotal",
    "نسبة الضريبة|vatRate": "vatRate",
    "قيمة الضريبة|vatAmount": "vatAmount",
    "الإجمالي|total": "total",
    "المدفوع|paidAmount": "paidAmount",
    "الحالة|status": "status",
    "تاريخ الاستحقاق|dueDate": "dueDate",
    "العملة|currency": "currency",
    "شروط الدفع|paymentTerms": "paymentTerms",
    "رقم أمر الشراء|poNumber": "poNumber",
    "ملاحظات|notes": "notes",
  },
  fieldTypes: {
    ref: "string",
    clientId: "integer",
    description: "string",
    subtotal: "number",
    vatRate: "number",
    vatAmount: "number",
    total: "number",
    paidAmount: "number",
    status: "string",
    dueDate: "date",
    currency: "string",
    paymentTerms: "string",
    poNumber: "string",
    notes: "string",
  },
  enumMaps: {
    status: INVOICE_STATUS,
  },
  required: ["ref", "total"],
  uniqueField: "ref",
  compareFields: ["clientId", "description", "subtotal", "vatRate", "vatAmount", "total", "paidAmount", "status", "dueDate", "currency", "paymentTerms", "poNumber", "notes"],
  hasCompanyId: true,
  hasBranchId: true,
  defaults: { vatRate: 15, status: "draft", currency: "SAR", glStatus: "pending" },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ADAPTERS: Record<ImportEntity, ImportAdapter> = {
  clients: CLIENTS,
  suppliers: SUPPLIERS,
  products: PRODUCTS,
  employees: EMPLOYEES,
  expenses: EXPENSES,
  invoices: INVOICES,
};
