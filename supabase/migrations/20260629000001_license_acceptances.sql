-- Registro de aceites do Termo de Licença e Confidencialidade (NDA).
-- Cada vez que um usuário aceita a licença vigente (license_version), grava-se
-- UMA linha aqui. A tela de aceite (LicenseGate) é bloqueante e exige o aceite
-- uma única vez por usuário e por versão de licença antes de liberar a área
-- logada. Serve como prova de concordância com os termos proprietários do
-- Software (uso restrito, proibição de revenda/distribuição, confidencialidade).
CREATE TABLE IF NOT EXISTS public.license_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  license_version TEXT NOT NULL DEFAULT 'v1',
  user_agent TEXT,
  -- Um aceite por usuário por versão de licença (idempotência do INSERT).
  UNIQUE (user_id, license_version)
);

-- Índice em user_id — toda checagem de aceite filtra pelo usuário logado.
CREATE INDEX IF NOT EXISTS idx_license_acceptances_user_id
  ON public.license_acceptances (user_id);

-- RLS: cada usuário só enxerga e só grava os próprios aceites.
ALTER TABLE public.license_acceptances ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê apenas os próprios registros.
DROP POLICY IF EXISTS "own_select" ON public.license_acceptances;
CREATE POLICY "own_select" ON public.license_acceptances
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: usuário só insere aceite para si mesmo.
DROP POLICY IF EXISTS "own_insert" ON public.license_acceptances;
CREATE POLICY "own_insert" ON public.license_acceptances
  FOR INSERT
  WITH CHECK (user_id = auth.uid());
