import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

// PadrÃ£o "mini_copy": headline / mini_copy / list_items / cta (+ body)
const PROMPT_MINI_COPY = `Voce e um especialista em extrair anuncios e copies de textos de copywriting.

Leia o texto e extraia CADA ANUNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto
- **mini_copy**: texto corrido de apoio (redline, sub, descricao). Se usa LISTA em vez de texto, deixe ""
- **list_items**: bullets/topicos, um por linha separados por \\n (sem marcadores). Se usa TEXTO CORRIDO, deixe ""
- **cta**: call-to-action
- **body**: notas visuais, observacoes, direcoes de arte. Se nao houver, ""

FORMATOS COMUNS:
1. Criativos completos (HEADLINE + MINI COPY/SUB + CTA + NOTA VISUAL):
   - MINI COPY (Redline) / SUB / texto corrido â†’ mini_copy
   - MINI COPY (Lista) / ITENS / bullets â†’ list_items
   - NOTA VISUAL / observacao â†’ body
2. Headlines isoladas â†’ headline preenchida, demais ""
3. Ads com versao A (texto) + B (lista): ambos preenchidos

O QUE IGNORAR:
- Titulo do doc, data, cliente, especialista, status
- Briefings, descricoes de campanha
- Tabelas de resumo, recomendacoes, rankings
- Titulos de angulo/categoria

REGRAS:
- Extraia FIELMENTE â€” NAO reescreva, NAO melhore, NAO invente
- Bullets: remova marcadores e coloque um por linha em list_items
- Redline (texto corrido) â†’ mini_copy. Lista â†’ list_items
- Campo inexistente = ""
- Sem limite de caracteres

IMPORTANTE: Retorne APENAS JSON valido, sem markdown, sem backticks.

Formato:
[
  { "headline": "...", "mini_copy": "...", "list_items": "...", "cta": "...", "body": "..." }
]

TEXTO:
`;

// PadrÃ£o "estatico" (anuncio estatico): headline / subheadline / ponte / cta (+ body)
const PROMPT_ESTATICO = `Voce e um especialista em extrair anuncios e copies de textos de copywriting.

Leia o texto e extraia CADA ANUNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto (chamada principal)
- **subheadline**: frase de apoio que complementa a headline (sub). Se nao houver, ""
- **ponte**: corpo/chamada que conecta a headline ao CTA (texto que faz a transicao pra acao). Se nao houver, ""
- **cta**: call-to-action
- **body**: notas visuais, observacoes, direcoes de arte. Se nao houver, ""

FORMATOS COMUNS:
1. Criativos completos (HEADLINE + SUB + PONTE/CORPO + CTA + NOTA VISUAL):
   - SUB / subheadline / segunda linha de apoio â†’ subheadline
   - CORPO / texto corrido que leva ao CTA / ponte â†’ ponte
   - NOTA VISUAL / observacao â†’ body
2. Headlines isoladas â†’ headline preenchida, demais ""

O QUE IGNORAR:
- Titulo do doc, data, cliente, especialista, status
- Briefings, descricoes de campanha
- Tabelas de resumo, recomendacoes, rankings
- Titulos de angulo/categoria

REGRAS:
- Extraia FIELMENTE â€” NAO reescreva, NAO melhore, NAO invente
- Campo inexistente = ""
- Sem limite de caracteres

IMPORTANTE: Retorne APENAS JSON valido, sem markdown, sem backticks.

Formato:
[
  { "headline": "...", "subheadline": "...", "ponte": "...", "cta": "...", "body": "..." }
]

TEXTO:
`;

/**
 * POST /api/copy-library/analyze-text
 * Recebe texto colado pelo usuario e usa IA para organizar em copies estruturadas.
 * A IA NAO cria conteúdo novo â€” apenas organiza o que ja existe.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, orgId, copyPattern } = body as { text?: string; orgId?: string; copyPattern?: string };
    const pattern = copyPattern === "estatico" ? "estatico" : "mini_copy";

    await requireAuth(orgId);

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Texto obrigatorio" },
        { status: 400 }
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "orgId obrigatorio" },
        { status: 400 }
      );
    }

    if (text.length > 50000) {
      return NextResponse.json(
        { error: "Texto muito longo. Maximo: 50.000 caracteres" },
        { status: 400 }
      );
    }

    // Montar prompt com texto do usuario (padrÃ£o ativo define os campos)
    const fullPrompt = (pattern === "estatico" ? PROMPT_ESTATICO : PROMPT_MINI_COPY) + text.trim();

    // Chamar IA via key rotation
    const response = await generateTextWithRotation(orgId, fullPrompt);

    // Parse JSON da resposta â€” campos dependem do padrÃ£o
    let copies: Array<Record<string, string>>;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON nao encontrado na resposta da IA");
      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, string>>;

      // Validar estrutura de cada copy conforme o padrÃ£o
      copies = parsed
        .map((c): Record<string, string> =>
          pattern === "estatico"
            ? {
                headline: String(c.headline || "").trim(),
                subheadline: String(c.subheadline || "").trim(),
                ponte: String(c.ponte || "").trim(),
                cta: String(c.cta || "").trim(),
                body: String(c.body || "").trim(),
              }
            : {
                headline: String(c.headline || "").trim(),
                mini_copy: String(c.mini_copy || "").trim(),
                list_items: String(c.list_items || "").trim(),
                cta: String(c.cta || "").trim(),
                body: String(c.body || "").trim(),
              }
        )
        .filter((c) => c.headline.length > 0);
    } catch {
      // Fallback: tenta organizar o texto como uma unica copy
      const lines = text
        .split("\n")
        .filter((l: string) => l.trim().length > 0);
      copies =
        pattern === "estatico"
          ? [
              {
                headline: lines[0] || "Copy do usuario",
                subheadline: lines[1] || "",
                ponte: lines.slice(2, 5).join("\n"),
                cta: "Saiba mais",
                body: "",
              },
            ]
          : [
              {
                headline: lines[0] || "Copy do usuario",
                mini_copy: lines[1] || "",
                list_items: lines.slice(2, 5).join("\n"),
                cta: "Saiba mais",
                body: "",
              },
            ];
    }

    return NextResponse.json({
      copies,
      count: copies.length,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

