interface CopyContent {
  /** Riddle Line â€” chamada principal. */
  headline?: string;
  /** Sub-riddle Line â€” apoio da headline. */
  subheadline?: string;
  /** Ponte / chamada â€” corpo que conecta headline ao CTA. */
  ponte?: string;
  /** Call to action â€” quando preenchido, vira BOTÃƒO desenhado na arte. */
  cta?: string;
  // legados (compatibilidade com copies antigas)
  mini_copy?: string;
  list_items?: string;
  [key: string]: string | undefined;
}

/**
 * Bloco de instruÃ§Ã£o do botÃ£o de CTA. Quando a copy tem CTA, a arte deve
 * renderizar um BOTÃƒO (pill) na cor accent da marca com o texto do CTA dentro.
 * DecisÃ£o do usuÃ¡rio (2026-06): CTA Ã© botÃ£o desenhado, nÃ£o texto solto.
 */
function buildCtaButtonRule(cta: string, accent: string): string {
  return `BOTÃƒO DE CTA (OBRIGATÃ“RIO â€” renderizar como botÃ£o, nÃ£o como texto solto):
A arte DEVE conter um botÃ£o de call-to-action com o texto exato "${cta}".
Formato do botÃ£o: retÃ¢ngulo de cantos bem arredondados (pill), preenchido na cor de destaque da marca (${accent}), com o texto "${cta}" centralizado em cor de alto contraste (branco ou a cor de fundo da marca), peso semibold/bold.
PosiÃ§Ã£o: parte inferior do criativo, centralizado ou alinhado conforme a composiÃ§Ã£o, com respiro das bordas.
Este Ã© o ÃšNICO botÃ£o permitido na arte. NÃƒO crie outros botÃµes nem repita o CTA em outro lugar.`;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  text?: string;
}

export interface BrandFonts {
  heading: { family: string; weight: string };
  body: { family: string; weight: string };
}

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

interface PromptProject {
  copy: CopyContent;
  brand: {
    colors: BrandColors;
    fonts: BrandFonts;
  };
  format: { width: number; height: number };
  hasExpertPhotos: boolean;
  hasLogo: boolean;
  /**
   * Ãndice deste criativo dentro do projeto (0, 1, 2...). Quando > 0 e o usuÃ¡rio
   * pediu variaÃ§Ã£o (nos ajustes/notas), o prompt instrui a variar cenÃ¡rio/fundo
   * e composiÃ§Ã£o pra cada criativo ficar diferente.
   */
  variationIndex?: number;
  /**
   * ForÃ§a a variaÃ§Ã£o de fundo/cenÃ¡rio/roupa/pose entre criativos, mesmo sem
   * palavra-chave nas notas. Quando true, o bloco de VARIAÃ‡ÃƒO OBRIGATÃ“RIA entra
   * no topo do prompt usando variationIndex como semente. Funciona mesmo com 1
   * foto do expert (o ROSTO continua o mesmo, sÃ³ o entorno muda).
   */
  forceVariation?: boolean;
  /**
   * Toggle de variaÃ§Ã£o de ROUPA/VESTIMENTA entre criativos (independente de
   * forceVariation). Quando false (padrÃ£o), a IA MANTÃ‰M o mesmo TIPO de roupa do
   * template (mesma peÃ§a: terno, camisa social, jaleco, etc), sÃ³ adaptando a cor Ã 
   * marca. Quando true, a IA pode variar a roupa entre os criativos. Mesmo com
   * variaÃ§Ã£o de fundo/pose ligada (forceVariation), a roupa sÃ³ varia se isto for true.
   */
  varyClothing?: boolean;
  /**
   * BLOCO C â€” modo composiÃ§Ã£o (fundo prÃ³prio). Quando true, uma foto de fundo
   * REAL foi anexada como primeira imagem e DEVE ser preservada como cena final.
   * O sistema entra em modo composiÃ§Ã£o: aplica sÃ³ os textos do template por cima
   * da foto, sem recriar/inventar o cenÃ¡rio. Mutuamente exclusivo com variaÃ§Ã£o de
   * cenÃ¡rio (variaÃ§Ã£o Ã© suprimida automaticamente quando isto Ã© true).
   */
  hasCustomBackground?: boolean;
  /**
   * BLOCO C.2 â€” layout do fundo prÃ³prio:
   * - 'full' (padrÃ£o): a foto ocupa a tela inteira e o texto entra por cima com overlay sutil.
   * - 'split-top': a foto ocupa a METADE SUPERIOR (50%) preservada intacta; a metade
   *   INFERIOR Ã© um bloco de cor sÃ³lida da marca onde a IA desenha headline/subheadline/pills.
   */
  backgroundMode?: "full" | "split-top" | "split-bottom";
  /**
   * BLOCO C.3 â€” cor do bloco no layout 'split-top'. Quando definida, o bloco
   * inferior usa ESTA cor especÃ­fica (vinda do rodÃ­zio de cores escolhidas pelo
   * usuÃ¡rio). Quando ausente, a IA escolhe a melhor cor da paleta da marca.
   */
  blockColor?: string;
  templateMiniPrompt?: string;
  /** AnÃ¡lise visual do template (Vision API no upload) */
  templateAnalysis?: {
    hasLogo: boolean | null;
    logoPosition: string | null;
    hasPerson: boolean | null;
    personPose: string | null;
  };
  /** AnÃ¡lise visual enriquecida (V2) */
  templateBackground?: BackgroundAnalysis | null;
  templateTextLayout?: TextLayoutItem[] | null;
  templatePerson?: PersonAnalysis | null;
  templateSpacing?: SpacingAnalysis | null;
  templateLogoSizePct?: number | null;
  chatRefinement?: string;
  /**
   * BLOCO B â€” campos de copy ativos no projeto (checkboxes nÃ­vel projeto).
   * Quando definido, os campos de copy que NÃƒO estiverem nesta lista sÃ£o
   * ignorados na arte (mesmo que a copy tenha valor). Quando undefined, todos
   * os campos preenchidos sÃ£o usados (comportamento padrÃ£o).
   */
  activeCopyFields?: string[];
  /** EP08: Quantidade de imagens de referÃªncia por tipo */
  imageRefs?: {
    templateCount: number;
    photoCount: number;
    hasLogo: boolean;
  };
  /** Ajustes do expert (presets + notas livres) â€” vem do step-visual */
  expertAdjustments?: ExpertAdjustmentsInput;
}

export interface ExpertAdjustmentsInput {
  presets: string[];
  notes: string;
}

// Mapeamento dos preset IDs para instruÃ§Ãµes (espelha EXPERT_ADJUSTMENT_PRESETS do step-visual)
const EXPERT_ADJUSTMENT_INSTRUCTIONS: Record<string, string> = {
  "no-glasses": "NÃ£o desenhar Ã³culos na pessoa, mesmo se o template mostrar Ã³culos.",
  "no-tie": "NÃ£o desenhar gravata, mesmo se o template mostrar gravata.",
  "no-beard": "NÃ£o desenhar barba, mesmo se o template mostrar pessoa com barba.",
  "no-hat": "NÃ£o desenhar chapÃ©u, bonÃ© ou qualquer acessÃ³rio de cabeÃ§a.",
  "neutral-expression": "Manter expressÃ£o neutra ou sÃ©ria. NÃ£o fazer a pessoa sorrir, mesmo se o template tiver sorriso.",
  "use-expert-clothing": "Usar a roupa que aparece nas fotos do expert, nÃ£o a roupa do template.",
  "preserve-hair": "Manter cor, comprimento e estilo do cabelo exatamente como nas fotos do expert.",
  "preserve-age": "Manter a idade aparente do expert das fotos. NÃ£o rejuvenescer nem envelhecer.",
  "force-brand-colors": "OBRIGATÃ“RIO: TODA a paleta visÃ­vel na arte final (fundo, textos, formas, gradientes, overlays, badges, destaques, sombras coloridas, tints, divisores, Ã­cones decorativos) DEVE estar dentro da paleta de cores da marca configurada no brand kit. JAMAIS use cores do template original â€” elas servem sÃ³ pra indicar ONDE vai cada cor, nÃ£o QUAL. Onde o template usa cor escura/principal â†’ usar PrimÃ¡ria da marca. Onde usa cor de destaque â†’ usar Accent. Onde usa cor de fundo â†’ usar Fundo (ou PrimÃ¡ria). Onde usa cor clara â†’ manter clara mas dentro da paleta.",
  "force-brand-logo": "OBRIGATÃ“RIO: o ÃšNICO logo, selo ou assinatura visual permitido na arte final Ã© o logo da marca anexado. Qualquer outro logo, marca d'Ã¡gua, sÃ­mbolo de empresa ou assinatura que apareÃ§a no template original DEVE SUMIR completamente. Se o template tem logo de outra empresa, REMOVE e substitui pelo logo da marca configurada (mesma posiÃ§Ã£o e tamanho relativo).",
  "force-brand-typography": "OBRIGATÃ“RIO: usar APENAS as fontes configuradas no brand kit da marca para todos os textos da arte final. TÃ­tulos na fonte de heading da marca, corpo na fonte body da marca. JAMAIS usar a fonte original do template.",
};

function buildExpertAdjustmentsBlock(input: ExpertAdjustmentsInput | undefined): string | null {
  if (!input) return null;
  const presetLines = (input.presets ?? [])
    .map((id) => EXPERT_ADJUSTMENT_INSTRUCTIONS[id])
    .filter(Boolean);
  const notes = (input.notes ?? "").trim();
  if (presetLines.length === 0 && !notes) return null;

  const lines: string[] = [
    "AJUSTES OBRIGATÃ“RIOS DO EXPERT (tÃªm prioridade sobre o template):",
  ];
  for (const line of presetLines) lines.push(`- ${line}`);
  if (notes) lines.push(`- Outras particularidades: ${notes}`);
  lines.push(
    "Se houver conflito entre o que o template mostra e estes ajustes, OS AJUSTES ACIMA VENCEM. O template define pose, enquadramento, cenÃ¡rio e layout â€” nÃ£o define acessÃ³rios, roupa ou expressÃ£o do expert."
  );
  return lines.join("\n");
}

/**
 * Monta o prompt final para geraÃ§Ã£o de criativos.
 * V2: Usa dados granulares da anÃ¡lise enriquecida (fundo, grid, proporÃ§Ãµes, tipografia)
 * para gerar instruÃ§Ãµes artesanais por template â€” mÃ¡xima fidelidade ao original.
 */
