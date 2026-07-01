-- Copies de um projeto
CREATE TABLE IF NOT EXISTS project_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES generation_projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  content JSONB NOT NULL,
  raw_text TEXT,
  sort_order INT DEFAULT 0
);

-- RLS
ALTER TABLE project_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON project_copies
  FOR ALL
  USING (project_id IN (
    SELECT id FROM generation_projects
    WHERE org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  ));
