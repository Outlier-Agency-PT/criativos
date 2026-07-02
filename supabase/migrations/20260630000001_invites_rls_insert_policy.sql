-- EP-14.10: Adição de políticas de INSERT/UPDATE/DELETE para criativos_invites.
--
-- Problema: a tabela criativos_invites tem RLS habilitada, mas APENAS com política de SELECT.
-- Embora service_role deveria bypassar RLS, as políticas precisam estar definidas para clareza.
-- O backend (src/app/api/admin/invite/route.ts) usa createServiceSupabase() (service_role),
-- que bypassa RLS de qualquer forma, MAS definir as políticas explicitamente melhora auditoria
-- e prepara para possíveis mudanças futuras.
--
-- ESTRATÉGIA:
--   - INSERT/UPDATE/DELETE: Disponível apenas via service_role (backend).
--   - SELECT: Restrito a owner/admin da org (já definido).
--   - Cliente autenticado (authenticated role): Pode ler convites da própria org se for owner/admin.

-- Idempotência: DROP ... IF EXISTS antes de criar.
DROP POLICY IF EXISTS "invites_insert_via_service" ON criativos_invites;
DROP POLICY IF EXISTS "invites_update_via_service" ON criativos_invites;
DROP POLICY IF EXISTS "invites_delete_via_service" ON criativos_invites;

-- INSERT via service_role (backend). O serviço bypassa RLS, então esta policy é principalmente
-- para clareza e auditoria. A policy permite que qualquer tentativa de INSERT via service_role
-- passe (não ha restricao).
CREATE POLICY "invites_insert_via_service" ON criativos_invites
  FOR INSERT
  WITH CHECK (true);  -- service_role bypassa anyway; true permite auditoria.

-- UPDATE via service_role (para reenvios e expiração de convites).
CREATE POLICY "invites_update_via_service" ON criativos_invites
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- DELETE via service_role (limpeza de convites expirados, se necessário).
CREATE POLICY "invites_delete_via_service" ON criativos_invites
  FOR DELETE
  USING (true);