export function buildPrompt(project: PromptProject): string {
  const {
    copy, brand, format, hasExpertPhotos, hasLogo, variationIndex, forceVariation,
    varyClothing,
    hasCustomBackground,
    backgroundMode,
    blockColor,
    templateMiniPrompt, templateAnalysis, templateBackground,
    templateTextLayout, templatePerson, templateSpacing, templateLogoSizePct,
    chatRefinement, imageRefs, expertAdjustments, activeCopyFields,
  } = project;

  // (c) Torriani â€” proprietary prompt engine, see LICENSE

  // BLOCO B â€” quando o projeto define campos ativos, ignorar os campos de copy
  // fora da lista. Mapeamento de aliases legados â†’ campo canÃ´nico (mini_copy Ã©
  // alias de subheadline; list_items Ã© alias de ponte) pra o filtro funcionar
  // independente do padrÃ£o (estatico/mini_copy) usado na copy.
  const fieldAlias: Record<string, string> = {
    mini_copy: "subheadline",
    list_items: "ponte",
  };
  const isCopyFieldActive = (field: string): boolean => {
    if (!activeCopyFields || activeCopyFields.length === 0) return true;
    const canonical = fieldAlias[field] ?? field;
    return activeCopyFields.includes(field) || activeCopyFields.includes(canonical);
  };
  const templateHasPerson = templateAnalysis?.hasPerson === true;
  const templateHasLogo = templateAnalysis?.hasLogo === true;

  // VARIAÃ‡ÃƒO: o usuÃ¡rio pediu pra variar (cenÃ¡rio/pose/roupa/fundo)? Detectamos
  // por palavras-chave nas notas/chat, OU por forceVariation explÃ­cito. Quando
  // true, as regras de "preserve o fundo/pose/cenÃ¡rio do template" sÃ£o INVERTIDAS
  // pra esses elementos â€” senÃ£o elas contradizem o pedido e o modelo gera tudo igual.
  const variationText = `${expertAdjustments?.notes ?? ""} ${chatRefinement ?? ""}`.toLowerCase();
  const keywordVariation = /\bvari|cen[Ã¡a]rio|fundo|consult[Ã³o]rio|ambiente|background|pose|roupa|enquadr/.test(variationText);
  // BLOCO C: modo composiÃ§Ã£o (fundo prÃ³prio) e variaÃ§Ã£o de cenÃ¡rio sÃ£o MUTUAMENTE
  // EXCLUSIVOS. Quando hÃ¡ fundo prÃ³prio, a cena Ã© preservada â€” nÃ£o faz sentido variar.
  const wantsVariation = !hasCustomBackground
    && (forceVariation === true || keywordVariation)
    && typeof variationIndex === "number";

  // ROUPA: por padrÃ£o a vestimenta do template Ã© MANTIDA (mesmo tipo de peÃ§a),
  // mesmo quando hÃ¡ variaÃ§Ã£o de fundo/pose. SÃ³ varia a roupa quando o usuÃ¡rio
  // liga o toggle dedicado (varyClothing). Detecta tambÃ©m menÃ§Ã£o explÃ­cita a
  // "variar roupa" nas notas/chat, pra respeitar pedido em texto livre.
  const explicitClothingKeyword = /\bvari\w*\s+(a\s+)?roupa|roupa\w*\s+diferent|trocar?\s+(a\s+)?roupa/.test(variationText);
  const wantsClothingVariation = !hasCustomBackground
    && (varyClothing === true || explicitClothingKeyword);

  const lines: string[] = [];

  // BLOCO C â€” MODO COMPOSIÃ‡ÃƒO (fundo prÃ³prio): no TOPO, alta prioridade. A foto de
  // fundo anexada (imagem 1) Ã© a cena final e DEVE ser preservada o mais fiel
  // possÃ­vel. O template sÃ³ empresta os textos (fonte/posiÃ§Ã£o/formato).
  if (hasCustomBackground && (backgroundMode === "split-top" || backgroundMode === "split-bottom")) {
    // Layout split 50/50: foto real numa metade (preservada), bloco de cor da marca na outra com o texto.
    const fotoEmCima = backgroundMode === "split-top";
    const metadeFoto = fotoEmCima ? "METADE SUPERIOR (os 50% DE CIMA)" : "METADE INFERIOR (os 50% DE BAIXO)";
    const metadeBloco = fotoEmCima ? "METADE INFERIOR (os 50% DE BAIXO)" : "METADE SUPERIOR (os 50% DE CIMA)";
    const paletaCores = [brand.colors.primary, brand.colors.secondary, brand.colors.accent]
      .filter(Boolean).join(", ");
    // Cor do bloco: especÃ­fica (rodÃ­zio escolhido pelo usuÃ¡rio) ou IA escolhe da paleta.
    const blocoRule = blockColor
      ? `um BLOCO DE COR SÃ“LIDA na cor ${blockColor} (cor da marca escolhida para este criativo). Use EXATAMENTE essa cor.`
      : `um BLOCO DE COR SÃ“LIDA da marca. Escolha a cor da paleta (${paletaCores}) que der MELHOR contraste e leitura com os textos.`;
    lines.push(`MODO COMPOSIÃ‡ÃƒO â€” DUAS FAIXAS HORIZONTAIS SEPARADAS (PRIORIDADE MÃXIMA, LEIA ANTES DE TUDO):
ESTE NÃƒO Ã‰ um criativo com texto por cima de uma foto. Ã‰ um criativo DIVIDIDO em DUAS FAIXAS HORIZONTAIS distintas, com uma LINHA DE CORTE RETA E LIMPA no meio (~50/50). NUNCA coloque texto, badges ou botÃµes SOBRE a foto.

FAIXA 1 â€” FOTO (a ${metadeFoto}): use a PRIMEIRA imagem anexada (a FOTO REAL da franquia) ocupando EXATAMENTE essa metade, do jeito que ela Ã©. PRESERVE com MÃXIMA FIDELIDADE: mesmos objetos, mesma perspectiva, mesma iluminaÃ§Ã£o, MESMAS cores. NÃƒO recrie, NÃƒO invente, NÃƒO redesenhe, NÃƒO substitua o cenÃ¡rio, NÃƒO escreva NADA sobre essa foto. Ela fica LIMPA, sem nenhum texto ou elemento grÃ¡fico por cima.

FAIXA 2 â€” BLOCO DE COR + TEXTO (a ${metadeBloco}): Ã© ${blocoRule} TODO o texto vive AQUI, dentro deste bloco de cor sÃ³lida, NUNCA sobre a foto. Desenhe headline em destaque, subheadline de apoio, e os bullets/destaques como PÃLULAS arredondadas de cor contrastante, seguindo a fonte e a hierarquia do template.

REGRAS DURAS:
- A linha que separa a foto do bloco Ã© RETA, HORIZONTAL e no MEIO (~50%).
- ZERO texto, badge, logo ou botÃ£o sobre a foto. Texto sÃ³ no bloco de cor.
- A foto NÃƒO Ã© fundo de tela cheia. Ela ocupa SÃ“ a sua metade.`);
  } else if (hasCustomBackground) {
    lines.push(`MODO COMPOSIÃ‡ÃƒO â€” FUNDO PRÃ“PRIO (PRIORIDADE MÃXIMA, LEIA ANTES DE TUDO):
A PRIMEIRA imagem anexada Ã© a FOTO DE FUNDO REAL e Ã© a CENA FINAL do criativo. PRESERVE-A com MÃXIMA FIDELIDADE.
- NÃƒO recrie, NÃƒO invente, NÃƒO redesenhe, NÃƒO substitua e NÃƒO altere o cenÃ¡rio/ambiente desta foto. Mantenha os mesmos objetos, a mesma perspectiva, a mesma iluminaÃ§Ã£o e as MESMAS cores da cena. O resultado deve ser essa mesma foto, apenas com os textos por cima.
- Aplique APENAS os TEXTOS por cima dessa foto de fundo, usando a MESMA fonte, posiÃ§Ã£o, tamanho relativo e formato indicados pelo template anexado (o template serve SÃ“ como molde de layout/tipografia do texto â€” ele NÃƒO dita o fundo).
- ÃšNICO ajuste permitido na foto de fundo: um overlay/gradiente sutil (escurecer ou clarear) ATRÃS do texto, sÃ³ o necessÃ¡rio pra garantir a leitura. NÃƒO mude as cores da cena, NÃƒO troque o fundo por outro, NÃƒO aplique a paleta da marca sobre a foto inteira.
Pense assim: a foto de fundo Ã© intocÃ¡vel; o template Ã© apenas a rÃ©gua de onde e como o texto entra.`);
  }

  // VARIAÃ‡ÃƒO NO TOPO (alta prioridade): aparece ANTES das regras de preservaÃ§Ã£o,
  // pra o modelo entender desde o inÃ­cio que esta versÃ£o deve ser diferente.
  // Funciona mesmo com 1 foto (hasExpertPhotos): o ROSTO continua o mesmo, sÃ³ o
  // fundo/cenÃ¡rio/roupa/pose em volta Ã© que mudam por versÃ£o.
  if (wantsVariation) {
    const clothingVariationLine = wantsClothingVariation
      ? "- VARIE a ROUPA da pessoa entre as versÃµes (cores/peÃ§as diferentes, sempre profissional e do MESMO TIPO de vestimenta do template, ex.: se o template usa terno, varie entre ternos)."
      : "- MANTENHA a ROUPA: a pessoa usa o MESMO tipo de roupa do template (mesma peÃ§a: terno, camisa social, jaleco, etc) em TODAS as versÃµes. NÃƒO invente roupa diferente entre as versÃµes; a cor pode ser adaptada Ã  marca, mas o tipo de vestimenta Ã© o do template.";
    const naoMudaRoupa = wantsClothingVariation ? "a roupa, " : "";
    lines.push(`VARIAÃ‡ÃƒO OBRIGATÃ“RIA â€” esta Ã© a versÃ£o ${(variationIndex ?? 0) + 1} do conjunto, e ela DEVE ser visualmente diferente das outras versÃµes:
- TROQUE o FUNDO/CENÃRIO por um ambiente diferente e coerente (ex.: consultÃ³rio moderno, sala acolhedora, ambiente claro com plantas, parede com estante de livros) â€” cada versÃ£o com um cenÃ¡rio, Ã¢ngulo e iluminaÃ§Ã£o DIFERENTES. NÃƒO use o fundo do template nem repita o cenÃ¡rio das outras versÃµes.
- VARIE a POSE da pessoa (em pÃ©, sentada, braÃ§os diferentes, leve mudanÃ§a de Ã¢ngulo).
${clothingVariationLine}
- VARIE o ENQUADRAMENTO (uma versÃ£o mais prÃ³xima do rosto, outra meio corpo, outra mais aberta).
${hasExpertPhotos
  ? `O que NÃƒO muda: o LAYOUT do template (onde ficam headline, subheadline, CTA, logo), as CORES da marca, a COPY (textos exatos) e a IDENTIDADE FACIAL da pessoa â€” Ã© SEMPRE o MESMO rosto da foto do expert anexada, em todas as versÃµes. SÃ³ o fundo, ${naoMudaRoupa}a pose e o enquadramento Ã© que mudam.`
  : "O que NÃƒO muda: o LAYOUT do template (posiÃ§Ãµes de headline, subheadline, CTA, logo), as CORES da marca e a COPY (textos exatos). SÃ³ o fundo/cenÃ¡rio e a composiÃ§Ã£o Ã© que variam."}
Use o nÃºmero da versÃ£o (${(variationIndex ?? 0) + 1}) como semente criativa pra garantir que esta seja diferente das demais.`);
  }

  // INSTRUÃ‡ÃƒO PRINCIPAL â€” hierarquia clara: template = ESTRUTURA, expert+brand = CONTEÃšDO
  const hardRulesIntro: string[] = [];
  hardRulesIntro.push("TAREFA: gerar uma imagem nova que use o TEMPLATE anexado APENAS como referÃªncia de LAYOUT e COMPOSIÃ‡ÃƒO (posiÃ§Ãµes, hierarquia, enquadramento, pose, espaÃ§amento, tipografia relativa).");
  hardRulesIntro.push("O CONTEÃšDO da imagem Ã© DIFERENTE do template:");

  const hardBullets: string[] = [];
  if (hasExpertPhotos) {
    hardBullets.push("- O ROSTO, traÃ§os faciais, pele, cabelo e identidade da pessoa final sÃ£o SEMPRE os da foto do expert anexada â€” JAMAIS o rosto do template. Se o template mostra uma pessoa, ela serve sÃ³ para indicar pose/enquadramento/iluminaÃ§Ã£o.");
  }
  if (hasCustomBackground) {
    hardBullets.push(`- As CORES dos TEXTOS e elementos grÃ¡ficos desenhados por cima (CTA, badges, overlays de leitura) sÃ£o as da marca anexada (PrimÃ¡ria ${brand.colors.primary}, SecundÃ¡ria ${brand.colors.secondary}, Accent ${brand.colors.accent}${brand.colors.background ? `, Fundo ${brand.colors.background}` : ""}). A FOTO DE FUNDO mantÃ©m as cores reais dela â€” NÃƒO repintar a cena (ver MODO COMPOSIÃ‡ÃƒO no topo).`);
  } else {
    hardBullets.push(`- As CORES da imagem final sÃ£o SEMPRE as da marca anexada (PrimÃ¡ria ${brand.colors.primary}, SecundÃ¡ria ${brand.colors.secondary}, Accent ${brand.colors.accent}${brand.colors.background ? `, Fundo ${brand.colors.background}` : ""}) â€” JAMAIS as cores do template original.`);
  }
  hardBullets.push("- A TIPOGRAFIA usa as fontes da marca, nÃ£o as do template.");
  if (hasLogo) {
    hardBullets.push("- O LOGO Ã© o da marca anexada, nÃ£o o do template.");
  }
  hardBullets.push("- OS TEXTOS sÃ£o exclusivamente a copy fornecida abaixo â€” qualquer texto que apareÃ§a no template e nÃ£o esteja na copy Ã© descartado.");

  hardRulesIntro.push(hardBullets.join("\n"));
  hardRulesIntro.push("REGRA ABSOLUTA: se o template e as instruÃ§Ãµes abaixo entrarem em conflito sobre rosto, cores, logo ou textos, AS INSTRUÃ‡Ã•ES ABAIXO VENCEM. O template define APENAS a forma visual (layout/grid/pose/proporÃ§Ãµes). Tudo que Ã© IDENTIDADE (quem aparece, em que cores, com qual marca, dizendo qual mensagem) vem das referÃªncias anexadas e da copy.");

  lines.push(hardRulesIntro.join("\n\n"));

  // Identificar imagens anexadas por posiÃ§Ã£o
  if (imageRefs) {
    const refLines: string[] = [];
    let pos = 1;

    if (imageRefs.templateCount > 0) {
      if (imageRefs.templateCount === 1) {
        refLines.push(`A imagem ${pos} Ã© o template/modelo base â€” a REFERÃŠNCIA PRINCIPAL. Replique-o fielmente.`);
      } else {
        refLines.push(`As ${imageRefs.templateCount} primeiras imagens (${pos}-${pos + imageRefs.templateCount - 1}) sÃ£o templates/modelos base.`);
      }
      pos += imageRefs.templateCount;
    }

    if (imageRefs.photoCount > 0) {
      const range = imageRefs.photoCount === 1
        ? `A imagem ${pos}`
        : `As imagens ${pos}-${pos + imageRefs.photoCount - 1}`;
      refLines.push(`${range} ${imageRefs.photoCount === 1 ? "Ã© uma referÃªncia" : "sÃ£o referÃªncias"} de IDENTIDADE FACIAL da pessoa real (rosto, pele, cabelo, traÃ§os). NÃƒO Ã© para ser colada na arte final. Use APENAS para capturar a identidade facial e aplicÃ¡-la na pessoa do template, preservando a POSE, enquadramento e iluminaÃ§Ã£o do template.`);
      pos += imageRefs.photoCount;
    }

    if (imageRefs.hasLogo) {
      refLines.push(`A imagem ${pos} Ã© o logo da marca. Posicione no mesmo local onde estÃ¡ o logo no template original.`);
    }

    lines.push(refLines.join(" "));
  }

  // === BLUEPRINT DO TEMPLATE ===
  // Combina mini_prompt + dados granulares para um blueprint ultra-preciso
  const blueprintParts: string[] = [];

  if (templateMiniPrompt) {
    blueprintParts.push(templateMiniPrompt);
  }

  // Fundo detalhado â€” SUPRIMIDO no modo composiÃ§Ã£o (a cena vem da foto prÃ³pria,
  // nÃ£o do fundo descrito pelo template).
  if (templateBackground && !hasCustomBackground) {
    blueprintParts.push(`FUNDO: ${templateBackground.description}${templateBackground.colors?.length ? ` (cores: ${templateBackground.colors.join(", ")})` : ""}`);
  }

  // Grid de texto com proporÃ§Ãµes
  if (templateTextLayout?.length) {
    const textDesc = templateTextLayout.map((item) => {
      const parts = [`${item.role.toUpperCase()}: "${item.text_found}"`];
      if (item.position) parts.push(`posiÃ§Ã£o ${item.position}`);
      if (item.grid_area) parts.push(`no ${item.grid_area}`);
      if (item.size_pct) parts.push(`ocupando ~${item.size_pct}% da altura`);
      if (item.style) parts.push(`estilo: ${item.style}`);
      if (item.color) parts.push(`cor: ${item.color}`);
      if (item.lines) parts.push(`${item.lines} linha${item.lines > 1 ? "s" : ""}`);
      return parts.join(", ");
    }).join("\n  ");
    blueprintParts.push(`MAPA DE TEXTOS DO TEMPLATE:\n  ${textDesc}`);
  }

  // Pessoa detalhada
  if (templatePerson?.present) {
    const personParts: string[] = [];
    if (templatePerson.framing) personParts.push(`enquadramento: ${templatePerson.framing}`);
    if (templatePerson.grid_position) personParts.push(`posiÃ§Ã£o: ${templatePerson.grid_position}`);
    if (templatePerson.coverage_pct) personParts.push(`ocupa ~${templatePerson.coverage_pct}% do quadro`);
    if (templatePerson.pose) personParts.push(`pose: ${templatePerson.pose}`);
    if (templatePerson.clothing) personParts.push(`vestimenta: ${templatePerson.clothing}`);
    if (templatePerson.expression) personParts.push(`expressÃ£o: ${templatePerson.expression}`);
    if (templatePerson.gaze_direction) personParts.push(`olhar: ${templatePerson.gaze_direction}`);
    if (personParts.length > 0) {
      blueprintParts.push(`PESSOA NO TEMPLATE: ${personParts.join("; ")}`);
    }
  }

  // EspaÃ§amento
  if (templateSpacing) {
    const spacingParts: string[] = [];
    if (templateSpacing.overall_density) spacingParts.push(`densidade: ${templateSpacing.overall_density}`);
    if (templateSpacing.text_blocks_gap) spacingParts.push(`gap entre textos: ${templateSpacing.text_blocks_gap}`);
    if (templateSpacing.margin_edges_pct) spacingParts.push(`margem das bordas: ~${templateSpacing.margin_edges_pct}%`);
    if (spacingParts.length > 0) {
      blueprintParts.push(`ESPAÃ‡AMENTO: ${spacingParts.join("; ")}`);
    }
  }

  if (blueprintParts.length > 0) {
    lines.push(`BLUEPRINT DETALHADO DO TEMPLATE:
${blueprintParts.join("\n\n")}

REGRA #1 â€” REPLIQUE ESTE LAYOUT COM PRECISÃƒO:
Siga o blueprint acima como especificaÃ§Ã£o tÃ©cnica. Cada elemento deve estar EXATAMENTE na posiÃ§Ã£o descrita, com o MESMO tamanho relativo (respeite os percentuais indicados), a MESMA hierarquia, o MESMO estilo tipogrÃ¡fico, o MESMO peso visual e o MESMO enquadramento. A imagem de referÃªncia anexada confirma visualmente esta descriÃ§Ã£o. Se houver conflito entre o texto do blueprint e a imagem, a IMAGEM DE REFERÃŠNCIA tem prioridade.`);
  } else {
    lines.push(`REGRA #1 â€” ESTRUTURA IDÃŠNTICA:
Mantenha EXATAMENTE a mesma composiÃ§Ã£o visual do template: posiÃ§Ã£o de textos, tamanho das letras, estilo tipogrÃ¡fico, peso visual, espaÃ§amentos, alinhamento e hierarquia visual. A imagem final deve parecer o mesmo template, apenas com conteÃºdo diferente.`);
  }

  // REGRA #2 â€” TROQUE CORES + FUNDO
  // Cor de fundo SEMPRE concreta: se a marca nÃ£o declara background, deriva da PrimÃ¡ria.
  // Sem isso, a IA recai pro preto/azul do template original (caso ZÃ© Coxinha).
  const fundoCor = brand.colors.background || brand.colors.primary;
  const colorParts = [`PrimÃ¡ria: ${brand.colors.primary}`, `SecundÃ¡ria: ${brand.colors.secondary}`, `Accent: ${brand.colors.accent}`];
  // Garante SEMPRE uma cor de fundo concreta na paleta listada, mesmo sem background declarado.
  colorParts.push(`Fundo: ${fundoCor}`);

  let colorRule = hasCustomBackground
    ? `REGRA #2 â€” CORES DA MARCA NOS TEXTOS E ELEMENTOS (NÃƒO NO FUNDO):
Aplique a paleta da marca abaixo APENAS aos TEXTOS e elementos grÃ¡ficos desenhados por cima da foto (textos, botÃ£o de CTA, badges, overlays/gradientes de leitura). NÃƒO altere as cores da FOTO DE FUNDO â€” ela Ã© preservada como estÃ¡ (ver MODO COMPOSIÃ‡ÃƒO no topo).
Paleta da marca: ${colorParts.join(" | ")}
Tipografia: tÃ­tulos em ${brand.fonts.heading.family} (${brand.fonts.heading.weight}), corpo em ${brand.fonts.body.family} (${brand.fonts.body.weight}).
Garanta contraste suficiente entre o texto e a foto de fundo (use o overlay/gradiente sutil permitido se necessÃ¡rio), mas SEM repintar a cena.`
    : `REGRA #2 â€” CORES DA MARCA SÃƒO OBRIGATÃ“RIAS (NÃƒO Ã‰ OPCIONAL):
Toda paleta visÃ­vel na arte final (fundo, textos, formas geomÃ©tricas, gradientes, overlays, destaques, botÃµes/CTAs decorativos, sombras coloridas, tints, badges) DEVE estar dentro da paleta da marca abaixo. JAMAIS use as cores originais do template â€” elas servem sÃ³ pra vocÃª entender ONDE vai cada cor, nÃ£o QUAL cor usar.
Paleta da marca: ${colorParts.join(" | ")}
Tipografia: tÃ­tulos em ${brand.fonts.heading.family} (${brand.fonts.heading.weight}), corpo em ${brand.fonts.body.family} (${brand.fonts.body.weight}).
COR DE FUNDO DA ARTE: use ${fundoCor} como cor base do fundo. JAMAIS use preto, azul, cinza ou qualquer cor do template original no fundo, a nÃ£o ser que essa cor esteja na paleta da marca.
Mapeamento: onde o template usa cor escura/primÃ¡ria â†’ use a PrimÃ¡ria da marca. Onde usa cor de destaque/CTA â†’ use o Accent da marca. Onde usa cor de fundo â†’ use ${fundoCor}. Onde usa texto claro â†’ mantenha claro mas dentro da paleta.`;

  // FUNDO â€” instruÃ§Ã£o de preservaÃ§Ã£o do TIPO + atmosfera do fundo do template,
  // adaptando SÃ“ as cores Ã  marca. SUPRIMIDO no modo composiÃ§Ã£o (fundo prÃ³prio,
  // regra do topo) e no modo variaÃ§Ã£o (o fundo DEVE mudar, regra do topo).
  // Sem variaÃ§Ã£o e sem fundo prÃ³prio, a IA inventava cenÃ¡rio novo â€” por isso
  // a instruÃ§Ã£o abaixo Ã© dura: preserve o TIPO de fundo, nunca invente cena nova.
  if (!hasCustomBackground && !wantsVariation) {
    if (templateBackground?.type === "gradient") {
      colorRule += `\nFUNDO (PRESERVE O TIPO): O template usa gradiente (${templateBackground.description}). Mantenha um fundo GRADIENTE (mesma direÃ§Ã£o e transiÃ§Ã£o), apenas trocando as cores para a paleta da marca (base ${fundoCor}). NÃƒO transforme o gradiente em foto, cena ou ambiente; NÃƒO invente um cenÃ¡rio novo.`;
    } else if (templateBackground?.type === "solid") {
      colorRule += `\nFUNDO (PRESERVE O TIPO): O template usa cor SÃ“LIDA. Mantenha um fundo de cor sÃ³lida da marca (${fundoCor}), com o MESMO nÃ­vel de contraste com os textos. NÃƒO invente foto, ambiente ou cenÃ¡rio no lugar do fundo sÃ³lido.`;
    } else if (templateBackground?.type === "photo" || templateBackground?.type === "blur") {
      colorRule += `\nFUNDO (PRESERVE O TIPO E A ATMOSFERA): O template usa foto/ambiente de fundo (${templateBackground.description}). Mantenha um fundo com o MESMO tipo de cena e a MESMA atmosfera, apenas tonalizando/adaptando as cores para a paleta da marca via overlay sutil. NÃƒO troque por um cenÃ¡rio diferente, NÃƒO invente um ambiente novo, NÃƒO transforme em fundo sÃ³lido/gradiente.`;
    } else {
      // Sem dados de anÃ¡lise de fundo: regra genÃ©rica forte contra inventar cenÃ¡rio.
      colorRule += `\nFUNDO (PRESERVE O TIPO E A ATMOSFERA): mantenha o MESMO tipo de fundo que o template anexado mostra (se Ã© gradiente, mantenha gradiente; se Ã© cor sÃ³lida, mantenha sÃ³lida; se Ã© foto/ambiente, mantenha um ambiente equivalente), apenas ADAPTANDO as cores para a paleta da marca (base ${fundoCor}). NÃƒO invente um cenÃ¡rio novo que nÃ£o existe no template, NÃƒO troque o TIPO de fundo, NÃƒO adicione objetos/ambientes que o template nÃ£o tem.`;
    }
  } else if (templateBackground && !hasCustomBackground && templateBackground.type === "gradient") {
    // Modo variaÃ§Ã£o: o cenÃ¡rio muda (regra do topo), mas se o template Ã© gradiente
    // sem pessoa, mantemos coerÃªncia de cor da marca sem forÃ§ar cena.
    colorRule += `\nFUNDO: adapte sempre as cores do fundo Ã  paleta da marca (base ${fundoCor}).`;
  }
  lines.push(colorRule);

  // DIREÃ‡ÃƒO DE MENSAGEM â€” conecta copy ao mood da imagem
  const headlineForMood = copy.headline || copy.chamada || Object.values(copy).find((v) => typeof v === "string" && v.length > 0);
  if (headlineForMood) {
    const moodExpression = templatePerson?.expression ? ` A expressÃ£o original do template Ã© "${templatePerson.expression}" com olhar "${templatePerson.gaze_direction || "para cÃ¢mera"}".` : "";
    lines.push(`DIREÃ‡ÃƒO DE MENSAGEM:
A mensagem central deste criativo Ã©: "${headlineForMood}".${moodExpression}
Ajuste a micro-expressÃ£o facial e a energia emocional da cena para reforÃ§ar essa mensagem â€” mantendo ABSOLUTAMENTE a composiÃ§Ã£o e o layout do template${wantsVariation ? " (a pose/cenÃ¡rio/fundo variam conforme a VARIAÃ‡ÃƒO OBRIGATÃ“RIA do topo)" : ", enquadramento, pose e cenÃ¡rio do template"}. ${wantsVariation ? "" : "Apenas a energia sutil e a expressÃ£o devem conversar com a copy."}`);
  }

  // REGRA #3 â€” TROQUE TEXTOS com proporÃ§Ãµes do template.
  // 4 campos canÃ´nicos: headline (riddle), subheadline (sub-riddle), ponte, cta (vira botÃ£o).
  const copyParts: string[] = [];
  if (copy.headline && isCopyFieldActive("headline")) copyParts.push(`Headline (texto principal, destaque): ${copy.headline}`);
  if ((copy.subheadline || copy.mini_copy) && isCopyFieldActive("subheadline")) copyParts.push(`Subheadline (apoio): ${copy.subheadline || copy.mini_copy}`);
  if ((copy.ponte || copy.list_items) && isCopyFieldActive("ponte")) copyParts.push(`Ponte (corpo que conecta): ${copy.ponte || copy.list_items}`);
  // CTA NÃƒO entra aqui â€” vira botÃ£o (regra prÃ³pria abaixo).
  const knownFields = ["headline", "subheadline", "ponte", "cta", "mini_copy", "list_items"];
  for (const [key, value] of Object.entries(copy)) {
    if (!knownFields.includes(key) && value && isCopyFieldActive(key)) {
      copyParts.push(`${key}: ${value}`);
    }
  }

  let textRule = `REGRA #3 â€” TROQUE OS TEXTOS:
Substitua TODOS os textos do template pela copy abaixo. Os textos abaixo DEVEM aparecer na arte, com a hierarquia indicada (headline em maior destaque, subheadline menor, ponte como corpo):
${copyParts.join("\n")}`;

  // CTA vira botÃ£o desenhado (nÃ£o texto solto) â€” respeita o checkbox do campo
  if (copy.cta && isCopyFieldActive("cta")) {
    textRule += `\n\n${buildCtaButtonRule(copy.cta, brand.colors.accent)}`;
  }

  // Se temos text_layout, adicionar mapeamento de proporÃ§Ãµes
  if (templateTextLayout?.length) {
    const mapping: string[] = [];
    for (const item of templateTextLayout) {
      const copyField = mapRoleToCopyField(item.role);
      if (copyField && copy[copyField] && isCopyFieldActive(copyField)) {
        const propParts: string[] = [];
        if (item.size_pct) propParts.push(`~${item.size_pct}% da altura`);
        if (item.position) propParts.push(`posiÃ§Ã£o: ${item.position}`);
        if (item.style) propParts.push(`estilo: ${item.style}`);
        if (propParts.length > 0) {
          mapping.push(`â€¢ ${copyField.toUpperCase()} â†’ substitui "${item.text_found}" â€” manter ${propParts.join(", ")}`);
        }
      }
    }
    if (mapping.length > 0) {
      textRule += `\n\nMAPEAMENTO TEXTOâ†’POSIÃ‡ÃƒO (preserve estas proporÃ§Ãµes EXATAS):\n${mapping.join("\n")}`;
    }
  }
  lines.push(textRule);

  lines.push(`REGRA #3.1 â€” ZERO TEXTO RESIDUAL DO TEMPLATE (CRÃTICO):
TODO e QUALQUER texto que existir no template original DEVE SUMIR da arte final, a menos que esteja LITERALMENTE escrito na copy listada acima.
Isso inclui: headlines antigos, subtÃ­tulos, datas, nÃºmeros de telefone, URLs, e-mails, nomes de produto, slogans, hashtags, @arrobas, palavras decorativas, selos, badges, CTAs antigos, "Webinar 2024", "AulÃ£o Gratuito", "Inscreva-se", "Acesse o link", nomes de pessoa que nÃ£o sejam o expert atual, qualquer marca/logo antigo, qualquer texto em rodapÃ©, qualquer marca d'Ã¡gua.
Se o template mostra a palavra "X" e "X" nÃ£o aparece na copy fornecida, "X" NÃƒO PODE estar na arte final. Substitua pelo texto correspondente da copy, ou (se nÃ£o houver substituto) apague completamente, deixando o espaÃ§o vazio/limpo coerente com o layout.
Pense assim: o template Ã© uma forma vazia. A copy fornecida Ã© o ÃšNICO conteÃºdo que pode preenchÃª-la. Tudo que existia antes que nÃ£o estÃ¡ na copy nova Ã© LIXO e tem que sair.`);

  lines.push(`REGRA #3.2 â€” MANTER O ESTILO E PROPORÃ‡ÃƒO DO TEXTO:
Troque apenas o conteÃºdo escrito. Preserve o MESMO estilo do template original para cada bloco de texto: famÃ­lia visual, peso aparente, caixa alta/baixa, tamanho relativo, alinhamento, quantidade de linhas e posiÃ§Ã£o. Se o headline ocupava ~12% da altura do quadro, o novo headline deve ocupar a MESMA proporÃ§Ã£o. Se o CTA estava em um botÃ£o retangular, mantenha o botÃ£o com as mesmas dimensÃµes.`);

  // REGRA #4 â€” FACE SWAP (enriquecido com dados da person analysis)
  if (hasExpertPhotos) {
    if (templateHasPerson && (templateAnalysis?.personPose || templatePerson?.pose)) {
      const pose = templatePerson?.pose || templateAnalysis?.personPose || "";
      const framing = templatePerson?.framing ? ` (${templatePerson.framing})` : "";
      const gridPos = templatePerson?.grid_position ? `, posicionada no ${templatePerson.grid_position}` : "";
      const coverage = templatePerson?.coverage_pct ? `, ocupando ~${templatePerson.coverage_pct}% do quadro` : "";
      // VESTIMENTA: por padrÃ£o mantÃ©m o TIPO de roupa do template. SÃ³ vira "varie"
      // quando o usuÃ¡rio liga o toggle de roupa. Sem isso a IA inventa roupa
      // (caso "pessoa de camisa" que nÃ£o estava na referÃªncia nem no template).
      const clothingDesc = templatePerson?.clothing ? `${templatePerson.clothing}` : "a mesma vestimenta/tipo de roupa que a pessoa do template usa";
      const clothing = wantsClothingVariation
        ? `\n5. VESTIMENTA: pode VARIAR a roupa entre as versÃµes, mas SEMPRE do MESMO TIPO da do template (${clothingDesc}). Ex.: se o template usa terno, varie entre ternos; se usa jaleco, varie entre jalecos. NÃƒO troque o tipo de peÃ§a.`
        : `\n5. VESTIMENTA (REGRA FORTE): a pessoa final usa o MESMO TIPO de roupa que a pessoa do template (${clothingDesc}) â€” mesma peÃ§a (terno, camisa social, jaleco, etc). NÃƒO invente roupa diferente, NÃƒO ponha "de camisa" se o template nÃ£o tem camisa. A cor pode ser adaptada Ã  paleta da marca se fizer sentido, mas o TIPO de vestimenta Ã© o do template.`;

      lines.push(`REGRA #4 â€” FACE SWAP NA POSE DO TEMPLATE (NÃƒO Ã‰ COLAGEM):
O template original CONTÃ‰M uma pessoa${framing}${gridPos}${coverage}.
Pose do template: "${pose}".
A foto de referÃªncia anexada serve APENAS como fonte de identidade facial. NÃƒO cole, recorte nem reproduza essa foto na arte final.
PROIBIDO: deixar o rosto/traÃ§os faciais da pessoa que aparece no template original na arte final. A pessoa do template Ã© descartada; sÃ³ sobra a POSE dela. O ROSTO Ã© SEMPRE o da foto de referÃªncia anexada, sem exceÃ§Ã£o. Se vocÃª gerar a imagem com o rosto original do template, a tarefa estÃ¡ ERRADA.
O que fazer:
1. ${wantsVariation
      ? `A POSE, o cenÃ¡rio/fundo e o enquadramento seguem a VARIAÃ‡ÃƒO OBRIGATÃ“RIA do topo (cada versÃ£o diferente) â€” NÃƒO copie a pose/cenÃ¡rio do template. ${wantsClothingVariation ? "A roupa tambÃ©m varia (mesmo tipo do template)." : "A ROUPA NÃƒO varia: mantenha o mesmo tipo de vestimenta do template."} SÃ³ o LAYOUT (posiÃ§Ã£o dos textos, logo, CTA) Ã© que vem do template.`
      : "Mantenha EXATAMENTE a pose descrita acima â€” o Ã¢ngulo, enquadramento, posiÃ§Ã£o no quadro, iluminaÃ§Ã£o e cenÃ¡rio do template original."}
2. Substitua INTEGRALMENTE o rosto, traÃ§os faciais, tom de pele, cabelo, idade aparente e identidade pelos da pessoa da foto de referÃªncia. Nada do rosto original sobrevive.
3. O resultado deve parecer que a pessoa da foto de referÃªncia foi fotografada de verdade nessa cena.
4. ${wantsVariation
      ? `Use a foto de referÃªncia SÃ“ para o rosto/identidade. Pose, fundo e iluminaÃ§Ã£o ${wantsClothingVariation ? "e roupa " : ""}devem variar conforme o topo.`
      : "IGNORE completamente a roupa, fundo, pose e iluminaÃ§Ã£o da foto de referÃªncia â€” sÃ³ o rosto/identidade importa."}${clothing}`);
    } else if (templateHasPerson) {
      lines.push(`REGRA #4 â€” FACE SWAP (NÃƒO Ã‰ COLAGEM):
O template tem uma pessoa. A foto de referÃªncia anexada serve APENAS como fonte de identidade facial.
1. Mantenha a POSE, enquadramento, Ã¢ngulo, iluminaÃ§Ã£o, roupa e cenÃ¡rio da pessoa do template.
2. Troque apenas rosto, traÃ§os, pele e cabelo pelos da foto de referÃªncia.
3. NÃƒO cole nem recorte a foto de referÃªncia. NÃƒO reproduza a roupa/fundo/pose dela.`);
    } else {
      lines.push(`REGRA #4 â€” INSERIR PESSOA RESPEITANDO O LAYOUT:
O template original NÃƒO tem pessoa. A foto de referÃªncia mostra a pessoa que deve aparecer na arte.
1. Insira a pessoa em um espaÃ§o coerente com o layout do template, sem quebrar a composiÃ§Ã£o, sem cobrir textos ou elementos importantes.
2. Use a foto de referÃªncia APENAS para identidade facial â€” nÃ£o copie a pose/roupa/fundo dela.
3. ${wantsVariation
      ? `Pose, enquadramento e cenÃ¡rio/fundo seguem a VARIAÃ‡ÃƒO OBRIGATÃ“RIA do topo (cada versÃ£o diferente). ${wantsClothingVariation ? "A roupa tambÃ©m pode variar, sempre profissional." : "A ROUPA Ã© uma vestimenta profissional coerente e CONSISTENTE entre as versÃµes (nÃ£o invente peÃ§as extravagantes)."}`
      : "Escolha uma pose neutra que combine com o estilo do template, com vestimenta profissional sÃ³bria e coerente (nÃ£o invente roupa chamativa)."}`);
    }
  } else if (templateHasPerson) {
    lines.push(`REGRA #4 â€” MANTENHA A PESSOA DO TEMPLATE:
O template original jÃ¡ tem uma pessoa. Mantenha-a EXATAMENTE como estÃ¡, na mesma pose, enquadramento, iluminaÃ§Ã£o e expressÃ£o.`);
  }

  // REGRA #4.5 â€” AJUSTES DO EXPERT (sobrepoe template)
  const adjustmentsBlock = buildExpertAdjustmentsBlock(expertAdjustments);
  if (adjustmentsBlock) {
    lines.push(`REGRA #4.5 â€” ${adjustmentsBlock}`);
  }

  // REGRA #5 â€” LOGO (com tamanho percentual se disponÃ­vel)
  if (hasLogo && templateHasLogo) {
    const pos = templateAnalysis?.logoPosition;
    const size = templateLogoSizePct ? ` (~${templateLogoSizePct}% da largura do quadro)` : "";
    lines.push(`REGRA #5 â€” LOGO:
O template original tem um logo${pos ? ` em ${pos}` : ""}${size}. Substitua-o pelo logo da marca anexado, mantendo a MESMA posiÃ§Ã£o, tamanho${size ? " proporcional" : ""} e proporÃ§Ã£o do logo original.`);
  } else if (hasLogo && !templateHasLogo) {
    lines.push(`REGRA #5 â€” LOGO:
O template original NÃƒO tinha logo. Insira o logo da marca anexado em um canto discreto (rodapÃ© ou topo), ocupando no mÃ¡ximo 8% da largura, sem competir com a hierarquia visual do template.`);
  } else if (!hasLogo && templateHasLogo) {
    lines.push(`REGRA #5 â€” REMOVER LOGO:
O template original tem um logo${templateAnalysis?.logoPosition ? ` em ${templateAnalysis.logoPosition}` : ""}. REMOVA-O completamente. NÃ£o coloque nenhum logo, marca, selo ou assinatura visual no lugar.`);
  } else {
    lines.push(`REGRA #5 â€” SEM LOGO:
NÃƒO coloque nenhum logo, nome de marca, selo ou assinatura visual de marca na imagem.`);
  }

  // REGRA #6 â€” SEM IMITAR A INTERFACE DA META (mas o botÃ£o de CTA da marca Ã‰ permitido)
  lines.push(`REGRA #6 â€” NÃƒO IMITAR A INTERFACE DA META (CRÃTICO):
A arte NÃƒO pode conter elementos que imitem a INTERFACE do Facebook/Instagram/Meta. Mesmo que o template/referÃªncia mostre esses elementos, REMOVA-OS. NÃƒO pode aparecer:
- Ãcone de link/cursor/seta/dedo apontando, simulando clique
- "Saiba mais" ao lado de um Ã­cone de link (estilo Instagram bio link)
- Barra de progresso de stories, avatar circular + @usuario + horÃ¡rio, faixa "Patrocinado/Sponsored"
- Ãcones de curtir (coraÃ§Ã£o), comentar (balÃ£o), compartilhar (aviÃ£o), salvar (bookmark)
- "Swipe up", "Arraste pra cima", "Toque aqui"
IMPORTANTE: isto NÃƒO proÃ­be o BOTÃƒO DE CTA da marca${copy.cta && isCopyFieldActive("cta") ? ` (com o texto "${copy.cta}")` : ""}. O botÃ£o de CTA descrito acima Ã‰ parte do design do criativo e DEVE aparecer. O que se proÃ­be Ã© imitar a UI nativa da Meta (Ã­cones de rede social, swipe, barra de stories), nÃ£o o botÃ£o da campanha.`);

  // PROIBIDO
  const forbidden: string[] = [
    "- NÃƒO altere o layout, composiÃ§Ã£o ou grid do template",
    "- NÃƒO mude as proporÃ§Ãµes dos elementos (se o headline ocupa 12% da altura, mantenha 12%)",
    "- NÃƒO adicione elementos visuais que nÃ£o existam no template original",
    "- NÃƒO mude o estilo tipogrÃ¡fico (se o template usa sans-serif bold uppercase, mantenha sans-serif bold uppercase)",
    "- NÃƒO invente textos â€” use APENAS a copy fornecida acima",
    '- NÃƒO mantenha textos originais do template ("Webinar Pro", "Saiba mais", nomes de produto, headers, botÃµes, labels) se eles nÃ£o estiverem na copy fornecida',
    "- NÃƒO adicione bordas, sombras ou efeitos que nÃ£o existam no template",
    // Quando o usuÃ¡rio pede variaÃ§Ã£o, o fundo PODE (e deve) mudar â€” entÃ£o esta
    // proibiÃ§Ã£o sÃ³ vale no modo normal. No modo composiÃ§Ã£o o fundo Ã© a foto prÃ³pria
    // (preservada pela regra do topo), entÃ£o esta proibiÃ§Ã£o baseada no template nÃ£o se aplica.
    ...(wantsVariation || hasCustomBackground ? [] : ["- NÃƒO altere o tipo de fundo (se Ã© gradiente, mantenha gradiente; se Ã© foto, mantenha foto)"]),
    '- Se o template for screenshot do Instagram, IGNORE a interface (faixa "Patrocinado", botÃµes, nomes de perfil) â€” recrie APENAS o conteÃºdo criativo',
    '- NUNCA reproduza a INTERFACE nativa do Facebook/Instagram/Meta que apareÃ§a no template: barra de progresso de stories, Ã­cones de curtir/comentar/compartilhar/salvar (clip/bookmark), avatar+@usuario+horÃ¡rio, faixa "Patrocinado/Sponsored", swipe up, Ã­cone de link/cursor/dedo. Esses elementos sÃ£o da plataforma â€” a arte final NÃƒO pode tÃª-los. (Isto NÃƒO inclui o botÃ£o de CTA da marca, que Ã© parte do design e deve ser desenhado quando a copy tiver CTA.)',
  ];
  if (hasExpertPhotos) {
    forbidden.push(
      "- NÃƒO cole, recorte nem reproduza a foto de referÃªncia da pessoa na arte final â€” ela serve sÃ³ como fonte de identidade facial",
      // No modo variaÃ§Ã£o, pose/roupa/fundo DEVEM variar (regra do topo). No modo
      // normal, mantÃ©m pose/cenÃ¡rio do template.
      wantsVariation
        ? `- Use a foto de referÃªncia APENAS para a identidade facial (o rosto Ã© sempre o mesmo). A pose, o enquadramento e o cenÃ¡rio/fundo DEVEM seguir a VARIAÃ‡ÃƒO OBRIGATÃ“RIA descrita no topo. ${wantsClothingVariation ? "A roupa tambÃ©m varia, mas sempre do MESMO TIPO de vestimenta do template." : "A ROUPA NÃƒO varia: mantenha o MESMO TIPO de vestimenta do template em todas as versÃµes."}`
        : "- NÃƒO reproduza a pose, a roupa, o fundo ou a iluminaÃ§Ã£o da foto de referÃªncia â€” use SEMPRE a pose e o cenÃ¡rio do template",
      "- NÃƒO deixe o resultado parecer uma colagem ou um sticker de foto sobre o template"
    );
    // Roupa: por padrÃ£o a IA mantÃ©m o tipo de vestimenta do template. ProÃ­be
    // explicitamente inventar roupa (caso "pessoa de camisa" que nÃ£o existia).
    if (!wantsClothingVariation) {
      forbidden.push("- NÃƒO invente uma roupa/vestimenta que nÃ£o esteja no template (ex.: nÃ£o ponha a pessoa 'de camisa' se o template nÃ£o tem camisa). A pessoa final usa o MESMO TIPO de peÃ§a que a pessoa do template.");
    }
  }
  lines.push(`PROIBIDO:\n${forbidden.join("\n")}`);

  // VALIDAÃ‡ÃƒO FINAL DE CORES â€” regra Ãºnica e rÃ­gida, lida por Ãºltimo (alta retenÃ§Ã£o).
  // Consolida o mapa univoco de cores num sÃ³ lugar e forÃ§a uma checagem antes de
  // finalizar. Resolve o conflito histÃ³rico de "JAMAIS use cor do template" vs
  // "use a cor X" espalhado em vÃ¡rios blocos: aqui fica a fonte Ãºnica de verdade.
  if (!hasCustomBackground) {
    lines.push(`VALIDAÃ‡ÃƒO FINAL DE CORES (LEIA POR ÃšLTIMO â€” REGRA ÃšNICA E DEFINITIVA):
A paleta da marca Ã© a ÃšNICA fonte de cor permitida: PrimÃ¡ria ${brand.colors.primary} | SecundÃ¡ria ${brand.colors.secondary} | Accent ${brand.colors.accent} | Fundo ${fundoCor}.
Mapa univoco (use SEMPRE este mapeamento, sem exceÃ§Ã£o):
- Onde o template usa cor ESCURA/principal â†’ use a PRIMÃRIA da marca (${brand.colors.primary}).
- Onde o template usa cor de DESTAQUE/CTA/badge â†’ use o ACCENT da marca (${brand.colors.accent}).
- Onde o template usa cor de FUNDO â†’ use ${fundoCor}.
- Onde o template usa cor SECUNDÃRIA/apoio â†’ use a SECUNDÃRIA da marca (${brand.colors.secondary}).
- Onde o template usa branco/cor clara neutra â†’ pode manter claro, desde que dentro da paleta.
ANTES DE FINALIZAR, confirme item a item: percorra TODA cor visÃ­vel na arte (fundo, textos, formas, gradientes, overlays, badges, botÃµes, Ã­cones, sombras coloridas, divisores) e verifique se cada uma pertence Ã  paleta da marca acima. Se SOBROU qualquer cor do template original que nÃ£o estÃ¡ na paleta, SUBSTITUA imediatamente pela cor correspondente do mapa univoco. Nenhuma cor fora da paleta da marca pode permanecer na arte final.`);
  }

  // FORMATO
  lines.push(`FORMATO: ${format.width}x${format.height}px`);

  // Refinamento do usuÃ¡rio via chat
  if (chatRefinement) {
    lines.push(`InstruÃ§Ãµes do usuÃ¡rio: ${chatRefinement}`);
  }

  // (A instruÃ§Ã£o de variaÃ§Ã£o foi movida para o TOPO do prompt â€” ver bloco
  // "VARIAÃ‡ÃƒO OBRIGATÃ“RIA" no inÃ­cio da funÃ§Ã£o, com alta prioridade.)

  return lines.join("\n\n");
}

