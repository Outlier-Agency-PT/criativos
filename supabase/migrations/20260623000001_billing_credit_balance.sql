-- Onda 2: Billing por crédito pré-pago (EP-14.01).
-- Esta migration PARTE do schema existente (criativos_org_limits, criativos_generation_logs,
-- criativos_templates.is_global já aplicados) e SÓ adiciona o que falta. NÃO recria nada.
--
-- O ponto crítico resolvido aqui é a colisão semântica:
--   credit_balance IS NULL  -> "ilimitado em consumo" (bypassa quota e decremento).
--   is_super_admin = true    -> "visão cross-org / Super Admin" (fonte canônica ÚNICA).
-- As duas coisas são INDEPENDENTES: um cliente pode ter saldo ilimitado sem ser Super Admin.
-- Por isso NÃO se deve usar credit_balance IS NULL pra identificar Super Admin.

-- =========================================================================
-- (D1) criativos_org_limits: saldo pré-pago decrementável + flag de Super Admin.
-- =========================================================================

ALTER TABLE criativos_org_limits
  -- Saldo atual decrementável. NULL = ilimitado em consumo. Inteiro >= 0 = créditos restantes.
  ADD COLUMN IF NOT EXISTS credit_balance INTEGER,
  -- Acumulado histórico de créditos já concedidos (auditoria/reconciliação). Nunca decrementa por consumo.
  ADD COLUMN IF NOT EXISTS credits_total INTEGER NOT NULL DEFAULT 0,
  -- Timestamp da última recarga manual de crédito.
  ADD COLUMN IF NOT EXISTS last_recharge_at TIMESTAMPTZ,
  -- Fonte canônica do Super Admin (visão cross-org). Separada do significado "ilimitado" de credit_balance.
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN criativos_org_limits.is_super_admin IS
  'Fonte canônica do Super Admin (visão cross-org). NÃO usar credit_balance IS NULL pra isso.';

COMMENT ON COLUMN criativos_org_limits.credit_balance IS
  'Saldo pré-pago decrementável. NULL = ilimitado em consumo, NÃO implica super admin.';

COMMENT ON COLUMN criativos_org_limits.credits_total IS
  'Acumulado histórico de créditos concedidos (auditoria/reconciliação), nunca decrementa por consumo.';

COMMENT ON COLUMN criativos_org_limits.last_recharge_at IS
  'Timestamp da última recarga manual de crédito.';

COMMENT ON COLUMN criativos_org_limits.monthly_generation_limit IS
  'DEPRECADA: mantida pra orgs legadas, ignorada pelo novo gate baseado em credit_balance.';

-- =========================================================================
-- (D2) criativos_credit_adjustments: registro de recargas e correções de saldo.
-- Os consumos vivem em criativos_generation_logs; os créditos (recargas/ajustes) vivem aqui.
-- =========================================================================

CREATE TABLE IF NOT EXISTS criativos_credit_adjustments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- delta > 0 = recarga, delta < 0 = correção/estorno.
  delta         INTEGER NOT NULL,
  -- Motivo livre: "recarga manual", "ajuste", "cobranca #X".
  reason        TEXT,
  -- Quem aplicou o ajuste (admin). NULL se origem automática/sistema.
  actor_user_id UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_adjustments_org_created
  ON criativos_credit_adjustments (org_id, created_at DESC);

-- =========================================================================
-- (D3) criativos_invites: convites B2B pendentes (listagem, reenvio, expiração).
-- =========================================================================

CREATE TABLE IF NOT EXISTS criativos_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- owner | admin | editor.
  role        TEXT NOT NULL DEFAULT 'editor',
  -- pending | accepted | expired.
  status      TEXT NOT NULL DEFAULT 'pending',
  invited_by  UUID REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_org_status
  ON criativos_invites (org_id, status);

