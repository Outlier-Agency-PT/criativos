-- Organizações (multi-tenant)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  setup_completed BOOLEAN DEFAULT FALSE,
  setup_step INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Owner pode ver/editar a própria organização
CREATE POLICY "owner_access" ON organizations
  FOR ALL
  USING (owner_id = auth.uid());
