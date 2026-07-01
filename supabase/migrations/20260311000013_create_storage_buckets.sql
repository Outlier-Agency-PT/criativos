-- Storage Buckets (todos privados)
INSERT INTO storage.buckets (id, name, public) VALUES ('expert-photos', 'expert-photos', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('templates', 'templates', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('creatives', 'creatives', false) ON CONFLICT (id) DO NOTHING;

-- Storage Policies: upload/download restrito por org_id via organization_members

-- expert-photos
CREATE POLICY "org_upload_expert_photos" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'expert-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_select_expert_photos" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'expert-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_delete_expert_photos" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'expert-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- brand-assets
CREATE POLICY "org_upload_brand_assets" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_select_brand_assets" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_delete_brand_assets" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- templates
CREATE POLICY "org_upload_templates" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_select_templates" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_delete_templates" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- creatives
CREATE POLICY "org_upload_creatives" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'creatives'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_select_creatives" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'creatives'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_delete_creatives" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'creatives'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM organization_members WHERE user_id = auth.uid()
    )
  );
