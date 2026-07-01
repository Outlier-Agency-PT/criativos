import {
  loadEnv,
  createSupabaseAdmin,
  downloadStorageObject,
  uploadStorageObject,
  optimizeImageBuffer,
  probeImageBuffer,
  parseFlags,
} from "./image-maintenance-utils.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1600;

const SOURCES = [
  {
    name: "expert-photos",
    bucket: "expert-photos",
    table: "criativos_expert_photos",
    fields: "id, file_path, mime_type, width, height, file_name",
  },
  {
    name: "templates",
    bucket: "templates",
    table: "criativos_templates",
    fields: "id, file_path, thumbnail_path, width, height, name",
  },
];

async function main() {
  await loadEnv();
  const supabase = createSupabaseAdmin();
  const { apply, bucket } = parseFlags(process.argv.slice(2));

  const selectedSources = bucket
    ? SOURCES.filter((source) => source.bucket === bucket)
    : SOURCES;

  const summary = [];

  for (const source of selectedSources) {
    const { data: rows, error } = await supabase
      .from(source.table)
      .select(source.fields)
      .not("file_path", "is", null);

    if (error) {
      throw new Error(`Falha ao listar ${source.name}: ${error.message}`);
    }

    let optimizedCount = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const row of rows || []) {
      const filePath = row.file_path;
      if (!filePath) continue;

      const mimeType = row.mime_type || (String(filePath).endsWith(".png") ? "image/png" : "image/jpeg");
      const originalBuffer = await downloadStorageObject(supabase, source.bucket, filePath);
      bytesBefore += originalBuffer.length;

      const currentDimensions =
        typeof row.width === "number" && typeof row.height === "number"
          ? { width: row.width, height: row.height }
          : await probeImageBuffer(originalBuffer, filePath);

      const shouldInspect =
        originalBuffer.length > MAX_BYTES ||
        currentDimensions.width > MAX_DIMENSION ||
        currentDimensions.height > MAX_DIMENSION;

      if (!shouldInspect) {
        bytesAfter += originalBuffer.length;
        continue;
      }

      const optimized = await optimizeImageBuffer({
        buffer: originalBuffer,
        originalPath: filePath,
        mimeType,
        maxDimension: MAX_DIMENSION,
      });

      const hasMeaningfulGain = optimized.buffer.length < originalBuffer.length * 0.98;

      if (!hasMeaningfulGain) {
        bytesAfter += originalBuffer.length;
        continue;
      }

      bytesAfter += optimized.buffer.length;
      optimizedCount += 1;

      if (apply) {
        await uploadStorageObject(supabase, source.bucket, filePath, optimized.buffer, mimeType);

        const updates = {};
        if ("width" in row) updates.width = optimized.width || row.width || null;
        if ("height" in row) updates.height = optimized.height || row.height || null;

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from(source.table)
            .update(updates)
            .eq("id", row.id);

          if (updateError) {
            throw new Error(`Falha ao atualizar metadados de ${source.name}/${row.id}: ${updateError.message}`);
          }
        }
      }
    }

    summary.push({
      source: source.name,
      apply,
      rows: rows?.length || 0,
      optimizedCount,
      estimatedSavingsBytes: Math.max(0, bytesBefore - bytesAfter),
    });
  }

  console.log(JSON.stringify({ summary }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
