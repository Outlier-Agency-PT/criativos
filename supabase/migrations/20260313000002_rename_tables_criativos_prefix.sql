-- Renomear tabelas do Criativos com prefixo criativos_
-- Banco compartilhado: evitar conflito com outros projetos

ALTER TABLE api_keys RENAME TO criativos_api_keys;
ALTER TABLE brand_kits RENAME TO criativos_brand_kits;
ALTER TABLE creatives RENAME TO criativos_creatives;
ALTER TABLE expert_photos RENAME TO criativos_expert_photos;
ALTER TABLE generation_projects RENAME TO criativos_generation_projects;
ALTER TABLE personas RENAME TO criativos_personas;
ALTER TABLE project_copies RENAME TO criativos_project_copies;
ALTER TABLE project_photos RENAME TO criativos_project_photos;
ALTER TABLE project_templates RENAME TO criativos_project_templates;
ALTER TABLE templates RENAME TO criativos_templates;
