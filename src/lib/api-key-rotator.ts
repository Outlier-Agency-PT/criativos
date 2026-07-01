import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decryptKey } from "./crypto";
import * as gemini from "./gemini";
import * as openrouter from "./openrouter";
import * as wisgate from "./wisgate";
import * as imagen from "./imagen";
import { isImagenModel, isGemini3ImageModel, REQUIRE_GEMINI3_FOR_IMAGE, getTextModelById, DEFAULT_TEXT_MODEL_CHAIN } from "./models";
import * as anthropic from "./anthropic";
import * as openaiText from "./openai-text";
import { isRateLimit, isOutOfCredit, parseStatusFromMessage } from "./config/error-patterns";
import { ENDPOINTS } from "@/lib/config/endpoints";
import type { GenerateCreativeInput, GenerateCreativeResult } from "./gemini";

const ERROR_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
const MAX_RETRIES_PER_KEY = 2; // Reduzido de 3 para 2 â€” falhar rÃ¡pido e tentar prÃ³xima key
const BASE_DELAY_MS = 500; // Reduzido de 1000 â€” backoff mais rÃ¡pido

interface ApiKeyRecord {
  id: string;
  provider: string;
  model: string;
  encrypted_key: string;
  priority: number;
  is_active: boolean;
  last_error: string | null;
  error_count: number;
  last_used_at: string | null;
}

interface AvailableKey {
  key: string;
  provider: string;
  model: string;
  keyId: string;
}

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* service key - sem cookies */ },
      },
    }
  );
}

function isKeyInCooldown(record: ApiKeyRecord): boolean {
  if (!record.last_error || record.error_count === 0) return false;
  const lastErrorTime = new Date(record.last_error).getTime();
  return Date.now() - lastErrorTime < ERROR_COOLDOWN_MS;
}

/**
 * Busca a prÃ³xima API key disponÃ­vel para uma organizaÃ§Ã£o.
 * Pula keys com erro recente (<5 min).
 */
