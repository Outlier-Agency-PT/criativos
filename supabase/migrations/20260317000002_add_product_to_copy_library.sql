-- EP-02.08: Add product field to copy_library for expanded registration
ALTER TABLE copy_library ADD COLUMN IF NOT EXISTS product text;

-- Index for filtering by product
CREATE INDEX IF NOT EXISTS idx_copy_library_product ON copy_library (product) WHERE product IS NOT NULL;
