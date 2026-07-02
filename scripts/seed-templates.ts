/**
 * Seed de Templates padrão (placeholders).
 * Uso: npx tsx scripts/seed-templates.ts <org_id>
 *
 * Como não temos imagens reais de templates neste momento,
 * este script cria registros no banco com metadados pré-preenchidos.
 * As imagens devem ser adicionadas depois via upload ou diretamente no Storage.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const SEED_TEMPLATES = [
  // Anúncios (4)
  {
    name: "Anúncio Feed — Expert com CTA",
    category: "anuncio",
    tags: ["expert", "pessoa", "cta", "feed"],
    copy_elements: [
      { type: "headline", text_found: "Título principal", position: "centro" },
      { type: "mini_copy", text_found: "Texto de apoio", position: "abaixo do título" },
      { type: "cta", text_found: "Saiba mais", position: "rodapé" },
    ],
    mini_prompt: "Manter a pessoa como elemento central, headline no topo, CTA em botão no rodapé.",
  },
  {
    name: "Anúncio Feed — Produto Destaque",
    category: "anuncio",
    tags: ["produto", "clean", "feed"],
    copy_elements: [
      { type: "headline", text_found: "Nome do produto", position: "topo" },
      { type: "mini_copy", text_found: "Benefício principal", position: "centro" },
      { type: "cta", text_found: "Compre agora", position: "rodapé" },
    ],
    mini_prompt: "Layout limpo com produto centralizado, fundo sólido, headline em destaque.",
  },
  {
    name: "Anúncio Feed — Ebook / Lead Magnet",
    category: "anuncio",
    tags: ["ebook", "lead-magnet", "download", "feed"],
    copy_elements: [
      { type: "headline", text_found: "Título do ebook", position: "topo" },
      { type: "subtitle", text_found: "Subtítulo descritivo", position: "abaixo do título" },
      { type: "cta", text_found: "Baixe grátis", position: "rodapé" },
    ],
    mini_prompt: "Mockup do ebook em ângulo, cores vibrantes, headline chamativa.",
  },
  {
    name: "Anúncio Feed — Depoimento / Prova Social",
    category: "anuncio",
    tags: ["depoimento", "prova-social", "feed"],
    copy_elements: [
      { type: "quote", text_found: "Citação do cliente", position: "centro" },
      { type: "headline", text_found: "Resultado obtido", position: "topo" },
      { type: "cta", text_found: "Quero o mesmo resultado", position: "rodapé" },
    ],
    mini_prompt: "Layout com aspas grandes, foto pequena do cliente, destaque no resultado numérico.",
  },
  // Posts (3)
  {
    name: "Post Carrossel — Dica Educativa",
    category: "post",
    tags: ["educativo", "dica", "carrossel"],
    copy_elements: [
      { type: "headline", text_found: "Título da dica", position: "topo" },
      { type: "mini_copy", text_found: "Explicação resumida", position: "centro" },
    ],
    mini_prompt: "Slide de carrossel com tipografia grande, fundo colorido, ícone ilustrativo.",
  },
  {
    name: "Post Feed — Frase de Impacto",
    category: "post",
    tags: ["frase", "impacto", "minimalista"],
    copy_elements: [
      { type: "headline", text_found: "Frase principal", position: "centro" },
    ],
    mini_prompt: "Fundo escuro, frase centralizada em fonte grande e impactante.",
  },
  {
    name: "Post Feed — Antes e Depois",
    category: "post",
    tags: ["antes-depois", "transformacao", "resultado"],
    copy_elements: [
      { type: "headline", text_found: "Antes vs Depois", position: "topo" },
      { type: "mini_copy", text_found: "Descrição da transformação", position: "centro" },
    ],
    mini_prompt: "Split layout (esquerda/direita), cores contrastantes, números em destaque.",
  },
  // Stories (3)
  {
    name: "Story — CTA com Urgência",
    category: "story",
    tags: ["urgencia", "cta", "oferta"],
    copy_elements: [
      { type: "headline", text_found: "Oferta limitada", position: "centro" },
      { type: "cta", text_found: "Arraste para cima", position: "rodapé" },
    ],
    mini_prompt: "Fundo vibrante, texto grande com urgência, seta indicando swipe up.",
  },
  {
    name: "Story — Expert Falando",
    category: "story",
    tags: ["expert", "pessoa", "autoridade"],
    copy_elements: [
      { type: "headline", text_found: "Tema do conteúdo", position: "topo" },
      { type: "mini_copy", text_found: "Resumo do que será falado", position: "rodapé" },
    ],
    mini_prompt: "Foto do expert em destaque, texto no topo, barra com nome/cargo no rodapé.",
  },
  {
    name: "Story — Enquete / Engajamento",
    category: "story",
    tags: ["enquete", "engajamento", "interativo"],
    copy_elements: [
      { type: "headline", text_found: "Pergunta", position: "centro" },
    ],
    mini_prompt: "Fundo colorido, pergunta centralizada, espaço para opções/sticker de enquete.",
  },
];

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error("Uso: npx tsx scripts/seed-templates.ts <org_id>");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verificar se já existem templates de sistema
  const { data: existing } = await supabase
    .from("criativos_templates")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_system", true);

  if (existing && existing.length >= 10) {
    console.log("Templates de sistema já existem. Pulando seed.");
    return;
  }

  const toInsert = SEED_TEMPLATES.map((t) => ({
    ...t,
    org_id: orgId,
    file_path: `seed/${t.category}-placeholder.png`,
    is_system: true,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from("criativos_templates")
    .insert(toInsert)
    .select("id, name, category");

  if (error) {
    console.error("Erro ao inserir templates:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${data.length} templates criados:`);
  const byCategory = { anuncio: 0, post: 0, story: 0 };
  data.forEach((t) => {
    byCategory[t.category as keyof typeof byCategory]++;
    console.log(`   - [${t.category}] ${t.name} (${t.id})`);
  });
  console.log(`\n   Resumo: ${byCategory.anuncio} anúncios, ${byCategory.post} posts, ${byCategory.story} stories`);
  console.log("\n⚠️  Imagens placeholder. Substitua em Storage > templates > seed/");
}

main();
