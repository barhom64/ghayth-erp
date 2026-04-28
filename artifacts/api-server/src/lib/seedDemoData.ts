import { pool } from "./rawdb.js";
import { toDateISO, roundTo2 } from "./businessHelpers.js";

const isDev = process.env.NODE_ENV === "development";
const seedEnabled = process.env.SEED_DEMO_DATA === "true";

export async function seedDemoData(): Promise<void> {
  if (!isDev && !seedEnabled) {
    return;
  }

  const client = await pool.connect();
  try {
    const { rows: companies } = await client.query(`SELECT id FROM companies LIMIT 1`);
    if (companies.length === 0) {
      return;
    }
    const companyId = companies[0].id;

    const { rows: branches } = await client.query(
      `SELECT id FROM branches WHERE "companyId" = $1 LIMIT 1`,
      [companyId]
    );
    if (branches.length === 0) return;
    const branchId = branches[0].id;

    const { rows: existingCheck } = await client.query(
      `SELECT COUNT(*)::int as cnt FROM employee_assignments WHERE "companyId" = $1`,
      [companyId]
    );
    if (existingCheck[0].cnt >= 20) {
      return;
    }

    await client.query("BEGIN");

    const empData = [
      { name: "أحمد محمد العتيبي", jobTitle: "مدير عام", phone: "0551234567", email: "ahmed@ghayth.sa", role: "general_manager", nationalId: "1000000001", nationality: "سعودي", gender: "male" },
      { name: "سارة عبدالله القحطاني", jobTitle: "مديرة الموارد البشرية", phone: "0559876543", email: "sara@ghayth.sa", role: "hr_manager", nationalId: "1000000002", nationality: "سعودية", gender: "female" },
      { name: "محمد خالد الشهري", jobTitle: "مدير مالي", phone: "0552345678", email: "mohammed@ghayth.sa", role: "finance_manager", nationalId: "1000000003", nationality: "سعودي", gender: "male" },
      { name: "فاطمة يوسف الدوسري", jobTitle: "مديرة المشاريع", phone: "0553456789", email: "fatima@ghayth.sa", role: "projects_manager", nationalId: "1000000004", nationality: "سعودية", gender: "female" },
      { name: "عبدالرحمن سعد الحربي", jobTitle: "مدير الأسطول", phone: "0554567890", email: "abdulrahman@ghayth.sa", role: "fleet_manager", nationalId: "1000000005", nationality: "سعودي", gender: "male" },
      { name: "نورة فهد المطيري", jobTitle: "مسؤولة الدعم الفني", phone: "0555678901", email: "noura@ghayth.sa", role: "support_manager", nationalId: "1000000006", nationality: "سعودية", gender: "female" },
      { name: "عمر ناصر العنزي", jobTitle: "مدير المستودعات", phone: "0556789012", email: "omar@ghayth.sa", role: "warehouse_manager", nationalId: "1000000007", nationality: "سعودي", gender: "male" },
      { name: "هند سلطان الغامدي", jobTitle: "مديرة الشؤون القانونية", phone: "0557890123", email: "hind@ghayth.sa", role: "legal_manager", nationalId: "1000000008", nationality: "سعودية", gender: "female" },
      { name: "خالد إبراهيم السبيعي", jobTitle: "محاسب", phone: "0558901234", email: "khalid@ghayth.sa", role: "employee", nationalId: "1000000009", nationality: "سعودي", gender: "male" },
      { name: "ريم عادل الزهراني", jobTitle: "مهندسة مشاريع", phone: "0559012345", email: "reem@ghayth.sa", role: "employee", nationalId: "1000000010", nationality: "سعودية", gender: "female" },
      { name: "يوسف حسن البلوي", jobTitle: "فني صيانة", phone: "0550123456", email: "yousif@ghayth.sa", role: "employee", nationalId: "1000000011", nationality: "سعودي", gender: "male" },
      { name: "منال طارق الرشيدي", jobTitle: "مسؤولة تسويق", phone: "0551122334", email: "manal@ghayth.sa", role: "employee", nationalId: "1000000012", nationality: "سعودية", gender: "female" },
      { name: "سلطان عبدالعزيز المالكي", jobTitle: "مهندس شبكات", phone: "0552233445", email: "sultan@ghayth.sa", role: "employee", nationalId: "1000000013", nationality: "سعودي", gender: "male" },
      { name: "لمى حسين العمري", jobTitle: "مصممة جرافيك", phone: "0553344556", email: "lama@ghayth.sa", role: "employee", nationalId: "1000000014", nationality: "سعودية", gender: "female" },
      { name: "عبدالله محمد الشمري", jobTitle: "سائق نقل", phone: "0554455667", email: "abdullah@ghayth.sa", role: "employee", nationalId: "1000000015", nationality: "سعودي", gender: "male" },
      { name: "نادية سالم الحارثي", jobTitle: "أخصائية موارد بشرية", phone: "0555566778", email: "nadia@ghayth.sa", role: "employee", nationalId: "1000000016", nationality: "سعودية", gender: "female" },
      { name: "تركي فيصل القرني", jobTitle: "مشرف مستودع", phone: "0556677889", email: "turki@ghayth.sa", role: "employee", nationalId: "1000000017", nationality: "سعودي", gender: "male" },
      { name: "غادة عمر النفيعي", jobTitle: "محللة بيانات", phone: "0557788990", email: "ghada@ghayth.sa", role: "employee", nationalId: "1000000018", nationality: "سعودية", gender: "female" },
      { name: "بندر راشد الدهمشي", jobTitle: "فني كهربائي", phone: "0558899001", email: "bandar@ghayth.sa", role: "employee", nationalId: "1000000019", nationality: "سعودي", gender: "male" },
      { name: "هيا عبدالرحمن السعيد", jobTitle: "سكرتيرة تنفيذية", phone: "0559900112", email: "haya@ghayth.sa", role: "employee", nationalId: "1000000020", nationality: "سعودية", gender: "female" },
      { name: "ماجد سليمان الرويلي", jobTitle: "أمين صندوق", phone: "0550011223", email: "majed@ghayth.sa", role: "employee", nationalId: "1000000021", nationality: "سعودي", gender: "male" },
      { name: "أسماء فهد البقمي", jobTitle: "مسؤولة مشتريات", phone: "0551122445", email: "asma@ghayth.sa", role: "employee", nationalId: "1000000022", nationality: "سعودية", gender: "female" },
    ];

    const assignmentIds: number[] = [];
    const employeeIds: number[] = [];
    for (let i = 0; i < empData.length; i++) {
      const emp = empData[i];
      const seqRes = await client.query(`SELECT nextval('employee_number_seq') AS seq`);
      const seq = Number(seqRes.rows[0].seq);
      const empNumber = `EMP-2024-${String(seq).padStart(3, "0")}`;

      const empRes = await client.query(
        `INSERT INTO employees (name, phone, email, "empNumber", "nationalId", gender, nationality, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
         ON CONFLICT DO NOTHING RETURNING id`,
        [emp.name, emp.phone, emp.email, empNumber, emp.nationalId, emp.gender, emp.nationality]
      );
      if (!empRes.rows.length) continue;
      const empId = empRes.rows[0].id;
      employeeIds.push(empId);

      const hireDate = toDateISO(new Date(2023, i % 12, (i * 3 + 1) % 28 + 1));
      const salary = emp.role.includes("manager") || emp.role === "general_manager" ? 15000 + i * 1000 : 7000 + i * 500;

      const assignRes = await client.query(
        `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,salary,"hireDate","isPrimary",status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,'active')
         RETURNING id`,
        [empId, companyId, branchId, emp.jobTitle, emp.role, salary, hireDate]
      );
      if (assignRes.rows.length) assignmentIds.push(assignRes.rows[0].id);
    }

    const clientData = [
      { name: "شركة الرياض للتجارة", phone: "0112345678", email: "info@riyadh-trade.sa", classification: "vip" },
      { name: "مؤسسة النجم الذهبي", phone: "0113456789", email: "info@golden-star.sa", classification: "premium" },
      { name: "شركة الخليج للتقنية", phone: "0114567890", email: "info@gulf-tech.sa", classification: "premium" },
      { name: "مجموعة الأمل العقارية", phone: "0115678901", email: "info@amal-group.sa", classification: "vip" },
      { name: "شركة الوادي للمقاولات", phone: "0116789012", email: "info@wadi-const.sa", classification: "regular" },
      { name: "مؤسسة البيت الأنيق", phone: "0117890123", email: "info@elegant-home.sa", classification: "regular" },
      { name: "شركة النخبة للاستشارات", phone: "0118901234", email: "info@elite-consult.sa", classification: "prospect" },
      { name: "مصنع الرواد للبلاستيك", phone: "0119012345", email: "info@rawad-plastic.sa", classification: "regular" },
      { name: "شركة المدينة للتطوير", phone: "0110123456", email: "info@madinah-dev.sa", classification: "vip" },
      { name: "مؤسسة الصفوة للأعمال", phone: "0111234567", email: "info@safwa-biz.sa", classification: "premium" },
      { name: "شركة الدار العربية", phone: "0112345679", email: "info@dar-arabi.sa", classification: "regular" },
      { name: "مجموعة الأفق التجارية", phone: "0113456790", email: "info@ofuq-trade.sa", classification: "prospect" },
    ];

    const clientIds: number[] = [];
    for (const cl of clientData) {
      const { rows } = await client.query(
        `INSERT INTO clients (name, phone, email, classification, "companyId", "isBlacklisted")
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT DO NOTHING RETURNING id`,
        [cl.name, cl.phone, cl.email, cl.classification, companyId]
      );
      if (rows.length) clientIds.push(rows[0].id);
    }

    const projectData = [
      { name: "تطوير منصة التجارة الإلكترونية", status: "active", budget: 250000 },
      { name: "بناء مجمع سكني - حي النرجس", status: "active", budget: 1500000 },
      { name: "تحديث نظام ERP الداخلي", status: "completed", budget: 180000 },
      { name: "صيانة مبنى المقر الرئيسي", status: "active", budget: 95000 },
      { name: "حملة تسويقية - الربع الثاني", status: "planning", budget: 50000 },
      { name: "تأهيل مستودعات المنطقة الشرقية", status: "on_hold", budget: 320000 },
      { name: "تطوير تطبيق الجوال", status: "active", budget: 175000 },
      { name: "تجديد واجهة المبنى الإداري", status: "planning", budget: 420000 },
    ];

    const projectIds: number[] = [];
    for (let i = 0; i < projectData.length; i++) {
      const proj = projectData[i];
      const clientId = clientIds.length ? clientIds[i % clientIds.length] : null;
      const res = await client.query(
        `INSERT INTO projects ("companyId", name, "clientId", budget, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [companyId, proj.name, clientId, proj.budget, proj.status]
      );
      if (res.rows.length) projectIds.push(res.rows[0].id);
    }

    const taskData = [
      { title: "مراجعة عقود الموردين", type: "task", priority: "high", status: "pending" },
      { title: "اجتماع فريق المشاريع الأسبوعي", type: "meeting", priority: "medium", status: "completed" },
      { title: "تحديث سياسة الإجازات", type: "task", priority: "medium", status: "in_progress" },
      { title: "متابعة طلبات الشراء المعلقة", type: "task", priority: "high", status: "pending" },
      { title: "مكالمة مع عميل شركة الرياض", type: "call", priority: "high", status: "completed" },
      { title: "إعداد تقرير الأداء الشهري", type: "task", priority: "medium", status: "in_progress" },
      { title: "مراجعة طلبات التوظيف الجديدة", type: "task", priority: "low", status: "pending" },
      { title: "تدريب الموظفين الجدد على النظام", type: "meeting", priority: "medium", status: "pending" },
      { title: "تحديث قاعدة بيانات العملاء", type: "task", priority: "low", status: "completed" },
      { title: "فحص المعدات الثقيلة", type: "task", priority: "high", status: "pending" },
      { title: "إعداد العرض التقديمي للإدارة", type: "task", priority: "medium", status: "in_progress" },
      { title: "مراجعة ميزانية الربع الأول", type: "task", priority: "high", status: "completed" },
    ];

    for (let i = 0; i < taskData.length; i++) {
      const task = taskData[i];
      const assignmentId = assignmentIds.length ? assignmentIds[i % assignmentIds.length] : null;
      const scheduledDate = toDateISO(new Date(Date.now() + (i - 5) * 86400000));
      await client.query(
        `INSERT INTO tasks ("companyId", "branchId", "assignmentId", title, type, priority, status, "scheduledStart")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING`,
        [companyId, branchId, assignmentId, task.title, task.type, task.priority, task.status, scheduledDate]
      );
    }

    const vehicleData = [
      { plateNumber: "أ ب ت 1234", make: "تويوتا", model: "هايلكس", year: 2024, color: "أبيض", status: "available", mileage: 15000 },
      { plateNumber: "ر س ع 5678", make: "نيسان", model: "باترول", year: 2023, color: "أسود", status: "in_use", mileage: 42000 },
      { plateNumber: "ه و ز 9012", make: "تويوتا", model: "كامري", year: 2024, color: "فضي", status: "available", mileage: 8500 },
      { plateNumber: "ل م ن 3456", make: "هيونداي", model: "سوناتا", year: 2023, color: "أزرق", status: "maintenance", mileage: 55000 },
      { plateNumber: "ك ع ص 7890", make: "تويوتا", model: "فورتشنر", year: 2024, color: "أبيض", status: "in_use", mileage: 22000 },
      { plateNumber: "د ح ط 2345", make: "شيفروليه", model: "تاهو", year: 2024, color: "رمادي", status: "available", mileage: 5200 },
      { plateNumber: "ف ق ي 6789", make: "ميتسوبيشي", model: "باجيرو", year: 2023, color: "أبيض", status: "in_use", mileage: 37000 },
    ];

    for (const v of vehicleData) {
      await client.query(
        `INSERT INTO fleet_vehicles ("companyId","plateNumber",make,model,year,color,"currentMileage",status,"branchId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [companyId, v.plateNumber, v.make, v.model, v.year, v.color, v.mileage, v.status, branchId]
      );
    }

    const ticketData = [
      { title: "مشكلة في الطابعة الرئيسية", category: "technical", priority: "high", status: "open" },
      { title: "طلب صلاحيات جديدة للنظام", category: "access", priority: "medium", status: "in_progress" },
      { title: "عطل في جهاز الكمبيوتر", category: "hardware", priority: "high", status: "open" },
      { title: "استفسار عن سياسة العمل عن بعد", category: "general", priority: "low", status: "resolved" },
      { title: "مشكلة في البريد الإلكتروني", category: "technical", priority: "medium", status: "open" },
      { title: "طلب ترقية نظام التشغيل", category: "technical", priority: "low", status: "in_progress" },
      { title: "خلل في نظام الحضور البيومتري", category: "hardware", priority: "high", status: "open" },
    ];

    for (let i = 0; i < ticketData.length; i++) {
      const t = ticketData[i];
      const clientId = clientIds.length ? clientIds[i % clientIds.length] : null;
      const ref = `TKT-${String(i + 1).padStart(4, "0")}`;
      await client.query(
        `INSERT INTO support_tickets ("companyId",ref,title,category,priority,status,"clientId")
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [companyId, ref, t.title, t.category, t.priority, t.status, clientId]
      );
    }

    const oppData = [
      { title: "توريد أنظمة أمنية - مجمع النرجس", stage: "proposal", value: 450000, probability: 70 },
      { title: "عقد صيانة سنوي - شركة الخليج", stage: "negotiation", value: 120000, probability: 85 },
      { title: "مشروع تطوير ويب - مجموعة الأمل", stage: "qualified", value: 280000, probability: 50 },
      { title: "توريد أثاث مكتبي - مؤسسة النجم", stage: "lead", value: 75000, probability: 30 },
      { title: "استشارات تقنية - شركة النخبة", stage: "closed_won", value: 95000, probability: 100 },
      { title: "تصميم مقر جديد - شركة المدينة", stage: "proposal", value: 680000, probability: 60 },
      { title: "عقد توريد معدات - شركة الدار", stage: "lead", value: 210000, probability: 25 },
    ];

    for (let i = 0; i < oppData.length; i++) {
      const opp = oppData[i];
      const clientId = clientIds.length ? clientIds[i % clientIds.length] : null;
      await client.query(
        `INSERT INTO crm_opportunities ("companyId",title,"clientId",stage,value,probability)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT DO NOTHING`,
        [companyId, opp.title, clientId, opp.stage, opp.value, opp.probability]
      );
    }

    const contractData = [
      { title: "عقد صيانة المبنى الرئيسي", contractType: "maintenance", partyName: "شركة الوادي للمقاولات", value: 180000, status: "active" },
      { title: "عقد توريد مواد بناء", contractType: "supply", partyName: "مصنع الرواد للبلاستيك", value: 350000, status: "active" },
      { title: "عقد استشارات قانونية", contractType: "service", partyName: "مكتب العدل للمحاماة", value: 60000, status: "draft" },
      { title: "عقد إيجار مستودع الدمام", contractType: "lease", partyName: "مجموعة الأمل العقارية", value: 240000, status: "active" },
      { title: "عقد خدمات تقنية", contractType: "service", partyName: "شركة الخليج للتقنية", value: 150000, status: "active" },
      { title: "عقد نقل بضائع", contractType: "logistics", partyName: "شركة النخبة للاستشارات", value: 90000, status: "expired" },
    ];

    for (let i = 0; i < contractData.length; i++) {
      const c = contractData[i];
      const ref = `CTR-${String(i + 1).padStart(4, "0")}`;
      const startDate = toDateISO(new Date(2024, i * 2, 1));
      const endDate = toDateISO(new Date(2025, i * 2, 1));
      await client.query(
        `INSERT INTO legal_contracts ("companyId",ref,title,"contractType","partyName",value,status,"startDate","endDate")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [companyId, ref, c.title, c.contractType, c.partyName, c.value, c.status, startDate, endDate]
      );
    }

    const warehouseCats = [
      { name: "مواد بناء" },
      { name: "أدوات كهربائية" },
      { name: "مستلزمات مكتبية" },
      { name: "قطع غيار" },
      { name: "مواد سباكة" },
    ];

    const catIds: number[] = [];
    for (const cat of warehouseCats) {
      const { rows } = await client.query(
        `INSERT INTO warehouse_categories ("companyId", name)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING id`,
        [companyId, cat.name]
      );
      if (rows.length) catIds.push(rows[0].id);
    }

    const productData = [
      { name: "أسمنت بورتلاندي 50 كغ", sku: "BLD-001", costPrice: 18, sellPrice: 25, stock: 500, minStock: 100 },
      { name: "حديد تسليح 12 مم", sku: "BLD-002", costPrice: 3200, sellPrice: 3800, stock: 80, minStock: 20 },
      { name: "كابل كهربائي 2.5 مم", sku: "ELC-001", costPrice: 45, sellPrice: 65, stock: 200, minStock: 50 },
      { name: "ورق طباعة A4 رزمة 500", sku: "OFC-001", costPrice: 12, sellPrice: 18, stock: 150, minStock: 30 },
      { name: "حبر طابعة HP 26A", sku: "OFC-002", costPrice: 180, sellPrice: 250, stock: 25, minStock: 10 },
      { name: "فلتر زيت تويوتا", sku: "SPR-001", costPrice: 35, sellPrice: 55, stock: 40, minStock: 15 },
      { name: "بلاط سيراميك 60x60", sku: "BLD-003", costPrice: 22, sellPrice: 35, stock: 300, minStock: 50 },
      { name: "أنابيب PVC بوصة", sku: "PLB-001", costPrice: 8, sellPrice: 14, stock: 400, minStock: 80 },
      { name: "مفتاح كهربائي مزدوج", sku: "ELC-002", costPrice: 15, sellPrice: 28, stock: 120, minStock: 30 },
      { name: "سيليكون مانع تسرب", sku: "BLD-004", costPrice: 25, sellPrice: 40, stock: 60, minStock: 15 },
    ];

    for (let i = 0; i < productData.length; i++) {
      const p = productData[i];
      const catId = catIds.length ? catIds[i % catIds.length] : null;
      await client.query(
        `INSERT INTO warehouse_products ("companyId",sku,name,"categoryId","minStock","currentStock","costPrice","sellPrice","branchId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING`,
        [companyId, p.sku, p.name, catId, p.minStock, p.stock, p.costPrice, p.sellPrice, branchId]
      );
    }

    const today = new Date();
    const attStatuses = ["present", "present", "present", "present", "late", "absent", "leave"];
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() - dayOffset);
      if (date.getDay() === 5 || date.getDay() === 6) continue;
      const dateStr = toDateISO(date);

      for (let empIdx = 0; empIdx < Math.min(assignmentIds.length, 15); empIdx++) {
        const status = attStatuses[(empIdx + dayOffset) % attStatuses.length];
        const checkIn = status === "absent" ? null : `${dateStr}T${status === "late" ? "08:45" : "07:55"}:00`;
        const checkOut = status === "absent" ? null : `${dateStr}T16:05:00`;
        const lateMin = status === "late" ? 15 + (empIdx % 30) : 0;

        await client.query(
          `INSERT INTO attendance ("assignmentId","companyId","branchId",date,"checkIn","checkOut",status,"lateMinutes")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [assignmentIds[empIdx], companyId, branchId, dateStr, checkIn, checkOut, status, lateMin]
        );
      }
    }

    const { rows: leaveTypeRows } = await client.query(
      `SELECT id FROM hr_leave_types WHERE "companyId" = $1 LIMIT 4`, [companyId]
    );
    if (leaveTypeRows.length > 0 && employeeIds.length > 0) {
      const leaveStatuses = ["pending", "approved", "rejected", "approved", "pending"];
      for (let i = 0; i < Math.min(employeeIds.length, 10); i++) {
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + (i * 5) - 15);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1 + (i % 3));
        const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
        const leaveStatus = leaveStatuses[i % leaveStatuses.length];
        const leaveTypeId = leaveTypeRows[i % leaveTypeRows.length].id;

        await client.query(
          `INSERT INTO hr_leave_requests ("companyId","employeeId","leaveTypeId","startDate","endDate",days,reason,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [companyId, employeeIds[i], leaveTypeId,
            toDateISO(startDate),
            toDateISO(endDate),
            days,
            i % 2 === 0 ? "ظروف شخصية" : "موعد طبي",
            leaveStatus]
        );
      }
    }

    for (let i = 0; i < Math.min(clientIds.length, 8); i++) {
      const ref = `INV-2024-${String(i + 1).padStart(4, "0")}`;
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + (i * 7) - 20);
      const total = 5000 + i * 3000;
      const invStatuses = ["paid", "pending_approval", "overdue", "partial", "draft", "paid", "sent", "sent"];
      const subtotal = roundTo2(total / 1.15);
      const vatAmount = total - subtotal;

      await client.query(
        `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate")
         VALUES ($1,$2,$3,$4,$5,$6,$7,15,$8,$9,$10)
         ON CONFLICT DO NOTHING`,
        [companyId, clientIds[i], ref,
          `فاتورة مبيعات - ${clientData[i]?.name || "عميل"}`,
          subtotal, total, vatAmount,
          invStatuses[i] === "paid" ? total : invStatuses[i] === "partial" ? roundTo2(total * 0.4) : 0,
          invStatuses[i],
          toDateISO(dueDate)]
      );
    }

    await client.query("COMMIT");
    console.log("[SeedDemo] Demo data inserted successfully for company", companyId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
