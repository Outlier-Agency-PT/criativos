-- Personas
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_audience TEXT,
  audience_problems TEXT,
  purchase_objections TEXT,
  deep_desires TEXT,
  extra_context TEXT,
  generated_summary JSONB,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON personas
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
