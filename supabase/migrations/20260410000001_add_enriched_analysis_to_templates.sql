-- Adiciona campos de análise visual enriquecida V2 à tabela criativos_templates
-- Preenchidos por /api/template-analyze (Gemini Vision) no upload
-- Campos JSONB para dados granulares: fundo, grid de texto, pessoa detalhada, espaçamento

ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS background JSONB,
  ADD COLUMN IF NOT EXISTS text_layout JSONB,
  ADD COLUMN IF NOT EXISTS person JSONB,
  ADD COLUMN IF NOT EXISTS spacing JSONB,
  ADD COLUMN IF NOT EXISTS logo_size_pct NUMERIC;

COMMENT ON COLUMN criativos_templates.background IS 'Análise V2: tipo de fundo (solid/gradient/photo/texture), descrição, cores';
COMMENT ON COLUMN criativos_templates.text_layout IS 'Análise V2: array de blocos de texto com role, posição, grid_area, size_pct, estilo';
COMMENT ON COLUMN criativos_templates.person IS 'Análise V2: dados detalhados da pessoa (framing, grid_position, coverage_pct, pose, clothing, expression, gaze)';
COMMENT ON COLUMN criativos_templates.spacing IS 'Análise V2: espaçamento (text_blocks_gap, margin_edges_pct, overall_density)';
COMMENT ON COLUMN criativos_templates.logo_size_pct IS 'Análise V2: tamanho do logo como % da largura do quadro';