export async function getNextAvailableKey(orgId: string): Promise<AvailableKey | null> {
  const supabase = await getSupabase();

  const { data: keys, error } = await supabase
    .from("criativos_api_keys")
    .select("id, provider, model, encrypted_key, priority, is_active, last_error, error_count, last_used_at")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !keys?.length) return null;

  for (const record of keys as ApiKeyRecord[]) {
    if (isKeyInCooldown(record)) continue;

    try {
      const key = decryptKey(record.encrypted_key);
      return { key, provider: record.provider, model: record.model, keyId: record.id };
    } catch (err) {
      console.error(`[api-key-rotator] Falha ao descriptografar key ${record.id.slice(0, 8)}:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  return null;
}

/**
 * Marca uma key com erro (rate limit, falha, etc).
 * Incremento ATOMICO via RPC Postgres (criativos_increment_key_error): evita
 * corrida de read-then-write quando duas geracoes concorrentes marcam erro na
 * mesma key ao mesmo tempo. A RPC tambem seta last_error = now().
 */
export async function markKeyError(keyId: string, errorMessage: string): Promise<void> {
  const supabase = await getSupabase();

  const { data: newCount, error } = await supabase.rpc("criativos_increment_key_error", {
    p_key_id: keyId,
  });

  if (error) {
    console.warn(`[api-key-rotator] Falha ao incrementar error_count da key ${keyId.slice(0, 8)}: ${error.message}`);
  }

  console.error(`[api-key-rotator] Key ${keyId.slice(0, 8)} erro #${newCount ?? "?"}: ${errorMessage}`);
}

/**
 * Marca uma key como usada com sucesso.
 */
export async function markKeySuccess(keyId: string): Promise<void> {
  const supabase = await getSupabase();
  await supabase
    .from("criativos_api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      error_count: 0,
      last_error: null,
    })
    .eq("id", keyId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Carrega a cadeia de modelos de texto configurada para a org (primÃ¡rio + fallbacks).
 * Se nÃ£o houver config, usa DEFAULT_TEXT_MODEL_CHAIN (Haiku â†’ GPT-4o mini â†’ Gemini 2.5 Flash).
 */
async function getTextModelChain(orgId: string): Promise<string[]> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("criativos_text_model_config")
    .select("model_chain")
    .eq("org_id", orgId)
    .maybeSingle();

  const chain = data?.model_chain;
  if (Array.isArray(chain) && chain.length > 0 && chain.every((m) => typeof m === "string")) {
    return chain as string[];
  }
  return DEFAULT_TEXT_MODEL_CHAIN;
}

/**
 * Gera texto via WisGate/OpenRouter (APIs compatÃ­veis com OpenAI) usando uma key relay.
 * `textModelId` Ã© o modelo Gemini de texto desejado (ex: gemini-2.5-flash).
 */
async function generateTextViaRelay(
  provider: "wisgate" | "openrouter",
  apiKey: string,
  textModelId: string,
  prompt: string,
  imageData?: { mimeType: string; data: string },
): Promise<string> {
  const isWisgate = provider === "wisgate";
  const endpoint = isWisgate
    ? ENDPOINTS.WISGATE_CHAT
    : ENDPOINTS.OPENROUTER;

  let model = textModelId;
  if (!isWisgate) {
    const openrouterModelMap: Record<string, string> = {
      "gemini-2.5-flash": "google/gemini-2.5-flash",
      "gemini-2.0-flash": "google/gemini-2.0-flash-001",
    };
    model = openrouterModelMap[textModelId] ?? `google/${textModelId}`;
  }

  const messages: { role: string; content: unknown }[] = [];
  if (imageData) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${imageData.mimeType};base64,${imageData.data}` } },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) {
    throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Gera texto via Gemini direto (genai SDK). */
async function generateTextViaGemini(
  apiKey: string,
  textModelId: string,
  prompt: string,
  imageData?: { mimeType: string; data: string },
): Promise<string> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [{ text: prompt }];
  if (imageData) parts.push({ inlineData: imageData });

  const response = await ai.models.generateContent({
    model: textModelId,
    contents: [{ role: "user", parts }],
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Gera texto (copy) respeitando a cadeia de modelos configurada pela org.
 *
 * Para cada modelo na cadeia (em ordem de preferÃªncia):
 *   - descobre o provider do modelo (anthropic/openai/gemini)
 *   - acha uma key ATIVA compatÃ­vel com esse provider
 *   - tenta gerar; sucesso â†’ retorna; falha â†’ prÃ³ximo modelo da cadeia
 *
 * Modelos "gemini" aceitam tanto key Gemini direta quanto relay WisGate/OpenRouter.
 * Usado em persona-generate, copy-generate, template-analyze.
 */
export async function generateTextWithRotation(
  orgId: string,
  prompt: string,
  imageData?: { mimeType: string; data: string }
): Promise<string> {
  const supabase = await getSupabase();

  const { data: keys } = await supabase
    .from("criativos_api_keys")
    .select("id, provider, model, encrypted_key, priority, is_active, last_error, error_count, last_used_at")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (!keys?.length) {
    throw new Error("Nenhuma API key configurada. Acesse ConfiguraÃ§Ãµes > API Keys.");
  }

  const records = keys as ApiKeyRecord[];
  const chain = await getTextModelChain(orgId);
  const errors: string[] = [];

  // Acha as keys ativas (fora de cooldown) que sabem falar com um provider de texto.
  function keysFor(textProvider: "anthropic" | "openai" | "gemini"): ApiKeyRecord[] {
    return records.filter((r) => {
      if (isKeyInCooldown(r)) return false;
      if (textProvider === "anthropic") return r.provider === "anthropic";
      if (textProvider === "openai") return r.provider === "openai";
      // gemini: key Gemini direta OU relay OpenAI-compat
      return r.provider === "gemini" || r.provider === "wisgate" || r.provider === "openrouter";
    });
  }

  for (const textModelId of chain) {
    const textModel = getTextModelById(textModelId);
    if (!textModel) {
      errors.push(`${textModelId}: modelo de texto desconhecido`);
      continue;
    }

    const candidateKeys = keysFor(textModel.provider);
    if (candidateKeys.length === 0) {
      errors.push(`${textModel.name}: nenhuma key ${textModel.provider} ativa`);
      continue;
    }

    for (const record of candidateKeys) {
      let decryptedKey: string;
      try {
        decryptedKey = decryptKey(record.encrypted_key);
      } catch {
        errors.push(`${record.id.slice(0, 8)}: decrypt falhou`);
        continue;
      }

      try {
        let text: string;
        if (textModel.provider === "anthropic") {
          text = await anthropic.generateText(decryptedKey, prompt, textModelId);
        } else if (textModel.provider === "openai") {
          text = await openaiText.generateText(decryptedKey, prompt, textModelId);
        } else if (record.provider === "wisgate" || record.provider === "openrouter") {
          text = await generateTextViaRelay(record.provider, decryptedKey, textModelId, prompt, imageData);
        } else {
          text = await generateTextViaGemini(decryptedKey, textModelId, prompt, imageData);
        }

        if (!text?.trim()) throw new Error("resposta vazia");
        await markKeySuccess(record.id);
        console.log(`[generateTextWithRotation] copy via ${textModel.name} (key ${record.id.slice(0, 8)})`);
        return text;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = parseStatusFromMessage(message);

        // Mesma hierarquia da geracao de imagem:
        // 1. sem credito/billing -> marca e pula a key (nao adianta retentar)
        // 2. rate-limit/sobrecarga -> marca pra cooldown e segue pra proxima key
        // 3. erro definitivo -> marca e segue
        if (isOutOfCredit(message, status)) {
          await markKeyError(record.id, message);
          errors.push(`${textModel.name}/${record.provider} (${record.id.slice(0, 8)}): sem crÃ©dito/billing â€” ${message.slice(0, 140)}`);
          continue;
        }
        if (isRateLimit(message, status)) {
          await markKeyError(record.id, message);
          errors.push(`${textModel.name}/${record.provider} (${record.id.slice(0, 8)}): rate-limit â€” ${message.slice(0, 140)}`);
          continue;
        }
        await markKeyError(record.id, message);
        errors.push(`${textModel.name}/${record.provider} (${record.id.slice(0, 8)}): ${message.slice(0, 160)}`);
        continue;
      }
    }
  }

  throw new Error(
    `NÃ£o foi possÃ­vel gerar a copy. Verifique se hÃ¡ key do provider do modelo escolhido (ConfiguraÃ§Ãµes > Modelo de texto).\n${errors.map((e) => `â€¢ ${e}`).join("\n")}`
  );
}

/**
 * Seleciona o client correto baseado no provider e modelo.
 */
function getClient(provider: string, model: string) {
  if (isImagenModel(model)) return imagen;
  if (provider === "wisgate") return wisgate;
  if (provider === "openrouter") return openrouter;
  return gemini;
}

/**
 * EP08 S08.8: Gera um criativo com rotaÃ§Ã£o de keys e suporte a modelo preferido.
 * Prioridade de fallback:
 *   1. Keys com modelo preferido (por prioridade)
 *   2. Keys com outros modelos Gemini (fallback)
 *   3. Keys OpenRouter (Ãºltimo recurso)
 */
export async function generateWithRotation(
  orgId: string,
  input: GenerateCreativeInput,
  preferredModel?: string,
  options?: { requireImageInput?: boolean }
): Promise<GenerateCreativeResult & { provider: string; model: string; keyId: string; fallbackUsed: boolean }> {
  const supabase = await getSupabase();

  const { data: keys, error } = await supabase
    .from("criativos_api_keys")
    .select("id, provider, model, encrypted_key, priority, is_active, last_error, error_count, last_used_at")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !keys?.length) {
    throw new Error("Nenhuma API key configurada. Acesse ConfiguraÃ§Ãµes > API Keys.");
  }

  // Ordenar: keys com modelo preferido primeiro, depois outros
  let allKeys = (keys as ApiKeyRecord[]).filter((record) =>
    options?.requireImageInput ? !isImagenModel(record.model) : true
  );

  // BLOQUEIO DE QUALIDADE (decisÃ£o do usuÃ¡rio 2026-06-02): geraÃ§Ã£o de imagem
  // SÃ“ com Gemini 3. Outros modelos entregam qualidade inferior e ficam de fora.
  if (REQUIRE_GEMINI3_FOR_IMAGE) {
    const g3 = allKeys.filter((record) => isGemini3ImageModel(record.model));
    if (g3.length === 0) {
      throw new Error(
        "Nenhuma API key com modelo Gemini 3 de imagem estÃ¡ configurada. " +
        "O sistema estÃ¡ bloqueado para usar APENAS Gemini 3 (gemini-3-pro-image-preview ou gemini-3.1-flash-image-preview) na geraÃ§Ã£o. " +
        "Cadastre/ative uma key Gemini 3 funcional em ConfiguraÃ§Ãµes > API Keys."
      );
    }
    allKeys = g3;
  }

  if (allKeys.length === 0) {
    throw new Error("Nenhuma API key com suporte a imagem configurada. Cadastre uma key Gemini/Nano Banana.");
  }

  const sortedKeys = preferredModel
    ? [
        ...allKeys.filter((k) => k.model === preferredModel),
        ...allKeys.filter((k) => k.model !== preferredModel && !isImagenModel(k.model)),
        ...allKeys.filter((k) => k.model !== preferredModel && isImagenModel(k.model)),
      ]
    : allKeys;

  const errors: string[] = [];

  for (const record of sortedKeys) {
    if (isKeyInCooldown(record)) {
      errors.push(`${record.model} (${record.id.slice(0, 8)}): em cooldown`);
      continue;
    }

    let decryptedKey: string;
    try {
      decryptedKey = decryptKey(record.encrypted_key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[api-key-rotator] Decrypt falhou para key ${record.id.slice(0, 8)}: ${msg}`);
      errors.push(`${record.model} (${record.id.slice(0, 8)}): falha ao descriptografar`);
      continue;
    }

    const client = getClient(record.provider, record.model);

    let lastError = "";
    for (let attempt = 0; attempt < MAX_RETRIES_PER_KEY; attempt++) {
      try {
        console.log(`[key-rotator] Tentativa ${attempt + 1}/${MAX_RETRIES_PER_KEY} com ${record.provider}/${record.model} (key ${record.id.slice(0, 8)})`);
        const t0 = Date.now();
        const result = await client.generateCreative(decryptedKey, input, record.model);
        console.log(`[key-rotator] Sucesso em ${Date.now() - t0}ms via ${record.provider}/${record.model}`);
        await markKeySuccess(record.id);
        const fallbackUsed = !!(preferredModel && record.model !== preferredModel);
        return { ...result, provider: record.provider, model: record.model, keyId: record.id, fallbackUsed };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = message;
        console.error(`[key-rotator] Falha tentativa ${attempt + 1}: ${message.slice(0, 200)}`);
        const status = parseStatusFromMessage(message);

        // SEM CRÃ‰DITO / BILLING ESGOTADO: diferente de rate-limit. Rate-limit passa
        // com o tempo; sem crÃ©dito NÃƒO passa â€” insistir Ã© desperdÃ­cio. Quando a key
        // estÃ¡ sem saldo, pulamos IMEDIATAMENTE pra prÃ³xima key (sem retry) e marcamos
        // erro pra ela entrar em cooldown e nÃ£o ser tentada de novo jÃ¡ a seguir.
        if (isOutOfCredit(message, status)) {
          console.log(`[key-rotator] Key ${record.id.slice(0, 8)} sem crÃ©dito/billing â€” pulando imediatamente pra prÃ³xima.`);
          await markKeyError(record.id, message);
          errors.push(`${record.model} (${record.id.slice(0, 8)}): sem crÃ©dito/billing â€” ${message.slice(0, 120)}`);
          break;
        }

        // Rate-limit temporÃ¡rio ou erro de servidor (500/503): vale a pena retentar a MESMA key.
        const isServerError = status === 500 || status === 503;
        if (isRateLimit(message, status) || isServerError) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.log(`[key-rotator] Rate limit/server error, retry em ${delay}ms`);
          await sleep(delay);
          continue;
        }

        await markKeyError(record.id, message);
        errors.push(`${record.model} (${record.id.slice(0, 8)}): ${message}`);
        break;
      }
    }

    if (lastError && !errors.some((e) => e.includes(record.id.slice(0, 8)))) {
      await markKeyError(record.id, lastError);
      errors.push(`${record.model} (${record.id.slice(0, 8)}): ${lastError} (apÃ³s ${MAX_RETRIES_PER_KEY} tentativas)`);
    }
  }

  throw new Error(
    `Todas as API keys falharam.\n\nDiagnÃ³stico:\n${errors.map((e) => `â€¢ ${e}`).join("\n")}`
  );
}

