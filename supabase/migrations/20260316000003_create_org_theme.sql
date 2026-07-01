-- Theme settings per organization
CREATE TABLE IF NOT EXISTS org_theme_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL DEFAULT 'cyan',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);

-- RLS
ALTER TABLE org_theme_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org theme" ON org_theme_settings
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can update org theme" ON org_theme_settings
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
