-- Rating (1-5 estrelas) e quality_status para templates
ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS rating SMALLINT DEFAULT NULL CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS quality_status TEXT DEFAULT 'pendente' CHECK (quality_status IN ('limpo', 'precisa_limpar', 'pendente'));

-- Index para filtro por rating
CREATE INDEX IF NOT EXISTS idx_criativos_templates_rating ON criativos_templates (rating) WHERE rating IS NOT NULL;
