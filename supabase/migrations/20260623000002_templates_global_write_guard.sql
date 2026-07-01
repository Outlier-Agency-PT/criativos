-- Defesa em profundidade (FR-014b): impedir que role authenticated (anon/cliente)
-- grave is_global=TRUE diretamente no banco, mesmo passando por cima da camada de app.
--
-- Contexto das policies atuais de criativos_templates ANTES desta migration:
--   1. "org_isolation"                  FOR ALL    USING (org_id IN members)
--   2. "templates_select_global_or_org" FOR SELECT USING (is_global OR org_id IN members)
--
-- Como policies PERMISSIVAS se combinam por OR no Postgres, NÃO adianta adicionar mais
-- uma policy permissiva pra "restringir": ela só somaria mais um caminho de permissão.
-- A policy "org_isolation" cobre escrita (INSERT/UPDATE/DELETE) e, por só ter USING
-- (sem WITH CHECK), o Postgres usa o USING como check de escrita: qualquer membro da org
-- pode gravar linhas da sua org com QUALQUER valor de is_global, inclusive TRUE. Esse é o gap.
--
-- Estratégia: DROP da policy FOR ALL permissiva e recriação como 4 policies separadas:
--   - SELECT  : NÃO recriada aqui. A união (global OR org) já é garantida pela policy
--               "templates_select_global_or_org" criada em 20260621000005, que permanece intacta.
--   - INSERT  : WITH CHECK exige org do usuário E (is_global=false OU org Super Admin).
--   - UPDATE  : USING (org isolation) + WITH CHECK exige (is_global=false OU org Super Admin).
--   - DELETE  : USING (org isolation), sem mudança de comportamento.
--
-- service_role bypassa RLS, então a promoção legítima a global (feita pelo backend com
-- service key após o guard de app validar o Super Admin) continua funcionando.
-- O cliente comum segue criando/editando templates próprios com is_global=false normalmente.
--
-- Sem DROP de tabela/coluna/dados. Apenas DROP+CREATE de POLICY.

-- Helper inline (subselect) reutilizado: org do usuário autenticado.
-- (Mantido como subselect em cada policy pra não criar função; espelha o padrão existente.)

-- Remove a policy permissiva FOR ALL que não diferenciava is_global na escrita.
DROP POLICY IF EXISTS "org_isolation" ON criativos_templates;

-- INSERT: o cliente só insere em org da qual é membro, e só pode gravar
-- is_global=TRUE se a org for Super Admin (caso contrário, is_global precisa ser FALSE).
DROP POLICY IF EXISTS "templates_insert_org_guarded" ON criativos_templates;
CREATE POLICY "templates_insert_org_guarded" ON criativos_templates
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND (
      is_global = FALSE
      OR EXISTS (
        SELECT 1 FROM criativos_org_limits ol
        WHERE ol.org_id = criativos_templates.org_id
          AND ol.is_super_admin = TRUE
      )
    )
  );

-- UPDATE: o cliente só edita linhas de org da qual é membro (USING), e o resultado
-- da edição não pode deixar is_global=TRUE numa org que não seja Super Admin (WITH CHECK).
DROP POLICY IF EXISTS "templates_update_org_guarded" ON criativos_templates;
CREATE POLICY "templates_update_org_guarded" ON criativos_templates
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
    AND (
      is_global = FALSE
      OR EXISTS (
        SELECT 1 FROM criativos_org_limits ol
        WHERE ol.org_id = criativos_templates.org_id
          AND ol.is_super_admin = TRUE
      )
    )
  );

-- DELETE: isolamento por org, sem mudança de comportamento (cliente apaga só o que é da org).
DROP POLICY IF EXISTS "templates_delete_org_isolation" ON criativos_templates;
CREATE POLICY "templates_delete_org_isolation" ON criativos_templates
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
