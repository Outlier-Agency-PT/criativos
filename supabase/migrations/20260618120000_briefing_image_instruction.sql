-- Modo briefing: instrução sobre como usar as imagens de referência/fundo.
-- As imagens em si reusam a tabela criativos_project_backgrounds (rodízio + download
-- já implementados). Esta coluna guarda o texto que diz o que fazer com elas
-- (ex.: "usar como fundo preservado" ou "usar como referência de estilo").
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS briefing_image_instruction TEXT;
