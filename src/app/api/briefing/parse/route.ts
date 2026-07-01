import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";
import type { BriefingItem } from "@/lib/briefing-types";

// A extraÃ§Ã£o via IA pode levar alguns segundos.
export const maxDuration = 120;

const EXTRACTION_INSTRUCTION = `VocÃª Ã© um extrator de briefings de criativos. Recebe um documento markdown com vÃ¡rios criativos (geralmente blocos separados por tÃ­tulos "# ...") e devolve um JSON estruturado.

Para CADA criativo no documento, extraia:
- "titulo": o tÃ­tulo do bloco (linha de cabeÃ§alho).
- "angulo": o Ã¢ngulo estratÃ©gico (A/B/C/D/E ou similar), se houver. SenÃ£o omita.
- "headline": a headline principal que deve aparecer na arte, se houver.
- "subheadline": a subheadline de apoio (sub-riddle line), se houver.
- "ponte": o texto de ponte / chamada â€” o corpo que conecta a ideia principal ao call to action (pode ser o "texto de apoio", "primary text" ou frase de transiÃ§Ã£o), se houver.
- "cta": o call to action (vira botÃ£o na arte), se houver.
- "direcao_visual": a descriÃ§Ã£o visual do criativo (o que aparece na imagem). Este campo Ã© OBRIGATÃ“RIO â€” se o bloco nÃ£o tiver uma seÃ§Ã£o de direÃ§Ã£o visual explÃ­cita, infira uma descriÃ§Ã£o curta a partir do conteÃºdo.
- "texto_apoio": o texto de apoio / primary text do anÃºncio, se houver.
- "prompt_pronto": se o bloco jÃ¡ contÃ©m um PROMPT DE GERAÃ‡ÃƒO completo escrito Ã  mÃ£o (geralmente dentro de cercas de cÃ³digo \`\`\`, comeÃ§ando com algo como "Crie uma imagem..." e contendo ESTILO/FUNDO/PALETA/TIPOGRAFIA/COMPOSIÃ‡ÃƒO), copie esse prompt INTEIRO e EXATO aqui (sem as cercas \`\`\`). Se nÃ£o houver prompt pronto no bloco, OMITA este campo.

REGRAS:
- Preserve EXATAMENTE a acentuaÃ§Ã£o e pontuaÃ§Ã£o do portuguÃªs (Ã¡ Ã© Ã­ Ã³ Ãº Ã£ Ãµ Ã§ Ãª Ã¢ etc). NUNCA remova acentos.
- NÃƒO invente campos que nÃ£o existem no bloco (exceto direcao_visual, que pode ser inferida).
- NÃƒO use travessÃ£o (â€”) em nenhum texto.
- Responda SOMENTE com um objeto JSON vÃ¡lido no formato: {"items": [ {...}, {...} ]}. Sem texto antes ou depois, sem cercas de cÃ³digo.

Documento markdown a processar:
`;

/** Extrai um objeto JSON de uma resposta de IA que pode vir com cercas ou texto extra. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // tenta direto
  try {
    return JSON.parse(trimmed);
  } catch {
    // procura o primeiro { e o Ãºltimo } e tenta o miolo
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Resposta da IA nÃ£o contÃ©m JSON vÃ¡lido");
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const markdown: unknown = body?.markdown;

    if (typeof markdown !== "string" || markdown.trim().length === 0) {
      return NextResponse.json({ error: "markdown obrigatÃ³rio e nÃ£o vazio" }, { status: 400 });
    }

    const { orgId } = await requireAuth();

    const raw = await generateTextWithRotation(orgId, EXTRACTION_INSTRUCTION + markdown);

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (err) {
      console.error(`[briefing/parse] JSON invÃ¡lido da IA: ${err instanceof Error ? err.message : err}. Trecho: ${raw.slice(0, 200)}`);
      return NextResponse.json(
        { error: "A IA nÃ£o retornou um JSON vÃ¡lido. Tente novamente ou ajuste o briefing." },
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
        if (!direcao) return null; // direcao_visual Ã© obrigatÃ³ria
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

