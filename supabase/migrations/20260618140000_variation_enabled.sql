-- Toggle de variação entre criativos (fundo/roupa/pose) por projeto.
-- O wizard manda `variationEnabled` no save-progress; sem esta coluna o estado
-- voltava desselecionado ao reabrir o projeto.
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS variation_enabled BOOLEAN DEFAULT FALSE;
