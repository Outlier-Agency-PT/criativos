-- EP08 S08.1: Adicionar coluna model na tabela api_keys
-- Permite que cada key seja associada a um modelo de IA específico

ALTER TABLE api_keys
  ADD COLUMN model VARCHAR NOT NULL DEFAULT 'gemini-2.5-flash'
  CHECK (model IN (
    'gemini-2.5-flash',
    'gemini-3.1-flash-image-preview',
    'imagen-4-fast',
    'imagen-4',
    'imagen-4-ultra'
  ));

-- Keys existentes recebem o modelo padrão automaticamente via DEFAULT
COMMENT ON COLUMN api_keys.model IS 'Model ID para geração de imagens (EP08)';
