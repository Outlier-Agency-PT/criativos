-- Limites de uso por organização (quota mensal de geração).
-- Tabela separada de `organizations` pra não acoplar billing ao núcleo de auth.
-- monthly_generation_limit = NULL  -> ilimitado (default, plano interno/admin).
-- monthly_generation_limit = N     -> no máximo N criativos por mês civil.
CREATE TABLE IF NOT EXISTS criativos_org_limits (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = ilimitado. Inteiro >= 0 = teto mensal de criativos gerados.
  monthly_generation_limit INTEGER,
  -- Rótulo do plano só pra exibição/contexto comercial (free, pro, etc.).
  plan_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: isolamento por organização.
ALTER TABLE criativos_org_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON criativos_org_limits;
CREATE POLICY "org_isolation" ON criativos_org_limits
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
