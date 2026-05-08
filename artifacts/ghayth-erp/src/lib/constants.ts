export const ROLES: Record<string, string> = {
  owner: "مالك",
  system_admin: "مدير النظام",
  branch_manager: "مدير الفرع",
  hr: "موارد بشرية",
  finance_manager: "مدير المالية",
  department_manager: "مدير القسم",
  employee: "موظف",
  sales: "مبيعات",
  support: "دعم فني",
  gm: "مدير عام",
  pm: "مدير مشروع",
};

export const STATUSES: Record<string, string> = {
  pending: "معلق",
  active: "نشط",
  completed: "مكتمل",
  overdue: "متأخر",
  in_progress: "جاري",
  cancelled: "ملغي",
  approved: "موافق",
  rejected: "مرفوض",
  draft: "مسودة",
  sent: "مرسلة",
  paid: "مدفوعة",
  partial: "جزئي",
  available: "متاح",
  rented: "مؤجر",
  maintenance: "صيانة",
  reserved: "محجوز",
  defaulted: "متعثر",
  expired: "منتهي",
  in_use: "قيد الاستخدام",
  arrived: "وصل",
  departed: "غادر",
  overstayed: "متأخر",
  violated: "مخالف",
  invoiced: "مفوترة",
  open: "مفتوح",
  closed: "مغلق",
  resolved: "تم الحل",
  under_review: "قيد المراجعة",
  pending_approval: "بانتظار الموافقة",
  high: "عاجل",
  medium: "متوسط",
  low: "عادي",
  urgent: "طارئ",
  critical: "حرج",
  present: "حاضر",
  present_out_of_range: "خارج النطاق",
  present_off_day: "حضور يوم عطلة",
  absent: "غائب",
  late: "متأخر",
  on_leave: "في إجازة",
  inactive: "غير نشط",
  in_review: "قيد المراجعة",
  suspended: "موقوف",
  closed_won: "مغلق (ربح)",
  closed_lost: "مغلق (خسارة)",
  lead: "عميل محتمل",
  qualified: "مؤهل",
  proposal: "عرض سعر",
  negotiation: "تفاوض",
  new: "جديد",
  on_hold: "متوقف",
  planning: "تخطيط",
  processed: "تمت المعالجة",
  refunded: "مسترجع",
  posted: "مرحّل",
  returned: "مُعاد",
  won: "ربح",
  lost: "خسارة",
  judgment: "حكم",
  execution: "تنفيذ",
};

export const CLASSIFICATIONS: Record<string, string> = {
  vip: "كبار العملاء",
  premium: "مميز",
  regular: "عادي",
  prospect: "محتمل",
  churned: "مفقود",
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case "active":
    case "completed":
    case "approved":
    case "paid":
    case "available":
    case "present":
    case "resolved":
    case "arrived":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "present_out_of_range":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "present_off_day":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "pending":
    case "in_progress":
    case "draft":
    case "partial":
    case "under_review":
    case "pending_approval":
    case "reserved":
    case "medium":
    case "open":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "overdue":
    case "cancelled":
    case "rejected":
    case "defaulted":
    case "violated":
    case "overstayed":
    case "high":
    case "urgent":
    case "critical":
    case "absent":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400";
    case "rented":
    case "in_use":
    case "sent":
    case "departed":
    case "lead":
    case "planning":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "maintenance":
    case "late":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "expired":
    case "closed":
    case "closed_lost":
    case "inactive":
    case "suspended":
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400";
    case "on_leave":
    case "qualified":
    case "negotiation":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "low":
    case "proposal":
    case "processed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "closed_won":
    case "new":
    case "refunded":
    case "won":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "on_hold":
    case "returned":
    case "execution":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "posted":
    case "judgment":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "lost":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400";
  }
};
