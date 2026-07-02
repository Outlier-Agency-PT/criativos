"use client";


import { useState, useCallback, useRef, useEffect } from "react";
import { useCreator } from "./creator-context";
import { EditCreativeModal } from "./edit-creative-modal";
import { Portal } from "./portal";
import { cn } from "@/lib/utils";
import { getModelById, getDefaultModel } from "@/lib/models";

const USD_TO_EUR = 0.92;
import {
  LayoutTemplate,
  FileText,
  Camera,
  Sparkles,
  Loader2,
  Zap,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RotateCcw,
  Clock,
  Terminal,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  CheckSquare,
  Square,
  Edit2,
  Download,
  Archive,
} from "lucide-react";

const GENERATION_CONCURRENCY = 5;
const RESULT_STEP = 4;

interface LogEntry {
  time: string;
  message: string;
  type: "info" | "success" | "error" | "warn";
}

interface PromptPreview {
  unitIndex: number;
  generationMode: "matrix" | "per_copy";
  copyIndex: number;
  copyLabel: string;
  copySummary: string;
  templateScope?: "single" | "shared";
  templateCount?: number;
  templateId?: string;
  templateName?: string;
  templateNames?: string[];
  templateIndex?: number;
  templateTotal?: number;
  prompt: string;
  charCount: number;
}

interface GeneratedCreative {
  id: string;
  index: number;
  imageUrl: string | null;
  status: "generating" | "completed" | "error";
  error?: string;
}

