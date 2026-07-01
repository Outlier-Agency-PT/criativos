-- Adiciona campo preferred_model aos projetos de geração
-- Permite que o usuário escolha o modelo de IA na interface do wizard
ALTER TABLE criativos_generation_projects
ADD COLUMN IF NOT EXISTS preferred_model TEXT DEFAULT NULL;

COMMENT ON COLUMN criativos_generation_projects.preferred_model IS 'Modelo de IA preferido para geração (ex: gemini-3-pro-image-preview). NULL = usar modelo da API key.';
