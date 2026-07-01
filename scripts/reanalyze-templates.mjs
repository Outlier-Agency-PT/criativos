#!/usr/bin/env node
/**
 * Re-analisa todos os templates existentes com o ANALYZE_PROMPT V2 enriquecido.
 * Preenche os novos campos: background, text_layout, person, spacing, logo_size_pct.
 *
 * Uso: node scripts/reanalyze-templates.mjs
 * Requer: .env.local com NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createDecipheriv } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carregar .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY;
const encryptionKey = env.ENCRYPTION_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_KEY no .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Decrypt API key — aes-256-gcm, formato iv:authTag:ciphertext (base64)
function decryptKey(encrypted) {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Formato inválido");
  const [ivB64, authTagB64, ciphertext] = parts;
  const key = Buffer.from(encryptionKey, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Buscar uma API key Gemini ativa
async function getGeminiKey() {
  const { data: keys } = await supabase
    .from("criativos_api_keys")
    .select("id, encrypted_key, model, provider, org_id")
    .eq("is_active", true)
    .order("priority", { ascending: true });

  console.log(`  Encontradas ${keys?.length || 0} keys ativas`);

  // Para análise Vision, precisamos de uma key Gemini direta (não openrouter/wisgate)
  // O modelo de análise é gemini-2.0-flash (text+vision), não o modelo de imagem
  for (const key of keys || []) {
    if (key.provider === "gemini") {
      try {
        const apiKey = decryptKey(key.encrypted_key);
        console.log(`  Usando key ${key.id.slice(0, 8)} (${key.provider}/${key.model})`);
        return { apiKey, model: "gemini-2.5-flash", provider: key.provider };
      } catch (e) {
        console.log(`  Key ${key.id.slice(0, 8)} decrypt falhou: ${e.message}`);
        continue;
      }
    }
  }
  throw new Error("Nenhuma API key Gemini direta encontrada");
}

const ANALYZE_PROMPT = `Você é um analista visual especialista em criativos publicitários. Analise a imagem do template anexada e retorne um JSON ESTRUTURADO com TODOS os detalhes necessários para recriar variações PIXEL-PERFECT deste template.

Retorne APENAS um JSON válido, sem markdown, sem comentários, neste formato exato:

{
  "mini_prompt": "Blueprint COMPLETO do layout em 4-8 frases. Descreva: (1) fundo — tipo exato, cores, gradiente, textura ou foto; (2) grid — use terços (ex: 'pessoa ocupa terço direito, texto nos 2/3 esquerdos'); (3) hierarquia de texto — posição, tamanho relativo ao quadro (ex: 'headline ocupa ~15% da altura, centralizado no terço superior'), espaçamento entre blocos; (4) pessoa — enquadramento (busto/meio-corpo/corpo-inteiro), posição no grid, direção do olhar; (5) elementos decorativos — linhas, formas, ícones, selos, badges. Seja PRECISO e REPRODUZÍVEL.",

  "background": {
    "type": "solid|gradient|photo|texture|pattern|blur",
    "description": "Descrição detalhada do fundo",
    "colors": ["#hex1", "#hex2"]
  },

  "text_layout": [
    {
      "role": "headline|subheadline|mini_copy|list_items|cta|badge|other",
      "text_found": "texto exato visível na imagem",
      "position": "topo-centro|centro-esquerda|rodapé-centro|etc",
      "grid_area": "terço superior|metade inferior|terço esquerdo|etc",
      "size_pct": 12,
      "style": "sans-serif bold uppercase tracking-wide|serif italic lowercase|etc",
      "color": "#hex da cor do texto",
      "lines": 1
    }
  ],

  "elements": [
    { "type": "headline|mini_copy|list_items|cta|subtitle|quote|badge|other", "text_found": "texto exato visível", "position": "topo|centro|rodapé|topo-esquerda|etc" }
  ],

  "person": {
    "present": true,
    "framing": "busto|meio-corpo|corpo-inteiro|rosto-close",
    "grid_position": "terço direito|centro|terço esquerdo|metade direita|etc",
    "coverage_pct": 40,
    "pose": "Descrição detalhada da pose",
    "clothing": "Descrição da vestimenta visível",
    "expression": "sorrindo|sério|confiante|animado|neutro|etc",
    "gaze_direction": "olhando para câmera|olhando para esquerda|etc"
  },

  "has_logo": true,
  "logo_position": "topo-esquerda|rodapé-centro|null se não tiver",
  "logo_size_pct": 5,

  "has_person": true,
  "person_pose": "Descrição completa da pose para face-swap",

  "dominant_colors": ["#rrggbb", "#rrggbb", "#rrggbb"],
  "visual_style": "dark|clean|foto_texto|prova_social|minimalista|colorido|gradiente|etc",

  "spacing": {
    "text_blocks_gap": "tight|normal|wide",
    "margin_edges_pct": 5,
    "overall_density": "denso|equilibrado|arejado"
  }
}

REGRAS CRÍTICAS:
- mini_prompt: 4-8 frases RICAS e REPRODUZÍVEIS.
- background: SEMPRE preencha.
- text_layout: para CADA bloco de texto visível, estime size_pct (% da altura total).
- person: se has_person=true, coverage_pct, expression e gaze_direction são OBRIGATÓRIOS.
- Se um campo não se aplica, use null para objetos e false para booleanos.
- Retorne APENAS o JSON. Sem explicação, sem markdown, sem cercas.`;

function parseAnalysis(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

async function analyzeTemplate(ai, imageBuffer) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{
      role: "user",
      parts: [
        { text: ANALYZE_PROMPT },
        { inlineData: { mimeType: "image/png", data: imageBuffer.toString("base64") } },
      ],
    }],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseAnalysis(text);
}

async function main() {
  console.log("Buscando API key...");
  const { apiKey } = await getGeminiKey();
  const ai = new GoogleGenAI({ apiKey });

  console.log("Buscando templates sem análise V2...");
  const { data: templates, error } = await supabase
    .from("criativos_templates")
    .select("id, name, file_path, background")
    .eq("is_active", true)
    .is("background", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar templates:", error.message);
    process.exit(1);
  }

  console.log(`${templates.length} templates para re-analisar`);

  let success = 0;
  let errors = 0;

  for (const tmpl of templates) {
    console.log(`\n[${success + errors + 1}/${templates.length}] Analisando: ${tmpl.name} (${tmpl.id.slice(0, 8)})`);

    if (!tmpl.file_path) {
      console.log("  SKIP: sem file_path");
      continue;
    }

    try {
      // Download imagem do template
      const { data: fileData, error: dlError } = await supabase.storage
        .from("templates")
        .download(tmpl.file_path);

      if (dlError || !fileData) {
        console.log(`  ERRO download: ${dlError?.message || "sem data"}`);
        errors++;
        continue;
      }

      const imageBuffer = Buffer.from(await fileData.arrayBuffer());
      console.log(`  Download OK (${(imageBuffer.length / 1024).toFixed(0)}KB), analisando...`);

      const analysis = await analyzeTemplate(ai, imageBuffer);

      if (!analysis) {
        console.log("  ERRO: análise retornou null");
        errors++;
        continue;
      }

      // Atualizar template com novos campos
      const updates = {
        mini_prompt: analysis.mini_prompt || undefined,
        background: analysis.background || null,
        text_layout: analysis.text_layout || null,
        person: analysis.person || null,
        spacing: analysis.spacing || null,
        logo_size_pct: typeof analysis.logo_size_pct === "number" ? analysis.logo_size_pct : null,
        has_logo: typeof analysis.has_logo === "boolean" ? analysis.has_logo : undefined,
        logo_position: analysis.logo_position || undefined,
        has_person: typeof analysis.has_person === "boolean" ? analysis.has_person : undefined,
        person_pose: analysis.person_pose || undefined,
        dominant_colors: Array.isArray(analysis.dominant_colors) ? analysis.dominant_colors : undefined,
        visual_style: analysis.visual_style || undefined,
        copy_elements: analysis.elements || undefined,
        analyzed_at: new Date().toISOString(),
      };

      // Remover undefined
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );

      const { error: updateError } = await supabase
        .from("criativos_templates")
        .update(cleanUpdates)
        .eq("id", tmpl.id);

      if (updateError) {
        console.log(`  ERRO update: ${updateError.message}`);
        errors++;
      } else {
        console.log(`  OK: ${analysis.mini_prompt?.slice(0, 80)}...`);
        success++;
      }

      // Rate limiting gentil — 1.5s entre requests
      await new Promise((r) => setTimeout(r, 1500));

    } catch (err) {
      console.log(`  ERRO: ${err.message}`);
      errors++;
      // Se for rate limit, esperar mais
      if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        console.log("  Rate limit detectado, esperando 30s...");
        await new Promise((r) => setTimeout(r, 30000));
      }
    }
  }

  console.log(`\n--- RESULTADO ---`);
  console.log(`OK: ${success} | Erros: ${errors} | Total: ${templates.length}`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
