DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='purchaseCost') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='purchasePrice') THEN
      ALTER TABLE fixed_assets RENAME COLUMN "purchasePrice" TO "purchaseCost";
    ELSE
      ALTER TABLE fixed_assets ADD COLUMN "purchaseCost" NUMERIC(15,2) NOT NULL DEFAULT 0;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='currentBookValue') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='currentValue') THEN
      ALTER TABLE fixed_assets RENAME COLUMN "currentValue" TO "currentBookValue";
    ELSE
      ALTER TABLE fixed_assets ADD COLUMN "currentBookValue" NUMERIC(15,2);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='description') THEN
    ALTER TABLE fixed_assets ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='disposedAt') THEN
    ALTER TABLE fixed_assets ADD COLUMN "disposedAt" DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='disposalValue') THEN
    ALTER TABLE fixed_assets ADD COLUMN "disposalValue" NUMERIC(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='assetAccountCode') THEN
    ALTER TABLE fixed_assets ADD COLUMN "assetAccountCode" VARCHAR(20) DEFAULT '1500';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='depreciationAccountCode') THEN
    ALTER TABLE fixed_assets ADD COLUMN "depreciationAccountCode" VARCHAR(20) DEFAULT '6100';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fixed_assets' AND column_name='accDepreciationAccountCode') THEN
    ALTER TABLE fixed_assets ADD COLUMN "accDepreciationAccountCode" VARCHAR(20) DEFAULT '1590';
  END IF;
END $$;
