"use client";


import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";

export interface CopyItem {
  id: string;
  content: Record<string, string>;
  source: "manual" | "ai" | "library";
  libraryId?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LoadedCreative {
  id: string;
  status: string;
  file_path: string | null;
  signed_url: string | null;
  error_message: string | null;
}

export interface CreatorState {
  currentStep: number;
  projectId: string | null;
  projectName: string;
  orgId: string;
  personaId: string | null;
  personaName: string | null;
  selectedTemplates: SelectedTemplate[];
  format: { width: number; height: number; label: string };
  selectedFormats: { width: number; height: number; label: string }[];
  copies: CopyItem[];
  selectedPhotos: SelectedPhoto[];
  brandKitId: string | null;
  brandKitName: string | null;
  showLogo: boolean;
  logoId: string | null;
  logoUrl: string | null;
  chatHistory: ChatMessage[];
  selectedCreativeIds: string[];
  loadedCreatives: LoadedCreative[];
  sourceProjectId: string | null;
  preferredModel: string | null;
  expertAdjustments: ExpertAdjustments;
  /** Variar fundo/cenÃ¡rio/pose entre os criativos (mantendo rosto, layout, cores, copy). */
  variationEnabled: boolean;
  /** Variar a ROUPA/vestimenta entre os criativos. Por padrÃ£o a roupa do template Ã© mantida. */
  varyClothing: boolean;
  /** BLOCO C â€” usar foto de fundo prÃ³pria (modo composiÃ§Ã£o). */
  useCustomBackground: boolean;
  /**
   * BLOCO C â€” layout do fundo prÃ³prio: "full" (foto ocupa a tela inteira, texto por cima)
   * ou "split-top" (foto no topo, bloco de cor da marca embaixo com o texto).
   * SÃ³ tem efeito quando useCustomBackground === true.
   */
  backgroundMode: BackgroundMode;
  /** BLOCO C â€” fotos de fundo do projeto (rodÃ­zio por criativo). Dedupe por id. */
  selectedBackgrounds: SelectedBackground[];
  /**
   * BLOCO C â€” cores do bloco no layout split-top (hex do brand kit). Com mais de
   * uma, a cor varia entre os criativos (rodÃ­zio). Vazio = IA escolhe a melhor
   * cor da paleta. SÃ³ tem efeito quando useCustomBackground === true e backgroundMode === "split-top".
   */
  blockColors: string[];
  /**
   * BLOCO A â€” padrÃ£o de copy do projeto: "estatico" (headline/subheadline/ponte/cta)
   * ou "mini_copy" (headline/mini_copy/list_items/cta).
   */
  copyPattern: CopyPattern;
  /**
   * BLOCO B â€” campos de copy ativos no projeto (checkboxes). Lista de keys do
   * padrÃ£o ativo. Default = todos os campos do padrÃ£o.
   */
  activeCopyFields: string[];
}

export type CopyPattern = "estatico" | "mini_copy";

export type BackgroundMode = "full" | "split-top" | "split-bottom";

/** Normaliza o valor de backgroundMode vindo do banco/request para um valor vÃ¡lido. */
export function normalizeBackgroundMode(v: unknown): BackgroundMode {
  return v === "split-top" || v === "split-bottom" ? v : "full";
}

/** Campos de cada padrÃ£o de copy (o primeiro de ambos Ã© sempre "headline"). */
export const COPY_PATTERN_FIELDS: Record<CopyPattern, { key: string; label: string }[]> = {
  estatico: [
    { key: "headline", label: "Headline" },
    { key: "subheadline", label: "Subheadline" },
    { key: "ponte", label: "Ponte" },
    { key: "cta", label: "CTA" },
  ],
  mini_copy: [
    { key: "headline", label: "Headline" },
    { key: "mini_copy", label: "Mini copy" },
    { key: "list_items", label: "List items" },
    { key: "cta", label: "CTA" },
  ],
};

export function defaultActiveFields(pattern: CopyPattern): string[] {
  return COPY_PATTERN_FIELDS[pattern].map((f) => f.key);
}

export interface ExpertAdjustments {
  presets: string[];
  notes: string;
}

export interface SelectedTemplate {
  id: string;
  name: string;
  category: string;
  thumbnailUrl: string | null;
  copyElements: CopyElement[] | null;
}

export interface CopyElement {
  key: string;
  label: string;
  type: string;
}

export interface SelectedPhoto {
  id: string;
  url: string;
  label: string;
}

export interface SelectedBackground {
  id: string;
  url: string;
  label: string;
  /** Caminho no storage (bucket de backgrounds) â€” usado pela geraÃ§Ã£o pra baixar a foto. */
  filePath: string;
}

function dedupeSelectedTemplates(templates: SelectedTemplate[]): SelectedTemplate[] {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (!template?.id || seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
}

/** Dedupe de backgrounds por id (espelha o tratamento de fotos do expert). */
function dedupeSelectedBackgrounds(backgrounds: SelectedBackground[]): SelectedBackground[] {
  const seen = new Set<string>();
  return (backgrounds ?? []).filter((bg) => {
    if (!bg?.id || seen.has(bg.id)) return false;
    seen.add(bg.id);
    return true;
  });
}

interface CreatorContextValue extends CreatorState {
  setStep: (step: number) => void;
  updateProject: (updates: Partial<CreatorState>) => void;
  reset: () => void;
  loadFromProject: (projectId: string) => Promise<boolean>;
  saveProgressToDb: () => Promise<void>;
  draftLoading: boolean;
}

const defaultFormat = { width: 1080, height: 1350, label: "Feed (1080x1350)" };
const GENERATE_STEP = 3;

function createInitialState(orgId: string): CreatorState {
  return {
    currentStep: 0,
    projectId: null,
    projectName: "",
    orgId,
    personaId: null,
    personaName: null,
    selectedTemplates: [],
    format: defaultFormat,
    selectedFormats: [],
    copies: [],
    selectedPhotos: [],
    brandKitId: null,
    brandKitName: null,
    showLogo: false,
    logoId: null,
    logoUrl: null,
    chatHistory: [],
    selectedCreativeIds: [],
    loadedCreatives: [],
    sourceProjectId: null,
    preferredModel: null,
    expertAdjustments: { presets: [], notes: "" },
    variationEnabled: false,
    varyClothing: false,
    useCustomBackground: false,
    backgroundMode: "full",
    selectedBackgrounds: [],
    blockColors: [],
    copyPattern: "estatico",
    activeCopyFields: defaultActiveFields("estatico"),
  };
}

/** Sanitiza estado carregado do banco â€” protege contra dados corrompidos (font objects etc).
 *  Usado APENAS nos boundaries de load (loadDraft, loadFromProject), nunca em updateProject. */
function sanitizeLoadedState(state: CreatorState): CreatorState {
  const s = { ...state };
  // Garantir format vÃ¡lido
  const rawFormat: Record<string, unknown> = s.format && typeof s.format === "object" ? s.format : {};
  const fw = typeof rawFormat.width === "number" ? rawFormat.width : 1080;
  const fh = typeof rawFormat.height === "number" ? rawFormat.height : 1350;
  s.format = {
    width: fw,
    height: fh,
    label: typeof rawFormat.label === "string" ? rawFormat.label : `${fw}x${fh}`,
  };
  if (Array.isArray(s.selectedFormats)) {
    s.selectedFormats = s.selectedFormats.map((f) => {
      const w = typeof f.width === "number" ? f.width : 1080;
      const h = typeof f.height === "number" ? f.height : 1350;
      return { width: w, height: h, label: typeof f.label === "string" ? f.label : `${w}x${h}` };
    });
  }
  // Garantir string fields (podem vir como {family, weight} do banco)
  if (typeof s.personaName !== "string") s.personaName = s.personaName ? String(s.personaName) : null;
  if (typeof s.brandKitName !== "string") s.brandKitName = s.brandKitName ? String(s.brandKitName) : null;
  if (typeof s.projectName !== "string") s.projectName = s.projectName ? String(s.projectName) : "";
  // Sanitizar copies content â€” garantir que valores sÃ£o strings
  if (Array.isArray(s.copies)) {
    s.copies = s.copies.map((c) => ({
      ...c,
      content: Object.fromEntries(
        Object.entries(c.content || {}).map(([k, v]) => [
          k,
          typeof v === "object" && v !== null ? (typeof (v as Record<string, unknown>).family === "string" ? (v as Record<string, unknown>).family as string : JSON.stringify(v)) : String(v ?? ""),
        ])
      ),
    }));
  }
  if (Array.isArray(s.selectedTemplates)) {
    s.selectedTemplates = dedupeSelectedTemplates(s.selectedTemplates);
  }
  if (Array.isArray(s.selectedBackgrounds)) {
    s.selectedBackgrounds = dedupeSelectedBackgrounds(s.selectedBackgrounds);
  } else {
    s.selectedBackgrounds = [];
  }
  if (typeof s.useCustomBackground !== "boolean") s.useCustomBackground = false;
  s.backgroundMode = normalizeBackgroundMode(s.backgroundMode);
  s.blockColors = Array.isArray(s.blockColors)
    ? s.blockColors.filter((c): c is string => typeof c === "string")
    : [];
  return s;
}

const CreatorContext = createContext<CreatorContextValue | null>(null);

export function CreatorProvider({
  orgId,
  children,
  startFresh = false,
  skipDraftLoad = false,
}: {
  orgId: string;
  children: ReactNode;
  startFresh?: boolean;
  skipDraftLoad?: boolean;
}) {
  const [state, setState] = useState<CreatorState>(() => createInitialState(orgId));
  const [draftLoading, setDraftLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Carregar draft do banco na montagem
  useEffect(() => {
    async function loadDraft() {
      if (startFresh) {
        fetch("/api/creator-draft", { method: "DELETE" }).catch(() => {});
        setState(createInitialState(orgId));
        setDraftLoading(false);
        initialized.current = true;
        return;
      }

      if (skipDraftLoad) {
        setDraftLoading(false);
        initialized.current = true;
        return;
      }

      try {
        const res = await fetch("/api/creator-draft");
        if (res.ok) {
          const { draft } = await res.json();
          if (draft && draft.orgId === orgId) {
            // Detectar corrupÃ§Ã£o â€” deletar e comeÃ§ar do zero
            const raw = JSON.stringify(draft);
            const isCorrupted = raw.includes('"family"') && raw.includes('"weight"');
            if (isCorrupted) {
              console.warn("[Creator] Draft corrompido detectado â€” limpando do banco");
              fetch("/api/creator-draft", { method: "DELETE" }).catch(() => {});
            }
            // Sempre sanitizar ao carregar do banco
            setState(sanitizeLoadedState(draft));
          }
        }
      } catch {
        // Falha silenciosa â€” comeÃ§a do zero
      } finally {
        setDraftLoading(false);
        initialized.current = true;
      }
    }
    loadDraft();
  }, [orgId, startFresh, skipDraftLoad]);

  // Salvar draft no banco com debounce (1s apÃ³s Ãºltima mudanÃ§a)
  useEffect(() => {
    if (!initialized.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/creator-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, orgId }),
      }).catch(() => {
        // Falha silenciosa
      });
    }, 1000);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, orgId]);

  // Salvar progresso no banco (projeto real, nÃ£o apenas draft)
  const saveProgressToDb = useCallback(async () => {
    const s = stateRef.current;
    try {
      const res = await fetch("/api/projects/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: s.projectId,
          projectName: s.projectName,
          personaId: s.personaId,
          brandKitId: s.brandKitId,
          format: s.format,
          selectedFormats: s.selectedFormats,
          showLogo: s.showLogo,
          selectedTemplates: s.selectedTemplates,
          copies: s.copies,
          selectedPhotos: s.selectedPhotos,
          chatHistory: s.chatHistory,
          currentStep: s.currentStep,
          preferredModel: s.preferredModel,
          expertAdjustments: s.expertAdjustments,
          variationEnabled: s.variationEnabled,
          varyClothing: s.varyClothing,
          useCustomBackground: s.useCustomBackground,
          backgroundMode: s.backgroundMode,
          selectedBackgrounds: s.selectedBackgrounds,
          blockColors: s.blockColors,
          copyPattern: s.copyPattern,
          activeCopyFields: s.activeCopyFields,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.projectId && !s.projectId) {
          setState((prev) => ({ ...prev, projectId: data.projectId }));
        }
      }
    } catch {
      // Falha silenciosa â€” draft system Ã© o backup
    }
  }, []);

  const setStep = useCallback((step: number) => {
    setState((prev) => {
      const next = { ...prev, currentStep: step };
      // Salvar no banco ao avanÃ§ar de step (apÃ³s step 0)
      if (step > 0 && step > prev.currentStep) {
        // Usar setTimeout para nÃ£o bloquear a navegaÃ§Ã£o
        setTimeout(() => saveProgressToDb(), 100);
      }
      return next;
    });
  }, [saveProgressToDb]);

  const updateProject = useCallback((updates: Partial<CreatorState>) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      // PERF: sÃ³ dedupar quando o patch TOCA o array relevante. Se o update nÃ£o
      // mexe em selectedTemplates/selectedBackgrounds, nÃ£o re-roda o dedupe (que
      // aloca Set + filtro a cada setState â€” caro com muitos itens).
      if ("selectedTemplates" in updates && Array.isArray(next.selectedTemplates)) {
        next.selectedTemplates = dedupeSelectedTemplates(next.selectedTemplates);
      }
      if ("selectedBackgrounds" in updates && Array.isArray(next.selectedBackgrounds)) {
        next.selectedBackgrounds = dedupeSelectedBackgrounds(next.selectedBackgrounds);
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setState(createInitialState(orgId));
    fetch("/api/creator-draft", { method: "DELETE" }).catch(() => {});
  }, [orgId]);

  const loadFromProject = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/config`);
      if (!res.ok) return false;

      const { project, templates, copies, photos, backgrounds, creatives: loadedCreativesData } = await res.json();

      const isIncomplete = project.status === "incomplete";
      const hasGeneratedOutput = (loadedCreativesData ?? []).length > 0;
      // Sempre abrir no step de gerar quando carregar via "?regenerate=" (mesmo se sem criativos / status incomplete).
      // CritÃ©rios pra abrir lÃ¡: jÃ¡ gerou, OU status sugere geraÃ§Ã£o, OU tem templates+copies+fotos prontos (caso "reabrir pra regerar").
      const hasReadyConfig =
        (templates ?? []).length > 0 &&
        (copies ?? []).length > 0;
      const shouldOpenGenerateStep =
        hasGeneratedOutput ||
        ["generating", "completed", "complete", "partial", "error"].includes(project.status ?? "") ||
        hasReadyConfig;
      const restoredCopies = (copies ?? []).map((c: { id: string; content: Record<string, string>; source: string }) => ({
        id: c.id,
        content: Object.fromEntries(
          Object.entries(c.content || {}).map(([k, v]) => [
            k,
            typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? ""),
          ])
        ),
        source: c.source as CopyItem["source"],
      }));

      const newState: CreatorState = {
        currentStep: shouldOpenGenerateStep ? GENERATE_STEP : (project.currentStep ?? 0),
        projectId,
        projectName: project.name ?? "",
        orgId,
        personaId: project.personaId ?? null,
        personaName: project.personaName ?? null,
        selectedTemplates: dedupeSelectedTemplates((templates ?? []).map((t: { id: string; name: string; category: string; thumbnailUrl: string | null; copyElements: CopyElement[] | null }) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          thumbnailUrl: t.thumbnailUrl,
          copyElements: t.copyElements,
        }))),
        format: {
          width: project.format?.width ?? 1080,
          height: project.format?.height ?? 1350,
          label: typeof project.format?.label === "string" ? project.format.label : "Feed (1080x1350)",
        },
        selectedFormats: project.selectedFormats ?? [project.format ?? defaultFormat],
        copies: restoredCopies,
        selectedPhotos: (photos ?? []).map((p: { id: string; url: string; label: string }) => ({
          id: p.id,
          url: p.url,
          label: p.label,
        })),
        brandKitId: project.brandKitId ?? null,
        brandKitName: project.brandKitName ?? null,
        showLogo: project.showLogo ?? false,
        logoId: null,
        logoUrl: null,
        chatHistory: project.chatHistory ?? [],
        selectedCreativeIds: restoredCopies.map((copy: { id: string }) => copy.id),
        loadedCreatives: (loadedCreativesData ?? []).map((c: { id: string; status: string; file_path: string | null; signed_url: string | null; error_message: string | null }) => ({
          id: c.id,
          status: c.status,
          file_path: c.file_path,
          signed_url: c.signed_url,
          error_message: c.error_message,
        })),
        sourceProjectId: isIncomplete ? null : projectId,
        preferredModel: project.preferredModel ?? null,
        expertAdjustments: {
          presets: Array.isArray(project.expertAdjustments?.presets) ? project.expertAdjustments.presets : [],
          notes: typeof project.expertAdjustments?.notes === "string" ? project.expertAdjustments.notes : "",
        },
        variationEnabled: project.variationEnabled === true,
        varyClothing: project.varyClothing === true,
        useCustomBackground: project.useCustomBackground === true,
        backgroundMode: normalizeBackgroundMode(project.backgroundMode),
        selectedBackgrounds: dedupeSelectedBackgrounds(
          (backgrounds ?? []).map((b: { id: string; url: string; label: string; filePath: string }) => ({
            id: b.id,
            url: b.url,
            label: b.label,
            filePath: b.filePath,
          }))
        ),
        blockColors: Array.isArray(project.blockColors)
          ? project.blockColors.filter((c: unknown): c is string => typeof c === "string")
          : [],
        copyPattern: project.copyPattern === "mini_copy" ? "mini_copy" : "estatico",
        activeCopyFields: Array.isArray(project.activeCopyFields) && project.activeCopyFields.length > 0
          ? project.activeCopyFields
          : defaultActiveFields(project.copyPattern === "mini_copy" ? "mini_copy" : "estatico"),
      };

      setState(sanitizeLoadedState(newState));
      return true;
    } catch {
      return false;
    }
  }, [orgId]);

  return (
    <CreatorContext.Provider value={{ ...state, setStep, updateProject, reset, loadFromProject, saveProgressToDb, draftLoading }}>
      {children}
    </CreatorContext.Provider>
  );
}

export function useCreator(): CreatorContextValue {
  const ctx = useContext(CreatorContext);
  if (!ctx) throw new Error("useCreator deve ser usado dentro de CreatorProvider");
  return ctx;
}

