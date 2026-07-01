import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { TEXT_MODELS, DEFAULT_TEXT_MODEL_CHAIN } from "@/lib/models";

const VALID_TEXT_MODEL_IDS = TEXT_MODELS.map((m) => m.id);

/**
 * GET /api/text-model-config?orgId=xxx
 * Retorna a cadeia ordenada de modelos de texto (copy) da org.
 * Se nÃ£o houver config salva, devolve o default.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    const { data } = await supabase
      .from("criativos_text_model_config")
      .select("model_chain")
      .eq("org_id", orgId)
      .maybeSingle();

    const chain = Array.isArray(data?.model_chain) && data.model_chain.length > 0
      ? (data.model_chain as string[])
      : DEFAULT_TEXT_MODEL_CHAIN;

    return NextResponse.json({ modelChain: chain });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PUT /api/text-model-config
 * Salva a cadeia ordenada de modelos de texto da org.
 * Body: { orgId, modelChain: string[] }
 */
export async function PUT(request: NextRequest) {
  try {
    const { orgId, modelChain } = await request.json();
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    if (!Array.isArray(modelChain) || modelChain.length === 0) {
      return NextResponse.json({ error: "modelChain deve ser uma lista nÃ£o vazia" }, { status: 400 });
    }

    const invalid = modelChain.filter((m) => !VALID_TEXT_MODEL_IDS.includes(m));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Modelo(s) de texto invÃ¡lido(s): ${invalid.join(", ")}` }, { status: 400 });
    }

    // Dedup preservando ordem
    const deduped = [...new Set(modelChain)];

    const { error } = await supabase
      .from("criativos_text_model_config")
      .upsert(
        { org_id: orgId, model_chain: deduped, updated_at: new Date().toISOString() },
        { onConflict: "org_id" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ modelChain: deduped });
  } catch (err) {
    return handleAuthError(err);
  }
}

