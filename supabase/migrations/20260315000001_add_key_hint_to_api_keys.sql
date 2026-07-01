-- Adiciona coluna key_hint à tabela criativos_api_keys
-- Armazena a dica visual da key (ex: "AIza...1234") sem expor a chave completa

ALTER TABLE criativos_api_keys
  ADD COLUMN IF NOT EXISTS key_hint TEXT;
