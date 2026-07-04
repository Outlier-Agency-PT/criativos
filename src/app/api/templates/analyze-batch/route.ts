import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

export const maxDuration = 300;

const ANALYZE_PROMPT = `Você é um analista visual de criativos publicitários. Analise a imagem do template anexada e retorne um JSON ESTRUTURADO descrevendo TUDO que será usado para recriar variações fiéis deste template.

Retorne APENAS um JSON válido, sem markdown:

{
  "mini_prompt": "Descrição em prosa do LAYOUT como blueprint reproduzível: posição, tamanho relativo, peso visual, hierarquia, alinhamento, espaçamentos, estilo tipográfico, enquadramento de pessoa (se houver), fundo, e estilo geral.",
  "elements": [{ "type": "headline|mini_copy|list_items|cta|subtitle|quote|other", "text_found": "texto exato", "position": "topo|centro|rodapé|etc" }],
  "has_logo": true|false,
  "logo_position": "topo-esquerda|null",
  "has_person": true|false,
  "person_pose": "Descrição precisa da pose, enquadramento, ângulo, expressão, vestimenta. null se não tiver pessoa.",
  "dominant_colors": ["#rrggbb"],
  "visual_style": "dark|clean|foto_texto|etc"
}

REGRAS:
- mini_prompt deve ter 2-5 frases ricas em detalhe espacial e tipográfico.
- elements: extraia TODO texto visível.
- has_logo: true SOMENTE se existir um logotipo de marca claro.
- person_pose: deve permitir face-swap preservando a pose original.
- Retorne APENAS o JSON.`;

interface ParsedAnalysis {
  mini_prompt: string | null;
  elements: { type: string; text_found: string; position?: string }[] | null;
  has_logo: boolean | null;
  logo_position: string | null;
  has_person: boolean | null;
  person_pose: string | null;
  dominant_colors: string[] | null;
  visual_style: string | null;
}

function parse(text: string): ParsedAnalysis | null {
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
      logo_position: typeof p.logo_position === "string" ? p.logo_position : null,
      has_person: typeof p.has_person === "boolean" ? p.has_person : null,
      person_pose: typeof p.person_pose === "string" ? p.person_pose.trim() : null,
      dominant_colors: Array.isArray(p.dominant_colors) ? p.dominant_colors.filter((c: unknown): c is string => typeof c === "string") : null,
      visual_style: typeof p.visual_style === "string" ? p.visual_style : null,
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/templates/analyze-batch
 * Roda análise visual em todos os templates da org que ainda não foram analisados.
 * Body: { orgId, force?: boolean (re-analisa mesmo os já feitos), limit?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const { orgId, force = false, limit = 30 } = await request.json();
    const { supabase } = await requireAuth(orgId);

    if (!orgId) return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });

    let query = supabase
      .from("criativos_templates")
      .select("id, file_path")
      .eq("org_id", orgId)
      .not("file_path", "is", null);
    if (!force) query = query.is("analyzed_at", null);
    query = query.limit(limit);

    const { data: templates, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!templates || templates.length === 0) {
      return NextResponse.json({ analyzed: 0, total: 0, results: [] });
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];

    // Roda em série pra não estourar quota da Vision API
    for (const t of templates) {
      try {
        const { data: fileData } = await supabase.storage.from("templates").download(t.file_path);
        if (!fileData) {
          results.push({ id: t.id, ok: false, error: "download falhou" });
          continue;
        }
        const buf = Buffer.from(await fileData.arrayBuffer());
        const text = await generateTextWithRotation(orgId, ANALYZE_PROMPT, {
          mimeType: "image/png",
          data: buf.toString("base64"),
        });
        const parsed = parse(text);
        if (!parsed) {
          results.push({ id: t.id, ok: false, error: "parse falhou" });
          continue;
        }
        const updates: Record<string, unknown> = { analyzed_at: new Date().toISOString() };
        if (parsed.mini_prompt) updates.mini_prompt = parsed.mini_prompt;
        if (parsed.elements) updates.copy_elements = parsed.elements;
        if (parsed.has_logo !== null) updates.has_logo = parsed.has_logo;
        if (parsed.logo_position) updates.logo_position = parsed.logo_position;
        if (parsed.has_person !== null) updates.has_person = parsed.has_person;
        if (parsed.person_pose) updates.person_pose = parsed.person_pose;
        if (parsed.dominant_colors) updates.dominant_colors = parsed.dominant_colors;
        if (parsed.visual_style) updates.visual_style = parsed.visual_style;

        await supabase.from("criativos_templates").update(updates).eq("id", t.id);
        results.push({ id: t.id, ok: true });
      } catch (err) {
        results.push({ id: t.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      analyzed: results.filter((r) => r.ok).length,
      total: results.length,
      results,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

