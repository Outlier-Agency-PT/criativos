-- Feature: layout do fundo próprio (full = tela cheia | split-top = foto no topo + bloco de cor)
-- Doc: docs/architecture/fundo-proprio-e-padroes-copy.md
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS background_mode TEXT DEFAULT 'full';