/** Mapeia role da anÃ¡lise visual para campo da copy */
function mapRoleToCopyField(role: string): string | null {
  const map: Record<string, string> = {
    headline: "headline",
    subheadline: "subheadline",
    mini_copy: "subheadline",
    ponte: "ponte",
    list_items: "ponte",
    body: "ponte",
    cta: "cta",
    badge: "cta",
  };
  return map[role] || null;
}

interface CopyGenerationInput {
  personaSummary: string;
  elements: string[];
  direction: string;
  count: number;
}

interface ImageEditPromptInput {
  originalPrompt?: string | null;
  userInstruction: string;
  hasExpertPhotos: boolean;
  hasLogo?: boolean;
  templateReferenceCount: number;
  /** "preserve" = fotos mantÃªm identidade atual; "replace" = foto nova substitui rosto/identidade do criativo */
  expertPhotoMode?: "preserve" | "replace";
  /** Ajustes do expert do projeto (herda automaticamente no edit) */
  expertAdjustments?: ExpertAdjustmentsInput;
  /** Brand kit do projeto pra reforÃ§ar cores/fontes na ediÃ§Ã£o */
  brand?: {
    colors: BrandColors;
    fonts: BrandFonts;
  };
  /** 4 campos canÃ´nicos de copy pra substituir nos textos do criativo (opcional). */
  copy?: CopyContent;
  /**
   * DescriÃ§Ã£o do contexto/tema do anÃºncio (ex: "Plenna, evento pra psicÃ³logas").
   * Quando presente, o prompt instrui trocar imagens que NÃƒO batem com este
   * contexto (ex: foto de cavalo num anÃºncio de psicologia) por algo coerente.
   */
  contextHint?: string;
}

