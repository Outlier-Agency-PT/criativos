-- copy_library: adiciona colunas que faltavam neste banco (migrations orfas nao
-- aplicadas). Sem elas, editar uma copy na biblioteca falhava ("could not find
-- the 'product'/'list_items' column"). (fix 2026-06-18)
ALTER TABLE public.copy_library
  ADD COLUMN IF NOT EXISTS list_items TEXT;
ALTER TABLE public.copy_library
  ADD COLUMN IF NOT EXISTS product TEXT;

CREATE INDEX IF NOT EXISTS idx_copy_library_product ON public.copy_library (product);
