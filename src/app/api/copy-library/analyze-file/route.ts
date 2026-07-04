import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_EXTENSIONS = [".txt", ".md"];

// Padrão "mini_copy": headline / mini_copy / list_items / cta (+ body)
const PROMPT_MINI_COPY = `Você é um especialista em extrair anúncios e copies de ficheiros de trabalho de copywriting.

Leia o conteúdo completo do ficheiro e extraia CADA ANÚNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto
- **mini_copy**: texto corrido de apoio (redline, sub, descrição). Se o criativo usa LISTA em vez de texto corrido, deixe ""
- **list_items**: bullets/tópicos, um por linha separados por \\n (sem marcadores •/-). Se o criativo usa TEXTO CORRIDO em vez de lista, deixe ""
- **cta**: call-to-action
- **body**: observações, notas visuais, direções de arte, ou qualquer instrução complementar. Se não houver, ""

FORMATOS COMUNS QUE VOCÊ VAI ENCONTRAR:

1. **Criativos completos** com seções marcadas (HEADLINE, MINI COPY, SUB, ITENS, CTA, NOTA VISUAL):
   - HEADLINE / headline → headline
   - MINI COPY (Redline) / SUB (versão A) / texto corrido → mini_copy
   - MINI COPY (Lista) / ITENS (versão B) / bullets → list_items
   - CTA → cta
   - NOTA VISUAL / observação / direção de arte → body
   - Se tem versão A (texto) E versão B (lista) no MESMO ad, ambos preenchidos

2. **Headlines isoladas** (tabelas, listas numeradas):
   → headline preenchida, demais campos ""

3. **Ads com variações A/B**: COMBINE numa só copy (texto em mini_copy + lista em list_items)

O QUE IGNORAR (NÃO extrair como copy):
- Título do documento, data, cliente, especialista, status, metadados
- Briefings, descrições de campanha, entregas concretas
- Tabelas de resumo/métricas ("Total: X criativos", "Top 5 headlines")
- Recomendações e rankings do autor
- Títulos de ângulo/categoria (ex: "ANGULO A — O FUNDADOR-SISTEMA")

REGRAS CRÍTICAS:
- Extraia FIELMENTE o texto original — NÃO reescreva, NÃO melhore, NÃO invente
- Bullets: remova marcadores (•, -, *) e coloque um item por linha em list_items
- Se o criativo tem Redline (texto corrido) → mini_copy. Se tem Lista → list_items. Nunca confunda
- Cada criativo vira UM objeto no array, mesmo que tenha poucas informações
- Sem limite de caracteres nos campos

IMPORTANTE: Retorne APENAS um JSON válido, sem markdown, sem backticks, sem texto adicional.

Formato:
[
  { "headline": "...", "mini_copy": "...", "list_items": "...", "cta": "...", "body": "..." }
]

CONTEÚDO DO ficheiro:
`;

// Padrão "estatico" (anúncio estático): headline / subheadline / ponte / cta (+ body)
const PROMPT_ESTATICO = `Você é um especialista em extrair anúncios e copies de ficheiros de trabalho de copywriting.

Leia o conteúdo completo do ficheiro e extraia CADA ANÚNCIO/CRIATIVO como um objeto separado. Ignore metadados.

CADA COPY TEM 5 CAMPOS:
- **headline**: frase principal de impacto (chamada principal)
- **subheadline**: frase de apoio que complementa a headline (sub). Se não houver, ""
- **ponte**: corpo/chamada que conecta a headline ao CTA (a transição que leva à ação). Se não houver, ""
- **cta**: call-to-action
- **body**: observações, notas visuais, direções de arte, ou qualquer instrução complementar. Se não houver, ""

FORMATOS COMUNS QUE VOCÊ VAI ENCONTRAR:

1. **Criativos completos** com seções marcadas (HEADLINE, SUB, CORPO/PONTE, CTA, NOTA VISUAL):
   - HEADLINE / headline → headline
   - SUB / subheadline / segunda linha → subheadline
   - CORPO / texto que leva ao CTA / ponte → ponte
   - CTA → cta
   - NOTA VISUAL / observação / direção de arte → body

2. **Headlines isoladas** (tabelas, listas numeradas):
   → headline preenchida, demais campos ""

O QUE IGNORAR (NÃO extrair como copy):
- Título do documento, data, cliente, especialista, status, metadados
- Briefings, descrições de campanha, entregas concretas
- Tabelas de resumo/métricas ("Total: X criativos", "Top 5 headlines")
- Recomendações e rankings do autor
- Títulos de ângulo/categoria

REGRAS CRÍTICAS:
- Extraia FIELMENTE o texto original — NÃO reescreva, NÃO melhore, NÃO invente
- Cada criativo vira UM objeto no array, mesmo que tenha poucas informações
- Sem limite de caracteres nos campos

IMPORTANTE: Retorne APENAS um JSON válido, sem markdown, sem backticks, sem texto adicional.

Formato:
[
  { "headline": "...", "subheadline": "...", "ponte": "...", "cta": "...", "body": "..." }
]

CONTEÚDO DO ficheiro:
`;

/**
 * POST /api/copy-library/analyze-file
 * Recebe um ficheiro (.txt, .md) e usa IA para extrair copies estruturadas.
 * A IA lê o ficheiro inteiro e gera quantas copies forem necessárias.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Esperado multipart/form-data com ficheiro" },
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
      return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
    }

    // Validar extensão
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Formato não suportado. Aceitos: .txt, .md" },
        { status: 400 }
      );
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ficheiro muito grande. Máximo: 1MB" },
        { status: 400 }
      );
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    const content = await file.text();

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Ficheiro vazio" },
        { status: 400 }
      );
    }

    // Montar prompt com conteúdo do ficheiro (padrão ativo define os campos)
    const fullPrompt = (pattern === "estatico" ? PROMPT_ESTATICO : PROMPT_MINI_COPY) + content;

    // Chamar IA via key rotation
    const response = await generateTextWithRotation(orgId, fullPrompt);

    // Parse JSON da resposta — campos dependem do padrão
    let copies: Array<Record<string, string>>;
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSON não encontrado na resposta da IA");
      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, string>>;

      // Validar estrutura de cada copy conforme o padrão
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
            headline: lines[0] || "Copy extraída do ficheiro",
            subheadline: lines[1] || "",
            ponte: lines.slice(2, 5).join("\n"),
            cta: "Saiba mais",
            body: "",
          }]
        : [{
            headline: lines[0] || "Copy extraída do ficheiro",
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

