import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";
import type { BriefingItem } from "@/lib/briefing-types";

// A extração via IA pode levar alguns segundos.
export const maxDuration = 120;

const EXTRACTION_INSTRUCTION = `Você é um extrator de briefings de criativos. Recebe um documento markdown com vários criativos (geralmente blocos separados por títulos "# ...") e devolve um JSON estruturado.

Para CADA criativo no documento, extraia:
- "titulo": o título do bloco (linha de cabeçalho).
- "angulo": o ângulo estratégico (A/B/C/D/E ou similar), se houver. Senão omita.
- "headline": a headline principal que deve aparecer na arte, se houver.
- "subheadline": a subheadline de apoio (sub-riddle line), se houver.
- "ponte": o texto de ponte / chamada — o corpo que conecta a ideia principal ao call to action (pode ser o "texto de apoio", "primary text" ou frase de transição), se houver.
- "cta": o call to action (vira botão na arte), se houver.
- "direcao_visual": a descrição visual do criativo (o que aparece na imagem). Este campo é OBRIGATÓRIO — se o bloco não tiver uma seção de direção visual explícita, infira uma descrição curta a partir do conteúdo.
- "texto_apoio": o texto de apoio / primary text do anúncio, se houver.
- "prompt_pronto": se o bloco já contém um PROMPT DE GERAÇÃO completo escrito à mão (geralmente dentro de cercas de código \`\`\`, começando com algo como "Crie uma imagem..." e contendo ESTILO/FUNDO/PALETA/TIPOGRAFIA/COMPOSIÇÃO), copie esse prompt INTEIRO e EXATO aqui (sem as cercas \`\`\`). Se não houver prompt pronto no bloco, OMITA este campo.

REGRAS:
- Preserve EXATAMENTE a acentuação e pontuação do português (á é í ó ú ã õ ç ê â etc). NUNCA remova acentos.
- NÃO invente campos que não existem no bloco (exceto direcao_visual, que pode ser inferida).
- NÃO use travessão (—) em nenhum texto.
- Responda SOMENTE com um objeto JSON válido no formato: {"items": [ {...}, {...} ]}. Sem texto antes ou depois, sem cercas de código.

Documento markdown a processar:
`;

/** Extrai um objeto JSON de uma resposta de IA que pode vir com cercas ou texto extra. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // tenta direto
  try {
    return JSON.parse(trimmed);
  } catch {
    // procura o primeiro { e o último } e tenta o miolo
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Resposta da IA não contém JSON válido");
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const markdown: unknown = body?.markdown;

    if (typeof markdown !== "string" || markdown.trim().length === 0) {
      return NextResponse.json({ error: "markdown obrigatório e não vazio" }, { status: 400 });
    }

    const { orgId } = await requireAuth();

    const raw = await generateTextWithRotation(orgId, EXTRACTION_INSTRUCTION + markdown);

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      console.error(`[briefing/parse] JSON inválido da IA: ${err instanceof Error ? err.message : err}. Trecho: ${raw.slice(0, 200)}`);
      return NextResponse.json(
        { error: "A IA não retornou um JSON válido. Tente novamente ou ajuste o briefing." },
        { status: 502 },
      );
    }

    const rawItems = (parsed as { items?: unknown })?.items;
    if (!Array.isArray(rawItems)) {
      return NextResponse.json({ error: "Resposta da IA sem lista de itens" }, { status: 502 });
    }

    const items: BriefingItem[] = rawItems
      .map((it, idx): BriefingItem | null => {
        const o = it as Record<string, unknown>;
        const direcao = typeof o.direcao_visual === "string" ? o.direcao_visual.trim() : "";
        if (!direcao) return null; // direcao_visual é obrigatória
        const str = (v: unknown) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined);
        return {
          id: str(o.id) ?? `item-${idx + 1}`,
          titulo: str(o.titulo) ?? `Criativo ${idx + 1}`,
          angulo: str(o.angulo),
          headline: str(o.headline),
          subheadline: str(o.subheadline),
          ponte: str(o.ponte),
          cta: str(o.cta),
          direcao_visual: direcao,
          texto_apoio: str(o.texto_apoio),
          prompt_pronto: str(o.prompt_pronto),
        };
      })
      .filter((x): x is BriefingItem => x !== null);

    console.log(
      `[briefing/parse] org=${orgId.slice(0, 8)} markdown=${markdown.length}chars items=${items.length} time=${Date.now() - started}ms`,
    );

    return NextResponse.json({ items });
  } catch (err) {
    console.error(`[briefing/parse] erro: ${err instanceof Error ? err.message : err}`);
    return handleAuthError(err); // trata AuthError (401/403) e qualquer outro como 500
  }
}

