-- Membros de uma organização (multi-tenant)
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',  -- 'owner' | 'admin' | 'editor'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- RLS
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_access" ON organization_members
  FOR ALL
  USING (user_id = auth.uid());
