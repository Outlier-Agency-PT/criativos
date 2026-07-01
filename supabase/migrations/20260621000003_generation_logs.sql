-- Logs de uso + custo por organização (base de billing / faturamento).
-- Cada geração de criativo bem-sucedida grava UMA linha aqui com o custo
-- estimado do modelo usado. É a fonte de verdade pra cobrança por uso,
-- relatórios de consumo e enforcement de quota mensal.
CREATE TABLE IF NOT EXISTS criativos_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES criativos_creatives(id) ON DELETE SET NULL,
  model_used TEXT,
  provider TEXT,
  -- Custo estimado em USD da geração (do catálogo de custos em models.ts).
  cost_usd NUMERIC(10, 5) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice em org_id (+ created_at) — toda agregação de billing filtra por org
-- e janela temporal (uso do mês).
CREATE INDEX IF NOT EXISTS idx_criativos_generation_logs_org_created
  ON criativos_generation_logs (org_id, created_at DESC);

-- RLS: isolamento por organização.
ALTER TABLE criativos_generation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON criativos_generation_logs;
CREATE POLICY "org_isolation" ON criativos_generation_logs
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
