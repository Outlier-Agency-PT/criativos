#!/usr/bin/env node
/**
 * Analisa todos os templates pendentes (analyzed_at IS NULL) via Gemini Vision
 * e grava mini_prompt, has_logo, has_person, person_pose, etc.
 *
 * Uso: node scripts/analyze-all-templates.mjs [--force] [--limit N]
 */
import { createDecipheriv } from "crypto";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync, spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

// Node fetch dá ECONNRESET intermitente com Cloudflare no macOS.
// Fallback pra curl (HTTP/2 estável, nativo).
function curlRequest(url, { method = "GET", headers = {}, body, binary = false } = {}) {
  // --retry 5 com --retry-all-errors lida com ECONNRESET/56
  const args = [
    "-sS", "--fail-with-body", "-X", method,
    "--max-time", "180",
    "--retry", "5",
    "--retry-delay", "2",
    "--retry-all-errors",
    "--connect-timeout", "30",
  ];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  let tmp;
  if (body) {
    tmp = join(tmpdir(), `curl-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    writeFileSync(tmp, body);
    args.push("--data-binary", `@${tmp}`);
  }
  args.push(url);
  try {
    const result = spawnSync("curl", args, {
      maxBuffer: 200 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || "";
      const stdout = result.stdout?.toString() || "";
      throw new Error(`curl exit ${result.status}: ${stderr.slice(0, 300)} ${stdout.slice(0, 300)}`);
    }
    return binary ? result.stdout : result.stdout.toString("utf8");
  } finally {
    if (tmp) { try { unlinkSync(tmp); } catch {} }
  }
}

// Carrega .env.local manualmente
const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ENCRYPTION_KEY) {
  console.error("Faltando env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, ENCRYPTION_KEY");
  process.exit(1);
}

const force = process.argv.includes("--force");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 500;

function decryptKey(encrypted) {
  const [ivB64, authTagB64, ciphertext] = encrypted.split(":");
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function sb(path, opts = {}) {
  const text = curlRequest(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    body: opts.body,
  });
  if (!text || text.trim() === "") return null;
  try { return JSON.parse(text); } catch { return text; }
}

function downloadStorage(bucket, path) {
  return curlRequest(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    binary: true,
  });
}

function getGeminiKey() {
  const keys = sb(
    "criativos_api_keys?select=id,provider,model,encrypted_key&is_active=eq.true&provider=eq.gemini&order=priority.asc&limit=10"
  );
  for (const k of keys) {
    try {
      return decryptKey(k.encrypted_key);
    } catch (e) {
      console.warn(`[key ${k.id.slice(0, 8)}] decrypt falhou: ${e.message}`);
    }
  }
  throw new Error("Nenhuma key Gemini ativa encontrada");
}

const ANALYZE_PROMPT = `Você é um analista visual de criativos publicitários. Analise a imagem do template anexada e retorne um JSON ESTRUTURADO descrevendo TUDO que será usado para recriar variações fiéis deste template.

Retorne APENAS um JSON válido, sem markdown, sem comentários, neste formato exato:

{
  "mini_prompt": "Descrição em prosa do LAYOUT como blueprint reproduzível: posição, tamanho relativo, peso visual, hierarquia, alinhamento, espaçamentos, estilo tipográfico, enquadramento de pessoa (se houver), fundo, e estilo geral. 2-5 frases ricas.",
  "elements": [{ "type": "headline|mini_copy|list_items|cta|subtitle|quote|other", "text_found": "texto exato visível", "position": "topo|centro|rodapé|etc" }],
  "has_logo": true|false,
  "logo_position": "topo-esquerda|rodapé-centro|null",
  "has_person": true|false,
  "person_pose": "Descrição precisa da pose, enquadramento, ângulo, expressão, vestimenta. null se não tiver pessoa.",
  "dominant_colors": ["#rrggbb"],
  "visual_style": "dark|clean|foto_texto|prova_social|minimalista|colorido|gradiente|etc"
}

REGRAS:
- has_logo: true SOMENTE se existir um logotipo de marca claro.
- person_pose: se has_person=true, esta descrição DEVE permitir face-swap preservando a pose original.
- Retorne APENAS o JSON. Sem explicação, sem markdown.`;

function callGemini(apiKey, imageBuffer) {
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [
          { text: ANALYZE_PROMPT },
          { inlineData: { mimeType: "image/png", data: imageBuffer.toString("base64") } },
        ],
      },
    ],
  });
  const text = curlRequest(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
  const data = JSON.parse(text);
  if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function parseAnalysis(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    return {
      mini_prompt: typeof p.mini_prompt === "string" ? p.mini_prompt.trim() : null,
      elements: Array.isArray(p.elements) ? p.elements : null,
      has_logo: typeof p.has_logo === "boolean" ? p.has_logo : null,
      logo_position: typeof p.logo_position === "string" && p.logo_position !== "null" ? p.logo_position : null,
      has_person: typeof p.has_person === "boolean" ? p.has_person : null,
      person_pose: typeof p.person_pose === "string" && p.person_pose !== "null" ? p.person_pose.trim() : null,
      dominant_colors: Array.isArray(p.dominant_colors) ? p.dominant_colors.filter((c) => typeof c === "string") : null,
      visual_style: typeof p.visual_style === "string" ? p.visual_style : null,
    };
  } catch {
    return null;
  }
}

function main() {
  console.log(`🔑 Buscando API key Gemini...`);
  const geminiKey = getGeminiKey();
  console.log(`✅ Key carregada (${geminiKey.slice(0, 10)}...)`);

  const filter = force ? "" : "&analyzed_at=is.null";
  const templates = sb(
    `criativos_templates?select=id,name,file_path${filter}&file_path=not.is.null&limit=${LIMIT}`
  );
  console.log(`📋 ${templates.length} templates para analisar${force ? " (FORCE)" : " (pendentes)"}\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const tag = `[${i + 1}/${templates.length}] ${t.name.slice(0, 50)}`;
    try {
      const buf = downloadStorage("templates", t.file_path);
      const raw = callGemini(geminiKey, buf);
      const parsed = parseAnalysis(raw);
      if (!parsed) throw new Error("parse falhou");

      // Normaliza strings: troca newlines reais por espaço (Cloudflare WAF bloqueia JSON com \n literal em campos de texto)
      const clean = (s) => typeof s === "string" ? s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() : s;
      const updates = { analyzed_at: new Date().toISOString() };
      if (parsed.mini_prompt) updates.mini_prompt = clean(parsed.mini_prompt);
      if (parsed.elements) {
        updates.copy_elements = parsed.elements.map((el) => ({
          ...el,
          text_found: clean(el.text_found),
          position: clean(el.position),
        }));
      }
      if (parsed.has_logo !== null) updates.has_logo = parsed.has_logo;
      if (parsed.logo_position) updates.logo_position = clean(parsed.logo_position);
      if (parsed.has_person !== null) updates.has_person = parsed.has_person;
      if (parsed.person_pose) updates.person_pose = clean(parsed.person_pose);
      if (parsed.dominant_colors) updates.dominant_colors = parsed.dominant_colors;
      if (parsed.visual_style) updates.visual_style = clean(parsed.visual_style);

      // Cloudflare WAF bloqueia PATCH com body grande contendo certos padrões.
      // Estratégia: mandar primitivos primeiro (sempre passa), depois cada texto
      // longo individualmente, tolerando falha por campo. Com pequeno sleep entre chamadas.
      const { copy_elements, mini_prompt, person_pose, ...primitives } = updates;

      const patchField = (payload) => {
        try {
          sb(`criativos_templates?id=eq.${t.id}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(payload),
          });
          return true;
        } catch {
          return false;
        }
      };

      // 1. Primitivos (pequeno, sempre passa)
      const primOk = patchField(primitives);
      if (!primOk) throw new Error("WAF bloqueou até primitivos");

      // 2. Textos longos, um por vez, tolerando falha
      const missed = [];
      if (mini_prompt && !patchField({ mini_prompt })) missed.push("mini_prompt");
      if (person_pose && !patchField({ person_pose })) missed.push("person_pose");
      if (copy_elements && !patchField({ copy_elements })) missed.push("copy_elements");

      if (missed.length > 0) {
        console.log(`  ⚠️ campos bloqueados pelo WAF: ${missed.join(", ")}`);
      }

      ok++;
      const flags = [parsed.has_person ? "👤" : "", parsed.has_logo ? "🏷" : ""].filter(Boolean).join("");
      console.log(`✅ ${tag} ${flags}`);
    } catch (err) {
      fail++;
      console.log(`❌ ${tag} → ${String(err.message || err).slice(0, 150)}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ OK: ${ok}    ❌ Erros: ${fail}    📊 Total: ${templates.length}`);
}

try {
  main();
} catch (err) {
  console.error("FATAL:", err);
  process.exit(1);
}
