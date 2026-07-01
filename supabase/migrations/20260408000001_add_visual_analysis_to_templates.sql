-- Adiciona campos de análise visual automática à tabela criativos_templates
-- Preenchidos por /api/template-analyze (Gemini Vision) no upload

ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS has_logo BOOLEAN,
  ADD COLUMN IF NOT EXISTS logo_position TEXT,
  ADD COLUMN IF NOT EXISTS has_person BOOLEAN,
  ADD COLUMN IF NOT EXISTS person_pose TEXT,
  ADD COLUMN IF NOT EXISTS dominant_colors TEXT[],
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

COMMENT ON COLUMN criativos_templates.has_logo IS 'Detectado por IA: se o template original contém logo/marca visual';
COMMENT ON COLUMN criativos_templates.logo_position IS 'Posição do logo no template (ex: topo-esquerda, rodapé-centro)';
COMMENT ON COLUMN criativos_templates.has_person IS 'Detectado por IA: se o template tem pessoa/foto humana';
COMMENT ON COLUMN criativos_templates.person_pose IS 'Descrição da pose/enquadramento da pessoa para guiar face-swap';
COMMENT ON COLUMN criativos_templates.dominant_colors IS 'Cores dominantes detectadas (hex)';
COMMENT ON COLUMN criativos_templates.analyzed_at IS 'Timestamp da última análise via Vision API';

CREATE INDEX IF NOT EXISTS idx_criativos_templates_analyzed
  ON criativos_templates (analyzed_at)
  WHERE analyzed_at IS NULL;
