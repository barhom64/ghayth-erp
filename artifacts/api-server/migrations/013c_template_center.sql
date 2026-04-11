DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "type" VARCHAR(50) DEFAULT 'letter';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "variables" JSONB DEFAULT '[]';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "branchId" INTEGER REFERENCES branches(id);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "htmlContent" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN DEFAULT false;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

INSERT INTO document_templates (name, description, content, category, "type", "variables", "htmlContent", "isDefault", "isActive")
SELECT t.name, t.description, t.content, t.category, t."type", t."variables", t."htmlContent", t."isDefault", t."isActive" FROM (VALUES
(
  'تعريف بالراتب',
  'خطاب تعريف بالراتب للموظف',
  'salary_certificate',
  'hr',
  'certificate',
  '[{"key":"employee.name","label":"اسم الموظف"},{"key":"employee.empNumber","label":"الرقم الوظيفي"},{"key":"employee.jobTitle","label":"المسمى الوظيفي"},{"key":"employee.departmentName","label":"القسم"},{"key":"employee.nationality","label":"الجنسية"},{"key":"employee.idNumber","label":"رقم الهوية"},{"key":"salary.basic","label":"الراتب الأساسي"},{"key":"salary.housing","label":"بدل السكن"},{"key":"salary.transport","label":"بدل النقل"},{"key":"salary.total","label":"إجمالي الراتب"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"},{"key":"date.todayHijri","label":"تاريخ اليوم هجري"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">تعريف بالراتب</h2></div>
<div style="line-height:2.2;font-size:12pt">
<p>التاريخ: {{date.today}}</p>
<p style="margin-top:20px">إلى من يهمه الأمر،</p>
<p style="margin-top:16px">نفيد نحن <strong>{{company.name}}</strong> بأن السيد/ة <strong>{{employee.name}}</strong> يعمل لدينا بوظيفة <strong>{{employee.jobTitle}}</strong> في قسم <strong>{{employee.departmentName}}</strong>، ويحمل الرقم الوظيفي <strong>{{employee.empNumber}}</strong>.</p>
<p style="margin-top:16px">وفيما يلي تفاصيل راتبه الشهري:</p>
<table style="width:60%;margin:16px auto;border-collapse:collapse">
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold">الراتب الأساسي</td><td style="border:1px solid #ccc;padding:8px;text-align:center">{{salary.basic}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold">بدل السكن</td><td style="border:1px solid #ccc;padding:8px;text-align:center">{{salary.housing}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold">بدل النقل</td><td style="border:1px solid #ccc;padding:8px;text-align:center">{{salary.transport}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold">إجمالي الراتب</td><td style="border:1px solid #ccc;padding:8px;text-align:center;font-weight:bold;color:#16a34a">{{salary.total}} ريال</td></tr>
</table>
<p style="margin-top:16px">أُعطي هذا التعريف بناءً على طلبه دون أدنى مسؤولية على الشركة.</p>
<p style="margin-top:8px">والله الموفق،</p>
</div>',
  true,
  true
),
(
  'إخلاء طرف',
  'نموذج إخلاء طرف للموظف المنتهية خدمته',
  'clearance',
  'hr',
  'clearance',
  '[{"key":"employee.name","label":"اسم الموظف"},{"key":"employee.empNumber","label":"الرقم الوظيفي"},{"key":"employee.jobTitle","label":"المسمى الوظيفي"},{"key":"employee.departmentName","label":"القسم"},{"key":"employee.hireDate","label":"تاريخ التعيين"},{"key":"employee.endDate","label":"تاريخ انتهاء الخدمة"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">نموذج إخلاء طرف</h2></div>
<div style="line-height:2.2;font-size:12pt">
<p>التاريخ: {{date.today}}</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0;padding:16px;border:1px solid #ddd;border-radius:8px;background:#fafafa">
<div><span style="color:#555">اسم الموظف:</span> <strong>{{employee.name}}</strong></div>
<div><span style="color:#555">الرقم الوظيفي:</span> <strong>{{employee.empNumber}}</strong></div>
<div><span style="color:#555">المسمى الوظيفي:</span> <strong>{{employee.jobTitle}}</strong></div>
<div><span style="color:#555">القسم:</span> <strong>{{employee.departmentName}}</strong></div>
<div><span style="color:#555">تاريخ التعيين:</span> <strong>{{employee.hireDate}}</strong></div>
<div><span style="color:#555">تاريخ انتهاء الخدمة:</span> <strong>{{employee.endDate}}</strong></div>
</div>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:10px;text-align:right">الجهة</th><th style="border:1px solid #ccc;padding:10px;text-align:center;width:100px">مخلى</th><th style="border:1px solid #ccc;padding:10px;text-align:center;width:100px">غير مخلى</th><th style="border:1px solid #ccc;padding:10px;text-align:right">ملاحظات</th></tr>
<tr><td style="border:1px solid #ccc;padding:10px">الموارد البشرية</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px"></td></tr>
<tr><td style="border:1px solid #ccc;padding:10px">الشؤون المالية</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px"></td></tr>
<tr><td style="border:1px solid #ccc;padding:10px">تقنية المعلومات</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px"></td></tr>
<tr><td style="border:1px solid #ccc;padding:10px">الإدارة العامة</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px"></td></tr>
<tr><td style="border:1px solid #ccc;padding:10px">المستودعات</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px;text-align:center">☐</td><td style="border:1px solid #ccc;padding:10px"></td></tr>
</table>
</div>',
  true,
  true
),
(
  'خطاب رسمي',
  'قالب خطاب رسمي عام',
  'official_letter',
  'general',
  'letter',
  '[{"key":"recipient.name","label":"اسم المرسل إليه"},{"key":"recipient.title","label":"صفة المرسل إليه"},{"key":"letter.subject","label":"الموضوع"},{"key":"letter.body","label":"نص الخطاب"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">خطاب رسمي</h2></div>
<div style="line-height:2.2;font-size:12pt">
<p>التاريخ: {{date.today}}</p>
<p style="margin-top:20px">السيد/ة: <strong>{{recipient.name}}</strong></p>
<p>{{recipient.title}}</p>
<p style="margin-top:16px">الموضوع: <strong>{{letter.subject}}</strong></p>
<p style="margin-top:8px">السلام عليكم ورحمة الله وبركاته،</p>
<div style="margin-top:16px;white-space:pre-wrap">{{letter.body}}</div>
<p style="margin-top:20px">وتقبلوا فائق الاحترام والتقدير،</p>
</div>',
  true,
  true
),
(
  'إنذار موظف',
  'خطاب إنذار رسمي للموظف',
  'warning',
  'hr',
  'warning',
  '[{"key":"employee.name","label":"اسم الموظف"},{"key":"employee.empNumber","label":"الرقم الوظيفي"},{"key":"employee.jobTitle","label":"المسمى الوظيفي"},{"key":"employee.departmentName","label":"القسم"},{"key":"warning.type","label":"نوع الإنذار"},{"key":"warning.reason","label":"سبب الإنذار"},{"key":"warning.date","label":"تاريخ المخالفة"},{"key":"warning.level","label":"مستوى الإنذار"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px;color:#dc2626">إنذار رسمي</h2></div>
<div style="line-height:2.2;font-size:12pt">
<p>التاريخ: {{date.today}}</p>
<p style="margin-top:16px">إلى السيد/ة: <strong>{{employee.name}}</strong></p>
<p>الرقم الوظيفي: {{employee.empNumber}}</p>
<p>المسمى الوظيفي: {{employee.jobTitle}} — القسم: {{employee.departmentName}}</p>
<div style="margin:20px 0;padding:16px;border:2px solid #dc2626;border-radius:8px;background:#fef2f2">
<p><strong>نوع الإنذار:</strong> {{warning.type}}</p>
<p><strong>مستوى الإنذار:</strong> {{warning.level}}</p>
<p><strong>تاريخ المخالفة:</strong> {{warning.date}}</p>
<p style="margin-top:12px"><strong>سبب الإنذار:</strong></p>
<p>{{warning.reason}}</p>
</div>
<p style="margin-top:16px">نحيطكم علماً بأنه في حال تكرار المخالفة سيتم اتخاذ الإجراءات النظامية اللازمة وفقاً لنظام العمل ولوائح الشركة الداخلية.</p>
<p style="margin-top:8px">نأمل منكم الالتزام بأنظمة وتعليمات الشركة.</p>
</div>',
  true,
  true
),
(
  'قرار تعيين',
  'قرار تعيين موظف جديد',
  'appointment',
  'hr',
  'decision',
  '[{"key":"employee.name","label":"اسم الموظف"},{"key":"employee.empNumber","label":"الرقم الوظيفي"},{"key":"employee.jobTitle","label":"المسمى الوظيفي"},{"key":"employee.departmentName","label":"القسم"},{"key":"employee.nationality","label":"الجنسية"},{"key":"employee.hireDate","label":"تاريخ التعيين"},{"key":"salary.basic","label":"الراتب الأساسي"},{"key":"salary.total","label":"إجمالي الراتب"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">قرار تعيين</h2></div>
<div style="line-height:2.2;font-size:12pt">
<p>التاريخ: {{date.today}}</p>
<p style="margin-top:16px">بناءً على الصلاحيات الممنوحة، وبعد استيفاء المتطلبات النظامية، تقرر ما يلي:</p>
<div style="margin:20px 0;padding:16px;border:1px solid #ddd;border-radius:8px;background:#f0fdf4">
<p><strong>المادة الأولى:</strong> يُعيّن السيد/ة <strong>{{employee.name}}</strong> ({{employee.nationality}}) بوظيفة <strong>{{employee.jobTitle}}</strong> في قسم <strong>{{employee.departmentName}}</strong>.</p>
<p style="margin-top:12px"><strong>المادة الثانية:</strong> يكون تاريخ مباشرة العمل اعتباراً من <strong>{{employee.hireDate}}</strong>.</p>
<p style="margin-top:12px"><strong>المادة الثالثة:</strong> يتقاضى راتباً أساسياً قدره <strong>{{salary.basic}}</strong> ريال، وإجمالي الراتب <strong>{{salary.total}}</strong> ريال شهرياً.</p>
<p style="margin-top:12px"><strong>المادة الرابعة:</strong> تسري عليه جميع أنظمة ولوائح الشركة الداخلية.</p>
</div>
<p style="margin-top:8px">والله الموفق،</p>
</div>',
  true,
  true
),
(
  'عرض سعر',
  'نموذج عرض سعر للعملاء',
  'quotation',
  'sales',
  'quotation',
  '[{"key":"client.name","label":"اسم العميل"},{"key":"client.company","label":"شركة العميل"},{"key":"quotation.ref","label":"رقم عرض السعر"},{"key":"quotation.items","label":"البنود"},{"key":"quotation.subtotal","label":"المجموع الفرعي"},{"key":"quotation.vat","label":"ضريبة القيمة المضافة"},{"key":"quotation.total","label":"الإجمالي"},{"key":"quotation.validUntil","label":"صالح حتى"},{"key":"quotation.notes","label":"ملاحظات"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">عرض سعر</h2></div>
<div style="line-height:2;font-size:12pt">
<div style="display:flex;justify-content:space-between;margin-bottom:20px">
<div><p>التاريخ: {{date.today}}</p><p>رقم العرض: <strong>{{quotation.ref}}</strong></p><p>صالح حتى: {{quotation.validUntil}}</p></div>
<div style="text-align:left"><p>العميل: <strong>{{client.name}}</strong></p><p>الشركة: {{client.company}}</p></div>
</div>
<p style="margin-bottom:12px">السادة / <strong>{{client.company}}</strong> المحترمين،</p>
<p>السلام عليكم ورحمة الله وبركاته، نتشرف بتقديم عرض السعر التالي:</p>
<div style="margin:16px 0">{{quotation.items}}</div>
<table style="width:50%;margin:16px 0 16px auto;border-collapse:collapse">
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5">المجموع الفرعي</td><td style="border:1px solid #ccc;padding:8px;text-align:center">{{quotation.subtotal}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5">ضريبة القيمة المضافة (15%)</td><td style="border:1px solid #ccc;padding:8px;text-align:center">{{quotation.vat}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:8px;background:#f5f5f5;font-weight:bold">الإجمالي</td><td style="border:1px solid #ccc;padding:8px;text-align:center;font-weight:bold;color:#16a34a">{{quotation.total}} ريال</td></tr>
</table>
<div style="margin-top:16px;padding:12px;background:#fffbeb;border:1px solid #fbbf24;border-radius:6px"><strong>ملاحظات:</strong> {{quotation.notes}}</div>
</div>',
  true,
  true
),
(
  'عقد موظف',
  'عقد عمل للموظف',
  'employee_contract',
  'hr',
  'contract',
  '[{"key":"employee.name","label":"اسم الموظف"},{"key":"employee.nationality","label":"الجنسية"},{"key":"employee.idNumber","label":"رقم الهوية"},{"key":"employee.jobTitle","label":"المسمى الوظيفي"},{"key":"employee.departmentName","label":"القسم"},{"key":"employee.hireDate","label":"تاريخ بداية العقد"},{"key":"contract.endDate","label":"تاريخ نهاية العقد"},{"key":"contract.duration","label":"مدة العقد"},{"key":"salary.basic","label":"الراتب الأساسي"},{"key":"salary.housing","label":"بدل السكن"},{"key":"salary.transport","label":"بدل النقل"},{"key":"salary.total","label":"إجمالي الراتب"},{"key":"contract.probation","label":"فترة التجربة"},{"key":"contract.vacationDays","label":"أيام الإجازة السنوية"},{"key":"company.name","label":"اسم الشركة"},{"key":"date.today","label":"تاريخ اليوم"}]'::jsonb,
  '<div style="text-align:center;margin-bottom:30px"><h2 style="font-size:16pt;font-weight:bold;border-bottom:2px solid #333;display:inline-block;padding-bottom:8px">عقد عمل</h2></div>
<div style="line-height:2.2;font-size:11pt">
<p>التاريخ: {{date.today}}</p>
<p style="margin-top:12px">تم الاتفاق بين كل من:</p>
<p><strong>الطرف الأول (صاحب العمل):</strong> {{company.name}}</p>
<p><strong>الطرف الثاني (الموظف):</strong> {{employee.name}} — الجنسية: {{employee.nationality}} — رقم الهوية: {{employee.idNumber}}</p>
<p style="margin-top:16px;font-weight:bold;text-decoration:underline">البند الأول: مسمى الوظيفة</p>
<p>يعمل الطرف الثاني بوظيفة <strong>{{employee.jobTitle}}</strong> في قسم <strong>{{employee.departmentName}}</strong>.</p>
<p style="margin-top:12px;font-weight:bold;text-decoration:underline">البند الثاني: مدة العقد</p>
<p>مدة هذا العقد <strong>{{contract.duration}}</strong> تبدأ من <strong>{{employee.hireDate}}</strong> وتنتهي في <strong>{{contract.endDate}}</strong>.</p>
<p>فترة التجربة: <strong>{{contract.probation}}</strong>.</p>
<p style="margin-top:12px;font-weight:bold;text-decoration:underline">البند الثالث: الأجر</p>
<table style="width:60%;margin:8px 0;border-collapse:collapse">
<tr><td style="border:1px solid #ccc;padding:6px;background:#f5f5f5">الراتب الأساسي</td><td style="border:1px solid #ccc;padding:6px;text-align:center">{{salary.basic}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:6px;background:#f5f5f5">بدل السكن</td><td style="border:1px solid #ccc;padding:6px;text-align:center">{{salary.housing}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:6px;background:#f5f5f5">بدل النقل</td><td style="border:1px solid #ccc;padding:6px;text-align:center">{{salary.transport}} ريال</td></tr>
<tr><td style="border:1px solid #ccc;padding:6px;background:#f5f5f5;font-weight:bold">الإجمالي</td><td style="border:1px solid #ccc;padding:6px;text-align:center;font-weight:bold">{{salary.total}} ريال</td></tr>
</table>
<p style="margin-top:12px;font-weight:bold;text-decoration:underline">البند الرابع: الإجازات</p>
<p>يستحق الطرف الثاني إجازة سنوية مدتها <strong>{{contract.vacationDays}}</strong> يوماً.</p>
<p style="margin-top:12px;font-weight:bold;text-decoration:underline">البند الخامس: أحكام عامة</p>
<p>يخضع هذا العقد لأحكام نظام العمل السعودي ولوائحه التنفيذية، وما لم يرد فيه نص يُرجع إلى أحكام النظام.</p>
<p style="margin-top:12px">حُرر هذا العقد من نسختين بيد كل طرف نسخة للعمل بموجبها.</p>
</div>',
  true,
  true
)
) AS t(name, description, content, category, "type", "variables", "htmlContent", "isDefault", "isActive")
WHERE NOT EXISTS (SELECT 1 FROM document_templates dt WHERE dt.content = t.content AND dt."isDefault" = true);
