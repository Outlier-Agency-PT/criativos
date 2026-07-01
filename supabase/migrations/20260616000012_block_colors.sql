-- Feature: cores do bloco no layout split-top (rodízio quando >1 cor escolhida)
-- Doc: docs/architecture/fundo-proprio-e-padroes-copy.md
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS block_colors JSONB DEFAULT '[]'::jsonb;
