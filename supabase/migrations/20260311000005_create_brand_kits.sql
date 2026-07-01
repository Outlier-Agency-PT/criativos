-- Brand Kits
CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_url TEXT,
  colors JSONB NOT NULL,
  fonts JSONB NOT NULL,
  logo_path TEXT,
  extra_styles JSONB,
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON brand_kits
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
