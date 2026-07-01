-- Bucket de logos (privado) — mesmo padrão dos demais buckets (org_id na 1ª pasta do path).
-- O código referencia o bucket 'logos' para salvar a logo da marca de cada org. Sem esta
-- migration o upload/leitura da logo falha. Criada na entrega para fechar o gap de setup.
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', false) ON CONFLICT (id) DO NOTHING;

-- Storage Policies: upload/select/delete restrito por org_id via organization_members
CREATE POLICY "org_upload_logos" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_select_logos" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_delete_logos" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );
