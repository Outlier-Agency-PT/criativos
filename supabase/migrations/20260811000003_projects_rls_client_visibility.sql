-- RLS de projetos: visibilidade por cliente vs. super admin.
--
-- Super admin (criativos_org_limits.is_super_admin = true na sua org):
--   vê e opera todos os projetos da org.
--
-- Cliente (is_super_admin = false ou ausente):
--   vê e opera apenas os projetos onde client_user_id = auth.uid().
--   Projetos com client_user_id = NULL (legado) são invisíveis para clientes.

DROP POLICY IF EXISTS "org_isolation" ON criativos_generation_projects;

CREATE POLICY "project_visibility"
  ON criativos_generation_projects
  FOR ALL
  USING (
    -- Super admin da org vê tudo
    EXISTS (
      SELECT 1
      FROM criativos_org_limits col
      JOIN organization_members om ON om.org_id = col.org_id
      WHERE om.user_id = auth.uid()
        AND col.is_super_admin = true
    )
    OR
    -- Cliente vê apenas os seus próprios projetos
    client_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM criativos_org_limits col
      JOIN organization_members om ON om.org_id = col.org_id
      WHERE om.user_id = auth.uid()
        AND col.is_super_admin = true
    )
    OR
    client_user_id = auth.uid()
  );
