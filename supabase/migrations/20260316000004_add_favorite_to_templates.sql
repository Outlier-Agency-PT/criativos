-- Adicionar coluna de favoritos aos templates
ALTER TABLE criativos_templates ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