/**
 * Monta o prompt para editar um criativo jÃ¡ gerado.
 * Usa a imagem atual como base principal e o template como rÃ©gua visual.
 */
export function buildImageEditPrompt(input: ImageEditPromptInput): string {
  const {
    originalPrompt,
    userInstruction,
    hasExpertPhotos,
    hasLogo = false,
    templateReferenceCount,
    expertPhotoMode = "preserve",
    expertAdjustments,
    brand,
    copy,
    contextHint,
  } = input;

  const lines: string[] = [
    `TAREFA: editar a imagem 1 (criativo atual). VocÃª DEVE aplicar de fato a mudanÃ§a pedida â€” o resultado tem que ficar VISIVELMENTE diferente da imagem original no ponto editado. NÃƒO devolva a imagem igual.

MUDANÃ‡A A APLICAR (prioridade mÃ¡xima, Ã© o objetivo da ediÃ§Ã£o):
${userInstruction || "(ver substituiÃ§Ãµes de texto/imagem especificadas abaixo)"}

Regra de ouro: aplique a mudanÃ§a acima com convicÃ§Ã£o. Tudo o que a instruÃ§Ã£o NÃƒO mencionou deve permanecer igual (mesma composiÃ§Ã£o, posiÃ§Ãµes e estilo dos elementos nÃ£o citados). Mas o elemento citado na instruÃ§Ã£o TEM que mudar de verdade.`,
  ];

  // Mapa de imagens anexadas
  const refMap: string[] = [];
  refMap.push("- Imagem 1: criativo ATUAL (base que vai ser editada).");
  let pos = 2;
  if (templateReferenceCount === 1) {
    refMap.push(`- Imagem ${pos}: template original â€” referÃªncia de layout/tipografia/proporÃ§Ãµes.`);
    pos += 1;
  } else if (templateReferenceCount > 1) {
    refMap.push(`- Imagens ${pos}-${pos + templateReferenceCount - 1}: templates de referÃªncia.`);
    pos += templateReferenceCount;
  }
  if (hasExpertPhotos) {
    if (expertPhotoMode === "replace") {
      refMap.push(`- Imagem ${pos}${pos !== pos ? "" : ""}: NOVA IDENTIDADE do expert (foto enviada nesta ediÃ§Ã£o). USE como fonte de rosto/traÃ§os/pele/cabelo para SUBSTITUIR a identidade da pessoa do criativo atual.`);
    } else {
      refMap.push(`- Imagem ${pos}: foto real do expert do projeto â€” fonte de identidade facial OFICIAL. Se houver pessoa na arte, ela deve ter o ROSTO desta foto, nÃ£o o rosto que estÃ¡ no criativo atual.`);
    }
    pos += 1;
  }
  if (hasLogo) {
    refMap.push(`- Imagem ${pos}: LOGO OFICIAL da marca configurada no projeto. Este Ã© o ÃšNICO logo permitido na arte final. Qualquer logo/marca/selo que apareÃ§a no criativo atual e que NÃƒO seja este logo DEVE ser removido e substituÃ­do por este. Mantenha a mesma posiÃ§Ã£o e tamanho relativo do logo atual.`);
    pos += 1;
  }
  lines.push(`MAPA DE IMAGENS ANEXADAS:\n${refMap.join("\n")}`);

  // Comportamento das fotos do expert
  if (hasExpertPhotos) {
    if (expertPhotoMode === "replace") {
      lines.push(`COMPORTAMENTO DAS FOTOS DO EXPERT (modo SUBSTITUIR):\nSUBSTITUA INTEGRALMENTE o rosto, traÃ§os faciais, pele, cabelo e (se visÃ­vel) acessÃ³rios faciais da pessoa do criativo pelos da pessoa anexada. Mantenha pose/enquadramento/iluminaÃ§Ã£o/cenÃ¡rio/roupa do criativo atual. Se a foto NÃƒO mostra Ã³culos, REMOVA Ã³culos. Se NÃƒO mostra gravata, REMOVA gravata. Se NÃƒO mostra barba, REMOVA barba. NÃƒO invente acessÃ³rios que a pessoa nÃ£o tem.`);
    } else {
      lines.push(`COMPORTAMENTO DAS FOTOS DO EXPERT:\nA pessoa visÃ­vel no criativo final DEVE ser a pessoa da foto anexada do expert do projeto â€” rosto, traÃ§os, pele, cabelo. Se a pessoa atualmente no criativo for visivelmente diferente, SUBSTITUA pela identidade da foto. Mantenha pose/enquadramento/cenÃ¡rio/roupa do criativo atual.`);
    }
  }

  // Branding obrigatÃ³rio
  if (brand) {
    const fundoCor = brand.colors.background || brand.colors.primary;
    const colorParts = [`PrimÃ¡ria: ${brand.colors.primary}`, `SecundÃ¡ria: ${brand.colors.secondary}`, `Accent: ${brand.colors.accent}`];
    colorParts.push(`Fundo: ${fundoCor}`);
    lines.push(`BRANDING OBRIGATÃ“RIO DA MARCA DO PROJETO:
Paleta autorizada: ${colorParts.join(" | ")}
Tipografia: tÃ­tulos em ${brand.fonts.heading.family} (${brand.fonts.heading.weight}), corpo em ${brand.fonts.body.family} (${brand.fonts.body.weight}).
COR DE FUNDO DA ARTE: use ${fundoCor} como cor base do fundo. JAMAIS use preto, azul, cinza ou qualquer cor do template original no fundo, a nÃ£o ser que essa cor esteja na paleta da marca.
Toda cor visÃ­vel na arte final (fundo, formas, textos, gradientes, overlays, badges, Ã­cones decorativos) DEVE estar dentro desta paleta. Se o criativo atual usa cores fora desta paleta, AJUSTE-AS para a paleta da marca durante a ediÃ§Ã£o. Toda fonte de texto DEVE ser da tipografia da marca.${hasLogo ? "\nO logo da marca Ã© a imagem anexada â€” substitua qualquer outro logo/sÃ­mbolo de empresa que apareÃ§a no criativo atual por este logo oficial." : ""}`);
  }

  // SubstituiÃ§Ã£o estruturada de texto pelos 4 campos canÃ´nicos
  if (copy && (copy.headline || copy.subheadline || copy.ponte || copy.cta)) {
    const repl: string[] = [];
    if (copy.headline) repl.push(`â€¢ HEADLINE (texto principal/maior do criativo) â†’ troque por: "${copy.headline}"`);
    if (copy.subheadline || copy.mini_copy) repl.push(`â€¢ SUBHEADLINE (texto de apoio, menor que a headline) â†’ troque por: "${copy.subheadline || copy.mini_copy}"`);
    if (copy.ponte || copy.list_items) repl.push(`â€¢ PONTE (corpo que conecta a ideia ao CTA) â†’ troque por: "${copy.ponte || copy.list_items}"`);
    lines.push(`SUBSTITUIÃ‡ÃƒO DE TEXTOS (mapeie cada bloco de texto do criativo atual ao campo correspondente e troque o conteÃºdo, mantendo posiÃ§Ã£o/estilo/proporÃ§Ã£o de cada um):
${repl.join("\n")}
Os textos acima DEVEM aparecer na arte final. Remova qualquer texto antigo que nÃ£o corresponda a esses campos. Preserve toda a acentuaÃ§Ã£o do portuguÃªs.`);
    if (copy.cta) {
      lines.push(buildCtaButtonRule(copy.cta, brand?.colors.accent ?? "#000000"));
    }
  }

  // Troca de imagem que nÃ£o bate com o contexto (ex: cavalo num anÃºncio de psicologia)
  if (contextHint) {
    lines.push(`COERÃŠNCIA DE IMAGEM COM O CONTEXTO:
O contexto deste anÃºncio Ã©: ${contextHint}.
Se o criativo atual contiver fotos, ilustraÃ§Ãµes ou elementos visuais que NÃƒO fazem sentido para este contexto (ex: um animal, objeto ou cena genÃ©rica de banco de imagens sem relaÃ§Ã£o com o tema), SUBSTITUA por uma imagem coerente com o contexto acima. Mantenha o mesmo enquadramento, posiÃ§Ã£o e proporÃ§Ã£o do elemento original â€” troque apenas o CONTEÃšDO da imagem, nÃ£o o lugar dela na composiÃ§Ã£o.`);
  }

  lines.push(`INSTRUÃ‡ÃƒO DE EDIÃ‡ÃƒO DO USUÃRIO (PRIORITÃRIA):
${userInstruction || "(sem instruÃ§Ã£o livre â€” aplicar as substituiÃ§Ãµes de texto/imagem acima)"}`);

  const adjustmentsBlock = buildExpertAdjustmentsBlock(expertAdjustments);
  if (adjustmentsBlock) {
    lines.push(adjustmentsBlock);
  }

  // NOTA: o prompt original do criativo NÃƒO Ã© reinjetado aqui de propÃ³sito.
  // Ele Ã© cheio de "preserve o template / mantenha tudo", o que faz o modelo
  // ignorar a ediÃ§Ã£o e devolver a imagem igual. A imagem 1 (atual) jÃ¡ Ã© a
  // referÃªncia visual suficiente para a ediÃ§Ã£o.
  void originalPrompt;

  const obligatoryRules: string[] = [
    "- A MUDANÃ‡A pedida na instruÃ§Ã£o tem prioridade sobre qualquer regra de preservaÃ§Ã£o. Aplique-a de verdade.",
    "- Preserve a estrutura/enquadramento/tipografia APENAS dos elementos que a instruÃ§Ã£o NÃƒO mandou mudar",
    "- NÃ£o invente novos textos, logos, marcas ou selos alÃ©m dos especificados (o botÃ£o de CTA da marca, quando pedido, Ã© permitido)",
    "- Remova qualquer texto residual antigo que nÃ£o faÃ§a parte da ediÃ§Ã£o pedida",
    "- FaÃ§a apenas as mudanÃ§as pedidas; todo o resto deve permanecer consistente",
  ];
  if (hasExpertPhotos && expertPhotoMode === "preserve") {
    obligatoryRules.push("- Se houver pessoa na arte, preserve a identidade da pessoa das fotos anexadas");
  }
  lines.push(`REGRAS OBRIGATÃ“RIAS:\n${obligatoryRules.join("\n")}`);

  lines.push(`PROIBIDO:
- NÃ£o redesenhar o layout do zero
- NÃ£o trocar fontes por estilos diferentes
- NÃ£o mudar a posiÃ§Ã£o dos blocos sem necessidade
- NÃ£o adicionar elementos novos que nÃ£o existiam
- NÃ£o manter nomes de produto, CTA ou logos antigos se a instruÃ§Ã£o pedir remoÃ§Ã£o
- NUNCA desenhar CTAs nativos da Meta/Facebook/Instagram: botÃµes "Saiba mais", "Quero saber mais", "Cadastre-se", "Compre agora", "Baixar", clip/bookmark de salvar, Ã­cones de like/comentar/compartilhar, barra de stories, faixa "Patrocinado". A plataforma adiciona isso automaticamente â€” duplicar na arte vira ruÃ­do visual e a Meta penaliza.`);

  return lines.join("\n\n");
}

