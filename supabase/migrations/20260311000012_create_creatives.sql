-- Criativos gerados (output final)
CREATE TABLE IF NOT EXISTS creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES generation_projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates(id),
  copy_id UUID REFERENCES project_copies(id),
  photo_id UUID REFERENCES expert_photos(id),
  file_path TEXT,
  thumbnail_path TEXT,
  prompt_used TEXT,
  provider_used TEXT,
  model_used TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  generation_time_ms INT,
  is_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON creatives
  FOR ALL
  USING (project_id IN (
    SELECT id FROM generation_projects
    WHERE org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  ));
