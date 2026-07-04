import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

const PERSONA_PROMPT = `Com base nas respostas abaixo, gere um resumo de persona para uso em marketing digital.

Inclua em formato JSON:
{
  "nome_sugerido": "nome curto para a persona (ex: 'Advogados Trabalhistas')",
  "perfil_demografico": "descrição do perfil",
  "dores_principais": ["dor 1", "dor 2", "dor 3"],
  "desejos_profundos": ["desejo 1", "desejo 2", "desejo 3"],
  "objecoes_compra": ["objeção 1", "objeção 2"],
  "tom_comunicacao": "tom recomendado para falar com esse público",
  "resumo": "parágrafo resumo da persona"
}

Retorne APENAS o JSON, sem markdown ou explicações.`;

/**
 * POST /api/persona-generate
 * Gera resumo de persona via Gemini a partir das respostas do wizard.
 */
export async function POST(request: NextRequest) {
  try {
    const { answers, orgId } = await request.json();
    await requireAuth(orgId);

    if (!answers || !orgId) {
      return NextResponse.json({ error: "answers e orgId obrigatórios" }, { status: 400 });
    }

    const prompt = `${PERSONA_PROMPT}

Público: ${answers.target_audience || "Não informado"}
Problemas: ${answers.audience_problems || "Não informado"}
Objeções: ${answers.purchase_objections || "Não informado"}
Desejos: ${answers.deep_desires || "Não informado"}
Contexto adicional: ${answers.extra_context || "Não informado"}`;

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

