-- Templates (Swipe File)
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  copy_elements JSONB,
  mini_prompt TEXT,
  tags TEXT[],
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON templates
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
