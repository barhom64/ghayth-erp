UPDATE chart_of_accounts
SET type = 'expense',
    name = 'فروقات التقريب',
    "nameEn" = 'Rounding Differences'
WHERE code = '9999'
  AND (type != 'expense' OR name != 'فروقات التقريب');
