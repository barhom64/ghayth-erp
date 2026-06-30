-- ===========================================================================
-- 449_seed_wafd_site.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Seeds company 4 (وفد الحديثة للاستثمار) site_config + the REAL content
--        currently hardcoded in the wafd-site React artifact (packages
--        1990/2990/4990, services, hotel samples). Honest migration: nothing
--        visually changes — the same content is now DB-driven and editable.
-- WHY:   First vertical of the site CMS — Ghayth controls the Wafd site.
-- SAFETY: data-only, guarded. Runs ONLY when company 4 exists AND no site_config
--        row exists for it (idempotent). No-ops on fresh/CI DBs without company 4.
-- @rollback: DELETE FROM site_posts WHERE "companyId"=4; DELETE FROM site_hotels WHERE "companyId"=4; DELETE FROM site_services WHERE "companyId"=4; DELETE FROM site_packages WHERE "companyId"=4; DELETE FROM site_config WHERE "companyId"=4;
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE id = 4)
     AND NOT EXISTS (SELECT 1 FROM site_config WHERE "companyId" = 4) THEN

    INSERT INTO site_config (
      "companyId", enabled, template, slug, "brandName", tagline, "logoUrl",
      "primaryColor", phone, whatsapp, "heroTitle", "heroSubtitle",
      "metaTitle", "metaDescription"
    ) VALUES (
      4, TRUE, 'managed', 'wafd',
      'وفد الحديثة للاستثمار',
      'وفد لخدمات العمرة — مرحباً بضيوف الرحمن',
      'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-logo-white_3c591659.png',
      'oklch(0.52 0.12 185)',
      '+966 12 536 9972', '966125369972',
      'مرحباً بضيوف الرحمن',
      'باقات عمرة متكاملة بخدمة احترافية',
      'وفد الحديثة للاستثمار — خدمات وباقات العمرة',
      'باقات عمرة متكاملة، تأشيرات، نقل، وحجوزات فنادق قرب الحرمين الشريفين.'
    );

    -- الباقات (نفس محتوى صفحة الباقات الحالي) -------------------------------
    INSERT INTO site_packages ("companyId", slug, name, subtitle, price, currency, "durationLabel", "durationDays", badge, features, "notIncluded", "sortOrder") VALUES
      (4, 'economy', 'الباقة الاقتصادية', 'رحلة عمرة ميسّرة', 1990, 'SAR', '٧ أيام', 7, NULL,
        '["تأشيرة عمرة","طيران ذهاب وعودة","فندق 4 نجوم","تنقلات من وإلى المطار","زيارة المساجد والمعالم"]'::jsonb,
        '["مرشد خاص","وجبات"]'::jsonb, 1),
      (4, 'standard', 'الباقة الأساسية', 'الأنسب للعائلات', 2990, 'SAR', '١٠ أيام', 10, 'الأكثر طلباً',
        '["تأشيرة عمرة","طيران ذهاب وعودة","فندق 5 نجوم","تنقلات مكيّفة","زيارة المساجد والمعالم","تأمين السفر"]'::jsonb,
        '["وجبات"]'::jsonb, 2),
      (4, 'vip', 'الباقة المميزة VIP', 'تجربة فاخرة متكاملة', 4990, 'SAR', '١٤ يوم', 14, 'VIP',
        '["تأشيرة عمرة سريعة","طيران درجة رجال الأعمال","فندق 5 نجوم مطل على الحرم","نقل خاص على مدار الساعة","مرشد خاص وجولات","تأمين السفر","دعم على مدار الساعة","وجبات"]'::jsonb,
        '[]'::jsonb, 3);

    -- الخدمات (نفس محتوى صفحة الخدمات الحالي) -------------------------------
    INSERT INTO site_services ("companyId", slug, title, subtitle, description, icon, link, features, "sortOrder") VALUES
      (4, 'visa', 'تأشيرة العمرة', 'متاحة', 'استخراج تأشيرة العمرة بسرعة وسهولة مع متابعة كاملة لكل الإجراءات.', '🛂', NULL,
        '["إصدار سريع للتأشيرة","متابعة كاملة للطلب","دعم مستمر","أسعار تنافسية"]'::jsonb, 1),
      (4, 'transport', 'النقل والمواصلات', 'متاحة', 'خدمات نقل مريحة ومكيّفة بين المطار والفنادق والحرمين الشريفين.', '🚐', NULL,
        '["تنقلات من وإلى المطار","حافلات مكيّفة حديثة","نقل بين الحرمين","سائقون محترفون"]'::jsonb, 2),
      (4, 'hotels', 'حجز الفنادق', 'متاحة', 'فنادق منتقاة قريبة من الحرمين الشريفين تناسب مختلف الميزانيات.', '🏨', '/hotels',
        '["فنادق قرب الحرم","تصنيفات متعددة","أسعار مناسبة","حجز مرن"]'::jsonb, 3),
      (4, 'programs', 'برامج العمرة', 'متاحة', 'باقات عمرة متكاملة بمدد وخيارات متنوعة تناسب الأفراد والعائلات.', '📋', '/packages',
        '["باقات متكاملة","خيارات متعددة","مدد مرنة","أسعار شاملة"]'::jsonb, 4);

    -- الفنادق (نماذج مكة والمدينة المعروضة حالياً) ---------------------------
    INSERT INTO site_hotels ("companyId", slug, name, city, "distanceLabel", stars, badge, "imageUrl", "sortOrder") VALUES
      (4, 'luxury-makkah', 'فندق وفد الفاخر — مكة', 'مكة المكرمة', 'قريب جداً من الحرم', 5, 'فاخر',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp', 1),
      (4, 'standard-makkah', 'فندق وفد القياسي — مكة', 'مكة المكرمة', 'قريب من الحرم المكي', 4, 'قياسي',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp', 2),
      (4, 'economy-makkah', 'فندق وفد الاقتصادي — مكة', 'مكة المكرمة', 'ضمن منطقة الحرم', 3, 'اقتصادي',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp', 3),
      (4, 'luxury-madinah', 'فندق وفد الفاخر — المدينة', 'المدينة المنورة', 'قريب من المسجد النبوي', 5, 'فاخر',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp', 4),
      (4, 'standard-madinah', 'فندق وفد القياسي — المدينة', 'المدينة المنورة', 'قريب من المسجد النبوي', 4, 'قياسي',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp', 5),
      (4, 'economy-madinah', 'فندق وفد الاقتصادي — المدينة', 'المدينة المنورة', 'ضمن منطقة المسجد النبوي', 3, 'اقتصادي',
        'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp', 6);

  END IF;
END $$;
