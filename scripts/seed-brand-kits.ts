/**
 * Seed de Brand Kits padrão.
 * Uso: npx tsx scripts/seed-brand-kits.ts <org_id>
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const BRAND_KITS = [
  {
    name: "Minimalista",
    colors: {
      primary: "#1a1a1a",
      secondary: "#666666",
      accent: "#000000",
      background: "#ffffff",
      text: "#1a1a1a",
    },
    fonts: {
      heading: { family: "Inter", weight: "700" },
      body: { family: "Inter", weight: "400" },
    },
    is_system: true,
    is_default: false,
  },
  {
    name: "Corporativo",
    colors: {
      primary: "#1e3a5f",
      secondary: "#4a6fa5",
      accent: "#c0392b",
      background: "#f8f9fa",
      text: "#2c3e50",
    },
    fonts: {
      heading: { family: "Georgia", weight: "700" },
      body: { family: "Open Sans", weight: "400" },
    },
    is_system: true,
    is_default: false,
  },
  {
    name: "Moderno",
    colors: {
      primary: "#6c5ce7",
      secondary: "#a29bfe",
      accent: "#fd79a8",
      background: "#0d0d0d",
      text: "#ffffff",
    },
    fonts: {
      heading: { family: "Poppins", weight: "800" },
      body: { family: "Poppins", weight: "400" },
    },
    is_system: true,
    is_default: false,
  },
];

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Uso: npx tsx scripts/seed-brand-kits.ts <org_id>");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verificar se já existem brand kits de sistema
  const { data: existing } = await supabase
    .from("brand_kits")
    .select("name")
    .eq("org_id", orgId)
    .eq("is_system", true);

  if (existing && existing.length >= 3) {
    console.log("Brand kits de sistema já existem. Pulando seed.");
    return;
  }

  const toInsert = BRAND_KITS.map((kit) => ({
    ...kit,
    org_id: orgId,
  }));

  const { data, error } = await supabase
    .from("brand_kits")
    .insert(toInsert)
    .select("id, name");

  if (error) {
    console.error("Erro ao inserir brand kits:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length} brand kits criados:`);
  data.forEach((kit) => console.log(`   - ${kit.name} (${kit.id})`));
}

main();
