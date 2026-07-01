-- Toggle de variação de ROUPA/VESTIMENTA entre criativos.
-- Por padrão (FALSE), a IA MANTÉM o tipo de roupa do template (terno, camisa social,
-- jaleco, etc), só adaptando a cor à marca. Quando TRUE, a IA pode variar a roupa
-- entre os criativos. Coluna independente de `variation_enabled` (fundo/pose/enquadramento).
ALTER TABLE criativos_generation_projects
  ADD COLUMN IF NOT EXISTS vary_clothing BOOLEAN DEFAULT FALSE;
