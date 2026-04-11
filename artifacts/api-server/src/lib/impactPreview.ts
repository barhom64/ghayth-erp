import { rawQuery } from "./rawdb.js";

export interface ImpactItem {
  category: string;
  label: string;
  value: string;
  severity: "info" | "warning" | "danger" | "success";
}

export interface ImpactPreview {
  actionType: string;
  employeeId: number;
  employeeName: string;
  items: ImpactItem[];
  summary: string;
}

export interface StatusImpactItem {
  type: "financial" | "operational" | "legal" | "notification";
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
}

export interface StatusImpactPreview {
  fromStatus: string;
  toStatus: string;
  impacts: StatusImpactItem[];
  canProceed: boolean;
  blockers: string[];
}

export async function computeLeaveImpact(
  companyId: number,
  employeeId: number,
  assignmentId: number,
  leaveTypeId: number,
  startDate: string,
  endDate: string,
  days: number
): Promise<ImpactPreview> {
  const items: ImpactItem[] = [];

  const [employee] = await rawQuery<any>(
    `SELECT e.name, ea.salary FROM employees e
     JOIN employee_assignments ea ON ea.id = $1
     WHERE e.id = $2`,
    [assignmentId, employeeId]
  );

  const [leaveType] = await rawQuery<any>(
    `SELECT name, "annualDays", "isPaid" FROM hr_leave_types WHERE id = $1 AND "companyId" = $2`,
    [leaveTypeId, companyId]
  );

  const year = new Date(startDate).getFullYear();
  const [balance] = await rawQuery<any>(
    `SELECT entitled, used, reserved, remaining FROM hr_leave_balances
     WHERE "companyId" = $1 AND "employeeId" = $2 AND "leaveTypeId" = $3 AND year = $4`,
    [companyId, employeeId, leaveTypeId, year]
  );

  const currentRemaining = balance ? Number(balance.remaining) : (Number(leaveType?.annualDays ?? 21));
  const newRemaining = currentRemaining - days;

  items.push({
    category: "الإجازات",
    label: `رصيد إجازة ${leaveType?.name ?? ""}`,
    value: `${currentRemaining} → ${newRemaining} يوم`,
    severity: newRemaining < 0 ? "danger" : newRemaining < 5 ? "warning" : "info",
  });

  const salary = Number(employee?.salary ?? 0);
  if (!leaveType?.isPaid && salary > 0) {
    const dailySalary = salary / 30;
    const deduction = Math.round(dailySalary * days * 100) / 100;
    items.push({
      category: "المالية",
      label: "خصم من الراتب",
      value: `-${deduction.toFixed(2)} ر.س (${days} أيام × ${dailySalary.toFixed(2)} يومي)`,
      severity: "danger",
    });
  } else if (leaveType?.isPaid) {
    items.push({
      category: "المالية",
      label: "أثر على الراتب",
      value: "لا خصم — إجازة مدفوعة الأجر",
      severity: "success",
    });
  }

  const pendingTasks = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM project_tasks
     WHERE "assigneeId" = $1 AND status NOT IN ('completed','cancelled')
       AND ("dueDate" IS NULL OR "dueDate" BETWEEN $2 AND $3)`,
    [employeeId, startDate, endDate]
  );
  const taskCount = Number(pendingTasks[0]?.cnt ?? 0);
  if (taskCount > 0) {
    items.push({
      category: "المهام",
      label: "مهام تتداخل مع فترة الإجازة",
      value: `${taskCount} مهمة ستُعاد للمدير تلقائياً`,
      severity: "warning",
    });
  }

  items.push({
    category: "الحضور",
    label: "تسجيل الحضور",
    value: `سيتم تسجيل ${days} يوم كـ "إجازة معتمدة" تلقائياً`,
    severity: "info",
  });

  const severity = items.some(i => i.severity === "danger") ? "تحقق من الآثار المالية قبل الاعتماد"
    : items.some(i => i.severity === "warning") ? "سيتأثر بعض المهام والأرصدة"
    : "الاعتماد آمن — لا آثار جوهرية";

  return {
    actionType: "leave",
    employeeId,
    employeeName: employee?.name ?? "",
    items,
    summary: severity,
  };
}

export async function computeTerminationImpact(
  companyId: number,
  employeeId: number,
  assignmentId: number
): Promise<ImpactPreview> {
  const items: ImpactItem[] = [];

  const [employee] = await rawQuery<any>(
    `SELECT e.name, ea.salary, ea."hireDate" FROM employees e
     JOIN employee_assignments ea ON ea.id = $1
     WHERE e.id = $2`,
    [assignmentId, employeeId]
  );

  const salary = Number(employee?.salary ?? 0);
  if (employee?.hireDate) {
    const hireDate = new Date(employee.hireDate);
    const today = new Date();
    const yearsOfService = (today.getTime() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000);
    const gratuity = Math.round(salary / 12 * yearsOfService * 100) / 100;
    items.push({
      category: "المالية",
      label: "مكافأة نهاية الخدمة المقدرة",
      value: `${gratuity.toFixed(2)} ر.س (${yearsOfService.toFixed(1)} سنوات × ${(salary / 12).toFixed(2)})`,
      severity: "warning",
    });
  }

  const [custodies] = await rawQuery<any>(
    `SELECT COALESCE(SUM(amount),0) AS total FROM custodies
     WHERE "companyId" = $1 AND "employeeId" = $2 AND status != 'settled'`,
    [companyId, employeeId]
  ).catch(() => [{ total: 0 }]);
  const custodyTotal = Number(custodies?.total ?? 0);
  if (custodyTotal > 0) {
    items.push({
      category: "المالية",
      label: "عهد غير مسواة",
      value: `${custodyTotal.toFixed(2)} ر.س — يجب التسوية قبل الإنهاء`,
      severity: "danger",
    });
  }

  const [loans] = await rawQuery<any>(
    `SELECT COALESCE(SUM("remainingAmount"),0) AS total FROM loans
     WHERE "companyId" = $1 AND "employeeId" = $2 AND status != 'settled'`,
    [companyId, employeeId]
  ).catch(() => [{ total: 0 }]);
  const loanTotal = Number(loans?.total ?? 0);
  if (loanTotal > 0) {
    items.push({
      category: "المالية",
      label: "سلف غير مسواة",
      value: `${loanTotal.toFixed(2)} ر.س — ستُخصم من المستحقات`,
      severity: "danger",
    });
  }

  const [activeTasks] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM project_tasks
     WHERE "assigneeId" = $1 AND status NOT IN ('completed','cancelled')`,
    [employeeId]
  );
  const taskCount = Number(activeTasks?.cnt ?? 0);
  if (taskCount > 0) {
    items.push({
      category: "المهام",
      label: "مهام معلقة",
      value: `${taskCount} مهمة ستُلغى أو تُعاد للمدير`,
      severity: "warning",
    });
  }

  items.push({
    category: "الوصول",
    label: "إيقاف حسابات النظام",
    value: "سيتم إيقاف الوصول فور الاعتماد",
    severity: "danger",
  });

  items.push({
    category: "الحالة",
    label: "حالة العقد",
    value: "العقد → منتهي الخدمة",
    severity: "info",
  });

  return {
    actionType: "termination",
    employeeId,
    employeeName: employee?.name ?? "",
    items,
    summary: custodyTotal > 0 || loanTotal > 0
      ? "تحذير: يوجد ذمم مالية غير مسواة يجب تسويتها أولاً"
      : "تأكد من استيفاء جميع الإجراءات قبل الاعتماد",
  };
}

