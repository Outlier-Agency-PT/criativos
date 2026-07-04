import { NextRequest, NextResponse } from "next/server";
import { encryptKey } from "@/lib/crypto";
import { requireAuth, handleAuthError, whitelist } from "@/lib/api-auth";
import * as gemini from "@/lib/gemini";
import * as openrouter from "@/lib/openrouter";
import * as wisgate from "@/lib/wisgate";
import * as imagen from "@/lib/imagen";
import * as anthropic from "@/lib/anthropic";
import * as openaiText from "@/lib/openai-text";
import { isImagenModel, AI_MODELS, TEXT_MODELS } from "@/lib/models";

/** Testa conexão de uma key escolhendo o client certo pelo provider/modelo. */
async function testKeyConnection(provider: string, key: string, model: string): Promise<boolean> {
  if (provider === "anthropic") return anthropic.testConnection(key, model);
  if (provider === "openai") return openaiText.testConnection(key, model);
  if (isImagenModel(model)) return imagen.testConnection(key, model);
  if (provider === "wisgate") return wisgate.testConnection(key, model);
  if (provider === "openrouter") return openrouter.testConnection(key, model);
  return gemini.testConnection(key, model);
}

/**
 * GET /api/api-keys?orgId=xxx
 * Lista API keys (mascaradas) de uma org.
 * EP08: Inclui coluna model.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("criativos_api_keys")
      .select("id, provider, model, label, priority, is_active, last_used_at, created_at")
      .eq("org_id", orgId)
      .order("priority", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const masked = (data || []).map((k) => ({
      id: k.id,
      provider: k.provider,
      model: k.model,
      label: k.label,
      priority: k.priority,
      is_active: k.is_active,
      last_used_at: k.last_used_at,
      created_at: k.created_at,
      masked_key: `${
        k.provider === "gemini" ? "AIza"
        : k.provider === "anthropic" ? "sk-ant-"
        : k.provider === "openai" ? "sk-"
        : k.provider === "wisgate" ? "sk-"
        : "sk-or"
      }...****`,
    }));

    return NextResponse.json({ apiKeys: masked });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST /api/api-keys
 * Salva uma API key criptografada.
 * EP08: Inclui model.
 */
export async function POST(request: NextRequest) {
  try {
    const { key, provider, model, label, priority, orgId } = await request.json();
    const { supabase } = await requireAuth(orgId);

    if (!key || !provider || !orgId) {
      return NextResponse.json({ error: "key, provider e orgId obrigatórios" }, { status: 400 });
    }

    const encrypted = encryptKey(key);
    const keyHint = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "***";

    const { data, error } = await supabase
      .from("criativos_api_keys")
      .insert({
        org_id: orgId,
        provider,
        model: model || "gemini-2.5-flash",
        label: label || `${provider} Key`,
        encrypted_key: encrypted,
        key_hint: keyHint,
        priority: priority ?? 0,
        is_active: true,
      })
      .select("id, provider, model, label, priority")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ apiKey: data }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PUT /api/api-keys
 * Testa uma API key.
 * EP08: Testa com o modelo correto.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const orgId = body.orgId || null;
    const { supabase } = await requireAuth(orgId);

    // Teste de key existente por id
    if (body.id) {
      const { data: keyRow, error } = await supabase
        .from("criativos_api_keys")
        .select("encrypted_key, provider, model")
        .eq("id", body.id)
        .eq("org_id", orgId)
        .single();

      if (error || !keyRow) {
        return NextResponse.json({ ok: false, message: "Key não encontrada" }, { status: 404 });
      }

      const { decryptKey } = await import("@/lib/crypto");
      const plain = decryptKey(keyRow.encrypted_key);
      const model = keyRow.model || "gemini-2.5-flash";

      const ok = await testKeyConnection(keyRow.provider, plain, model);
      return NextResponse.json({ ok, message: ok ? "Conexão OK" : "Falha na conexão" });
    }

    // Teste de key avulsa
    const { key, provider, model } = body;

    if (!key || !provider) {
      return NextResponse.json({ error: "key e provider obrigatórios" }, { status: 400 });
    }

    const ok = await testKeyConnection(provider, key, model || "gemini-2.5-flash");
    return NextResponse.json({ ok, message: ok ? "Conexão OK" : "Falha na conexão" });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PATCH /api/api-keys
 * Atualiza campos de uma key (ex: is_active, label, priority, model).
 * EP08: model adicionado ao whitelist.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, orgId, newKey, ...rest } = body;
    const { supabase } = await requireAuth(orgId);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const safeUpdates: Record<string, unknown> = whitelist(rest, ["label", "priority", "is_active", "model"]);

    // Validar model contra whitelist de modelos suportados (imagem + texto)
    if (safeUpdates.model) {
      const validModelIds = [...AI_MODELS.map((m) => m.id), ...TEXT_MODELS.map((m) => m.id)];
      if (!validModelIds.includes(safeUpdates.model as string)) {
        return NextResponse.json({ error: `Modelo inválido: ${safeUpdates.model}` }, { status: 400 });
      }
    }

    // Atualizar a API Key se fornecida
    if (newKey && typeof newKey === "string" && newKey.trim()) {
      safeUpdates.encrypted_key = encryptKey(newKey.trim());
      safeUpdates.key_hint = newKey.length > 8 ? `${newKey.slice(0, 4)}...${newKey.slice(-4)}` : "***";
      safeUpdates.error_count = 0;
      safeUpdates.last_error = null;
    }

    const { data, error } = await supabase
      .from("criativos_api_keys")
      .update(safeUpdates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, provider, model, label, priority, is_active")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ apiKey: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * DELETE /api/api-keys?id=xxx
 * Remove uma API key.
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("criativos_api_keys")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleAuthError(err);
  }
}

