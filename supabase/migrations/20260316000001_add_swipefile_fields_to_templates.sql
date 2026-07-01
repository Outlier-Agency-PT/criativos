-- Adiciona campos de swipe file à tabela criativos_templates
-- Permite catalogar screenshots de anúncios com metadados ricos

ALTER TABLE criativos_templates
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS advertiser TEXT,
  ADD COLUMN IF NOT EXISTS offer_type TEXT,
  ADD COLUMN IF NOT EXISTS hook TEXT,
  ADD COLUMN IF NOT EXISTS cta TEXT,
  ADD COLUMN IF NOT EXISTS visual_style TEXT,
  ADD COLUMN IF NOT EXISTS niche TEXT,
  ADD COLUMN IF NOT EXISTS source_format TEXT,
  ADD COLUMN IF NOT EXISTS source_platform TEXT DEFAULT 'instagram';

-- Comentários
COMMENT ON COLUMN criativos_templates.advertiser IS 'Anunciante/perfil (ex: @thiagoreis, @jp.bijari)';
COMMENT ON COLUMN criativos_templates.offer_type IS 'Tipo de oferta (mentoria, curso, evento, lead_magnet, playbook, etc.)';
COMMENT ON COLUMN criativos_templates.hook IS 'Headline/hook principal do criativo';
COMMENT ON COLUMN criativos_templates.cta IS 'Call-to-action usado (ex: Saiba mais, Garantir vaga)';
COMMENT ON COLUMN criativos_templates.visual_style IS 'Estilo visual (dark, clean, foto_texto, prova_social, etc.)';
COMMENT ON COLUMN criativos_templates.niche IS 'Nicho (vendas, trafego, ia, gestao, infoprodutos, etc.)';
COMMENT ON COLUMN criativos_templates.source_format IS 'Formato original (story, feed, carrossel, reels)';
COMMENT ON COLUMN criativos_templates.source_platform IS 'Plataforma de origem (instagram, facebook, tiktok)';