export async function computeViolationImpact(
  companyId: number,
  employeeId: number,
  assignmentId: number,
  deduction: number,
  severity: string
): Promise<ImpactPreview> {
  const items: ImpactItem[] = [];

  const [employee] = await rawQuery<any>(
    `SELECT e.name, ea.salary FROM employees e
     JOIN employee_assignments ea ON ea.id = $1
     WHERE e.id = $2`,
    [assignmentId, employeeId]
  );

  const period = new Date().toISOString().slice(0, 7);
  const [monthCount] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM employee_violations
     WHERE "assignmentId" = $1 AND period = $2`,
    [assignmentId, period]
  );
  const existingCount = Number(monthCount?.cnt ?? 0);

  const escalationLevel = existingCount + 1;
  const escalationLabels: Record<number, string> = {
    1: "تنبيه شفهي",
    2: "إنذار كتابي أول",
    3: "إنذار كتابي ثاني",
    4: "خصم من الراتب",
    5: "إيقاف مؤقت",
  };
  const escalationLabel = escalationLabels[Math.min(escalationLevel, 5)] ?? "إجراء تأديبي";

  items.push({
    category: "التصعيد",
    label: "مستوى الإجراء التأديبي",
    value: `${escalationLabel} (${escalationLevel}/${Object.keys(escalationLabels).length})`,
    severity: escalationLevel >= 4 ? "danger" : escalationLevel >= 2 ? "warning" : "info",
  });

  if (deduction > 0) {
    items.push({
      category: "المالية",
      label: "خصم من الراتب",
      value: `-${Number(deduction).toFixed(2)} ر.س في مسير الرواتب القادم`,
      severity: "danger",
    });
  }

  items.push({
    category: "التقييم",
    label: "أثر على التقييم الدوري",
    value: "ستؤثر هذه المخالفة على تقييم الموظف",
    severity: "warning",
  });

  if (escalationLevel >= 3) {
    items.push({
      category: "الترقية",
      label: "تأهل الترقية",
      value: "الموظف غير مؤهل للترقية بسبب المخالفات المتراكمة",
      severity: "danger",
    });
  }

  return {
    actionType: "violation",
    employeeId,
    employeeName: employee?.name ?? "",
    items,
    summary: escalationLevel >= 4 ? "إجراء تأديبي خطير — راجع الإدارة قبل الاعتماد" : "سيتم تسجيل المخالفة في ملف الموظف",
  };
}

export async function computeEmployeeOperationalStatus(
  companyId: number,
  employeeId: number,
  assignmentId: number
): Promise<{
  status: string;
  label: string;
  color: string;
  reason: string;
}> {
  const today = new Date().toISOString().split("T")[0];
  const period = today.slice(0, 7);

  const [onLeave] = await rawQuery<any>(
    `SELECT id FROM hr_leave_requests
     WHERE "employeeId" = $1 AND status = 'approved'
       AND "startDate" <= $2 AND "endDate" >= $2`,
    [employeeId, today]
  ).catch(() => [null]);
  if (onLeave) {
    return { status: "on_leave", label: "في إجازة", color: "bg-blue-100 text-blue-700", reason: "إجازة معتمدة" };
  }

  const [contract] = await rawQuery<any>(
    `SELECT status FROM employee_contracts
     WHERE "companyId" = $1 AND "employeeId" = $2 ORDER BY id DESC LIMIT 1`,
    [companyId, employeeId]
  ).catch(() => [null]);
  if (contract?.status === "terminated" || contract?.status === "cancelled") {
    return { status: "terminated", label: "منتهية خدماته", color: "bg-gray-100 text-gray-600", reason: "انتهاء الخدمة" };
  }

  const [suspension] = await rawQuery<any>(
    `SELECT id FROM employee_violations
     WHERE "assignmentId" = $1 AND type = 'suspension' AND status = 'active'`,
    [assignmentId]
  ).catch(() => [null]);
  if (suspension) {
    return { status: "suspended", label: "موقوف", color: "bg-red-100 text-red-700", reason: "إيقاف تأديبي" };
  }

  const [pendingViolation] = await rawQuery<any>(
    `SELECT id FROM employee_violations
     WHERE "assignmentId" = $1 AND period = $2 AND severity IN ('high','critical') AND status = 'active'`,
    [assignmentId, period]
  ).catch(() => [null]);
  if (pendingViolation) {
    return { status: "under_action", label: "تحت إجراء", color: "bg-orange-100 text-orange-700", reason: "مخالفة نشطة" };
  }

  const [todayAttendance] = await rawQuery<any>(
    `SELECT status, "lateMinutes" FROM attendance WHERE "assignmentId" = $1 AND date = $2`,
    [assignmentId, today]
  ).catch(() => [null]);

  if (!todayAttendance) {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 10) {
      return { status: "absent", label: "غائب", color: "bg-red-100 text-red-600", reason: "لم يسجل حضوراً اليوم" };
    }
    return { status: "working", label: "على رأس العمل", color: "bg-green-100 text-green-700", reason: "" };
  }

  if (todayAttendance.status === "on_leave") {
    return { status: "on_leave", label: "في إجازة", color: "bg-blue-100 text-blue-700", reason: "إجازة اليوم" };
  }

  if (todayAttendance.lateMinutes > 0) {
    return { status: "late", label: "متأخر", color: "bg-yellow-100 text-yellow-700", reason: `تأخر ${todayAttendance.lateMinutes} دقيقة` };
  }

  return { status: "working", label: "على رأس العمل", color: "bg-green-100 text-green-700", reason: "حاضر" };
}

export async function getPropertyUnitStatusImpact(
  unitId: number,
  companyId: number,
  newStatus: string
): Promise<StatusImpactPreview> {
  const [unit] = await rawQuery<any>(
    `SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2`,
    [unitId, companyId]
  );
  if (!unit) throw new Error("الوحدة غير موجودة");

  const fromStatus = unit.status;
  const impacts: StatusImpactItem[] = [];
  const blockers: string[] = [];

  const [activeContract] = await rawQuery<any>(
    `SELECT rc.*, (SELECT COUNT(*) FROM rent_payments WHERE "contractId"=rc.id AND status IN ('pending','partial')) AS "pendingPayments"
     FROM rental_contracts rc WHERE "unitId"=$1 AND status='active' LIMIT 1`,
    [unitId]
  );

  const [openMaintenance] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM maintenance_requests WHERE "unitId"=$1 AND status NOT IN ('completed','closed')`,
    [unitId]
  );

  if (newStatus === "rented") {
    if (fromStatus === "rented") {
      blockers.push("الوحدة مؤجرة بالفعل");
    }
    impacts.push({
      type: "financial",
      title: "إيراد إيجاري شهري",
      description: `سيبدأ إيراد شهري بمبلغ ${Number(unit.monthlyRent || 0).toLocaleString("ar-SA")} ريال + إنشاء جدول دفعات`,
      severity: "info",
    });
    impacts.push({
      type: "operational",
      title: "تحديث سجل الوحدة",
      description: "سيتم تغيير حالة الوحدة إلى مؤجرة وربطها بالعقد الجديد",
      severity: "info",
    });
  }

  if (newStatus === "maintenance") {
    if (activeContract) {
      impacts.push({
        type: "operational",
        title: "عقد إيجار ساري",
        description: `توجد عقد إيجار ساري للمستأجر ${activeContract.tenantName} — ستظل الوحدة محجوزة`,
        severity: "warning",
      });
    }
    impacts.push({
      type: "operational",
      title: "أمر عمل صيانة",
      description: "سيتم إنشاء أمر عمل صيانة + تقدير مصروف مبدئي",
      severity: "info",
    });
    impacts.push({
      type: "financial",
      title: "مصروف تقديري",
      description: "يُنصح بتحديد ميزانية صيانة وتخصيص فني",
      severity: "info",
    });
  }

  if (newStatus === "available") {
    if (fromStatus === "rented" && activeContract) {
      if (Number(activeContract.pendingPayments) > 0) {
        impacts.push({
          type: "financial",
          title: "دفعات معلقة",
          description: `يوجد ${activeContract.pendingPayments} دفعة معلقة للمستأجر ${activeContract.tenantName} — يجب تسوية الحساب أولاً`,
          severity: "warning",
        });
      }
      impacts.push({
        type: "operational",
        title: "إنهاء عقد الإيجار",
        description: `سيبدأ فحص الوحدة + تسوية مالية نهائية للمستأجر ${activeContract.tenantName}`,
        severity: "warning",
      });
      impacts.push({
        type: "legal",
        title: "إجراءات إخلاء",
        description: "يُنصح باستيفاء محضر استلام الوحدة وتوثيق حالتها",
        severity: "info",
      });
    }
    if (Number(openMaintenance?.cnt || 0) > 0) {
      impacts.push({
        type: "operational",
        title: "طلبات صيانة مفتوحة",
        description: `يوجد ${openMaintenance.cnt} طلب صيانة قيد التنفيذ — يُنصح بإغلاقها أولاً`,
        severity: "warning",
      });
    }
  }

  if (newStatus === "defaulted" || newStatus === "suspended") {
    if (!activeContract) {
      blockers.push("لا يوجد عقد إيجار ساري لبدء إجراءات التعثر");
    } else {
      impacts.push({
        type: "legal",
        title: "مسار تصعيد قانوني",
        description: `سيبدأ مسار تصعيد الإيجار المتأخر + إشعار للإدارة القانونية بشأن ${activeContract.tenantName}`,
        severity: "critical",
      });
      impacts.push({
        type: "notification",
        title: "إشعار للإدارة",
        description: "سيتم إرسال إشعار عاجل للإدارة القانونية وإدارة الأملاك",
        severity: "critical",
      });
    }
  }

  if (newStatus === "reserved") {
    if (fromStatus === "rented") {
      blockers.push("لا يمكن حجز وحدة مؤجرة بالفعل");
    }
    impacts.push({
      type: "operational",
      title: "حجز مؤقت",
      description: "ستُعلَّم الوحدة كمحجوزة ولن تظهر في الوحدات المتاحة",
      severity: "info",
    });
  }

  if (newStatus === "expired") {
    if (activeContract) {
      impacts.push({
        type: "operational",
        title: "انتهاء العقد",
        description: `سيتم إنهاء عقد إيجار ${activeContract.tenantName} وبدء إجراءات التسوية`,
        severity: "warning",
      });
    }
    impacts.push({
      type: "operational",
      title: "فحص الوحدة",
      description: "يُنصح بإجراء فحص الوحدة وتوثيق حالتها بعد انتهاء العقد",
      severity: "info",
    });
  }

  return {
    fromStatus,
    toStatus: newStatus,
    impacts,
    canProceed: blockers.length === 0,
    blockers,
  };
}

