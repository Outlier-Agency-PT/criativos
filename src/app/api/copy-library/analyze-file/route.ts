import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_EXTENSIONS = [".txt", ".md"];

// PadrÃ£o "mini_copy": headline / mini_copy / list_items / cta (+ body)
const PROMPT_MINI_COPY = `VocÃª Ã© um especialista em extrair anÃºncios e copies de arquivos de trabalho de copywriting.

Leia o conteÃºdo completo do arquivo e extraia CADA ANÃšNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto
- **mini_copy**: texto corrido de apoio (redline, sub, descriÃ§Ã£o). Se o criativo usa LISTA em vez de texto corrido, deixe ""
- **list_items**: bullets/tÃ³picos, um por linha separados por \\n (sem marcadores â€¢/-). Se o criativo usa TEXTO CORRIDO em vez de lista, deixe ""
- **cta**: call-to-action
- **body**: observaÃ§Ãµes, notas visuais, direÃ§Ãµes de arte, ou qualquer instruÃ§Ã£o complementar. Se nÃ£o houver, ""

FORMATOS COMUNS QUE VOCÃŠ VAI ENCONTRAR:

1. **Criativos completos** com seÃ§Ãµes marcadas (HEADLINE, MINI COPY, SUB, ITENS, CTA, NOTA VISUAL):
   - HEADLINE / headline â†’ headline
   - MINI COPY (Redline) / SUB (versÃ£o A) / texto corrido â†’ mini_copy
   - MINI COPY (Lista) / ITENS (versÃ£o B) / bullets â†’ list_items
   - CTA â†’ cta
   - NOTA VISUAL / observaÃ§Ã£o / direÃ§Ã£o de arte â†’ body
   - Se tem versÃ£o A (texto) E versÃ£o B (lista) no MESMO ad, ambos preenchidos

2. **Headlines isoladas** (tabelas, listas numeradas):
   â†’ headline preenchida, demais campos ""

3. **Ads com variaÃ§Ãµes A/B**: COMBINE numa sÃ³ copy (texto em mini_copy + lista em list_items)

O QUE IGNORAR (NÃƒO extrair como copy):
- TÃ­tulo do documento, data, cliente, especialista, status, metadados
- Briefings, descriÃ§Ãµes de campanha, entregas concretas
- Tabelas de resumo/mÃ©tricas ("Total: X criativos", "Top 5 headlines")
- RecomendaÃ§Ãµes e rankings do autor
- TÃ­tulos de Ã¢ngulo/categoria (ex: "ANGULO A â€” O FUNDADOR-SISTEMA")

REGRAS CRÃTICAS:
- Extraia FIELMENTE o texto original â€” NÃƒO reescreva, NÃƒO melhore, NÃƒO invente
- Bullets: remova marcadores (â€¢, -, *) e coloque um item por linha em list_items
- Se o criativo tem Redline (texto corrido) â†’ mini_copy. Se tem Lista â†’ list_items. Nunca confunda
- Cada criativo vira UM objeto no array, mesmo que tenha poucas informaÃ§Ãµes
- Sem limite de caracteres nos campos

IMPORTANTE: Retorne APENAS um JSON vÃ¡lido, sem markdown, sem backticks, sem texto adicional.

Formato:
[
  { "headline": "...", "mini_copy": "...", "list_items": "...", "cta": "...", "body": "..." }
]

CONTEÃšDO DO ARQUIVO:
`;

