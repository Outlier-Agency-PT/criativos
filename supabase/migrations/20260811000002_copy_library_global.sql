-- Swipe File global: copy_library e copy_campaigns acessíveis a qualquer
-- utilizador autenticado da plataforma, independentemente de org.
-- Todos os utilizadores (funcionários e clientes) partilham o mesmo repositório.

DROP POLICY IF EXISTS "org_isolation" ON public.copy_library;
CREATE POLICY "authenticated_access" ON public.copy_library
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "org_isolation" ON public.copy_campaigns;
CREATE POLICY "authenticated_access" ON public.copy_campaigns
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- copy_usage_log: acesso a qualquer utilizador autenticado (segue copy_library).
DROP POLICY IF EXISTS "org_isolation" ON public.copy_usage_log;
CREATE POLICY "authenticated_access" ON public.copy_usage_log
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
