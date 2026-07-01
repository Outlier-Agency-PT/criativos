-- Adiciona suporte a multiplos formatos por projeto
-- e dimensoes individuais por criativo

-- 1. Coluna selected_formats no projeto (array de formatos)
ALTER TABLE criativos_generation_projects
  ADD COLUMN IF NOT EXISTS selected_formats JSONB;

-- 2. Dimensoes proprias por criativo (override do projeto)
ALTER TABLE criativos_creatives
  ADD COLUMN IF NOT EXISTS width INT,
  ADD COLUMN IF NOT EXISTS height INT,
  ADD COLUMN IF NOT EXISTS format_label TEXT;

-- Backfill: copiar width/height/format do projeto pros criativos existentes
UPDATE criativos_creatives c
SET
  width = p.width,
  height = p.height,
  format_label = p.format
FROM criativos_generation_projects p
WHERE c.project_id = p.id
  AND c.width IS NULL;

-- Backfill: selected_formats parte do format atual do projeto
UPDATE criativos_generation_projects
SET selected_formats = jsonb_build_array(
  jsonb_build_object(
    'width', width,
    'height', height,
    'label', format
  )
)
WHERE selected_formats IS NULL;
