-- Atualizar constraint de modelos para incluir novos modelos Gemini Pro e WisGate
ALTER TABLE criativos_api_keys DROP CONSTRAINT IF EXISTS api_keys_model_check;
ALTER TABLE criativos_api_keys ADD CONSTRAINT api_keys_model_check CHECK (model IN (
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
  'imagen-4-ultra'
));
