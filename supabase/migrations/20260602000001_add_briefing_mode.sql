-- EP-13.01 — Modelo de dados do Modo Lote por Briefing (geração sem template)
--
-- Aditiva e idempotente. Não altera colunas existentes, não dropa nada.
--
-- generation_mode: distingue o fluxo. 'wizard' = fluxo de 5 steps (template + brand kit + copy).
--                  'briefing' = novo modo sem template (prompt manda no visual).
--                  NOTA: a coluna NÃO se chama "mode" de propósito — "mode" colide com a
--                  função de agregação reservada mode() do Postgres e quebra queries PostgREST.
-- visual_direction: direção visual textual (input humano) de cada criativo do briefing,
--                   ex.: "print de agenda com 4 horários riscados em vermelho".
--                   Distinta de prompt_used (prompt técnico final enviado à IA).

ALTER TABLE criativos_generation_projects
  ADD COLUMN IF NOT EXISTS generation_mode TEXT NOT NULL DEFAULT 'wizard';

ALTER TABLE criativos_creatives
  ADD COLUMN IF NOT EXISTS visual_direction TEXT;

COMMENT ON COLUMN criativos_generation_projects.generation_mode IS
  'Fluxo de geração: wizard (template+copy) ou briefing (sem template, prompt livre). EP-13.';
COMMENT ON COLUMN criativos_creatives.visual_direction IS
  'Direção visual textual do item do briefing (input humano). EP-13.';
