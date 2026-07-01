import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { generateTextWithRotation } from "@/lib/api-key-rotator";

// Permitir atÃ© 60s para Vision
export const maxDuration = 60;

const ANALYZE_PROMPT = `VocÃª Ã© um analista visual especialista em criativos publicitÃ¡rios. Analise a imagem do template anexada e retorne um JSON ESTRUTURADO com TODOS os detalhes necessÃ¡rios para recriar variaÃ§Ãµes PIXEL-PERFECT deste template.

Retorne APENAS um JSON vÃ¡lido, sem markdown, sem comentÃ¡rios, neste formato exato:

{
  "mini_prompt": "Blueprint COMPLETO do layout em 4-8 frases. Descreva: (1) fundo â€” tipo exato, cores, gradiente, textura ou foto; (2) grid â€” use terÃ§os (ex: 'pessoa ocupa terÃ§o direito, texto nos 2/3 esquerdos'); (3) hierarquia de texto â€” posiÃ§Ã£o, tamanho relativo ao quadro (ex: 'headline ocupa ~15% da altura, centralizado no terÃ§o superior'), espaÃ§amento entre blocos; (4) pessoa â€” enquadramento (busto/meio-corpo/corpo-inteiro), posiÃ§Ã£o no grid, direÃ§Ã£o do olhar; (5) elementos decorativos â€” linhas, formas, Ã­cones, selos, badges. Seja PRECISO e REPRODUZÃVEL.",

  "background": {
    "type": "solid|gradient|photo|texture|pattern|blur",
    "description": "DescriÃ§Ã£o detalhada: 'gradiente diagonal do azul-escuro (#1a2744) no topo-esquerda para preto (#0a0a0a) no rodapÃ©-direita' ou 'foto desfocada de escritÃ³rio com overlay escuro a 60% de opacidade'",
    "colors": ["#hex1", "#hex2"]
  },

  "text_layout": [
    {
      "role": "headline|subheadline|mini_copy|list_items|cta|badge|other",
      "text_found": "texto exato visÃ­vel na imagem",
      "position": "topo-centro|centro-esquerda|rodapÃ©-centro|etc",
      "grid_area": "terÃ§o superior|metade inferior|terÃ§o esquerdo|etc",
      "size_pct": 12,
      "style": "sans-serif bold uppercase tracking-wide|serif italic lowercase|etc",
      "color": "#hex da cor do texto",
      "lines": 1
    }
  ],

  "elements": [
    { "type": "headline|mini_copy|list_items|cta|subtitle|quote|badge|other", "text_found": "texto exato visÃ­vel", "position": "topo|centro|rodapÃ©|topo-esquerda|etc" }
  ],

  "person": {
    "present": true,
    "framing": "busto|meio-corpo|corpo-inteiro|rosto-close",
    "grid_position": "terÃ§o direito|centro|terÃ§o esquerdo|metade direita|etc",
    "coverage_pct": 40,
    "pose": "DescriÃ§Ã£o detalhada: direÃ§Ã£o do corpo, Ã¢ngulo da cÃ¢mera, posiÃ§Ã£o das mÃ£os, expressÃ£o facial, direÃ§Ã£o do olhar",
    "clothing": "DescriÃ§Ã£o da vestimenta visÃ­vel",
    "expression": "sorrindo|sÃ©rio|confiante|animado|neutro|etc",
    "gaze_direction": "olhando para cÃ¢mera|olhando para esquerda|olhando para baixo|etc"
  },

  "has_logo": true,
  "logo_position": "topo-esquerda|rodapÃ©-centro|null se nÃ£o tiver",
  "logo_size_pct": 5,

  "has_person": true,
  "person_pose": "DescriÃ§Ã£o completa da pose para face-swap (mesma info de person.pose mas em frase Ãºnica)",

  "dominant_colors": ["#rrggbb", "#rrggbb", "#rrggbb"],
  "visual_style": "dark|clean|foto_texto|prova_social|minimalista|colorido|gradiente|etc",

  "spacing": {
    "text_blocks_gap": "tight|normal|wide",
    "margin_edges_pct": 5,
    "overall_density": "denso|equilibrado|arejado"
  }
}

REGRAS CRÃTICAS:
- mini_prompt: 4-8 frases RICAS. AlguÃ©m deve conseguir recriar o layout EXATO sÃ³ lendo isso.
- background: SEMPRE preencha. Se for foto, descreva a cena. Se for cor sÃ³lida, dÃª o hex exato.
- text_layout: para CADA bloco de texto visÃ­vel, estime size_pct (% da altura total do quadro que o texto ocupa). Headline geralmente 8-15%, mini_copy 4-8%, CTA 3-6%.
- person: se has_person=true, coverage_pct Ã© a % da Ã¡rea total do quadro que a pessoa ocupa. framing e pose sÃ£o ESSENCIAIS para face-swap.
- person.expression e person.gaze_direction: OBRIGATÃ“RIOS se has_person=true â€” serÃ£o usados para reproduzir a mesma energia na variaÃ§Ã£o.
- logo_size_pct: % da largura do quadro que o logo ocupa.
- spacing: descreva a densidade visual geral.
- elements: extraia TODO texto visÃ­vel na imagem, sem exceÃ§Ã£o.
- has_logo: true SOMENTE se existir um logotipo de marca claro (texto puro de nome de pessoa NÃƒO conta).
- dominant_colors: 3 a 5 cores mais usadas (em hex).
- Se um campo nÃ£o se aplica (ex: person quando nÃ£o hÃ¡ pessoa), use null para objetos e false para booleanos.
- Retorne APENAS o JSON. Sem explicaÃ§Ã£o, sem markdown, sem cercas \`\`\`.`;

