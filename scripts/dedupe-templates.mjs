import {
  loadEnv,
  createSupabaseAdmin,
  downloadStorageObject,
  sha256,
  normalizedVisualHashFromBuffer,
  parseFlags,
} from "./image-maintenance-utils.mjs";

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return groups;
}

async function loadTemplateUsage(supabase) {
  const [projectTemplates, creatives] = await Promise.all([
    supabase.from("criativos_project_templates").select("template_id"),
    supabase.from("criativos_creatives").select("template_id"),
  ]);

  if (projectTemplates.error) throw new Error(projectTemplates.error.message);
  if (creatives.error) throw new Error(creatives.error.message);

  const usage = new Map();
  for (const row of [...(projectTemplates.data || []), ...(creatives.data || [])]) {
    if (!row.template_id) continue;
    usage.set(row.template_id, (usage.get(row.template_id) || 0) + 1);
  }
  return usage;
}

function chooseCanonical(group, usageMap) {
  return [...group].sort((left, right) => {
    const usageDiff = (usageMap.get(right.id) || 0) - (usageMap.get(left.id) || 0);
    if (usageDiff !== 0) return usageDiff;
    const systemDiff = Number(Boolean(right.is_system)) - Number(Boolean(left.is_system));
    if (systemDiff !== 0) return systemDiff;
    return String(left.created_at).localeCompare(String(right.created_at));
  })[0];
}

async function main() {
  await loadEnv();
  const { apply } = parseFlags(process.argv.slice(2));
  const supabase = createSupabaseAdmin();

  const { data: templates, error } = await supabase
    .from("criativos_templates")
    .select("id, org_id, name, file_path, thumbnail_path, is_system, created_at");

  if (error) {
    throw new Error(`Falha ao listar templates: ${error.message}`);
  }

  const usageMap = await loadTemplateUsage(supabase);
  const enriched = [];

  for (const template of templates || []) {
    if (!template.file_path) continue;
    const buffer = await downloadStorageObject(supabase, "templates", template.file_path);
    enriched.push({
      ...template,
      sha256: sha256(buffer),
      visualHash: await normalizedVisualHashFromBuffer(buffer, template.file_path),
      size: buffer.length,
      usageCount: usageMap.get(template.id) || 0,
    });
  }

  const exactGroups = [...groupBy(enriched, (template) => template.sha256).values()]
    .filter((group) => group.length > 1);

  const visualGroups = [...groupBy(enriched, (template) => template.visualHash).values()]
    .filter((group) => group.length > 1);

  const exactSummary = [];
  const visualSummary = [];
  const processedTemplateIds = new Set();

  for (const group of exactGroups) {
    const canonical = chooseCanonical(group, usageMap);
    const duplicates = group.filter((item) => item.id !== canonical.id);
    duplicates.forEach((item) => processedTemplateIds.add(item.id));

    exactSummary.push({
      canonical: {
        id: canonical.id,
        name: canonical.name,
        file_path: canonical.file_path,
        usageCount: canonical.usageCount,
      },
      duplicates: duplicates.map((item) => ({
        id: item.id,
        name: item.name,
        file_path: item.file_path,
        usageCount: item.usageCount,
      })),
    });

    if (!apply) continue;

    const duplicateIds = duplicates.map((item) => item.id);

    const { error: projectUpdateError } = await supabase
      .from("criativos_project_templates")
      .update({ template_id: canonical.id })
      .in("template_id", duplicateIds);
    if (projectUpdateError) throw new Error(projectUpdateError.message);

    const { error: creativeUpdateError } = await supabase
      .from("criativos_creatives")
      .update({ template_id: canonical.id })
      .in("template_id", duplicateIds);
    if (creativeUpdateError) throw new Error(creativeUpdateError.message);

    for (const duplicate of duplicates) {
      if (duplicate.file_path && duplicate.file_path !== canonical.file_path) {
        await supabase.storage.from("templates").remove([duplicate.file_path]);
      }
      if (
        duplicate.thumbnail_path &&
        duplicate.thumbnail_path !== duplicate.file_path &&
        duplicate.thumbnail_path !== canonical.thumbnail_path
      ) {
        await supabase.storage.from("templates").remove([duplicate.thumbnail_path]);
      }
    }

    const { error: deleteError } = await supabase
      .from("criativos_templates")
      .delete()
      .in("id", duplicateIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  for (const group of visualGroups) {
    const canonical = chooseCanonical(group, usageMap);
    const duplicates = group.filter((item) => item.id !== canonical.id && !processedTemplateIds.has(item.id));
    if (duplicates.length === 0) continue;
    duplicates.forEach((item) => processedTemplateIds.add(item.id));

    visualSummary.push({
      canonical: {
        id: canonical.id,
        name: canonical.name,
        file_path: canonical.file_path,
        usageCount: canonical.usageCount,
      },
      duplicates: duplicates.map((item) => ({
        id: item.id,
        name: item.name,
        file_path: item.file_path,
        usageCount: item.usageCount,
      })),
    });

    if (!apply) continue;

    const duplicateIds = duplicates.map((item) => item.id);

    const { error: projectUpdateError } = await supabase
      .from("criativos_project_templates")
      .update({ template_id: canonical.id })
      .in("template_id", duplicateIds);
    if (projectUpdateError) throw new Error(projectUpdateError.message);

    const { error: creativeUpdateError } = await supabase
      .from("criativos_creatives")
      .update({ template_id: canonical.id })
      .in("template_id", duplicateIds);
    if (creativeUpdateError) throw new Error(creativeUpdateError.message);

    for (const duplicate of duplicates) {
      if (duplicate.file_path && duplicate.file_path !== canonical.file_path) {
        await supabase.storage.from("templates").remove([duplicate.file_path]);
      }
      if (
        duplicate.thumbnail_path &&
        duplicate.thumbnail_path !== duplicate.file_path &&
        duplicate.thumbnail_path !== canonical.thumbnail_path
      ) {
        await supabase.storage.from("templates").remove([duplicate.thumbnail_path]);
      }
    }

    const { error: deleteError } = await supabase
      .from("criativos_templates")
      .delete()
      .in("id", duplicateIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  console.log(JSON.stringify({
    apply,
    exactDuplicateGroups: exactSummary,
    visualDuplicateGroups: visualSummary,
    counts: {
      templates: enriched.length,
      exactDuplicateGroups: exactSummary.length,
      visualDuplicateGroups: visualSummary.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
