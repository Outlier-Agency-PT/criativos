/**
 * Script de importação em lote de templates
 *
 * Uso:
 *   node scripts/import-templates.mjs <pasta> <orgId> [categoria]
 *
 * Exemplo:
 *   node scripts/import-templates.mjs ~/Desktop/templates abc123-org-id feed
 *
 * O script vai:
 *   1. Ler todas as imagens da pasta (PNG, JPG, JPEG, WEBP)
 *   2. Detectar dimensões (width × height)
 *   3. Gerar nome limpo a partir do nome do arquivo
 *   4. Fazer upload para Supabase Storage (bucket: templates)
 *   5. Inserir registro em criativos_templates
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readdir, readFile } from "fs/promises";
import { join, extname, basename } from "path";
import { existsSync } from "fs";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias. Rode com:");
  console.error("   SUPABASE_SERVICE_KEY=... node scripts/import-templates.mjs ...");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Args ─────────────────────────────────────────────────────────────────────

const [,, folderPath, orgId, categoryArg] = process.argv;

if (!folderPath || !orgId) {
  console.error("Uso: node scripts/import-templates.mjs <pasta> <orgId> [categoria]");
  console.error("Exemplo: node scripts/import-templates.mjs ~/Desktop/templates abc123 feed");
  process.exit(1);
}

if (!existsSync(folderPath)) {
  console.error(`❌ Pasta não encontrada: ${folderPath}`);
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPPORTED = [".png", ".jpg", ".jpeg", ".webp"];

/** Gera nome amigável a partir do nome do arquivo */
function generateName(filename) {
  return basename(filename, extname(filename))
    .replace(/[-_]+/g, " ")          // hífens/underscores → espaço
    .replace(/\s+/g, " ")            // múltiplos espaços → 1
    .replace(/\b\w/g, (c) => c.toUpperCase()) // Title Case
    .trim();
}

/** Detecta categoria pelo tamanho (fallback) */
function detectCategory(width, height) {
  if (categoryArg) return categoryArg;
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "feed";           // quadrado
  if (ratio < 0.75) return "stories";                      // vertical
  if (ratio > 1.5) return "horizontal";
  return "feed";
}

/** Detecta formato pelo tamanho */
function detectFormat(width, height) {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "quadrado (1:1)";
  if (Math.abs(ratio - 0.8) < 0.05) return "feed (4:5)";
  if (Math.abs(ratio - 0.5625) < 0.05) return "stories (9:16)";
  if (ratio > 1.5) return "banner";
  return `${width}×${height}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const files = await readdir(folderPath);
  const images = files.filter((f) => SUPPORTED.includes(extname(f).toLowerCase()));

  if (images.length === 0) {
    console.error("❌ Nenhuma imagem encontrada na pasta. Suportados: PNG, JPG, JPEG, WEBP");
    process.exit(1);
  }

  console.log(`\n📂 Pasta: ${folderPath}`);
  console.log(`🏢 Org ID: ${orgId}`);
  console.log(`🖼  ${images.length} imagens encontradas\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const filename of images) {
    const filePath = join(folderPath, filename);
    const name = generateName(filename);
    const ext = extname(filename).toLowerCase();

    try {
      // 1. Ler arquivo e detectar dimensões
      const buffer = await readFile(filePath);
      const meta = await sharp(buffer).metadata();
      const width = meta.width ?? 1080;
      const height = meta.height ?? 1080;
      const category = detectCategory(width, height);
      const format = detectFormat(width, height);

      // 2. Definir path no storage
      const storagePath = `${orgId}/${Date.now()}-${filename}`;

      // Verificar se já existe (por nome)
      const { data: existing } = await supabase
        .from("criativos_templates")
        .select("id")
        .eq("org_id", orgId)
        .eq("name", name)
        .limit(1);

      if (existing?.length > 0) {
        console.log(`⏭  Pulando "${name}" (já existe)`);
        skip++;
        continue;
      }

      // 3. Upload para Storage
      const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      const { error: uploadError } = await supabase.storage
        .from("templates")
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

      if (uploadError) {
        console.error(`❌ Upload falhou para "${filename}": ${uploadError.message}`);
        fail++;
        continue;
      }

      // 4. Inserir no banco
      // Tentar inserir com dimensões; se a coluna não existir, inserir sem elas
      const record = {
        name,
        category,
        tags: [category, format.split(" ")[0].toLowerCase()],
        file_path: storagePath,
        thumbnail_path: storagePath,
        copy_elements: null,
        mini_prompt: null,
        org_id: orgId,
        is_system: false,
        is_active: true,
      };

      // Tentar com width/height primeiro
      let { error: insertError } = await supabase
        .from("criativos_templates")
        .insert({ ...record, width, height });

      // Se falhou por causa das colunas, inserir sem elas
      if (insertError?.message?.includes("width") || insertError?.message?.includes("height")) {
        console.warn(`   ⚠️  Colunas width/height não existem, inserindo sem dimensões`);
        ({ error: insertError } = await supabase.from("criativos_templates").insert(record));
      }

      if (insertError) {
        // Limpar upload se insert falhou
        await supabase.storage.from("templates").remove([storagePath]);
        console.error(`❌ Insert falhou para "${name}": ${insertError.message}`);
        fail++;
        continue;
      }

      console.log(`✅ "${name}" — ${width}×${height} (${format}, categoria: ${category})`);
      ok++;

    } catch (err) {
      console.error(`❌ Erro ao processar "${filename}": ${err.message}`);
      fail++;
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ Importados:  ${ok}`);
  if (skip > 0) console.log(`⏭  Pulados:    ${skip} (já existiam)`);
  if (fail > 0) console.log(`❌ Com erro:   ${fail}`);
  console.log(`─────────────────────────────────────\n`);
}

run().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
