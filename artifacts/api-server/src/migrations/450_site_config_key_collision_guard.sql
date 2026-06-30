-- @rollback: DROP TRIGGER IF EXISTS site_config_key_collision ON site_config; DROP FUNCTION IF EXISTS site_config_key_collision_check();

-- حارس تضارب المفاتيح عبر العمودين في site_config.
-- كل عمود (slug / customDomain) فريد منفرداً، لكن لا قيد يمنع أن يساوي slug
-- مستأجرٍ customDomain مستأجرٍ آخر. مع أن حلّ المستأجر العام صار مفصولاً حسب
-- العمود (slug-only و host-only) فإن هذا الحارس دفاعٌ في العمق: يمنع المشغّل
-- من ربط نطاق مخصّص يطابق slug مستأجر آخر (لبس/إساءة استخدام).
CREATE OR REPLACE FUNCTION site_config_key_collision_check() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM site_config
    WHERE "companyId" <> NEW."companyId" AND "customDomain" IS NOT NULL
      AND LOWER("customDomain") = LOWER(NEW.slug)
  ) THEN
    RAISE EXCEPTION 'slug "%" collides with another tenant customDomain', NEW.slug
      USING ERRCODE = 'unique_violation';
  END IF;
  IF NEW."customDomain" IS NOT NULL AND EXISTS (
    SELECT 1 FROM site_config
    WHERE "companyId" <> NEW."companyId" AND slug IS NOT NULL
      AND LOWER(slug) = LOWER(NEW."customDomain")
  ) THEN
    RAISE EXCEPTION 'customDomain "%" collides with another tenant slug', NEW."customDomain"
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_config_key_collision ON site_config;
CREATE TRIGGER site_config_key_collision
  BEFORE INSERT OR UPDATE OF slug, "customDomain" ON site_config
  FOR EACH ROW EXECUTE FUNCTION site_config_key_collision_check();