interface TextLayoutItem {
  role: string;
  text_found: string;
  position: string;
  grid_area?: string;
  size_pct?: number;
  style?: string;
  color?: string;
  lines?: number;
}

interface PersonAnalysis {
  present: boolean;
  framing?: string;
  grid_position?: string;
  coverage_pct?: number;
  pose?: string;
  clothing?: string;
  expression?: string;
  gaze_direction?: string;
}

interface BackgroundAnalysis {
  type: string;
  description: string;
  colors?: string[];
}

interface SpacingAnalysis {
  text_blocks_gap?: string;
  margin_edges_pct?: number;
  overall_density?: string;
}

interface AnalysisResult {
  mini_prompt: string | null;
  background: BackgroundAnalysis | null;
  text_layout: TextLayoutItem[] | null;
  elements: { type: string; text_found: string; position?: string }[] | null;
  person: PersonAnalysis | null;
  has_logo: boolean | null;
  logo_position: string | null;
  logo_size_pct: number | null;
  has_person: boolean | null;
  person_pose: string | null;
  dominant_colors: string[] | null;
  visual_style: string | null;
  spacing: SpacingAnalysis | null;
}

const EMPTY: AnalysisResult = {
  mini_prompt: null,
  background: null,
  text_layout: null,
  elements: null,
  person: null,
  has_logo: null,
  logo_position: null,
  logo_size_pct: null,
  has_person: null,
  person_pose: null,
  dominant_colors: null,
  visual_style: null,
  spacing: null,
};