/**
 * Monta o prompt para geraÃ§Ã£o de copies via IA.
 * Persona Ã© usada AQUI (na geraÃ§Ã£o de copy), nÃ£o na geraÃ§Ã£o de imagem.
 */
export function buildCopyPrompt(input: CopyGenerationInput): string {
  const { personaSummary, elements, direction, count } = input;

  return `VocÃª Ã© um copywriter especialista em anÃºncios para redes sociais.

PERSONA/PÃšBLICO-ALVO:
${personaSummary}

ELEMENTOS NECESSÃRIOS:
${elements.map((e) => `- ${e}`).join("\n")}

DIREÃ‡ÃƒO/TEMA:
${direction}

TAREFA:
Gere ${count} versÃµes diferentes de copy para um criativo.
Cada versÃ£o deve conter os elementos listados acima.

REGRAS:
- Textos curtos e impactantes
- Adaptados para o pÃºblico-alvo descrito
- Cada versÃ£o com abordagem/Ã¢ngulo diferente
- Formato: retorne um JSON array com objetos contendo os campos: ${elements.join(", ")}

Retorne APENAS o JSON, sem markdown ou explicaÃ§Ãµes.`;
}

interface TemplateAwareCopyInput {
  personaSummary: string;
  productName: string;
  salesArguments: string;
  templates: {
    name: string;
    category: string;
    copyElements: { type: string; text_found: string; position?: string }[];
  }[];
  count: number;
}