export function StepReviewGenerate() {
  const {
    projectName,
    selectedTemplates,
    format,
    selectedFormats,
    copies,
    selectedPhotos,
    brandKitName,
    showLogo,
    chatHistory,
    selectedCreativeIds,
    projectId,
    personaId,
    brandKitId,
    selectedPhotos: photos,
    loadedCreatives,
    updateProject,
    setStep,
    personaName,
    orgId,
    preferredModel,
    variationEnabled,
    varyClothing,
    activeCopyFields,
    useCustomBackground,
    selectedBackgrounds,
  } = useCreator();

  // Carrega dados completos do brand kit selecionado (cores + logo url) pro checklist visual
  const [brandKitDetails, setBrandKitDetails] = useState<{
    colors?: Record<string, string>;
    logoUrl?: string | null;
  }>({});
  useEffect(() => {
    if (!brandKitId || !orgId) {
      setBrandKitDetails({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/brand-kits?orgId=${orgId}`);
        const data = await res.json();
        if (cancelled) return;
        const kit = (data.brandKits ?? []).find((k: { id: string }) => k.id === brandKitId);
        if (!kit) return;
        // logo_url jÃ¡ vem assinada do storage pela API de brand-kits.
        setBrandKitDetails({ colors: kit.colors, logoUrl: kit.logo_url ?? null });
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [brandKitId, orgId]);

  const logEndRef = useRef<HTMLDivElement>(null);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    completed: number;
    errors: number;
    done: boolean;
  } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const [generatedCreatives, setGeneratedCreatives] = useState<GeneratedCreative[]>([]);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [editingCreative, setEditingCreative] = useState<{ id: string; imageUrl: string | null; label: string } | null>(null);

  // UI state
  const [matrixMode, setMatrixMode] = useState(selectedTemplates.length > 1);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptPreviews, setPromptPreviews] = useState<PromptPreview[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);
  const [expandedPromptIndex, setExpandedPromptIndex] = useState<number | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<number | null>(null);
  const [promptOverrides, setPromptOverrides] = useState<Record<number, string>>({});
  const [promptEditUnit, setPromptEditUnit] = useState<PromptPreview | null>(null);
  const [promptEditValue, setPromptEditValue] = useState("");

  // Copy element toggles: which fields to include per copy (by copy id)
  // Default: all fields active. User can toggle off mini_copy or list_items
  const [copyFieldToggles, setCopyFieldToggles] = useState<Record<string, Record<string, boolean>>>({});

  function getActiveFields(copyId: string, content: Record<string, string>): Record<string, string> {
    const toggles = copyFieldToggles[copyId];
    if (!toggles) return content; // all active by default
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(content)) {
      if (toggles[key] !== false && value) {
        result[key] = value;
      }
    }
    return result;
  }

  function toggleCopyField(copyId: string, field: string) {
    setCopyFieldToggles((prev) => {
      const current = prev[copyId] || {};
      return { ...prev, [copyId]: { ...current, [field]: current[field] === false ? true : false } };
    });
    setPromptPreviews([]);
  }

  function isFieldActive(copyId: string, field: string): boolean {
    return copyFieldToggles[copyId]?.[field] !== false;
  }

  // Template URLs frescas
  const [templateUrls, setTemplateUrls] = useState<Record<string, string>>({});

  // Modal de visualizaÃ§Ã£o ampliada do template (clicar no thumbnail abre grande)
  const [previewTemplate, setPreviewTemplate] = useState<{ url: string; name: string } | null>(null);

  // Modal para editar copy
  const [editModalIndex, setEditModalIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Buscar URLs frescas dos templates ao montar
  useEffect(() => {
    if (selectedTemplates.length === 0) return;
    const ids = selectedTemplates.map((t) => t.id);
    fetch("/api/templates/thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateIds: ids }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.urls) setTemplateUrls(data.urls);
      })
      .catch(() => {});
  }, [selectedTemplates]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (generating || generatedCreatives.length > 0 || loadedCreatives.length === 0) return;

    const restoredCreatives: GeneratedCreative[] = loadedCreatives.map((creative, index) => ({
      id: creative.id,
      index: index + 1,
      imageUrl: creative.signed_url || null,
      status: creative.status === "error" ? "error"
        : creative.status === "completed" || creative.status === "approved" || creative.signed_url ? "completed"
        : "generating",
      error: creative.error_message || undefined,
    }));

    const completed = restoredCreatives.filter((creative) => creative.status === "completed").length;
    const errors = restoredCreatives.filter((creative) => creative.status === "error").length;
    const pending = restoredCreatives.length - completed - errors;

    setGeneratedCreatives(restoredCreatives);
    setProgress({
      total: restoredCreatives.length,
      completed,
      errors,
      done: pending === 0,
    });
  }, [loadedCreatives, generating, generatedCreatives.length]);

  // Auto-selecionar todas as copies
  useEffect(() => {
    if (copies.length === 0) return;

    const validIds = new Set(copies.map((copy) => copy.id));
    const normalizedSelection = selectedCreativeIds.filter((id) => validIds.has(id));

    if (normalizedSelection.length === 0) {
      updateProject({ selectedCreativeIds: copies.map((copy) => copy.id) });
      return;
    }

    if (normalizedSelection.length !== selectedCreativeIds.length) {
      updateProject({ selectedCreativeIds: normalizedSelection });
    }
  }, [copies, selectedCreativeIds, updateProject]);

  useEffect(() => {
    setPromptPreviews([]);
    setPromptOverrides({});
    setShowPrompt(false);
    setExpandedPromptIndex(null);
  }, [matrixMode, selectedCreativeIds, selectedTemplates, copies, photos, brandKitId, showLogo, format, chatHistory]);

  function startTimer() {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Cap de logs: em geracoes grandes (centenas de criativos) o array crescia sem
  // limite, causando uso de memoria e scroll lento. Mantemos so as ultimas 500.
  const MAX_LOGS = 500;
  function addLog(message: string, type: LogEntry["type"] = "info") {
    const now = new Date();
    const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { time, message, type }].slice(-MAX_LOGS));
  }

  function formatMs(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // --- Copy modal ---
  function openEditModal(index: number) {
    setEditValues({ ...copies[index].content });
    setEditModalIndex(index);
  }

  function saveEditModal() {
    if (editModalIndex === null) return;
    const newCopies = copies.map((c, i) => {
      if (i !== editModalIndex) return c;
      return { ...c, content: { ...editValues } };
    });
    updateProject({ copies: newCopies });
    setPromptPreviews([]);
    setEditModalIndex(null);
  }

  // --- Selection ---
  function toggleCopy(id: string) {
    if (selectedCreativeIds.includes(id)) {
      updateProject({ selectedCreativeIds: selectedCreativeIds.filter((x) => x !== id) });
    } else {
      updateProject({ selectedCreativeIds: [...selectedCreativeIds, id] });
    }
  }

  function toggleAll() {
    const allIds = copies.map((c) => c.id);
    if (selectedCreativeIds.length === allIds.length) {
      updateProject({ selectedCreativeIds: [] });
    } else {
      updateProject({ selectedCreativeIds: allIds });
    }
  }

  // --- Prompt preview ---
  const requestPromptPreviewUnits = useCallback(async (): Promise<PromptPreview[]> => {
    const generationMode = matrixMode && selectedTemplates.length > 1 ? "matrix" : "per_copy";
    const selectedCopies = copies
      .filter((copy) => selectedCreativeIds.includes(copy.id))
      .map((copy) => ({ ...copy, content: getActiveFields(copy.id, copy.content) }));
    const res = await fetch("/api/generate/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandKitId,
        copies: selectedCopies,
        format,
        selectedTemplates,
        showLogo,
        selectedPhotos: photos,
        chatHistory,
        generationMode,
        activeCopyFields,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erro ao montar preview de prompt");
    }
    return data.prompts || [];
  }, [matrixMode, selectedTemplates, copies, selectedCreativeIds, brandKitId, format, showLogo, photos, chatHistory, activeCopyFields]);

  function resolvePromptText(promptPreview: PromptPreview) {
    return promptOverrides[promptPreview.unitIndex] ?? promptPreview.prompt;
  }

  async function loadPromptPreview() {
    setPromptLoading(true);
    try {
      const prompts = await requestPromptPreviewUnits();
      setPromptPreviews(prompts);
      setShowPrompt(true);
      if (prompts.length > 0) setExpandedPromptIndex(0);
    } catch {
      // silent
    } finally {
      setPromptLoading(false);
    }
  }

  async function copyPromptToClipboard(index: number) {
    const promptPreview = promptPreviews[index];
    const prompt = promptPreview ? resolvePromptText(promptPreview) : null;
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(index);
    setTimeout(() => setCopiedPrompt(null), 2000);
  }

  function openPromptEdit(promptPreview: PromptPreview) {
    setPromptEditUnit(promptPreview);
    setPromptEditValue(resolvePromptText(promptPreview));
  }

  function savePromptEdit() {
    if (!promptEditUnit) return;
    setPromptOverrides((prev) => ({
      ...prev,
      [promptEditUnit.unitIndex]: promptEditValue,
    }));
    setPromptEditUnit(null);
  }

  function resetPromptEdit(unitIndex: number) {
    setPromptOverrides((prev) => {
      const next = { ...prev };
      delete next[unitIndex];
      return next;
    });
  }

  // --- Buscar URL da imagem gerada (com retry/backoff p/ consistÃªncia do Storage) ---
  async function fetchCreativeImageUrl(creativeId: string, attempts = 5): Promise<string | null> {
    const delays = [0, 250, 500, 1000, 1500];
    for (let i = 0; i < attempts; i++) {
      if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        const res = await fetch(`/api/creatives/${creativeId}/image`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.url) return data.url;
        }
      } catch {}
    }
    return null;
  }

  // IDs jÃ¡ em hidrataÃ§Ã£o (nÃ£o cancelar quando estado muda)
  const hydratingIdsRef = useRef<Set<string>>(new Set());

  // HidrataÃ§Ã£o de URLs apenas como fallback (ex: restauraÃ§Ã£o de criativos ao recarregar a pÃ¡gina).
  // Durante a geraÃ§Ã£o ativa, a URL Ã© buscada diretamente em processCreative.
  useEffect(() => {
    if (!projectId || generatedCreatives.length === 0 || generating) return;

    const missingIds = generatedCreatives
      .filter((c) => c.status === "completed" && !c.imageUrl && !hydratingIdsRef.current.has(c.id))
      .map((c) => c.id);

    if (missingIds.length === 0) return;

    missingIds.forEach((id) => hydratingIdsRef.current.add(id));

    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        if (cancelled) return;
        const stillMissing = missingIds.filter((id) => hydratingIdsRef.current.has(id));
        if (stillMissing.length === 0) return;

        const results = await Promise.all(
          stillMissing.map(async (id) => ({ id, url: await fetchCreativeImageUrl(id) }))
        );

        if (cancelled) return;

        setGeneratedCreatives((prev) =>
          prev.map((c) => {
            const hit = results.find((r) => r.id === c.id);
            if (hit?.url) {
              hydratingIdsRef.current.delete(c.id);
              return { ...c, imageUrl: hit.url };
            }
            return c;
          })
        );

        if (attempt < 11) await new Promise((r) => setTimeout(r, 1500));
      }
      missingIds.forEach((id) => hydratingIdsRef.current.delete(id));
    })();

    return () => { cancelled = true; };
  }, [projectId, generatedCreatives, generating]);

  // --- Download ZIP ---
  const handleDownloadZip = useCallback(async () => {
    if (!projectId || downloadingZip) return;
    setDownloadingZip(true);
    setError(null);
    try {
      const res = await fetch(`/api/generate/download?projectId=${projectId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha no download");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (projectName || "criativos").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
      a.download = `criativos-${safeName || projectId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar ZIP");
    } finally {
      setDownloadingZip(false);
    }
  }, [projectId, projectName, downloadingZip]);

  // --- Gerar ---
  const handleGenerate = useCallback(async () => {
    if (selectedCreativeIds.length === 0) return;
    setGenerating(true);
    setError(null);
    setLogs([]);
    setGeneratedCreatives([]);
    startTimer();

    const selectedCount = selectedCreativeIds.length;
    const useMatrixMode = matrixMode && selectedTemplates.length > 1;
    const formatsCountLocal = Math.max(1, (selectedFormats?.length ?? 0) || 1);
    const plannedTotal = (useMatrixMode ? selectedCount * selectedTemplates.length : selectedCount) * formatsCountLocal;
    setProgress({ total: plannedTotal, completed: 0, errors: 0, done: false });
    addLog(`Iniciando geracao de ${plannedTotal} criativo${plannedTotal > 1 ? "s" : ""}...`);

    try {
      let executionPrompts = promptPreviews;
      if (executionPrompts.length !== plannedTotal) {
        executionPrompts = await requestPromptPreviewUnits();
        setPromptPreviews(executionPrompts);
      }
      const executionUnits = executionPrompts.map((promptPreview) => ({
        ...promptPreview,
        prompt: promptOverrides[promptPreview.unitIndex] ?? promptPreview.prompt,
      }));

      let pid = projectId;

      if (!pid) {
        addLog("Criando projeto...");
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName || undefined, personaId, brandKitId, format, selectedFormats, showLogo, selectedTemplates, copies: copies.map((c) => ({ ...c, content: getActiveFields(c.id, c.content) })), selectedPhotos: photos, chatHistory, useCustomBackground, selectedBackgrounds }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error);
        pid = createData.projectId;
        updateProject({ projectId: pid });
        addLog(`Projeto criado: ${pid?.slice(0, 8)}`, "success");
      }

      addLog("Preparando registros...");
      const selectedCopyIndexes = copies.reduce<number[]>((acc, copy, index) => {
        if (selectedCreativeIds.includes(copy.id)) acc.push(index);
        return acc;
      }, []);
      const prepRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          generationMode: useMatrixMode ? "matrix" : "per_copy",
          selectedCopyIds: selectedCreativeIds,
          selectedCopyIndexes,
        }),
      });
      const prepData = await prepRes.json();
      if (!prepRes.ok) throw new Error(prepData.error);

      const { creativeIds, total } = prepData;
      addLog(`${total} criativo${total > 1 ? "s" : ""} preparado${total > 1 ? "s" : ""}`, "success");
      setProgress({ total, completed: 0, errors: 0, done: false });

      // Inicializar placeholders
      const placeholders: GeneratedCreative[] = creativeIds.map((id: string, i: number) => ({
        id, index: i + 1, imageUrl: null, status: "generating" as const,
      }));
      setGeneratedCreatives(placeholders);

      let completed = 0;
      let errors = 0;

      const processCreative = async (cid: string, index: number) => {
        const unit = executionUnits[index];
        const unitLabel = unit
          ? unit.generationMode === "matrix" && unit.templateName
            ? `Template ${unit.templateIndex}/${unit.templateTotal} Â· Copy ${unit.copyIndex}`
            : `Copy ${unit.copyIndex}`
          : `Criativo ${index + 1}`;

        addLog(`Gerando ${unitLabel} (${index + 1}/${total})...`);
        // Marcar como gerando
        setGeneratedCreatives((prev) => prev.map((c) => c.id === cid ? { ...c, status: "generating" } : c));

        const genStart = Date.now();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 240_000); // 4 min timeout

          const res = await fetch("/api/generate/one", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // VariaÃ§Ã£o ligada: NÃƒO manda promptOverride (senÃ£o o backend ignora o
            // buildPrompt e o bloco de variaÃ§Ã£o nunca entra). Manda forceVariation
            // pra cada criativo ser remontado com fundo/roupa/pose diferentes.
            body: JSON.stringify(
              variationEnabled
                ? { creativeId: cid, forceVariation: true, varyClothing: varyClothing === true }
                : { creativeId: cid, promptOverride: unit?.prompt }
            ),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await res.json();

          if (res.ok && data.success) {
            completed++;
            const genTime = formatMs(data.generationTime);
            const dlTime = formatMs(data.downloadTime);
            addLog(
              `${unitLabel} OK â€” ${genTime} (download: ${dlTime}) via ${data.provider}/${data.model}${data.fallbackUsed ? " [fallback]" : ""}`,
              "success"
            );

            // Buscar a signed URL imediatamente apÃ³s geraÃ§Ã£o bem-sucedida
            const imageUrl = await fetchCreativeImageUrl(cid);
            setGeneratedCreatives((prev) => prev.map((c) => c.id === cid ? { ...c, status: "completed", imageUrl } : c));
          } else {
            errors++;
            addLog(`${unitLabel} ERRO: ${data.error || "Erro desconhecido"}`, "error");
            setGeneratedCreatives((prev) => prev.map((c) => c.id === cid ? { ...c, status: "error", error: data.error } : c));
          }
        } catch (err) {
          errors++;
          const elapsed = formatMs(Date.now() - genStart);
          const isAbort = err instanceof DOMException && err.name === "AbortError";
          const msg = isAbort
            ? "Timeout de 4min excedido. Verifique a API key e tente novamente"
            : err instanceof Error ? err.message : "Falha de conexao";
          addLog(`${unitLabel} ERRO apos ${elapsed}: ${msg}`, "error");
          setGeneratedCreatives((prev) => prev.map((c) => c.id === cid ? { ...c, status: "error", error: msg } : c));
        }

        setProgress({ total, completed, errors, done: false });
      };

      for (let batchStart = 0; batchStart < creativeIds.length; batchStart += GENERATION_CONCURRENCY) {
        const batch = creativeIds.slice(batchStart, batchStart + GENERATION_CONCURRENCY);
        const batchNumber = Math.floor(batchStart / GENERATION_CONCURRENCY) + 1;
        addLog(`Abrindo lote ${batchNumber} com ${batch.length} criativo${batch.length > 1 ? "s" : ""} em paralelo...`);
        await Promise.all(
          batch.map((cid: string, offset: number) => processCreative(cid, batchStart + offset))
        );
      }

      stopTimer();
      const totalElapsed = formatMs(Date.now() - startTimeRef.current);
      setProgress({ total, completed, errors, done: true });
      await fetch("/api/generate/status?projectId=" + pid).catch(() => {});
      await fetch("/api/projects/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, currentStep: RESULT_STEP }),
      }).catch(() => {});

      if (errors === 0) {
        addLog(`Geracao concluida! ${completed} criativo${completed > 1 ? "s" : ""} em ${totalElapsed}`, "success");
      } else if (completed > 0) {
        addLog(`Concluido com ${errors} erro${errors > 1 ? "s" : ""}. ${completed} OK de ${total}. Tempo: ${totalElapsed}`, "warn");
      } else {
        addLog(`Todos falharam. ${errors} erro${errors > 1 ? "s" : ""}. Tempo: ${totalElapsed}`, "error");
      }

      setGenerating(false);
      if (completed > 0) {
        setStep(RESULT_STEP);
      }
    } catch (err) {
      stopTimer();
      const message = err instanceof Error ? err.message : "Erro ao iniciar geracao";
      addLog(`ERRO FATAL: ${message}`, "error");
      setError(message);
      setGenerating(false);
    }
  }, [selectedCreativeIds, projectId, projectName, personaId, brandKitId, format, showLogo, selectedTemplates, copies, photos, chatHistory, updateProject, matrixMode, promptPreviews, promptOverrides, requestPromptPreviewUnits, setStep, variationEnabled, varyClothing, useCustomBackground, selectedBackgrounds]);

  const selectedCount = selectedCreativeIds.length;
  const effectiveMatrixMode = matrixMode && selectedTemplates.length > 1;
  const formatsCount = Math.max(1, (selectedFormats?.length ?? 0) || 1);
  const baseCount = effectiveMatrixMode ? selectedCount * selectedTemplates.length : selectedCount;
  const plannedCount = baseCount * formatsCount;
  const progressPct = progress ? Math.round(((progress.completed + progress.errors) / progress.total) * 100) : 0;

  // Estimativa de custo antes de gerar
  const modelInfo = getModelById(preferredModel || "") || getDefaultModel();
  const costPerImageUSD = modelInfo.costPerImage;
  const estimatedCostEUR = plannedCount * costPerImageUSD * USD_TO_EUR;
  const fmtEUR = (v: number) => v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

  // PÃ­lulas de cores do brand kit (atÃ© 5)
  const colorPills: Array<{ key: string; hex: string }> = brandKitDetails.colors
    ? Object.entries(brandKitDetails.colors)
        .filter(([, hex]) => typeof hex === "string" && /^#[0-9a-fA-F]{3,8}$/.test(hex))
        .slice(0, 5)
        .map(([key, hex]) => ({ key, hex: hex as string }))
    : [];

  const checklistItems: Array<{ label: string; value: string; ok: boolean }> = [
    { label: "Projeto", value: projectName || "(sem nome)", ok: !!projectName },
    { label: "Persona", value: personaName || "â€”", ok: !!personaName },
    { label: "Formato", value: typeof format?.label === "string" ? format.label : `${format?.width}x${format?.height}`, ok: !!format?.width },
    { label: "Brand kit", value: brandKitName || "â€”", ok: !!brandKitName },
    { label: "Templates", value: `${selectedTemplates.length}`, ok: selectedTemplates.length > 0 },
    { label: "Copies", value: `${copies.length}`, ok: copies.length > 0 },
    { label: "Fotos do expert", value: `${selectedPhotos.length}`, ok: true },
    { label: "Logo", value: showLogo ? (brandKitDetails.logoUrl ? "Sim, vinculado" : "Ligado mas sem arquivo") : "NÃ£o", ok: !showLogo || !!brandKitDetails.logoUrl },
  ];

  return (
    <div className="space-y-4">

      {/* === CHECKLIST VISUAL === */}
      <div className="theme-panel rounded-[26px] p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Checklist da geraÃ§Ã£o</p>
            <p className="text-xs text-text-muted">Confira tudo antes de gerar em lote.</p>
          </div>
          <span className="px-2 py-1 rounded-full bg-accent-champagne/15 text-accent-champagne text-[11px] font-semibold">
            {plannedCount} criativo{plannedCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {checklistItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-border-subtle bg-surface-000 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted flex items-center gap-1">
                {item.ok ? <CheckCircle2 className="w-3 h-3 text-accent-green" /> : <span className="w-3 h-3 rounded-full bg-accent-red/40" />}
                {item.label}
              </p>
              <p className="mt-1 text-sm font-medium text-text-primary truncate" title={item.value}>{item.value}</p>
            </div>
          ))}
        </div>

        {(colorPills.length > 0 || brandKitDetails.logoUrl) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-center">
            {colorPills.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-1.5">Paleta</p>
                <div className="flex flex-wrap gap-1.5">
                  {colorPills.map((c) => (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-000 pl-1 pr-2 py-0.5 text-[10px] font-mono text-text-secondary"
                      title={`${c.key}: ${c.hex}`}
                    >
                      <span className="inline-block w-3 h-3 rounded-full border border-border-subtle" style={{ background: c.hex }} />
                      {c.hex.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {brandKitDetails.logoUrl && (
              <div className="flex flex-col items-end">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-1.5">Logo</p>
                <div className="rounded-lg border border-border-subtle bg-surface-000 p-1.5">
                  <img src={brandKitDetails.logoUrl} alt="Logo" className="h-10 w-auto max-w-[120px] object-contain" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
        <div className="theme-panel space-y-4 rounded-[26px] p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-champagne" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Visual selecionado</p>
              <p className="text-xs text-text-muted">Templates, fotos do expert e modo de combinaÃ§Ã£o.</p>
            </div>
          </div>

          {selectedTemplates.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <LayoutTemplate className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-semibold text-text-primary">Templates</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selectedTemplates.map((tmpl, index) => {
                  const url = templateUrls[tmpl.id] || tmpl.thumbnailUrl;
                  return (
                    <div key={`${tmpl.id}-${index}`} className="rounded-xl border border-border-subtle bg-surface-000 p-2">
                      {url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate({ url, name: tmpl.name })}
                          className="group relative block h-36 w-full overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-champagne"
                          title="Ver template ampliado"
                        >
                          <img src={url} alt={tmpl.name} className="h-36 w-full rounded-lg object-cover transition-transform group-hover:scale-[1.03]" />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                            <Eye className="h-5 w-5 text-white" />
                          </span>
                        </button>
                      ) : (
                        <div className="flex h-36 w-full items-center justify-center rounded-lg bg-surface-100">
                          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
                        </div>
                      )}
                      <p className="mt-2 truncate text-xs text-text-muted">{tmpl.name}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selectedPhotos.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-semibold text-text-primary">Fotos do expert</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedPhotos.map((photo) => (
                  <div key={photo.id} className="flex-shrink-0">
                    {photo.url ? (
                      <img src={photo.url} alt={photo.label || "Expert"} className="h-20 w-20 rounded-lg border border-border-subtle object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border-subtle bg-surface-100">
                        <Camera className="w-4 h-4 text-text-muted" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border-subtle bg-surface-000 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Brand kit
              </p>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {brandKitName || "Nenhum brand kit selecionado"}
              </p>
            </div>

            <div className="rounded-xl border border-border-subtle bg-surface-000 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Logo
              </p>
              <p className="mt-1 text-sm font-medium text-text-primary">
                {showLogo ? "Incluido na geracao" : "Nao incluido"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-surface-000 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-xs font-medium text-text-primary">Modo Matrix</p>
                <p className="text-[10px] text-text-muted">
                  {effectiveMatrixMode
                    ? `${selectedTemplates.length} templates Ã— ${selectedCount} copies = ${plannedCount} criativos`
                    : `${selectedCount} criativo${selectedCount !== 1 ? "s" : ""} com referencias visuais compartilhadas`}
                </p>
              </div>
              <button
                onClick={() => {
                  setMatrixMode(!matrixMode);
                  setPromptPreviews([]);
                  setShowPrompt(false);
                  setExpandedPromptIndex(null);
                  updateProject({ selectedCreativeIds: copies.map((c) => c.id) });
                }}
                disabled={selectedTemplates.length < 2}
                className={cn(
                  "relative h-6 w-11 flex-shrink-0 rounded-full transition-colors",
                  effectiveMatrixMode ? "bg-accent-champagne" : "bg-surface-200",
                  selectedTemplates.length < 2 && "cursor-not-allowed opacity-40"
                )}
              >
                <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform", effectiveMatrixMode ? "left-6" : "left-1")} />
              </button>
            </div>
          </div>
        </div>

        <div className="theme-panel rounded-[26px] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs font-semibold text-text-primary">
                Copies: {selectedCount}/{copies.length} selecionadas
              </span>
            </div>
            <button onClick={toggleAll} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-primary">
              {selectedCount === copies.length ? <CheckSquare className="w-3.5 h-3.5 text-accent-champagne" /> : <Square className="w-3.5 h-3.5" />}
              Todas
            </button>
          </div>
          <div className="space-y-1.5">
            {copies.map((copy, ci) => {
              const isSelected = selectedCreativeIds.includes(copy.id);
              const rawHeadline = copy.content.headline || copy.content.chamada || Object.values(copy.content).filter(Boolean)[0] || `Copy ${ci + 1}`;
              const headline = typeof rawHeadline === "object" ? JSON.stringify(rawHeadline) : String(rawHeadline);
              // Toggleable fields (only show toggle for fields that have content)
              const toggleableFields = [
                { key: "mini_copy", label: "Mini copy" },
                { key: "list_items", label: "Lista" },
              ].filter((f) => copy.content[f.key]);
              return (
                <div
                  key={copy.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-all hover:border-accent-champagne/50",
                    isSelected ? "border-accent-champagne bg-champagne-alpha-05" : "border-border-subtle bg-surface-000"
                  )}
                >
                  <div className="flex cursor-pointer items-start gap-2.5">
                    <button onClick={(e) => { e.stopPropagation(); toggleCopy(copy.id); }} className="mt-0.5 flex-shrink-0">
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-accent-champagne" /> : <Square className="w-3.5 h-3.5 text-text-muted" />}
                    </button>
                    <div className="min-w-0 flex-1" onClick={() => openEditModal(ci)}>
                      <p className="text-xs font-medium text-text-primary leading-snug">{headline}</p>
                      {copy.content.mini_copy && isFieldActive(copy.id, "mini_copy") && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-text-muted">{copy.content.mini_copy}</p>
                      )}
                      {copy.content.list_items && isFieldActive(copy.id, "list_items") && (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-text-muted">
                          {copy.content.list_items.split("\n").filter(Boolean).slice(0, 3).join(" Â· ")}
                        </p>
                      )}
                      {copy.content.cta && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] bg-accent-champagne/20 text-accent-champagne font-medium">
                          {copy.content.cta}
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 flex-shrink-0 text-[9px] text-text-muted">#{ci + 1}</span>
                  </div>
                  {/* Element toggles */}
                  {isSelected && toggleableFields.length > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 ml-6 pt-1.5 border-t border-border-subtle/50">
                      <span className="text-[9px] text-text-muted">Usar:</span>
                      {toggleableFields.map((f) => {
                        const active = isFieldActive(copy.id, f.key);
                        return (
                          <button
                            key={f.key}
                            onClick={(e) => { e.stopPropagation(); toggleCopyField(copy.id, f.key); }}
                            className={cn(
                              "px-2 py-0.5 rounded text-[9px] font-medium transition-all border",
                              active
                                ? "bg-accent-champagne/15 text-accent-champagne border-accent-champagne/30"
                                : "bg-surface-100 text-text-muted border-border-subtle line-through"
                            )}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* === PROMPT PREVIEW === */}
      <div className="theme-panel rounded-[22px]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs font-semibold text-text-primary">Prompt Final</span>
          </div>
          <button
            onClick={() => showPrompt ? setShowPrompt(false) : loadPromptPreview()}
            disabled={promptLoading || selectedCount === 0}
            className="flex items-center gap-1.5 text-[10px] text-accent-champagne hover:text-accent-champagne/80 disabled:opacity-50"
          >
            {promptLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : showPrompt ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {promptLoading ? "Carregando..." : showPrompt ? "Esconder" : "Ver prompt"}
          </button>
        </div>
        {showPrompt && promptPreviews.length > 0 && (
          <div className="px-4 pb-2">
            <div className="rounded-xl border border-border-subtle bg-surface-000 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">Preview contextualizado</span>
                <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-text-primary">
                  {promptPreviews[0]?.generationMode === "matrix"
                    ? "Modo matrix"
                    : "Modo por copy"}
                </span>
                <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-text-primary">
                  {promptPreviews.length} unidade{promptPreviews.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
                Cada cartÃ£o mostra a unidade de geraÃ§Ã£o com a copy associada e os templates usados como contexto visual.
              </p>
            </div>
          </div>
        )}
        {showPrompt && promptPreviews.length > 0 && (
          <div className="px-3 pb-3 space-y-2">
            {promptPreviews.map((pp, i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-surface-000 overflow-hidden">
                <button
                  onClick={() => setExpandedPromptIndex(expandedPromptIndex === i ? null : i)}
                  className="w-full flex items-start justify-between gap-3 px-3 py-2 bg-surface-100 hover:bg-surface-150 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-surface-000 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        Unidade {String(pp.unitIndex).padStart(2, "0")}
                      </span>
                      <span className="rounded-full bg-surface-000 px-2 py-0.5 text-[9px] font-medium text-text-primary">
                        Copy {pp.copyIndex}
                      </span>
                      {pp.generationMode === "matrix" && pp.templateName && (
                        <span className="rounded-full bg-champagne-alpha-05 px-2 py-0.5 text-[9px] font-medium text-accent-champagne">
                          Template {pp.templateIndex}/{pp.templateTotal}: {pp.templateName}
                        </span>
                      )}
                      {pp.generationMode !== "matrix" && (
                        <span className="rounded-full bg-surface-000 px-2 py-0.5 text-[9px] font-medium text-text-muted">
                          {pp.templateCount === 1 ? "1 template" : `${pp.templateCount || 0} templates`}
                        </span>
                      )}
                      {promptOverrides[pp.unitIndex] && (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-medium text-green-400">
                          Prompt ajustado
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-text-primary">{pp.copyLabel}</p>
                    {pp.copySummary && <p className="mt-0.5 line-clamp-2 text-[10px] text-text-muted">{pp.copySummary}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5 pt-0.5">
                    <span className="text-[9px] text-text-muted">{resolvePromptText(pp).length} chars</span>
                    <button onClick={(e) => { e.stopPropagation(); openPromptEdit(pp); }} className="p-0.5 rounded hover:bg-surface-200">
                      <Edit2 className="w-3 h-3 text-text-muted" />
                    </button>
                    {promptOverrides[pp.unitIndex] && (
                      <button onClick={(e) => { e.stopPropagation(); resetPromptEdit(pp.unitIndex); }} className="p-0.5 rounded hover:bg-surface-200">
                        <RotateCcw className="w-3 h-3 text-text-muted" />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); copyPromptToClipboard(i); }} className="p-0.5 rounded hover:bg-surface-200">
                      {copiedPrompt === i ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-text-muted" />}
                    </button>
                    {expandedPromptIndex === i ? <ChevronUp className="w-3 h-3 text-text-muted" /> : <ChevronDown className="w-3 h-3 text-text-muted" />}
                  </div>
                </button>
                {expandedPromptIndex === i && (
                  <div className="p-3 border-t border-border-subtle bg-surface-000">
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[9px] font-medium text-text-primary">
                        {pp.generationMode === "matrix" ? "Unidade matrix" : "Unidade por copy"}
                      </span>
                      {pp.templateNames?.map((name, templateIndex) => (
                        <span key={`${name}-${templateIndex}`} className="rounded-full bg-surface-100 px-2 py-0.5 text-[9px] font-medium text-text-muted">
                          Template {templateIndex + 1}: {name}
                        </span>
                      ))}
                    </div>
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-text-secondary">{resolvePromptText(pp)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!showPrompt && (
          <p className="px-4 pb-3 text-[10px] text-text-muted">
            {selectedCount === 0
              ? "Selecione pelo menos uma copy para visualizar o prompt."
              : "Visualize o prompt exato antes de gerar."}
          </p>
        )}
      </div>

      {/* === BOTAO GERAR === */}
      {!generating && (() => {
        const alreadyGenerated = loadedCreatives.length > 0 || generatedCreatives.length > 0;
        const buttonClass = "w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-accent-champagne text-surface-000 text-sm font-semibold hover:bg-accent-champagne/90";
        const buttonLabel = alreadyGenerated
          ? `Gerar novos ${plannedCount} criativo${plannedCount !== 1 ? "s" : ""}`
          : `Gerar ${plannedCount} criativo${plannedCount !== 1 ? "s" : ""} em lotes de ate ${GENERATION_CONCURRENCY}`;
        return (
          <>
            {error && <p className="text-xs text-accent-red">{error}</p>}

            {/* Aviso de custo antes de gerar */}
            {plannedCount > 0 && (
              <div className="theme-panel rounded-[18px] px-4 py-3 mb-2 flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">ðŸ’°</span>
                <div className="flex-1 text-xs">
                  <p className="text-text-primary font-semibold">
                    {plannedCount} imagem{plannedCount !== 1 ? "ns" : ""} Â· custo estimado {fmtEUR(estimatedCostEUR)}
                  </p>
                  <p className="text-text-muted mt-0.5">
                    ~{fmtEUR(costPerImageUSD * USD_TO_EUR)} por imagem ({modelInfo.name}).
                    {formatsCount > 1 && (
                      <span className="text-amber-500"> VocÃª estÃ¡ gerando em {formatsCount} formatos, o que multiplica o custo por {formatsCount}.</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerate}
              className={buttonClass}
            >
              <Zap className="w-4 h-4" />
              {buttonLabel}
            </button>
          </>
        );
      })()}

      {/* === LOG VISIVEL === */}
      {logs.length > 0 && (
        <div className="theme-panel rounded-[22px]">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-text-muted" />
              <span className="text-xs font-medium text-text-primary">Log da geracao</span>
            </div>
            <span className="text-[10px] text-text-muted">
              {logs.length} entrad{logs.length === 1 ? "a" : "as"}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto bg-surface-000 mx-3 mb-3 rounded-lg p-2 space-y-0.5 font-mono text-[10px]">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-text-muted flex-shrink-0">[{log.time}]</span>
                <span
                  className={cn(
                    log.type === "success" && "text-green-400",
                    log.type === "error" && "text-red-400",
                    log.type === "warn" && "text-amber-400",
                    log.type === "info" && "text-text-secondary"
                  )}
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* === CRIATIVOS GERADOS (em tempo real) === */}
      {generatedCreatives.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-text-primary">Criativos gerados</span>
            {progress && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs font-mono">
                  <Clock className={cn("w-3.5 h-3.5", generating ? "text-accent-champagne animate-pulse" : "text-text-muted")} />
                  <span className={cn(generating ? "text-accent-champagne" : "text-text-muted")}>{formatMs(elapsedMs)}</span>
                </div>
                <span className="text-xs font-medium text-accent-champagne">{progressPct}%</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {progress && (
            <div className="w-full h-1.5 rounded-full bg-surface-200 overflow-hidden mb-3">
              <div
                className={cn("h-full rounded-full transition-all duration-500", progress.errors > 0 && progress.completed === 0 ? "bg-accent-red" : "bg-accent-champagne")}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {/* Grid de criativos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {generatedCreatives.map((creative) => (
              <div key={creative.id} className="rounded-lg border border-border-subtle overflow-hidden bg-surface-050">
                <div className="aspect-[4/5] relative">
                  {creative.status === "completed" && creative.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage({ url: creative.imageUrl!, label: `Criativo ${creative.index}` })}
                      className="block h-full w-full cursor-zoom-in"
                    >
                      <img src={creative.imageUrl} alt={`Criativo ${creative.index}`} className="w-full h-full object-cover" />
                    </button>
                  ) : creative.status === "generating" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-surface-100">
                      <Loader2 className="w-6 h-6 text-accent-champagne animate-spin mb-2" />
                      <span className="text-[10px] text-text-muted">Gerando...</span>
                    </div>
                  ) : creative.status === "completed" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-surface-100">
                      <Loader2 className="w-6 h-6 text-accent-champagne animate-spin mb-2" />
                      <span className="text-[10px] text-text-muted">Carregando preview...</span>
                    </div>
                  ) : creative.status === "error" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-surface-100 px-2">
                      <XCircle className="w-5 h-5 text-accent-red mb-1" />
                      <span className="text-[9px] text-accent-red text-center line-clamp-2">{creative.error || "Erro"}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-surface-100" />
                  )}
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-text-muted">#{creative.index}</span>
                  <div className="flex items-center gap-2">
                    {creative.status === "completed" && creative.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditingCreative({ id: creative.id, imageUrl: creative.imageUrl, label: `Criativo ${creative.index}` })}
                        className="rounded-md border border-border-subtle px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:text-text-primary"
                      >
                        Editar
                      </button>
                    )}
                    {creative.status === "completed" && <CheckCircle2 className="w-3 h-3 text-accent-green" />}
                    {creative.status === "generating" && <Loader2 className="w-3 h-3 text-accent-champagne animate-spin" />}
                    {creative.status === "error" && <XCircle className="w-3 h-3 text-accent-red" />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          {progress && (
            <div className="flex items-center gap-4 mt-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-accent-green" />{progress.completed} OK</span>
              {progress.errors > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-accent-red" />{progress.errors} erros</span>}
              <span className="flex items-center gap-1"><MinusCircle className="w-3 h-3" />{progress.total - progress.completed - progress.errors} pendentes</span>
            </div>
          )}

          {/* Botoes pos-geracao */}
          {!generating && progress?.done && (progress.errors > 0 || error) && (
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => { setProgress(null); setError(null); setLogs([]); setGenerating(false); setGeneratedCreatives([]); updateProject({ projectId: null }); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-xs font-medium hover:bg-surface-150"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Voltar e ajustar
              </button>
              <button
                onClick={() => { setProgress(null); setError(null); setLogs([]); setGeneratedCreatives([]); updateProject({ projectId: null }); handleGenerate(); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent-champagne text-surface-000 text-xs font-semibold hover:bg-accent-champagne/90"
              >
                <Zap className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      )}

      {error && !progress && (
        <div className="space-y-2">
          <p className="text-xs text-accent-red">{error}</p>
          <button onClick={() => { setError(null); setGenerating(false); }} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 text-text-secondary text-xs font-medium hover:bg-surface-150">
            <RotateCcw className="w-3.5 h-3.5" /> Voltar
          </button>
        </div>
      )}

      {previewImage && (
        <Portal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.label}
              className="max-h-[92vh] max-w-[92vw] rounded-2xl border border-border-subtle bg-surface-000 object-contain shadow-2xl"
            />
          </div>
        </div>
        </Portal>
      )}

      {editingCreative && (
        <EditCreativeModal
          creativeId={editingCreative.id}
          imageUrl={editingCreative.imageUrl}
          label={editingCreative.label}
          onClose={() => setEditingCreative(null)}
          onSaved={({ url }) => {
            // Cache-bust pra forcar o browser a recarregar a nova imagem
            const bustedUrl = url
              ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`
              : null;
            setGeneratedCreatives((prev) =>
              prev.map((creative) =>
                creative.id === editingCreative.id
                  ? { ...creative, imageUrl: bustedUrl ?? creative.imageUrl, status: "completed", error: undefined }
                  : creative
              )
            );
          }}
        />
      )}

      {/* === MODAL EDITAR COPY === */}
      {editModalIndex !== null && copies[editModalIndex] && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditModalIndex(null)}>
          <div className="bg-surface-000 rounded-2xl border border-border-subtle w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">Copy {editModalIndex + 1}</h3>
              <button onClick={() => setEditModalIndex(null)} className="p-1 rounded-lg hover:bg-surface-100">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {Object.entries(editValues).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">{key}</label>
                  <textarea
                    value={value}
                    onChange={(e) => setEditValues({ ...editValues, [key]: e.target.value })}
                    rows={key === "mini_copy" || key === "list_items" || value.length > 80 ? 4 : 2}
                    className="w-full px-3 py-2 rounded-lg bg-surface-050 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-accent-champagne resize-none leading-relaxed"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border-subtle">
              <button onClick={() => setEditModalIndex(null)} className="px-4 py-2 rounded-lg text-xs text-text-muted hover:bg-surface-100">Cancelar</button>
              <button onClick={saveEditModal} className="px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-xs font-semibold hover:bg-accent-champagne/90">Salvar</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {promptEditUnit && (
        <Portal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPromptEditUnit(null)}>
          <div className="bg-surface-000 rounded-2xl border border-border-subtle w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Editar prompt da unidade {String(promptEditUnit.unitIndex).padStart(2, "0")}
                </h3>
                <p className="mt-0.5 text-[10px] text-text-muted">
                  Ajuste manual apenas para esta execucao. O projeto base nao sera sobrescrito.
                </p>
              </div>
              <button onClick={() => setPromptEditUnit(null)} className="p-1 rounded-lg hover:bg-surface-100">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[9px] font-medium text-text-primary">
                  Copy {promptEditUnit.copyIndex}
                </span>
                {promptEditUnit.templateName && (
                  <span className="rounded-full bg-champagne-alpha-05 px-2 py-0.5 text-[9px] font-medium text-accent-champagne">
                    {promptEditUnit.templateName}
                  </span>
                )}
              </div>
              <textarea
                value={promptEditValue}
                onChange={(event) => setPromptEditValue(event.target.value)}
                rows={18}
                className="w-full rounded-xl border border-border-subtle bg-surface-050 px-4 py-3 font-mono text-xs leading-relaxed text-text-primary focus:outline-none focus:border-accent-champagne"
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border-subtle">
              <button
                onClick={() => {
                  resetPromptEdit(promptEditUnit.unitIndex);
                  setPromptEditValue(promptEditUnit.prompt);
                }}
                className="px-4 py-2 rounded-lg text-xs text-text-muted hover:bg-surface-100"
              >
                Restaurar original
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setPromptEditUnit(null)} className="px-4 py-2 rounded-lg text-xs text-text-muted hover:bg-surface-100">
                  Cancelar
                </button>
                <button onClick={savePromptEdit} className="px-4 py-2 rounded-lg bg-accent-champagne text-surface-000 text-xs font-semibold hover:bg-accent-champagne/90">
                  Aplicar nesta execucao
                </button>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {previewTemplate && (
        <Portal>
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => setPreviewTemplate(null)}
          >
            <div
              className="relative flex max-h-[90vh] max-w-3xl flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewTemplate(null)}
                className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface-000 text-text-primary shadow-lg hover:bg-surface-100"
                title="Fechar"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={previewTemplate.url}
                alt={previewTemplate.name}
                className="max-h-[82vh] w-auto rounded-2xl border border-border-subtle object-contain shadow-2xl"
              />
              <p className="mt-3 text-center text-sm font-medium text-white">
                {previewTemplate.name}
              </p>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

