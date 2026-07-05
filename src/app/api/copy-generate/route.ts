import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";
import { buildCopyPrompt, buildTemplateAwareCopyPrompt } from "@/lib/prompt-builder";

// Delimitador pedido ao modelo no prompt para separar cada versão de copy.
const VERSION_DELIMITER = /-{2,}\s*VERS[AÃ]O\s*-{2,}/gi;

/** Remove markdown residual (negrito, títulos, marcadores) que o modelo às vezes insere. */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/\*/g, "")
    .trim();
}

/**
 * Converte a resposta em texto do modelo (versões separadas por VERSION_DELIMITER,
 * campos no formato "Campo: texto") num array de objetos { campo: texto }.
 * Mantém compatibilidade com respostas legadas em JSON array.
 */
function parseCopyVersions(text: string): Record<string, string>[] {
  const trimmed = text.trim();

  // Compatibilidade com respostas legadas em JSON.
  const jsonMatch = trimmed.match(/^\[[\s\S]*\]$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // não é JSON válido, segue para o parsing de texto
    }
  }

  const chunks = trimmed
    .split(VERSION_DELIMITER)
    .map((c) => stripMarkdown(c))
    .filter((c) => c.length > 0);

  const versions = (chunks.length > 0 ? chunks : [stripMarkdown(trimmed)]).map((chunk) => {
    const fields: Record<string, string> = {};
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^([a-zA-ZÀ-ÿ_ ]{2,30}?)\s*:\s*(.+)$/);
      if (m) {
        const key = m[1]
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/\s+/g, "_");
        fields[key] = m[2].trim();
      }
    }
    return Object.keys(fields).length > 0 ? fields : { text: chunk };
  });

  return versions;
}

/**
 * POST /api/copy-generate
 * Gera N versões de copy usando Gemini (texto, não imagem).
 * Suporta dois modos:
 *   1. Modo básico: direction + elements (legado)
 *   2. Modo template-aware: productName + salesArguments + templateIds (EP-02.07)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personaId, orgId } = body;
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json(
        { error: "orgId é obrigatório" },
        { status: 400 }
      );
    }

    const validCount = Math.min(Math.max(body.count || 3, 1), 10);

    // Buscar persona (opcional)
    let personaSummary = "Público geral";
    if (personaId) {
      const { data: persona } = await supabase
        .from("criativos_personas")
        .select("name, target_audience, audience_problems, generated_summary")
        .eq("id", personaId)
        .single();

      if (persona) {
        personaSummary = persona.generated_summary
          ? JSON.stringify(persona.generated_summary)
          : [persona.name, persona.target_audience, persona.audience_problems].filter(Boolean).join(". ");
      }
    }

    let prompt: string;

    // Modo template-aware (EP-02.07)
    if (body.templateIds?.length && body.productName) {
      const { productName, salesArguments, templateIds } = body;

      if (!salesArguments?.trim()) {
        return NextResponse.json(
          { error: "Descreva os argumentos de venda do produto" },
          { status: 400 }
        );
      }

      // Carregar templates com copy_elements do banco
      const { data: templates, error: tmplError } = await supabase
        .from("criativos_templates")
        .select("id, name, category, copy_elements")
        .in("id", templateIds);

      if (tmplError) {
        console.error("[api/copy-generate] Template load error:", tmplError);
        return NextResponse.json(
          { error: "Nao foi possivel carregar os templates" },
          { status: 500 }
        );
      }

      if (!templates?.length) {
        return NextResponse.json(
          { error: "Nenhum template encontrado com os IDs fornecidos" },
          { status: 404 }
        );
      }

      // Filtrar templates que têm copy_elements
      const templatesWithElements = templates
        .filter((t) => t.copy_elements?.length)
        .map((t) => ({
          name: t.name,
          category: t.category,
          copyElements: t.copy_elements as { type: string; text_found: string; position?: string }[],
        }));

      if (templatesWithElements.length === 0) {
        // Fallback: elementos do PADRÃO ativo (estatico → headline/subheadline/ponte/cta;
        // mini_copy → headline/mini_copy/list_items/cta). Sem isto, a IA gerava sempre
        // em mini_copy, ignorando o padrão Estático selecionado no projeto.
        const defaultElements = body.copyPattern === "estatico"
          ? ["headline", "subheadline", "ponte", "cta"]
          : ["headline", "mini_copy", "list_items", "cta"];
        prompt = buildCopyPrompt({
          personaSummary,
          elements: defaultElements,
          direction: `Produto: ${productName}\n\nArgumentos de venda: ${salesArguments}`,
          count: validCount,
        });
      } else {
        prompt = buildTemplateAwareCopyPrompt({
          personaSummary,
          productName,
          salesArguments,
          templates: templatesWithElements,
          count: validCount,
        });
      }
    } else {
      // Modo básico (legado)
      const { elements, direction } = body;

      if (!elements?.length || !direction) {
        return NextResponse.json(
          { error: "elements, direction e orgId são obrigatórios" },
          { status: 400 }
        );
      }

      prompt = buildCopyPrompt({
        personaSummary,
        elements,
        direction,
        count: validCount,
      });
    }

    try {
      const text = await generateTextWithRotation(orgId, prompt);
      const copies = parseCopyVersions(text);

      return NextResponse.json({ copies, count: copies.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Falha na geração: ${message}` }, { status: 500 });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}

