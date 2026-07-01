-- Rascunho do wizard de criação (1 por usuário, upsert)
CREATE TABLE IF NOT EXISTS criativos_creator_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE criativos_creator_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_drafts" ON criativos_creator_drafts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