export async function getVehicleStatusImpact(
  vehicleId: number,
  companyId: number,
  newStatus: string
): Promise<StatusImpactPreview> {
  const [vehicle] = await rawQuery<any>(
    `SELECT v.*, d.name AS "driverName" FROM fleet_vehicles v LEFT JOIN fleet_drivers d ON d.id=v."assignedDriverId" WHERE v.id=$1 AND v."companyId"=$2`,
    [vehicleId, companyId]
  );
  if (!vehicle) throw new Error("المركبة غير موجودة");

  const fromStatus = vehicle.status;
  const impacts: StatusImpactItem[] = [];
  const blockers: string[] = [];

  const [activeTrip] = await rawQuery<any>(
    `SELECT * FROM fleet_trips WHERE "vehicleId"=$1 AND status='in_progress' LIMIT 1`,
    [vehicleId]
  );

  const [insurance] = await rawQuery<any>(
    `SELECT * FROM fleet_insurance WHERE "vehicleId"=$1 ORDER BY "endDate" DESC LIMIT 1`,
    [vehicleId]
  );
  const insuranceExpired = !insurance || new Date(insurance.endDate) < new Date();

  const [openMaintenance] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM fleet_maintenance WHERE "vehicleId"=$1 AND status NOT IN ('completed')`,
    [vehicleId]
  );

  if (newStatus === "maintenance") {
    if (activeTrip) {
      blockers.push("المركبة في رحلة جارية — يجب إنهاء الرحلة أولاً");
    }
    impacts.push({
      type: "operational",
      title: "أمر صيانة",
      description: "سيتم إنشاء سجل صيانة + تقدير مصروف مبدئي",
      severity: "info",
    });
    impacts.push({
      type: "operational",
      title: "توقف المركبة",
      description: "المركبة ستصبح غير متاحة للمهام حتى اكتمال الصيانة",
      severity: "warning",
    });
    impacts.push({
      type: "financial",
      title: "مصروف تقديري",
      description: "يُنصح بتحديد التكلفة التقديرية وتخصيص الميكانيكي",
      severity: "info",
    });
  }

  if (newStatus === "in_use" || newStatus === "on_trip") {
    if (!vehicle.assignedDriverId) {
      blockers.push("لا يوجد سائق مرتبط بالمركبة — يجب تعيين سائق أولاً");
    }
    if (insuranceExpired) {
      blockers.push("تأمين المركبة منتهٍ — يجب تجديد التأمين أولاً");
    }
    if (Number(openMaintenance?.cnt || 0) > 0) {
      impacts.push({
        type: "operational",
        title: "صيانة قيد التنفيذ",
        description: `يوجد ${openMaintenance.cnt} سجل صيانة مفتوح — يُنصح بإغلاقها أولاً`,
        severity: "warning",
      });
    }
    impacts.push({
      type: "financial",
      title: "احتساب استهلاك وقود",
      description: "سيتم احتساب استهلاك الوقود وتحديث عداد المسافة عند انتهاء الرحلة",
      severity: "info",
    });
    impacts.push({
      type: "operational",
      title: "تحديث حالة السائق",
      description: `سيتم تحديث حالة السائق ${vehicle.driverName || "المرتبط"} إلى "في رحلة"`,
      severity: "info",
    });
  }

  if (newStatus === "available") {
    if (activeTrip) {
      blockers.push("المركبة في رحلة جارية — يجب إنهاء الرحلة أولاً");
    }
    if (Number(openMaintenance?.cnt || 0) > 0) {
      impacts.push({
        type: "operational",
        title: "صيانة مفتوحة",
        description: `يوجد ${openMaintenance.cnt} سجل صيانة مفتوح — يُنصح بإغلاقها أولاً`,
        severity: "warning",
      });
    }
    impacts.push({
      type: "operational",
      title: "المركبة متاحة",
      description: "ستعود المركبة لقائمة المركبات المتاحة للمهام والرحلات",
      severity: "info",
    });
  }

  if (newStatus === "accident" || newStatus === "damaged") {
    if (activeTrip) {
      impacts.push({
        type: "legal",
        title: "رحلة جارية",
        description: "ستُوقف الرحلة الجارية وتُسجل كحادث",
        severity: "critical",
      });
    }
    impacts.push({
      type: "legal",
      title: "مطالبة تأمين",
      description: insuranceExpired
        ? "تأمين المركبة منتهٍ — لن يمكن تقديم مطالبة تأمين"
        : `سيتم فتح مطالبة تأمين مع ${insurance?.provider || "شركة التأمين"}`,
      severity: "critical",
    });
    impacts.push({
      type: "financial",
      title: "تسجيل خسارة",
      description: "سيتم تسجيل خسارة مالية وإيقاف المركبة عن الخدمة",
      severity: "critical",
    });
    impacts.push({
      type: "notification",
      title: "إشعار عاجل",
      description: "سيتم إرسال إشعار عاجل لإدارة الأسطول والإدارة القانونية",
      severity: "critical",
    });
  }

  if (newStatus === "reserved") {
    if (activeTrip) {
      blockers.push("المركبة في رحلة جارية — يجب إنهاء الرحلة أولاً");
    }
    impacts.push({
      type: "operational",
      title: "حجز مؤقت",
      description: "ستُعلَّم المركبة كمحجوزة ولن تظهر في القائمة المتاحة للمهام",
      severity: "info",
    });
  }

  return {
    fromStatus,
    toStatus: newStatus,
    impacts,
    canProceed: blockers.length === 0,
    blockers,
  };
}
