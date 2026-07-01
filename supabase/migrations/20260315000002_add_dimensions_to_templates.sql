-- Adiciona colunas de dimensão à tabela criativos_templates
-- Permite exibir o tamanho correto na galeria de templates

ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;
