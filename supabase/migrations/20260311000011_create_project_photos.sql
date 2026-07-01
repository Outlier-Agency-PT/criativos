-- Fotos selecionadas para um projeto
CREATE TABLE IF NOT EXISTS project_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES generation_projects(id) ON DELETE CASCADE,
  photo_id UUID REFERENCES expert_photos(id),
  sort_order INT DEFAULT 0
);

-- RLS
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON project_photos
  FOR ALL
  USING (project_id IN (
    SELECT id FROM generation_projects
    WHERE org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  ));
