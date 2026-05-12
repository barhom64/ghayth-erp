-- Migration 134: Seed ZATCA settings (sandbox mode) per company
-- Required for: /finance/zatca/* — invoices non-compliant without settings

INSERT INTO zatca_settings ("companyId", enabled, environment, "vatRegistrationNumber",
  "organizationName", "organizationNameEn", "streetName", "buildingNumber",
  "cityName", "postalCode")
SELECT c.id, false, 'sandbox', NULL,
  c.name, c."nameEn", NULL, NULL, NULL, NULL
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM zatca_settings zs WHERE zs."companyId" = c.id
);
