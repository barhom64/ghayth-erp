-- ===========================================================================
-- 455_seed_wafd_site_cms.sql
-- ---------------------------------------------------------------------------
-- WHAT:  Fills the EMPTY site CMS sections for company 4 (وفد الحديثة للاستثمار)
--        with the REAL content already present in the wafd-site React artifact:
--          • site_faqs        — 9 Q&A (4 from Packages page + 5 from HajjTips)
--          • site_team        — the 1 real team member (المؤسس والمدير التنفيذي)
--          • site_gallery     — the 5 real site images (كعبة/مدينة/مجموعات/فندق/نقل)
--        NOT seeded (honest — no invented data): testimonials (no real pilgrim
--        reviews exist in the project), banners (promotional, no source),
--        nav_items (frontend already renders a hardcoded nav — DB rows would
--        duplicate it).
-- WHY:   موائمة بدون تكرار — المحتوى الثابت في قالب الموقع صار محرَّرًا من لوحة
--        تحكم غيث. الأقسام الديناميكية (الأسئلة/الفريق/المعرض) كانت فارغة فلا
--        تظهر (كل مكوّن: if (!x.length) return null) — الآن تظهر ببيانات حقيقية.
-- SAFETY: data-only, per-table idempotent guards (NOT EXISTS for company 4).
--        Runs ONLY when company 4 exists. No-ops on fresh/CI DBs without it.
-- @rollback: DELETE FROM site_gallery WHERE "companyId"=4; DELETE FROM site_team WHERE "companyId"=4; DELETE FROM site_faqs WHERE "companyId"=4;
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = 4) THEN
    RAISE NOTICE '455: company 4 absent — skipping wafd CMS seed';
    RETURN;
  END IF;

  -- ── الأسئلة الشائعة ────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM site_faqs WHERE "companyId" = 4) THEN
    INSERT INTO site_faqs ("companyId", question, answer, category, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
      (4, 'هل يمكن تخصيص الباقة؟', 'نعم، جميع باقاتنا قابلة للتخصيص. تواصل معنا عبر واتساب لتصميم باقتك المثالية.', 'الباقات', 1, TRUE, now(), now()),
      (4, 'كم يستغرق استخراج التأشيرة؟', 'عادةً تستغرق التأشيرة من ٣ إلى ٧ أيام عمل. في الباقة المميزة نوفر خدمة التأشيرة المعجّلة خلال ٢٤-٤٨ ساعة.', 'الباقات', 2, TRUE, now(), now()),
      (4, 'هل الأسعار شاملة للضريبة؟', 'نعم، جميع الأسعار المعروضة شاملة لضريبة القيمة المضافة (١٥%) وجميع الرسوم.', 'الباقات', 3, TRUE, now(), now()),
      (4, 'ما طرق الدفع المتاحة؟', 'نقبل التحويل البنكي، مدى، وبطاقات الائتمان. يمكن تقسيم المبلغ على دفعات.', 'الباقات', 4, TRUE, now(), now()),
      (4, 'ما هي الوثائق المطلوبة للحج والعمرة؟', 'تحتاج إلى جواز سفر ساري المفعول لمدة لا تقل عن 6 أشهر، وتأشيرة العمرة أو الحج الرسمية، وصور شخصية، وشهادة اللقاحات.', 'الحج والعمرة', 5, TRUE, now(), now()),
      (4, 'ما هو أفضل وقت لأداء العمرة؟', 'يمكن أداء العمرة في أي وقت من السنة، لكن أفضل الأوقات هي شهر رمضان المبارك.', 'الحج والعمرة', 6, TRUE, now(), now()),
      (4, 'كم تستغرق رحلة العمرة عادةً؟', 'تتراوح مدة رحلة العمرة عادةً بين 7 و14 يوماً.', 'الحج والعمرة', 7, TRUE, now(), now()),
      (4, 'هل يمكن للمرأة أداء العمرة بدون محرم؟', 'وفقاً للأنظمة السعودية الحديثة، يمكن للمرأة التي تجاوزت 45 عاماً السفر ضمن مجموعة منظمة بدون محرم.', 'الحج والعمرة', 8, TRUE, now(), now()),
      (4, 'ما هي تكلفة رحلة العمرة؟', 'تتفاوت التكاليف بحسب الموسم ومستوى الفندق ومدة الإقامة.', 'الحج والعمرة', 9, TRUE, now(), now());
    RAISE NOTICE '455: seeded 9 site_faqs for company 4';
  END IF;

  -- ── فريق العمل ─────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM site_team WHERE "companyId" = 4) THEN
    INSERT INTO site_team ("companyId", name, role, bio, "photoUrl", socials, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
      (4, 'غيث الحربي', 'المؤسس والمدير التنفيذي', NULL, NULL, '{}'::jsonb, 1, TRUE, now(), now());
    RAISE NOTICE '455: seeded 1 site_team member for company 4';
  END IF;

  -- ── معرض الصور ─────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM site_gallery WHERE "companyId" = 4) THEN
    INSERT INTO site_gallery ("companyId", title, "imageUrl", category, "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
      (4, 'الكعبة المشرفة', 'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hero-kaaba-HJyJeNN97h7PfMrmAAMs2W.webp', 'رحلات', 1, TRUE, now(), now()),
      (4, 'المدينة المنورة', 'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-madinah-mLYiJhvGYuvzquRMzJikST.webp', 'رحلات', 2, TRUE, now(), now()),
      (4, 'مجموعات ضيوف الرحمن', 'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-umrah-group-BnpX9ASFQabKmJ7XA7wh9j.webp', 'رحلات', 3, TRUE, now(), now()),
      (4, 'فنادق مكة المكرمة', 'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-hotel-makkah-WYrvVrLjdJdmpSUqPRnpcC.webp', 'رحلات', 4, TRUE, now(), now()),
      (4, 'خدمات النقل', 'https://d2xsxph8kpxj0f.cloudfront.net/310419663030823861/YHZMogv6aVcNXaRZ3427z7/wafd-transport-QQDUMvQJAjEuRcZsn5eb8H.webp', 'رحلات', 5, TRUE, now(), now());
    RAISE NOTICE '455: seeded 5 site_gallery items for company 4';
  END IF;
END $$;
