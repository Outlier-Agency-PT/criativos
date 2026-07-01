import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

const MAX_TEXTS = 20;

const ANALYSIS_PROMPT = `VocÃª Ã© um copywriter especialista. Analise cada texto de copy a seguir e extraia os elementos estruturados.

Para cada texto, identifique 4 elementos obrigatÃ³rios:
- **headline**: a frase principal de impacto que chama atenÃ§Ã£o
- **mini_copy**: subtÃ­tulo de apoio que complementa a headline
- **list_items**: lista de tÃ³picos/benefÃ­cios, um por linha (separados por \\n)
- **cta**: call-to-action (aÃ§Ã£o que o leitor deve tomar)
- **body**: restante do texto (se houver)

Se nÃ£o encontrar algum elemento explicitamente, derive-o do conteÃºdo.
Se nÃ£o houver lista clara, extraia os principais pontos do texto.

IMPORTANTE: Retorne APENAS um JSON vÃ¡lido, sem markdown, sem backticks, sem texto adicional.

Formato de resposta:
[
  { "headline": "...", "mini_copy": "...", "list_items": "item 1\\nitem 2", "cta": "...", "body": "..." },
  ...
]

Textos para anÃ¡lise:
`;

/**
 * POST /api/copy-library/analyze
 * Analisa textos com IA para extrair headline/mini_copy/list_items/cta/body.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { texts, org_id, orgId } = body;
    const resolvedOrgId = org_id || orgId;

    await requireAuth(resolvedOrgId);

    if (!resolvedOrgId) {
      return NextResponse.json({ error: "org_id obrigatÃ³rio" }, { status: 400 });
    }

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: "texts obrigatÃ³rio (array de strings)" }, { status: 400 });
    }

    if (texts.length > MAX_TEXTS) {
      return NextResponse.json({ error: `MÃ¡ximo ${MAX_TEXTS} textos por chamada` }, { status: 400 });
    }

    // Construir prompt com textos numerados
    const numberedTexts = texts
      .map((t: string, i: number) => `--- Texto ${i + 1} ---\n${t}`)
      .join("\n\n");

    const fullPrompt = ANALYSIS_PROMPT + numberedTexts;

    // Chamar IA via key rotation
    const response = await generateTextWithRotation(resolvedOrgId, fullPrompt);

    // Parse JSON da resposta
    let results;
    try {
      // Tentar extrair JSON da resposta (pode ter texto extra)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON nÃ£o encontrado na resposta");
      results = JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback: cada texto vira headline inteira
      results = texts.map((t: string) => ({
        headline: t.split("\n")[0] || t,
        mini_copy: "",
        list_items: "",
        cta: "",
        body: t,
      }));
    }

    // Garantir que temos resultado para cada texto
    while (results.length < texts.length) {
      const i = results.length;
      results.push({
        headline: texts[i]?.split("\n")[0] || texts[i] || "",
        mini_copy: "",
        list_items: "",
        cta: "",
        body: texts[i] || "",
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    return handleAuthError(err);
  }
}

