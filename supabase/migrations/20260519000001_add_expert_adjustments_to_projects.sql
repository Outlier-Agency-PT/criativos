-- Ajustes do expert por projeto (sem oculos, sem gravata, expressao neutra, etc.)
-- Aplicado tanto na geracao quanto na edicao de criativos.

alter table public.criativos_generation_projects
  add column if not exists expert_adjustments jsonb not null default '{}'::jsonb;

comment on column public.criativos_generation_projects.expert_adjustments is
  'Ajustes do expert aplicados em geracao e edicao. Schema: { presets: string[], notes: string }';
