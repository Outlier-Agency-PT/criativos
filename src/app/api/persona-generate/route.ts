import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

const PERSONA_PROMPT = `Com base nas respostas abaixo, gere um resumo de persona para uso em marketing digital.

Inclua em formato JSON:
{
  "nome_sugerido": "nome curto para a persona (ex: 'Advogados Trabalhistas')",
  "perfil_demografico": "descriÃ§Ã£o do perfil",
  "dores_principais": ["dor 1", "dor 2", "dor 3"],
  "desejos_profundos": ["desejo 1", "desejo 2", "desejo 3"],
  "objecoes_compra": ["objeÃ§Ã£o 1", "objeÃ§Ã£o 2"],
  "tom_comunicacao": "tom recomendado para falar com esse pÃºblico",
  "resumo": "parÃ¡grafo resumo da persona"
}

Retorne APENAS o JSON, sem markdown ou explicaÃ§Ãµes.`;

/**
 * POST /api/persona-generate
 * Gera resumo de persona via Gemini a partir das respostas do wizard.
 */
export async function POST(request: NextRequest) {
  try {
    const { answers, orgId } = await request.json();
    await requireAuth(orgId);

    if (!answers || !orgId) {
      return NextResponse.json({ error: "answers e orgId obrigatÃ³rios" }, { status: 400 });
    }

    const prompt = `${PERSONA_PROMPT}

PÃºblico: ${answers.target_audience || "NÃ£o informado"}
Problemas: ${answers.audience_problems || "NÃ£o informado"}
ObjeÃ§Ãµes: ${answers.purchase_objections || "NÃ£o informado"}
Desejos: ${answers.deep_desires || "NÃ£o informado"}
Contexto adicional: ${answers.extra_context || "NÃ£o informado"}`;

    try {
      const text = await generateTextWithRotation(orgId, prompt);

      let persona = null;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) persona = JSON.parse(jsonMatch[0]);
      } catch {
        persona = { resumo: text, nome_sugerido: "Persona" };
      }

      return NextResponse.json({ persona });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}