-- =========================================================================
-- BACKFILL (idempotente). Decisão de coexistência com monthly_generation_limit:
-- o novo gate lê credit_balance; monthly_generation_limit fica só pra contexto legado.
--
-- IMPORTANTE: criativos_org_limits pode estar VAZIA (orgs sem row ainda). Um simples
-- UPDATE atingiria 0 linhas e deixaria orgs cliente SEM row. O código (src/lib/usage.ts)
-- trata "sem row em org_limits" como ILIMITADO, então uma org cliente sem row viraria
-- ilimitada silenciosamente (viola AC-4 e AC-7). Por isso MATERIALIZAMOS uma row pra
-- CADA org de organizations via INSERT ... SELECT ... ON CONFLICT DO UPDATE (upsert).
-- =========================================================================

-- Garante uma row em criativos_org_limits pra CADA org de organizations.
--   Super Admin (UUID abaixo): is_super_admin = true, credit_balance = NULL (ilimitado em consumo).
--   Demais orgs (clientes):    is_super_admin = false, credit_balance = COALESCE(limite legado, 0).
-- monthly_generation_limit vive em criativos_org_limits (não em organizations); como a tabela
-- pode estar vazia, o derivado pra clientes novos vira 0 (precisam de recarga). Para orgs que
-- JÁ tenham row com limite/saldo, o COALESCE no DO UPDATE preserva o valor existente.
--
-- IMPORTANTE (deploy novo): o UUID '00000000-0000-0000-0000-000000000000' abaixo é um
-- placeholder que NÃO corresponde a nenhuma org real, então NENHUMA org nasce ilimitada.
-- Para tornar a SUA org administradora ilimitada, troque o UUID nas duas linhas abaixo pelo
-- id da sua org (SELECT id FROM organizations) e rode novamente esta lógica, OU faça:
--   UPDATE criativos_org_limits SET is_super_admin = true, credit_balance = NULL WHERE org_id = '<sua-org>';
INSERT INTO criativos_org_limits (org_id, is_super_admin, credit_balance, credits_total, updated_at)
SELECT
  o.id,
  -- A org com o UUID abaixo é a ÚNICA Super Admin (determinístico).
  (o.id = '00000000-0000-0000-0000-000000000000') AS is_super_admin,
  -- Super Admin: NULL (ilimitado). Cliente: 0 (sem limite legado materializado nesta tabela vazia).
  CASE WHEN o.id = '00000000-0000-0000-0000-000000000000' THEN NULL ELSE 0 END AS credit_balance,
  -- credits_total acompanha o saldo derivado. Nesta tabela vazia o derivado é 0 pra todos
  -- (Outlier Agency e clientes), o que mantém a reconciliação consistente (resolve Issue #3 do QA).
  0 AS credits_total,
  now() AS updated_at
FROM organizations o
ON CONFLICT (org_id) DO UPDATE
   SET
     -- is_super_admin é determinístico: sempre reflete a regra (só Outlier Agency true).
     is_super_admin = EXCLUDED.is_super_admin,
     -- IDEMPOTÊNCIA: nunca sobrescreve saldo já consumido em produção. COALESCE preserva o
     -- credit_balance existente (decrementado por consumo); só aplica o derivado quando a row
     -- ainda está "nova"/não inicializada (credit_balance IS NULL). Chaveia por EXCLUDED.is_super_admin
     -- (valor determinístico de entrada) e não pelo flag antigo da row, pra ser robusto na 1ª passada.
     credit_balance = CASE
       WHEN EXCLUDED.is_super_admin THEN NULL
       ELSE COALESCE(criativos_org_limits.credit_balance, EXCLUDED.credit_balance)
     END,
     -- credits_total também preserva valor já concedido; só usa o derivado quando ainda era 0/default.
     credits_total = CASE
       WHEN criativos_org_limits.credits_total > 0 THEN criativos_org_limits.credits_total
       ELSE EXCLUDED.credits_total
     END,
     updated_at = now();
