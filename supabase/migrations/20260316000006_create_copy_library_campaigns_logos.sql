-- Cria as tabelas de biblioteca de copy, campanhas, log de uso e logos da org.
--
-- CONTEXTO (entrega): estas tabelas existiam apenas no banco remoto original e nunca
-- viraram migration (ficaram como stubs vazios *_remote_orphan.sql). Sem este arquivo, o
-- `supabase db push` num banco novo falha no primeiro ALTER TABLE copy_library
-- (migration 20260317000002). Por isso o timestamp deste arquivo é ANTERIOR a 20260317:
-- as tabelas precisam existir antes dos ALTERs idempotentes que vêm depois.
--
-- Ordem respeita as foreign keys:
--   copy_campaigns -> copy_library -> copy_usage_log; org_logos é independente.
-- RLS/policy de copy_library e copy_campaigns NÃO são definidas aqui (já vêm na
-- migration 20260621000001, que roda depois). Definimos RLS só para copy_usage_log e
-- org_logos, que não são cobertas por nenhuma outra migration.

-- ─── copy_campaigns (FK -> organizations) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    product text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.copy_campaigns ADD CONSTRAINT copy_campaigns_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.copy_campaigns
    ADD CONSTRAINT copy_campaigns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_copy_campaigns_org_id ON public.copy_campaigns USING btree (org_id);

-- ─── copy_library (FK -> copy_campaigns, organizations, auth.users) ───────────
CREATE TABLE IF NOT EXISTS public.copy_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    campaign_id uuid,
    headline text,
    mini_copy text,
    cta text,
    body text,
    raw_text text,
    source text DEFAULT 'manual'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    times_used integer DEFAULT 0,
    last_used_at timestamp with time zone,
    is_favorite boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    list_items text,
    product text,
    CONSTRAINT copy_library_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'upload'::text, 'ai_generated'::text, 'local_import'::text])))
);
ALTER TABLE ONLY public.copy_library ADD CONSTRAINT copy_library_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.copy_library
    ADD CONSTRAINT copy_library_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.copy_campaigns(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.copy_library
    ADD CONSTRAINT copy_library_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.copy_library
    ADD CONSTRAINT copy_library_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_copy_library_org_id ON public.copy_library USING btree (org_id);
CREATE INDEX IF NOT EXISTS idx_copy_library_campaign_id ON public.copy_library USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_copy_library_product ON public.copy_library USING btree (product);
CREATE INDEX IF NOT EXISTS idx_copy_library_tags ON public.copy_library USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_copy_library_fts ON public.copy_library USING gin (
  to_tsvector('portuguese'::regconfig,
    ((((((COALESCE(headline, ''::text) || ' '::text) || COALESCE(mini_copy, ''::text)) || ' '::text) || COALESCE(cta, ''::text)) || ' '::text) || COALESCE(body, ''::text)))
);

-- ─── copy_usage_log (FK -> copy_library) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    copy_id uuid NOT NULL,
    project_id uuid,
    creative_id uuid,
    used_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.copy_usage_log ADD CONSTRAINT copy_usage_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.copy_usage_log
    ADD CONSTRAINT copy_usage_log_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.copy_library(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_copy_usage_log_copy_id ON public.copy_usage_log USING btree (copy_id);
ALTER TABLE public.copy_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON public.copy_usage_log;
CREATE POLICY "org_isolation" ON public.copy_usage_log USING (
  copy_id IN (
    SELECT cl.id FROM public.copy_library cl
    WHERE cl.org_id IN (
      SELECT organization_members.org_id FROM public.organization_members
      WHERE organization_members.user_id = auth.uid()
    )
  )
);

-- ─── org_logos (FK -> organizations) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_logos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    file_path text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY public.org_logos ADD CONSTRAINT org_logos_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.org_logos
    ADD CONSTRAINT org_logos_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_org_logos_org_id ON public.org_logos USING btree (org_id);
ALTER TABLE public.org_logos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON public.org_logos;
CREATE POLICY "org_isolation" ON public.org_logos USING (
  org_id IN (
    SELECT organization_members.org_id FROM public.organization_members
    WHERE organization_members.user_id = auth.uid()
  )
);
