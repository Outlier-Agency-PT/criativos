-- Feature: Dois padrões de copy + checkboxes de campos + imagem de fundo própria
-- Doc: docs/architecture/fundo-proprio-e-padroes-copy.md
-- Nota: as tabelas reais usam prefixo criativos_ (renomeadas após as migrations 20260311*).

-- BLOCO A — padrão de copy selecionável por projeto
-- Valores: 'estatico' (headline/subheadline/ponte/cta) | 'mini_copy' (headline/mini_copy/list_items/cta)
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS copy_pattern TEXT DEFAULT 'estatico';

-- BLOCO B — campos de copy ativos (checkboxes), nível projeto
-- Ex.: ["headline","subheadline","ponte","cta"]. Default lógico = todos do padrão (resolvido no app).
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS active_copy_fields JSONB;

-- BLOCO C — modo de fundo próprio
ALTER TABLE public.criativos_generation_projects
  ADD COLUMN IF NOT EXISTS use_custom_background BOOLEAN DEFAULT FALSE;

-- BLOCO C — fotos de fundo vinculadas ao projeto (rodízio por sort_order)
CREATE TABLE IF NOT EXISTS public.criativos_project_backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.criativos_generation_projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  width INT,
  height INT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_criativos_project_backgrounds_project
  ON public.criativos_project_backgrounds (project_id);

ALTER TABLE public.criativos_project_backgrounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON public.criativos_project_backgrounds;
CREATE POLICY "org_isolation" ON public.criativos_project_backgrounds
  FOR ALL
  USING (project_id IN (
    SELECT id FROM public.criativos_generation_projects
    WHERE org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  ));
