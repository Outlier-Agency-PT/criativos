-- Associa cada projeto ao utilizador cliente dono.
-- NULL = projeto existente sem cliente definido (visível apenas a super admins).
-- Funcionários (is_super_admin = true) veem todos os projetos independentemente.
ALTER TABLE criativos_generation_projects
  ADD COLUMN IF NOT EXISTS client_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gen_projects_client_user_id
  ON criativos_generation_projects(client_user_id);
