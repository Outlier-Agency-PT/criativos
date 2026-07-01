-- ════════════════════════════════════════════════════════════════════════
-- Seleção configurável do MODELO DE TEXTO (geração de copy)
--
-- 1. Amplia o CHECK constraint de `model` em criativos_api_keys pra aceitar
--    modelos de texto da Anthropic (Claude Haiku) e OpenAI (GPT-4o mini).
-- 2. Cria tabela criativos_text_model_config: por org, a lista ORDENADA de
--    modelos de texto a usar na geração de copy (primário + fallbacks).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Ampliar constraint de model das api_keys -----------------------------
ALTER TABLE criativos_api_keys DROP CONSTRAINT IF EXISTS api_keys_model_check;
ALTER TABLE criativos_api_keys ADD CONSTRAINT api_keys_model_check CHECK (model IN (
  -- Imagem (Gemini / Imagen)
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-image',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
  'imagen-4-fast',
  'imagen-4',
  'imagen-4-ultra',
  -- Texto (copy)
  'claude-haiku-4-5-20251001',
  'gpt-4o-mini'
));

-- 2. Config de modelo de texto por org ------------------------------------
CREATE TABLE IF NOT EXISTS criativos_text_model_config (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Lista ordenada de model ids: primeiro = primário, resto = fallbacks.
  -- Ex: ["claude-haiku-4-5-20251001","gpt-4o-mini","gemini-2.5-flash"]
  model_chain jsonb NOT NULL DEFAULT '["claude-haiku-4-5-20251001","gpt-4o-mini","gemini-2.5-flash"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE criativos_text_model_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage own org text model config" ON criativos_text_model_config;
CREATE POLICY "members manage own org text model config"
  ON criativos_text_model_config
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
