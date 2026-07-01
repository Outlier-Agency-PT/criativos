-- EP-14.02: RLS endurecida do billing (NFR-001 / NFR-002).
--
-- PROBLEMA RESOLVIDO (regressao critica):
--   As tabelas de billing (criativos_org_limits e criativos_generation_logs) tinham
--   uma policy "org_isolation" FOR ALL USING (org_id IN members). Como uma policy
--   FOR ALL sem WITH CHECK usa o USING tambem como check de escrita, QUALQUER membro
--   da org (role authenticated, anon key via PostgREST) conseguia UPDATE/INSERT/DELETE
--   das proprias linhas, inclusive UPDATE de credit_balance. Ou seja: o cliente podia
--   se auto-recarregar chamando o Supabase direto, contornando todo o billing server-side.
--
-- ESTRATEGIA:
--   A logica autoritativa de saldo vive no backend com SERVICE KEY (service_role bypassa
--   RLS por design). A RLS aqui e a defesa em profundidade: para o role authenticated,
--   so existe policy de SELECT. Sem policy de INSERT/UPDATE/DELETE, o Postgres NEGA
--   qualquer mutacao do cliente (PostgREST retorna 0 rows / permission denied), enquanto
--   o service_role continua mutando normalmente por bypassar a RLS.
--
-- Padrao espelha a migration 20260623000002 (templates_global_write_guard): SELECT pro
-- membro, mutacao via service key no backend.
--
-- Sem DROP de tabela/coluna/dados (CON-007). Apenas DROP+CREATE de POLICY e ENABLE RLS.
-- Todas as operacoes sao idempotentes (DROP POLICY IF EXISTS, ENABLE RLS).

-- =========================================================================
-- (1) criativos_org_limits: saldo pre-pago. Cliente LE, nunca MUTA.
-- =========================================================================

-- RLS ja estava habilitada (migration 20260621000004), reafirmamos por idempotencia.
ALTER TABLE criativos_org_limits ENABLE ROW LEVEL SECURITY;

-- Remove a policy permissiva FOR ALL que deixava o cliente mutar o proprio saldo.
DROP POLICY IF EXISTS "org_isolation" ON criativos_org_limits;

-- SELECT-only: o membro le o saldo da propria org (dashboard funciona normalmente).
-- NENHUMA policy de INSERT/UPDATE/DELETE pra authenticated => mutacao negada pro cliente;
-- service_role bypassa RLS e segue sendo o unico que muta o saldo.
DROP POLICY IF EXISTS "org_limits_select_member" ON criativos_org_limits;
CREATE POLICY "org_limits_select_member" ON criativos_org_limits
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================================
-- (2) criativos_generation_logs: log de uso/custo. Cliente LE, nunca MUTA.
-- =========================================================================
--
-- NOTA DE SEGURANCA (insert de log):
--   O insert do log de uso acontece em src/app/api/generate/one/route.ts (linha ~395)
--   atraves do client criado por createServiceSupabase() (src/lib/api-auth.ts), que usa
--   SUPABASE_SERVICE_KEY (service_role). Como o service_role BYPASSA a RLS, remover a
--   policy de INSERT pra authenticated NAO quebra a gravacao do log. Verificado nesta story.

-- RLS ja estava habilitada (migration 20260621000003), reafirmamos por idempotencia.
ALTER TABLE criativos_generation_logs ENABLE ROW LEVEL SECURITY;

-- Remove a policy permissiva FOR ALL.
DROP POLICY IF EXISTS "org_isolation" ON criativos_generation_logs;

-- SELECT-only por membro (relatorios de consumo do cliente continuam lendo).
DROP POLICY IF EXISTS "generation_logs_select_member" ON criativos_generation_logs;
CREATE POLICY "generation_logs_select_member" ON criativos_generation_logs
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================================
-- (3) criativos_credit_adjustments: recargas/ajustes (tabela nova da EP-14.01).
-- RLS ainda nao estava habilitada; habilita agora. Cliente LE, nunca MUTA.
-- =========================================================================

ALTER TABLE criativos_credit_adjustments ENABLE ROW LEVEL SECURITY;

-- SELECT-only por membro: o cliente ve o historico de recargas/ajustes da propria org.
-- A criacao de ajustes (recarga) e feita pelo backend com service key (proximas stories).
DROP POLICY IF EXISTS "credit_adjustments_select_member" ON criativos_credit_adjustments;
CREATE POLICY "credit_adjustments_select_member" ON criativos_credit_adjustments
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================================
-- (4) criativos_invites: convites B2B (tabela nova da EP-14.01).
-- RLS ainda nao estava habilitada; habilita agora.
-- SELECT restrito a OWNER/ADMIN da org (membro comum NAO lista convites). Cliente nunca MUTA.
-- =========================================================================
--
-- IDENTIFICACAO DE OWNER/ADMIN (padrao do projeto):
--   organization_members.role IN ('owner','admin')  -> papel administrativo da org
--      (organization_members tem coluna role TEXT DEFAULT 'editor'; valores owner|admin|editor).
--   OU organizations.owner_id = auth.uid()           -> dono original da org
--      (organizations tem coluna owner_id referenciando auth.users).
--   Cobrimos os dois caminhos pra ser robusto: quem e owner da org (owner_id) e quem foi
--   promovido a owner/admin em organization_members. Membro 'editor' comum nao lista convites.

ALTER TABLE criativos_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_select_owner_admin" ON criativos_invites;
CREATE POLICY "invites_select_owner_admin" ON criativos_invites
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
    OR org_id IN (
      SELECT o.id FROM organizations o
      WHERE o.owner_id = auth.uid()
    )
  );

-- =========================================================================
-- QUERY DE TESTE (provando AC-4, AC-5 e AC-6).
-- Rodar com DOIS clients distintos contra o mesmo banco:
--
--   A) Cliente autenticado (anon key + sessao do usuario => role authenticated):
--
--      -- AC-5: SELECT do proprio saldo FUNCIONA (dashboard le normalmente).
--      SELECT org_id, credit_balance
--      FROM criativos_org_limits
--      WHERE org_id = '<org-do-usuario>';
--      -- Esperado: retorna a row com o saldo. (Sucesso.)
--
--      -- AC-4: UPDATE de credit_balance e NEGADO pela RLS.
--      UPDATE criativos_org_limits
--      SET credit_balance = 999999
--      WHERE org_id = '<org-do-usuario>';
--      -- Esperado via PostgREST/REST: 0 rows afetadas (a row e invisivel pra escrita,
--      -- pois nao existe policy de UPDATE pra authenticated). Nenhum saldo muda.
--      -- (Em SQL direto como role authenticated: "new row violates row-level security"
--      --  ou 0 rows; de qualquer forma a auto-recarga NAO acontece.)
--
--      -- Membro comum (role 'editor') NAO lista convites (parte do AC-6):
--      SELECT * FROM criativos_invites WHERE org_id = '<org-do-usuario>';
--      -- Esperado pra editor: 0 rows. Pra owner/admin da org: lista os convites.
--
--   B) Service role (SUPABASE_SERVICE_KEY, usado nos endpoints backend):
--
--      -- AC-6 (parte service): UPDATE de saldo FUNCIONA (bypassa RLS).
--      UPDATE criativos_org_limits
--      SET credit_balance = credit_balance + 100
--      WHERE org_id = '<org-do-usuario>';
--      -- Esperado: 1 row afetada. O backend continua recarregando/decrementando normalmente.
-- =========================================================================