// PadrÃ£o "estatico" (anÃºncio estÃ¡tico): headline / subheadline / ponte / cta (+ body)
const PROMPT_ESTATICO = `VocÃª Ã© um especialista em extrair anÃºncios e copies de arquivos de trabalho de copywriting.

Leia o conteÃºdo completo do arquivo e extraia CADA ANÃšNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto (chamada principal)
- **subheadline**: frase de apoio que complementa a headline (sub). Se nÃ£o houver, ""
- **ponte**: corpo/chamada que conecta a headline ao CTA (a transiÃ§Ã£o que leva Ã  aÃ§Ã£o). Se nÃ£o houver, ""
- **cta**: call-to-action
- **body**: observaÃ§Ãµes, notas visuais, direÃ§Ãµes de arte, ou qualquer instruÃ§Ã£o complementar. Se nÃ£o houver, ""

FORMATOS COMUNS QUE VOCÃŠ VAI ENCONTRAR:

1. **Criativos completos** com seÃ§Ãµes marcadas (HEADLINE, SUB, CORPO/PONTE, CTA, NOTA VISUAL):
   - HEADLINE / headline â†’ headline
   - SUB / subheadline / segunda linha â†’ subheadline
   - CORPO / texto que leva ao CTA / ponte â†’ ponte
   - CTA â†’ cta
   - NOTA VISUAL / observaÃ§Ã£o / direÃ§Ã£o de arte â†’ body

2. **Headlines isoladas** (tabelas, listas numeradas):
   â†’ headline preenchida, demais campos ""

O QUE IGNORAR (NÃƒO extrair como copy):
- TÃ­tulo do documento, data, cliente, especialista, status, metadados
- Briefings, descriÃ§Ãµes de campanha, entregas concretas
- Tabelas de resumo/mÃ©tricas ("Total: X criativos", "Top 5 headlines")
- RecomendaÃ§Ãµes e rankings do autor
- TÃ­tulos de Ã¢ngulo/categoria

REGRAS CRÃTICAS:
- Extraia FIELMENTE o texto original â€” NÃƒO reescreva, NÃƒO melhore, NÃƒO invente
- Cada criativo vira UM objeto no array, mesmo que tenha poucas informaÃ§Ãµes
- Sem limite de caracteres nos campos

IMPORTANTE: Retorne APENAS um JSON vÃ¡lido, sem markdown, sem backticks, sem texto adicional.

Formato:
[
  { "headline": "...", "subheadline": "...", "ponte": "...", "cta": "...", "body": "..." }
]

CONTEÃšDO DO ARQUIVO:
`;

/**
 * POST /api/copy-library/analyze-file
 * Recebe um arquivo (.txt, .md) e usa IA para extrair copies estruturadas.
 * A IA lÃª o arquivo inteiro e gera quantas copies forem necessÃ¡rias.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Esperado multipart/form-data com arquivo" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orgId = formData.get("orgId") as string | null;
    const copyPatternRaw = formData.get("copyPattern");
    const pattern = copyPatternRaw === "estatico" ? "estatico" : "mini_copy";

    await requireAuth(orgId);

    if (!file) {
      return NextResponse.json({ error: "file obrigatÃ³rio" }, { status: 400 });
    }

    // Validar extensÃ£o
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Formato nÃ£o suportado. Aceitos: .txt, .md" },
        { status: 400 }
      );
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Arquivo muito grande. MÃ¡ximo: 1MB" },
        { status: 400 }
      );
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    const content = await file.text();

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Arquivo vazio" },
        { status: 400 }
      );
    }

    // Montar prompt com conteÃºdo do arquivo (padrÃ£o ativo define os campos)
    const fullPrompt = (pattern === "estatico" ? PROMPT_ESTATICO : PROMPT_MINI_COPY) + content;

    // Chamar IA via key rotation
    const response = await generateTextWithRotation(orgId, fullPrompt);

    // Parse JSON da resposta â€” campos dependem do padrÃ£o
    let copies: Array<Record<string, string>>;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON nÃ£o encontrado na resposta da IA");
      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, string>>;

      // Validar estrutura de cada copy conforme o padrÃ£o
      copies = parsed.map((c): Record<string, string> =>
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
      ).filter((c) => c.headline.length > 0);
    } catch {
      // Fallback: tenta extrair pelo menos uma copy do texto
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      copies = pattern === "estatico"
        ? [{
            headline: lines[0] || "Copy extraÃ­da do arquivo",
            subheadline: lines[1] || "",
            ponte: lines.slice(2, 5).join("\n"),
            cta: "Saiba mais",
            body: "",
          }]
        : [{
            headline: lines[0] || "Copy extraÃ­da do arquivo",
            mini_copy: lines[1] || "",
            list_items: lines.slice(2, 5).join("\n"),
            cta: "Saiba mais",
            body: "",
          }];
    }

    return NextResponse.json({
      copies,
      count: copies.length,
      fileName: file.name,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

