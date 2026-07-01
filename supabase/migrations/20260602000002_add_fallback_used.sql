-- Adiciona fallback_used em criativos_creatives.
--
-- A coluna era referenciada por /api/generate/one (update após geração) mas não
-- existia no schema deste banco (migração local órfã nunca aplicada). O update
-- inteiro falhava silenciosamente — o criativo ficava preso em 'generating'
-- mesmo com a imagem já no storage. Esta migration fecha esse gap.
-- Bug exposto durante EP-13 (geração em lote por briefing).

ALTER TABLE criativos_creatives
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN criativos_creatives.fallback_used IS
  'true se a geração usou um modelo de fallback (não o preferido). Preenchido por /api/generate/one.';