/**
 * Monta o prompt para geraÃ§Ã£o de copies baseadas em templates.
 * Analisa os copy_elements de cada template para gerar copies
 * que encaixem na estrutura do template.
 */
export function buildTemplateAwareCopyPrompt(input: TemplateAwareCopyInput): string {
  const { personaSummary, productName, salesArguments, templates, count } = input;

  // Extrair todos os tipos de elementos unicos dos templates
  const elementTypes = new Map<string, string[]>();
  for (const tmpl of templates) {
    for (const el of tmpl.copyElements) {
      if (!elementTypes.has(el.type)) {
        elementTypes.set(el.type, []);
      }
      elementTypes.get(el.type)!.push(el.text_found);
    }
  }

  const templateDescriptions = templates.map((t) => {
    const elements = t.copyElements
      .map((el) => `  - ${el.type}: "${el.text_found}"${el.position ? ` (posiÃ§Ã£o: ${el.position})` : ""}`)
      .join("\n");
    return `Template "${t.name}" (${t.category}):\n${elements}`;
  }).join("\n\n");

  const allFields = Array.from(elementTypes.keys());

  return `VocÃª Ã© um copywriter especialista em anÃºncios para redes sociais.

PERSONA/PÃšBLICO-ALVO:
${personaSummary}

PRODUTO/SERVIÃ‡O:
${productName}

ARGUMENTOS DE VENDA E DIFERENCIAIS:
${salesArguments}

TEMPLATES SELECIONADOS (anÃ¡lise dos elementos de copy):
${templateDescriptions}

CAMPOS QUE CADA COPY DEVE CONTER:
${allFields.map((f) => {
  const examples = elementTypes.get(f)!;
  return `- ${f} (exemplos dos templates: "${examples.slice(0, 2).join('", "')}")`;
}).join("\n")}

TAREFA:
Gere ${count} versÃµes diferentes de copy para criativos baseados nos templates acima.
Cada versÃ£o deve conter TODOS os campos listados: ${allFields.join(", ")}.

REGRAS:
- Os textos devem ENCAIXAR na estrutura dos templates (respeitar tipo e tamanho dos elementos)
- headline: mÃ¡ximo 8-12 palavras, impactante e direto
- mini_copy: 1-2 frases curtas de apoio
- list_items: lista de tÃ³picos/benefÃ­cios
- cta: chamada para aÃ§Ã£o clara e urgente (2-5 palavras)
- Outros campos: adaptar ao contexto do template
- Usar os argumentos de venda fornecidos como base
- Adaptados para o pÃºblico-alvo descrito
- Cada versÃ£o com abordagem/Ã¢ngulo diferente
- Formato: retorne um JSON array com objetos contendo os campos: ${allFields.join(", ")}

Retorne APENAS o JSON, sem markdown ou explicaÃ§Ãµes.`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EP-13 â€” Modo Lote por Briefing (geraÃ§Ã£o SEM template)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface BriefingPromptInput {
  /** DireÃ§Ã£o visual do item â€” espinha dorsal do prompt. */
  visualDirection: string;
  /** Textos que devem aparecer na arte (exatamente). 4 campos canÃ´nicos. */
  headline?: string;
  subheadline?: string;
  /** Ponte / chamada â€” corpo que conecta. */
  ponte?: string;
  /** CTA â€” vira botÃ£o desenhado quando preenchido. */
  cta?: string;
  /** RestriÃ§Ã£o de marca. */
  brand: { colors: BrandColors; fonts: BrandFonts };
  format: { width: number; height: number };
  hasLogo: boolean;
  /**
   * InstruÃ§Ã£o do usuÃ¡rio sobre o que fazer com a(s) imagem(ns) de referÃªncia
   * anexada(s) ao criativo (rodÃ­zio). Quando presente, uma imagem real Ã©
   * enviada junto ao modelo e este texto diz como aplicÃ¡-la.
   */
  imageInstruction?: string;
}

/**
 * Bloco "IMAGEM DE REFERÃŠNCIA ANEXADA" â€” anexado a QUALQUER prompt do briefing
 * (gerado ou pronto) quando hÃ¡ imagens de referÃªncia no lote. Cada criativo
 * recebe UMA imagem do rodÃ­zio; este texto diz ao modelo como usÃ¡-la.
 */
export function buildBriefingImageReferenceRule(instruction?: string): string {
  const instr = (instruction || "").trim();
  const intro = instr
    ? `IMAGEM DE REFERÃŠNCIA ANEXADA: ${instr}`
    : "IMAGEM DE REFERÃŠNCIA ANEXADA: use a imagem anexada como referÃªncia principal da composiÃ§Ã£o.";
  return `${intro}
Uma imagem de referÃªncia foi anexada a este criativo. Aplique-a conforme a instruÃ§Ã£o acima. Se a instruÃ§Ã£o pedir para preservar a imagem como fundo/cena real, mantenha-a como estÃ¡ e componha apenas o texto e os elementos de marca por cima, sem recriar ou substituir a cena. Se a instruÃ§Ã£o pedir referÃªncia de estilo/cores, use-a como guia visual sem copiar literalmente. Respeite sempre as regras de marca (cores, tipografia, logo) definidas abaixo.`;
}

/**
 * Monta o prompt do Nano Banana a partir de um item do briefing, SEM template.
 * Diferente de `buildPrompt`: aqui nÃ£o hÃ¡ blueprint de template â€” a direÃ§Ã£o
 * visual descreve o conceito inteiro. O brand kit entra como restriÃ§Ã£o (cores,
 * tipografia, logo) e os textos do item sÃ£o o que aparece na arte.
 *
 * Reaproveita as regras canÃ´nicas de `buildPrompt`: cores da marca (REGRA #2)
 * e zero CTA nativo Meta (REGRA #6), adaptadas ao contexto sem-template.
 */
export function buildPromptFromBriefingItem(input: BriefingPromptInput): string {
  const { visualDirection, headline, subheadline, ponte, cta, brand, format, hasLogo, imageInstruction } = input;
  // PresenÃ§a da imagem Ã© sinalizada por imageInstruction !== undefined (string,
  // mesmo vazia). O texto pode estar vazio (o builder usa o fallback padrÃ£o).
  const hasRefImage = typeof imageInstruction === "string";
  const lines: string[] = [];

  lines.push(
    hasRefImage
      ? `Crie uma arte publicitÃ¡ria de ${format.width}x${format.height}px (proporÃ§Ã£o ${format.width}:${format.height}) para anÃºncio/rede social, a partir do conceito visual descrito abaixo e da imagem de referÃªncia anexada, seguindo as regras de marca.`
      : `Crie uma arte publicitÃ¡ria de ${format.width}x${format.height}px (proporÃ§Ã£o ${format.width}:${format.height}) para anÃºncio/rede social, a partir do conceito visual descrito abaixo. VocÃª compÃµe a arte inteira do zero, guiado apenas por esta direÃ§Ã£o visual e pelas regras de marca â€” nÃ£o hÃ¡ imagem de referÃªncia a copiar.`,
  );

  // IMAGEM DE REFERÃŠNCIA ANEXADA (rodÃ­zio) â€” alta prioridade, logo apÃ³s a abertura.
  if (hasRefImage) {
    lines.push(buildBriefingImageReferenceRule(imageInstruction));
  }

  // CONCEITO VISUAL â€” espinha dorsal
  lines.push(`CONCEITO VISUAL (siga fielmente):
${visualDirection}`);

  // TEXTOS que aparecem na arte â€” 4 campos canÃ´nicos (CTA Ã© botÃ£o, tratado Ã  parte)
  const textParts: string[] = [];
  if (headline) textParts.push(`- Headline (destaque principal, maior): "${headline}"`);
  if (subheadline) textParts.push(`- Subheadline (apoio, menor que a headline): "${subheadline}"`);
  if (ponte) textParts.push(`- Ponte (corpo que conecta a ideia ao CTA): "${ponte}"`);
  if (textParts.length > 0) {
    lines.push(`TEXTOS NA ARTE â€” escreva EXATAMENTE estes textos, com a hierarquia indicada, sem alterar nem inventar outros:
${textParts.join("\n")}
Preserve toda a acentuaÃ§Ã£o do portuguÃªs. NÃ£o adicione textos decorativos, hashtags, @arrobas, URLs ou selos que nÃ£o estejam listados acima${cta ? " (o botÃ£o de CTA Ã© descrito abaixo)" : ""}.`);
  } else if (!cta) {
    lines.push(`TEXTOS NA ARTE: o conceito visual acima nÃ£o especifica textos obrigatÃ³rios. NÃ£o invente headlines ou frases â€” mantenha a arte limpa de texto, a menos que o conceito visual peÃ§a explicitamente algum rÃ³tulo.`);
  }

  // CTA vira botÃ£o desenhado
  if (cta) {
    lines.push(buildCtaButtonRule(cta, brand.colors.accent));
  }

  // REGRA #2 â€” cores da marca (adaptada: nÃ£o hÃ¡ "cores do template", a direÃ§Ã£o visual pode citar cor conceitualmente)
  const fundoCor = brand.colors.background || brand.colors.primary;
  const colorParts = [
    `PrimÃ¡ria: ${brand.colors.primary}`,
    `SecundÃ¡ria: ${brand.colors.secondary}`,
    `Accent: ${brand.colors.accent}`,
  ];
  colorParts.push(`Fundo: ${fundoCor}`);
  lines.push(`REGRA #2 â€” CORES DA MARCA SÃƒO OBRIGATÃ“RIAS (NÃƒO Ã‰ OPCIONAL):
Toda a paleta visÃ­vel na arte final (fundo, textos, formas, gradientes, overlays, destaques, badges) DEVE estar dentro da paleta da marca abaixo. Se a direÃ§Ã£o visual mencionar uma cor de forma conceitual (ex.: "vermelho de alerta", "verde de aprovaÃ§Ã£o"), trate como intenÃ§Ã£o semÃ¢ntica e materialize com a cor mais prÃ³xima DENTRO da paleta da marca â€” nunca use cores fora dela.
Paleta da marca: ${colorParts.join(" | ")}
COR DE FUNDO DA ARTE: use ${fundoCor} como cor base do fundo. JAMAIS use preto, azul, cinza ou qualquer cor do template original no fundo, a nÃ£o ser que essa cor esteja na paleta da marca.
Tipografia: tÃ­tulos em ${brand.fonts.heading.family} (${brand.fonts.heading.weight}), corpo em ${brand.fonts.body.family} (${brand.fonts.body.weight}).`);

  // LOGO
  if (hasLogo) {
    lines.push(`LOGO: a imagem de logo da marca foi anexada. Posicione-a de forma discreta e profissional (canto superior ou inferior), sem distorcer proporÃ§Ãµes e sem competir com o conceito visual principal.`);
  } else {
    lines.push(`LOGO: nÃ£o hÃ¡ logo a aplicar. NÃƒO invente nome de marca, selo ou assinatura visual na arte.`);
  }

  // REGRA #6 â€” nÃ£o imitar a interface da Meta (o botÃ£o de CTA da marca Ã‰ permitido)
  lines.push(`REGRA #6 â€” NÃƒO IMITAR A INTERFACE DA META (CRÃTICO):
A arte NÃƒO pode conter elementos que imitem a INTERFACE do Facebook/Instagram/Meta:
- Ãcone de link/cursor/seta/dedo simulando clique
- Barra de progresso de stories, avatar circular + @usuario, faixa "Patrocinado"
- Ãcones de curtir/comentar/compartilhar/salvar
- "Swipe up"/"Arraste pra cima"/"Toque aqui"
Isto NÃƒO proÃ­be o botÃ£o de CTA da marca${cta ? ` (com o texto "${cta}")` : ""}, que Ã© parte do design e deve ser desenhado. O que se proÃ­be Ã© imitar a UI nativa da Meta (Ã­cones de rede social, swipe, barra de stories).`);

  lines.push(`QUALIDADE: arte profissional, alto contraste de leitura, hierarquia tipogrÃ¡fica clara, composiÃ§Ã£o equilibrada para o formato ${format.width}x${format.height}.`);

  return lines.join("\n\n");
}

