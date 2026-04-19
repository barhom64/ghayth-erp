-- 081_contract_templates.sql
-- Two ready-to-use Arabic contract templates seeded into document_templates:
--   1. عقد تقديم خدمات قانونية واستشارات (legal_services_contract)
--   2. عقد عمل موظف (employment_contract)
--
-- The variables array is informational; the template engine substitutes
-- {{var.path}} placeholders at render time. Templates are marked
-- isDefault=true so the pattern used by 013c_template_center.sql (dedup
-- against existing default templates by content) will skip re-inserts on
-- repeat runs.

INSERT INTO document_templates (
  name, description, content, category, "type", variables,
  "htmlContent", "isDefault", "isActive"
)
SELECT
  t.name, t.description, t.content, t.category, t."type",
  t.variables::jsonb, t."htmlContent", true, true
FROM (VALUES
  (
    'عقد تقديم خدمات قانونية واستشارات',
    'قالب عقد محاماة بنظام الساعات الشهرية — 21 مادة — يُعبأ تلقائيًا من كيانات النظام',
    E'عقد تقديم خدمات قانونية واستشارات\n\nبسم الله الرحمن الرحيم\n\nأبرم هذا العقد في مدينة {{city}} بتاريخ {{date_hijri}} هـ الموافق {{date_gregorian}} م بين كل من:\n\nالطرف الأول (المحامي/المكتب): {{lawyer_name}}\nرقم الترخيص: {{lawyer_license}}\nالسجل التجاري: {{lawyer_cr}}\nالعنوان: {{lawyer_address}}\nالجوال: {{lawyer_phone}}\nالبريد الإلكتروني: {{lawyer_email}}\n\nالطرف الثاني (العميل): {{client_name}}\nرقم الهوية/السجل: {{client_id}}\nالعنوان: {{client_address}}\nالجوال: {{client_phone}}\nالبريد الإلكتروني: {{client_email}}\nيمثله: {{client_representative}}\n\nالمادة الأولى — التمهيد:\nيُعد التمهيد جزءًا لا يتجزأ من هذا العقد ومكملًا لأحكامه.\n\nالمادة الثانية — موضوع العقد:\nيلتزم الطرف الأول بتقديم خدمات قانونية واستشارية للطرف الثاني وفق الشروط والبنود الواردة في هذا العقد.\n\nالمادة الثالثة — عدد الساعات الشهرية:\nيُخصص للطرف الثاني عدد ({{monthly_hours}}) ساعة شهريًا من الخدمات القانونية والاستشارية.\n\nالمادة الرابعة — الساعات الإضافية:\nتُحتسب الساعة الإضافية بمبلغ ({{extra_hour_rate}}) ريال سعودي.\n\nالمادة الخامسة — الجلسات السنوية:\nيلتزم الطرف الأول بحضور ({{annual_sessions}}) جلسة قضائية سنويًا لصالح الطرف الثاني.\n\nالمادة السادسة — الأتعاب:\nتبلغ الأتعاب الشهرية ({{monthly_fee}}) ريال سعودي ({{fee_words}}) شاملة ضريبة القيمة المضافة.\n\nالمادة السابعة — آلية السداد:\nتُسدد الأتعاب خلال ({{payment_delay_days}}) يومًا من تاريخ إصدار الفاتورة، تحويلًا على حساب الطرف الأول:\nالبنك: {{bank_name}}\nرقم الحساب/الآيبان: {{bank_account}}\n\nالمادة الثامنة — التأخر في السداد:\nفي حال تأخر الطرف الثاني عن السداد تُطبق غرامة تأخير بنسبة ({{delay_penalty_percent}}%) من قيمة المستحقات عن كل شهر تأخير.\n\nالمادة التاسعة — مدة العقد:\nمدة هذا العقد ({{contract_duration_months}}) شهرًا تبدأ من تاريخ التوقيع، ويُجدد تلقائيًا لمدة مماثلة ما لم يُخطر أحد الطرفين الآخر كتابيًا قبل ثلاثين يومًا من انتهائه.\n\nالمادة العاشرة — نطاق الخدمات:\nتشمل الخدمات: الاستشارات القانونية، مراجعة العقود، صياغة المذكرات، التمثيل أمام الجهات القضائية وشبه القضائية، ومتابعة القضايا المحالة.\n\nالمادة الحادية عشرة — التزامات الطرف الأول:\nيلتزم الطرف الأول ببذل العناية المهنية المعتادة، وتقديم المشورة القانونية في الوقت المناسب، والحفاظ على سرية المعلومات.\n\nالمادة الثانية عشرة — التزامات الطرف الثاني:\nيلتزم الطرف الثاني بتزويد الطرف الأول بالمستندات والمعلومات اللازمة، وسداد الأتعاب في مواعيدها.\n\nالمادة الثالثة عشرة — السرية:\nيلتزم الطرف الأول بالحفاظ على سرية كل المعلومات التي يطلع عليها لمدة ({{confidentiality_years}}) سنوات من تاريخ انتهاء العقد.\n\nالمادة الرابعة عشرة — تعارض المصالح:\nلا يجوز للطرف الأول قبول أي وكالة تتعارض مع مصالح الطرف الثاني لمدة ({{conflict_months}}) شهرًا من تاريخ انتهاء العقد.\n\nالمادة الخامسة عشرة — التقارير الدورية:\nيقدم الطرف الأول تقريرًا دوريًا ({{report_frequency}}) يوضح فيه ساعات العمل المنجزة والمهام المكتملة.\n\nالمادة السادسة عشرة — الفسخ:\nيحق لأي طرف فسخ هذا العقد بإشعار كتابي قبل ثلاثين يومًا، مع تسوية المستحقات حتى تاريخ الفسخ.\n\nالمادة السابعة عشرة — القوة القاهرة:\nلا يكون أي طرف مسؤولًا عن عدم الوفاء بالتزاماته إذا نتج ذلك عن قوة قاهرة.\n\nالمادة الثامنة عشرة — تعديل العقد:\nلا يجوز تعديل أي بند من بنود هذا العقد إلا بموافقة كتابية من الطرفين.\n\nالمادة التاسعة عشرة — النزاعات:\nفي حال نشوء أي نزاع يُسعى لحله وديًا، وإلا يُحال إلى الجهات القضائية المختصة في المملكة العربية السعودية.\n\nالمادة العشرون — النفاذ:\nيسري هذا العقد من تاريخ توقيعه ويظل ساريًا طوال مدته المحددة في المادة التاسعة.\n\nالمادة الحادية والعشرون — النسخ:\nحُرر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها.\n\nالطرف الأول — {{lawyer_name}}\nالتوقيع: ____________________\n\nالطرف الثاني — {{client_name}}\nالتوقيع: ____________________',
    'legal',
    'legal_services_contract',
    '["lawyer_name","lawyer_license","lawyer_cr","lawyer_address","lawyer_phone","lawyer_email","client_name","client_id","client_address","client_phone","client_email","client_representative","monthly_hours","extra_hour_rate","annual_sessions","monthly_fee","fee_words","payment_delay_days","delay_penalty_percent","contract_duration_months","confidentiality_years","conflict_months","report_frequency","city","bank_name","bank_account","date_hijri","date_gregorian"]',
    NULL
  ),
  (
    'عقد عمل موظف',
    'قالب عقد عمل — 10 بنود — يُعبأ تلقائيًا من بيانات المنشأة والموظف والتعيين',
    E'عقد عمل\n\nبسم الله الرحمن الرحيم\n\nأبرم هذا العقد في مدينة {{city}} بتاريخ {{date_hijri}} هـ الموافق {{date_gregorian}} م بين كل من:\n\nالطرف الأول (صاحب العمل): {{company_name}}\nالسجل التجاري: {{company_cr}}\nالعنوان: {{company_address}}\nيمثله: {{representative_name}}\nرقم الهوية: {{representative_id}}\nالجوال: {{representative_phone}}\n\nالطرف الثاني (الموظف): {{employee_name}}\nرقم الهوية/الإقامة: {{employee_id}}\nالجوال: {{employee_phone}}\nالعنوان: {{employee_address}}\n\nالبند الأول — التمهيد:\nيُعد التمهيد جزءًا لا يتجزأ من هذا العقد ومكملًا لأحكامه، ويخضع العقد لأحكام نظام العمل في المملكة العربية السعودية ولائحته التنفيذية.\n\nالبند الثاني — المسمى الوظيفي وطبيعة العمل:\nيعمل الطرف الثاني لدى الطرف الأول بمسمى ({{job_title}}) وتشمل مهامه: {{job_description}}\n\nالبند الثالث — مدة العقد وفترة التجربة:\nمدة العقد ({{contract_duration}})، تبدأ من تاريخ مباشرة العمل. يخضع الطرف الثاني لفترة تجربة مدتها ({{probation_days}}) يومًا يحق خلالها لأي طرف إنهاء العقد دون إشعار.\n\nالبند الرابع — ساعات العمل:\nساعات العمل الرسمية ({{working_hours}}) ساعة أسبوعيًا موزعة وفق جدول الدوام المعتمد لدى الطرف الأول، مع ضمان حقوق الراحة اليومية والأسبوعية وفق النظام.\n\nالبند الخامس — الأجر والبدلات:\nالراتب الأساسي ({{base_salary}}) ريال سعودي ({{salary_words}}) يُدفع في نهاية كل شهر ميلادي. إذا كانت طبيعة العمل تستحق عمولة فتُحتسب بنسبة ({{commission_percent}}%) وفق اللائحة الداخلية.\n\nالبند السادس — الإجازات:\nيستحق الطرف الثاني إجازة سنوية مدفوعة الأجر قدرها ({{annual_leave_days}}) يومًا عن كل سنة كاملة، إضافة إلى الإجازات الأخرى المقررة نظامًا (مرضية، عارضة، أمومة، حداد…).\n\nالبند السابع — الالتزامات العامة:\nيلتزم الطرف الثاني بتنفيذ مهامه بأمانة وإتقان، والمحافظة على ممتلكات الطرف الأول، والتقيد باللوائح والتعليمات الداخلية، وعدم إفشاء أسرار العمل.\n\nالبند الثامن — الإنهاء ومهلة الإشعار:\nيحق لأي من الطرفين إنهاء العقد بإشعار كتابي مسبق مدته ({{notice_period_days}}) يومًا، مع الاحتفاظ بحق إنهائه دون إشعار في الحالات الواردة في نظام العمل.\n\nالبند التاسع — عدم المنافسة:\nيلتزم الطرف الثاني بعدم العمل لدى أي جهة منافسة للطرف الأول لمدة ({{non_compete_years}}) سنة من تاريخ انتهاء هذا العقد، ضمن النطاق الجغرافي والمهني الذي يحدده النظام.\n\nالبند العاشر — النسخ والنفاذ:\nحُرر هذا العقد من نسختين أصليتين، بيد كل طرف نسخة للعمل بموجبها. يسري العقد اعتبارًا من تاريخ مباشرة العمل ويخضع في تفسيره وتنفيذه لأحكام نظام العمل السعودي.\n\nالطرف الأول — {{company_name}}\nيمثله: {{representative_name}}\nالتوقيع: ____________________\n\nالطرف الثاني — {{employee_name}}\nالتوقيع: ____________________',
    'hr',
    'employment_contract',
    '["company_name","company_cr","company_address","representative_name","representative_id","representative_phone","employee_name","employee_id","employee_phone","employee_address","job_title","job_description","contract_duration","probation_days","working_hours","base_salary","salary_words","commission_percent","annual_leave_days","notice_period_days","non_compete_years","date_hijri","date_gregorian","city"]',
    NULL
  )
) AS t(name, description, content, category, "type", variables, "htmlContent")
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
  WHERE dt."type" = t."type" AND dt."isDefault" = true
);
