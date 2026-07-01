-- Projetos de Geração
CREATE TABLE IF NOT EXISTS generation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES personas(id),
  brand_kit_id UUID REFERENCES brand_kits(id),
  name TEXT,
  format TEXT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  show_logo BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'draft',
  total_creatives INT DEFAULT 0,
  chat_history JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE generation_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON generation_projects
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
