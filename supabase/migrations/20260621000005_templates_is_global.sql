-- Templates globais (swipe file padrão do admin) vs templates da org.
-- is_global = TRUE  -> aparece pra TODAS as orgs (curadoria do admin).
-- is_global = FALSE -> pertence só à org dona (org_id).
ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- Índice parcial: a listagem traz (is_global = true OR org_id = <org>),
-- e o ramo global é varrido com frequência por todas as orgs.
CREATE INDEX IF NOT EXISTS idx_criativos_templates_is_global
  ON criativos_templates (is_global)
  WHERE is_global = TRUE;

-- RLS: a policy de org_isolation existente (org_id IN ...) bloquearia templates
-- globais sob anon key. Ampliar o SELECT pra também liberar is_global = true,
-- mantendo escrita restrita à org (mutação via service key no backend).
DROP POLICY IF EXISTS "templates_select_global_or_org" ON criativos_templates;
CREATE POLICY "templates_select_global_or_org" ON criativos_templates
  FOR SELECT
  USING (
    is_global = TRUE
    OR org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