function parseAnalysis(text: string): AnalysisResult {
  if (!text) return EMPTY;
  // Remove cercas de cÃ³digo se vierem
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return EMPTY;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      mini_prompt: typeof parsed.mini_prompt === "string" ? parsed.mini_prompt.trim() : null,
      background: parsed.background && typeof parsed.background === "object" ? {
        type: parsed.background.type || "unknown",
        description: parsed.background.description || "",
        colors: Array.isArray(parsed.background.colors) ? parsed.background.colors : undefined,
      } : null,
      text_layout: Array.isArray(parsed.text_layout) ? parsed.text_layout.map((item: Record<string, unknown>) => ({
        role: String(item.role || "other"),
        text_found: String(item.text_found || ""),
        position: String(item.position || ""),
        grid_area: typeof item.grid_area === "string" ? item.grid_area : undefined,
        size_pct: typeof item.size_pct === "number" ? item.size_pct : undefined,
        style: typeof item.style === "string" ? item.style : undefined,
        color: typeof item.color === "string" ? item.color : undefined,
        lines: typeof item.lines === "number" ? item.lines : undefined,
      })) : null,
      elements: Array.isArray(parsed.elements) ? parsed.elements : null,
      person: parsed.person && typeof parsed.person === "object" ? {
        present: !!parsed.person.present,
        framing: typeof parsed.person.framing === "string" ? parsed.person.framing : undefined,
        grid_position: typeof parsed.person.grid_position === "string" ? parsed.person.grid_position : undefined,
        coverage_pct: typeof parsed.person.coverage_pct === "number" ? parsed.person.coverage_pct : undefined,
        pose: typeof parsed.person.pose === "string" ? parsed.person.pose : undefined,
        clothing: typeof parsed.person.clothing === "string" ? parsed.person.clothing : undefined,
        expression: typeof parsed.person.expression === "string" ? parsed.person.expression : undefined,
        gaze_direction: typeof parsed.person.gaze_direction === "string" ? parsed.person.gaze_direction : undefined,
      } : null,
      has_logo: typeof parsed.has_logo === "boolean" ? parsed.has_logo : null,
      logo_position: typeof parsed.logo_position === "string" ? parsed.logo_position : null,
      logo_size_pct: typeof parsed.logo_size_pct === "number" ? parsed.logo_size_pct : null,
      has_person: typeof parsed.has_person === "boolean" ? parsed.has_person : null,
      person_pose: typeof parsed.person_pose === "string" ? parsed.person_pose.trim() : null,
      dominant_colors: Array.isArray(parsed.dominant_colors) ? parsed.dominant_colors.filter((c: unknown): c is string => typeof c === "string") : null,
      visual_style: typeof parsed.visual_style === "string" ? parsed.visual_style : null,
      spacing: parsed.spacing && typeof parsed.spacing === "object" ? {
        text_blocks_gap: typeof parsed.spacing.text_blocks_gap === "string" ? parsed.spacing.text_blocks_gap : undefined,
        margin_edges_pct: typeof parsed.spacing.margin_edges_pct === "number" ? parsed.spacing.margin_edges_pct : undefined,
        overall_density: typeof parsed.spacing.overall_density === "string" ? parsed.spacing.overall_density : undefined,
      } : null,
    };
  } catch {
    return EMPTY;
  }
}

/**
 * POST /api/template-analyze
 * Analisa imagem de template via Gemini Vision e retorna estrutura completa:
 * mini_prompt (blueprint do layout), elements (textos), has_logo, has_person, person_pose, etc.
 */
export async function POST(request: NextRequest) {
  try {
    const { filePath, orgId } = await request.json();
    const { supabase } = await requireAuth(orgId);

    if (!filePath || !orgId) {
      return NextResponse.json({ error: "filePath e orgId obrigatÃ³rios" }, { status: 400 });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("templates")
      .download(filePath);

    if (downloadError || !fileData) {
      return NextResponse.json({ error: "Falha ao baixar imagem do template" }, { status: 500 });
    }

    const imageBuffer = Buffer.from(await fileData.arrayBuffer());

    try {
      const text = await generateTextWithRotation(orgId, ANALYZE_PROMPT, {
        mimeType: "image/png",
        data: imageBuffer.toString("base64"),
      });

      const analysis = parseAnalysis(text);
      return NextResponse.json({ analysis, raw: text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, analysis: EMPTY }, { status: 200 });
    }
  } catch (err) {
    return handleAuthError(err);
  }
}

