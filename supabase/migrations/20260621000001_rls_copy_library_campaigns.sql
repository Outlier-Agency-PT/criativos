-- ════════════════════════════════════════════════════════════════════════
-- RLS CRÍTICO — Isolamento multi-tenant em copy_library e copy_campaigns
--
-- Sem RLS, qualquer cliente autenticado conseguia ler/escrever copies e
-- campanhas de OUTRA organização (vazamento multi-tenant). Esta migration
-- habilita Row Level Security e isola por org_id via organization_members.
--
-- Padrão idêntico ao usado em criativos_text_model_config (migration
-- 20260605000001): org_id IN (SELECT org_id FROM organization_members
-- WHERE user_id = auth.uid()).
-- ════════════════════════════════════════════════════════════════════════

-- copy_library --------------------------------------------------------------
ALTER TABLE public.copy_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON public.copy_library;
CREATE POLICY "org_isolation"
  ON public.copy_library
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- copy_campaigns ------------------------------------------------------------
ALTER TABLE public.copy_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON public.copy_campaigns;
CREATE POLICY "org_isolation"
  ON public.copy_campaigns
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
