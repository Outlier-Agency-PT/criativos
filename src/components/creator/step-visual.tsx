"use client";


import { useState, useEffect, useRef, useCallback } from "react";
import { useCreator, type SelectedPhoto, type SelectedBackground } from "./creator-context";
import { BrandKitCreateModal } from "./brand-kit-create-modal";
import { cn } from "@/lib/utils";
import { optimizeImageForUpload } from "@/lib/client-image-optimization";
import {
  Loader2,
  Check,
  CheckSquare,
  Square,
  UserX,
  User,
  CheckCircle2,
  Palette,
  Image as ImageIcon,
  Plus,
  Upload,
  Trash2,
  X,
} from "lucide-react";

interface PhotoItem {
  id: string;
  file_path: string;
  file_name: string;
  url?: string;
}

interface BrandKitItem {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background?: string;
    text?: string;
  };
  fonts: {
    heading: { family: string; weight: string };
    body: { family: string; weight: string };
  };
  logo_path: string | null;
  /** URL assinada do logo, resolvida do storage pela API de brand-kits. */
  logo_url?: string | null;
}

interface LogoItem {
  id: string;
  file_path: string;
  label: string;
  url: string | null;
}

function getFontFamily(font: unknown): string {
  if (typeof font === "string") return font;
  if (font && typeof font === "object") {
    const f = (font as Record<string, unknown>).family;
    if (typeof f === "string") return f;
    if (f && typeof f === "object") return String((f as Record<string, unknown>).family || "Inter");
  }
  return "Inter";
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const LOGO_TYPES = ["image/png", "image/svg+xml"];
export function StepVisual() {
  const {
    orgId, projectId, sourceProjectId, selectedPhotos, brandKitId, showLogo,
    logoId, draftLoading, updateProject, expertAdjustments, variationEnabled, varyClothing,
    useCustomBackground, backgroundMode, selectedBackgrounds, blockColors,
    saveProgressToDb,
  } = useCreator();

  // Photos state
  const [usePhotos, setUsePhotos] = useState(selectedPhotos.length > 0);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Background (imagem de fundo própria) state
  const [uploadingBackgrounds, setUploadingBackgrounds] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  // Brand kit state
  const [brandKits, setBrandKits] = useState<BrandKitItem[]>([]);
  const [brandKitsLoading, setBrandKitsLoading] = useState(true);
  const [brandKitsError, setBrandKitsError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Logo state
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [logosLoading, setLogosLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogoId, setDeletingLogoId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const defaultLogoApplied = useRef(false);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Persistência confiável da seleção de fotos/fundos no PROJETO real (não só no
  // draft). O debounce do creator-context só grava em /api/creator-draft; sem isto,
  // ao reabrir o projeto (?regenerate=) as fotos/fundos voltavam vazios. Grava com
  // debounce curto, sem disparar no load inicial e só quando há projeto real.
  const visualPersistKey = `${selectedPhotos.map((p) => p.id).join(",")}|${selectedBackgrounds
    .map((b) => b.id)
    .join(",")}`;
  const visualPersistMounted = useRef(false);
  useEffect(() => {
    if (draftLoading) return;
    if (!projectId) return;
    if (!visualPersistMounted.current) {
      visualPersistMounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      saveProgressToDb().catch(() => {});
    }, 700);
    return () => clearTimeout(t);
    // visualPersistKey é a fingerprint da seleção (ids de fotos + fundos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualPersistKey, projectId, draftLoading]);

  useEffect(() => {
    if (draftLoading) return;
    if (defaultLogoApplied.current) return;
    if (projectId || sourceProjectId) {
      defaultLogoApplied.current = true;
      return;
    }
    if (showLogo) {
      defaultLogoApplied.current = true;
      updateProject({ showLogo: false });
    }
  }, [draftLoading, projectId, sourceProjectId, showLogo, updateProject]);

  // Load photos
  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/photos?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotos(data.photos ?? []);
    } catch (err) {
      setPhotosError(err instanceof Error ? err.message : "Erro ao carregar fotos");
    } finally {
      setPhotosLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!usePhotos) return;
    loadPhotos();
  }, [usePhotos, loadPhotos]);

  // Load brand kits
  const loadBrandKits = useCallback(async () => {
    setBrandKitsLoading(true);
    try {
      const res = await fetch(`/api/brand-kits?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const items: BrandKitItem[] = data.brandKits ?? [];
      setBrandKits(items);
      if (items.length === 1 && !brandKitId) {
        updateProject({ brandKitId: items[0].id, brandKitName: items[0].name });
      }
    } catch (err) {
      setBrandKitsError(err instanceof Error ? err.message : "Erro ao carregar brand kits");
    } finally {
      setBrandKitsLoading(false);
    }
  }, [brandKitId, orgId, updateProject]);

  useEffect(() => {
    loadBrandKits();
  }, [loadBrandKits]);

  // Load logos
  const loadLogos = useCallback(async () => {
    setLogosLoading(true);
    try {
      const res = await fetch(`/api/logos?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogos(data.logos ?? []);
    } catch {
      // Silencioso, logos sao opcionais
    } finally {
      setLogosLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadLogos();
  }, [loadLogos]);

  // ====== PHOTO HANDLERS ======

  function handleToggleUsePhotos() {
    const next = !usePhotos;
    setUsePhotos(next);
    if (!next) {
      updateProject({ selectedPhotos: [] });
    }
  }

  async function deletePhoto(photo: PhotoItem, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = window.confirm(`Apagar a foto "${photo.file_name}" da biblioteca? (não dá pra desfazer)`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/photos?id=${photo.id}&orgId=${orgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao apagar foto");
      }
      // Remove da seleção se estava selecionada
      if (selectedPhotos.some((p) => p.id === photo.id)) {
        updateProject({ selectedPhotos: selectedPhotos.filter((p) => p.id !== photo.id) });
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      showToast("Foto apagada");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao apagar foto", "error");
    }
  }

  function togglePhoto(photo: PhotoItem) {
    const isSelected = selectedPhotos.some((p) => p.id === photo.id);
    if (isSelected) {
      updateProject({
        selectedPhotos: selectedPhotos.filter((p) => p.id !== photo.id),
      });
    } else {
      const newPhoto: SelectedPhoto = {
        id: photo.id,
        url: photo.url || photo.file_path,
        label: photo.file_name,
      };
      updateProject({ selectedPhotos: [...selectedPhotos, newPhoto] });
    }
  }

  const handlePhotoUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const supported = fileArray.filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) {
        showToast(`${f.name}: tipo nao suportado`, "error");
        return false;
      }
      return true;
    });

    if (supported.length === 0) return;

    // Auto-redimensionar imagens grandes
    const valid: File[] = [];
    for (const f of supported) {
      try {
        const processed = await optimizeImageForUpload(f, {
          maxBytes: MAX_PHOTO_SIZE,
          maxDimension: 1600,
        });
        valid.push(processed);
      } catch {
        showToast(`${f.name}: erro ao processar`, "error");
      }
    }

    if (valid.length === 0) return;

    setUploadingPhotos(true);
    try {
      const uploaded = await Promise.all(
        valid.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("bucket", "expert-photos");
          formData.append("path", orgId);

          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          // Inserir registro na tabela criativos_expert_photos
          const dbRes = await fetch("/api/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              org_id: orgId,
              file_path: data.file_path,
              file_name: data.file_name,
              mime_type: data.mime_type,
              is_active: true,
            }),
          });
          const dbData = await dbRes.json();
          if (!dbRes.ok) throw new Error(dbData.error);

          return { ...data, id: dbData.photo?.id };
        })
      );

      showToast(`${uploaded.length} foto${uploaded.length > 1 ? "s" : ""} adicionada${uploaded.length > 1 ? "s" : ""}`);
      await loadPhotos();

      // Auto-selecionar fotos uploadadas
      const newPhotos: SelectedPhoto[] = uploaded.map((u) => ({
        id: u.id || u.file_path,
        url: u.url || u.file_path,
        label: u.file_name,
      }));
      updateProject({ selectedPhotos: [...selectedPhotos, ...newPhotos] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro no upload", "error");
    } finally {
      setUploadingPhotos(false);
    }
  }, [loadPhotos, orgId, selectedPhotos, updateProject]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handlePhotoUpload(e.dataTransfer.files);
    }
  }, [handlePhotoUpload]);

  // ====== BACKGROUND (IMAGEM DE FUNDO PRÓPRIA) HANDLERS ======

  function handleToggleUseBackground() {
    updateProject({ useCustomBackground: !useCustomBackground });
  }

  function removeBackground(id: string) {
    updateProject({
      selectedBackgrounds: selectedBackgrounds.filter((bg) => bg.id !== id),
    });
  }

  const handleBackgroundUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const supported = fileArray.filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) {
        showToast(`${f.name}: tipo nao suportado`, "error");
        return false;
      }
      return true;
    });

    if (supported.length === 0) return;

    // Auto-redimensionar imagens grandes
    const valid: File[] = [];
    for (const f of supported) {
      try {
        const processed = await optimizeImageForUpload(f, {
          maxBytes: MAX_PHOTO_SIZE,
          maxDimension: 1600,
        });
        valid.push(processed);
      } catch {
        showToast(`${f.name}: erro ao processar`, "error");
      }
    }

    if (valid.length === 0) return;

    setUploadingBackgrounds(true);
    try {
      const uploaded = await Promise.all(
        valid.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("bucket", "expert-photos");
          formData.append("path", orgId);

          const res = await fetch("/api/upload", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return data as { url: string; file_path: string; file_name?: string };
        })
      );

      const existingIds = new Set(selectedBackgrounds.map((bg) => bg.id));
      const novos: SelectedBackground[] = uploaded
        .filter((u) => !existingIds.has(u.file_path))
        .map((u) => ({
          id: u.file_path,
          url: u.url || u.file_path,
          label: u.file_name || u.file_path.split("/").pop() || "Fundo",
          filePath: u.file_path,
        }));

      if (novos.length > 0) {
        updateProject({ selectedBackgrounds: [...selectedBackgrounds, ...novos] });
      }
      showToast(`${uploaded.length} imagem${uploaded.length > 1 ? "ns" : ""} de fundo adicionada${uploaded.length > 1 ? "s" : ""}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro no upload", "error");
    } finally {
      setUploadingBackgrounds(false);
    }
  }, [orgId, selectedBackgrounds, updateProject]);

  // ====== BRAND KIT HANDLERS ======

  function handleSelectBrandKit(kit: BrandKitItem) {
    updateProject({
      brandKitId: kit.id,
      brandKitName: kit.name,
      logoId: null,
      logoUrl: null,
    });
  }

  function handleBrandKitCreated(brandKit: { id: string; name: string }) {
    setShowCreateModal(false);
    showToast("Brand kit criado");
    loadBrandKits();
    updateProject({ brandKitId: brandKit.id, brandKitName: brandKit.name });
  }

  // ====== LOGO HANDLERS ======

  function selectLogo(logo: LogoItem) {
    if (logoId === logo.id) {
      updateProject({ logoId: null, logoUrl: null });
    } else {
      updateProject({ logoId: logo.id, logoUrl: logo.url });
    }
  }

  async function handleLogoUpload(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      showToast("Logo deve ser PNG ou SVG", "error");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      showToast("Logo deve ter no máximo 2MB", "error");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgId", orgId);
      formData.append("label", file.name.replace(/\.[^.]+$/, ""));

      const res = await fetch("/api/logos", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast("Logo adicionado");
      await loadLogos();
      updateProject({ logoId: data.logo.id, logoUrl: data.logo.url });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro no upload", "error");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleLogoDelete(logo: LogoItem) {
    setDeletingLogoId(logo.id);
    try {
      const res = await fetch(`/api/logos/${logo.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (logoId === logo.id) {
        updateProject({ logoId: null, logoUrl: null });
      }
      setLogos((prev) => prev.filter((l) => l.id !== logo.id));
      showToast("Logo removido");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao remover logo", "error");
    } finally {
      setDeletingLogoId(null);
    }
  }

  // Get brand kit logo URL
  const selectedBrandKit = brandKits.find((k) => k.id === brandKitId);

  // Cores do bloco (split-top): paleta do brand kit, deduplicada por hex normalizado.
  // No Zé Coxinha várias cores são o mesmo amarelo (#FBBF24) — só mostramos uma vez.
  const blockColorOptions = (() => {
    const c = selectedBrandKit?.colors;
    if (!c) return [] as { hex: string; label: string }[];
    const candidates: { hex: string | undefined; label: string }[] = [
      { hex: c.primary, label: "Primária" },
      { hex: c.secondary, label: "Secundária" },
      { hex: c.accent, label: "Accent" },
      { hex: c.background, label: "Fundo" },
    ];
    const seen = new Set<string>();
    const out: { hex: string; label: string }[] = [];
    for (const { hex, label } of candidates) {
      if (typeof hex !== "string" || !hex.trim()) continue;
      const norm = hex.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({ hex: hex.trim(), label });
    }
    return out;
  })();

  function toggleBlockColor(hex: string) {
    const norm = hex.toLowerCase();
    const exists = blockColors.some((c) => c.toLowerCase() === norm);
    const next = exists
      ? blockColors.filter((c) => c.toLowerCase() !== norm)
      : [...blockColors, hex];
    updateProject({ blockColors: next });
  }

  return (
    <div className="space-y-8 xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] xl:gap-8 xl:space-y-0">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all",
            toast.type === "success"
              ? "bg-green-900/90 text-green-100"
              : "bg-red-900/90 text-red-100"
          )}
        >
          {toast.message}
        </div>
      )}

      {/* === COLUNA ESQUERDA: FOTOS === */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-text-primary mb-1">Fotos</h3>
          <p className="text-xs text-text-muted">
            Opcional, adicione fotos de pessoas aos criativos
          </p>
        </div>

        {/* Toggle */}
        <button
          onClick={handleToggleUsePhotos}
          className={cn(
            "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
            usePhotos
              ? "border-accent-champagne bg-champagne-alpha-05"
              : "border-border-subtle bg-surface-050 hover:border-border-default"
          )}
        >
          <div
            className={cn(
              "w-10 h-6 rounded-full relative transition-colors flex-shrink-0",
              usePhotos ? "bg-accent-champagne" : "bg-surface-200"
            )}
          >
            <div
              className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                usePhotos ? "left-5" : "left-1"
              )}
            />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-text-primary">Usar fotos de pessoas</p>
            <p className="text-xs text-text-muted">
              {usePhotos
                ? "O expert aparecera nos criativos"
                : "Criativos sem pessoa, foco em design e tipografia"}
            </p>
          </div>
          {usePhotos ? (
            <User className="w-5 h-5 text-accent-champagne ml-auto" />
          ) : (
            <UserX className="w-5 h-5 text-text-muted ml-auto" />
          )}
        </button>

        {usePhotos && (
          <>
            {photosLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            ) : photosError ? (
              <p className="text-sm text-accent-red">{photosError}</p>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2 p-2 rounded-xl transition-all",
                  dragOver && "border-2 border-dashed border-accent-champagne bg-champagne-alpha-05"
                )}
              >
                {photos.map((photo) => {
                  const isSelected = selectedPhotos.some((p) => p.id === photo.id);
                  return (
                    <div key={photo.id} className="group relative">
                      <button
                        onClick={() => togglePhoto(photo)}
                        title={photo.file_name}
                        className={cn(
                          "relative aspect-square w-full rounded-lg overflow-hidden border-2 transition-all",
                          isSelected
                            ? "border-accent-champagne ring-1 ring-accent-champagne"
                            : "border-transparent hover:border-border-default"
                        )}
                      >
                        <img
                          src={photo.url || photo.file_path}
                          alt={photo.file_name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 right-1">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-accent-champagne drop-shadow" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-white/60 drop-shadow" />
                          )}
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                          <p className="text-[9px] text-white truncate leading-tight">{photo.file_name}</p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => deletePhoto(photo, e)}
                        title="Apagar foto da biblioteca"
                        className="absolute top-1 left-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-red"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}

                {/* Upload button */}
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="aspect-square rounded-lg border-2 border-dashed border-border-subtle hover:border-accent-champagne flex flex-col items-center justify-center gap-0.5 transition-all"
                >
                  {uploadingPhotos ? (
                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-text-muted" />
                      <span className="text-[9px] text-text-muted">Subir</span>
                    </>
                  )}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)}
                />
              </div>
            )}

            {selectedPhotos.length > 0 && (
              <p className="text-xs text-text-muted">
                {selectedPhotos.length} foto{selectedPhotos.length > 1 ? "s" : ""} selecionada
                {selectedPhotos.length > 1 ? "s" : ""}
              </p>
            )}

            {/* === AJUSTES DO EXPERT === */}
            {usePhotos && selectedPhotos.length > 0 && (
              <ExpertAdjustmentsSection
                value={expertAdjustments}
                onChange={(next) => updateProject({ expertAdjustments: next })}
              />
            )}
          </>
        )}

        {/* === IMAGEM DE FUNDO (OPCIONAL) === */}
        <div className="border-t border-border-subtle pt-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Imagem de fundo (opcional)</h3>
            <p className="text-xs text-text-muted">
              A foto de fundo é preservada e o texto do template é aplicado por cima.
            </p>
          </div>

          {/* Toggle */}
          <button
            onClick={handleToggleUseBackground}
            className={cn(
              "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
              useCustomBackground
                ? "border-accent-champagne bg-champagne-alpha-05"
                : "border-border-subtle bg-surface-050 hover:border-border-default"
            )}
          >
            <div
              className={cn(
                "w-10 h-6 rounded-full relative transition-colors flex-shrink-0",
                useCustomBackground ? "bg-accent-champagne" : "bg-surface-200"
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  useCustomBackground ? "left-5" : "left-1"
                )}
              />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Usar foto de fundo própria</p>
              <p className="text-xs text-text-muted">
                {useCustomBackground
                  ? "O fundo enviado é mantido e a variação de cenário é ignorada"
                  : "O fundo virá do template e da marca"}
              </p>
            </div>
            <ImageIcon className={cn("w-5 h-5 ml-auto", useCustomBackground ? "text-accent-champagne" : "text-text-muted")} />
          </button>

          {useCustomBackground && (
            <>
              {/* Seletor de layout do fundo próprio */}
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">Layout do fundo</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    {
                      value: "full" as const,
                      title: "Foto ocupa tudo",
                      help: "Foto na tela inteira, texto por cima.",
                    },
                    {
                      value: "split-top" as const,
                      title: "Foto em cima",
                      help: "Foto na metade de cima, bloco de cor embaixo com o texto.",
                    },
                    {
                      value: "split-bottom" as const,
                      title: "Foto embaixo",
                      help: "Foto na metade de baixo, bloco de cor em cima com o texto.",
                    },
                  ]).map((opt) => {
                    const selected = backgroundMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateProject({ backgroundMode: opt.value })}
                        className={cn(
                          "text-left p-3 rounded-xl border transition-all",
                          selected
                            ? "border-accent-champagne bg-champagne-alpha-05"
                            : "border-border-subtle bg-surface-050 hover:border-border-default"
                        )}
                      >
                        <p className={cn(
                          "text-sm font-medium",
                          selected ? "text-accent-champagne" : "text-text-primary"
                        )}>
                          {opt.title}
                        </p>
                        <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{opt.help}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cores do bloco (nos layouts split: foto em cima ou embaixo) */}
              {(backgroundMode === "split-top" || backgroundMode === "split-bottom") && (
                <div>
                  <p className="text-xs font-medium text-text-secondary mb-2">Cor do bloco</p>
                  {blockColorOptions.length === 0 ? (
                    <p className="text-[11px] text-text-muted leading-snug">
                      Selecione um brand kit ao lado para escolher as cores do bloco.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {blockColorOptions.map((opt) => {
                          const selected = blockColors.some(
                            (c) => c.toLowerCase() === opt.hex.toLowerCase()
                          );
                          return (
                            <button
                              key={opt.hex.toLowerCase()}
                              type="button"
                              onClick={() => toggleBlockColor(opt.hex)}
                              title={`${opt.label} (${opt.hex})`}
                              aria-pressed={selected}
                              className={cn(
                                "relative w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center",
                                selected
                                  ? "border-accent-champagne ring-1 ring-accent-champagne"
                                  : "border-border-subtle hover:border-border-default"
                              )}
                              style={{ backgroundColor: opt.hex }}
                            >
                              {selected && (
                                <Check className="w-4 h-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-text-muted mt-2 leading-snug">
                        Escolha uma ou mais cores para o bloco. Com mais de uma, a cor varia entre os criativos (rodízio).
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {selectedBackgrounds.map((bg) => (
                  <div key={bg.id} className="group relative">
                    <div
                      title={bg.label}
                      className="relative aspect-square w-full rounded-lg overflow-hidden border-2 border-accent-champagne ring-1 ring-accent-champagne"
                    >
                      <img
                        src={bg.url}
                        alt={bg.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                        <p className="text-[9px] text-white truncate leading-tight">{bg.label}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeBackground(bg.id)}
                      title="Remover imagem de fundo"
                      className="absolute top-1 left-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent-red"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {/* Upload button */}
                <button
                  onClick={() => backgroundInputRef.current?.click()}
                  disabled={uploadingBackgrounds}
                  className="aspect-square rounded-lg border-2 border-dashed border-border-subtle hover:border-accent-champagne flex flex-col items-center justify-center gap-0.5 transition-all"
                >
                  {uploadingBackgrounds ? (
                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-text-muted" />
                      <span className="text-[9px] text-text-muted">Subir</span>
                    </>
                  )}
                </button>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleBackgroundUpload(e.target.files)}
                />
              </div>

              <p className="text-[10px] text-text-muted">
                Ao ligar o fundo próprio, a variação de cenário entre criativos é ignorada (são mutuamente exclusivos).
              </p>
            </>
          )}
        </div>

        {/* === VARIAR ENTRE OS CRIATIVOS (agrupado com Imagem de fundo) === */}
        {usePhotos && selectedPhotos.length > 0 && (
          <div className="border-t border-border-subtle pt-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary mb-1">Variar entre os criativos</h3>
              <p className="text-xs text-text-muted">
                Cada criativo sai com fundo/cenário, pose e enquadramento diferentes. A roupa só varia se você ligar o toggle dedicado abaixo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (useCustomBackground) return;
                updateProject({ variationEnabled: !variationEnabled });
              }}
              disabled={useCustomBackground}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                useCustomBackground
                  ? "border-border-subtle bg-surface-050 opacity-50 cursor-not-allowed"
                  : variationEnabled
                    ? "border-accent-champagne bg-champagne-alpha-05"
                    : "border-border-subtle bg-surface-050 hover:border-border-default"
              )}
              aria-pressed={variationEnabled && !useCustomBackground}
            >
              <div
                className={cn(
                  "w-10 h-6 rounded-full relative transition-colors flex-shrink-0",
                  variationEnabled && !useCustomBackground ? "bg-accent-champagne" : "bg-surface-200"
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    variationEnabled && !useCustomBackground ? "left-5" : "left-1"
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {variationEnabled && !useCustomBackground ? "Variação ligada" : "Variar entre os criativos"}
                </p>
                <p className="text-xs text-text-muted">
                  O rosto do expert, o layout, as cores da marca e a copy continuam iguais.
                  {selectedPhotos.length === 1 && " Com 1 foto, o rosto é o mesmo e só o entorno muda."}
                </p>
              </div>
            </button>
            {useCustomBackground && (
              <p className="text-[11px] text-accent-champagne leading-snug">
                Desligue a foto de fundo própria para variar o cenário.
              </p>
            )}

            {/* Toggle dedicado: variar a ROUPA. Por padrão a roupa do template é mantida. */}
            <button
              type="button"
              onClick={() => {
                if (useCustomBackground) return;
                updateProject({ varyClothing: !varyClothing });
              }}
              disabled={useCustomBackground}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                useCustomBackground
                  ? "border-border-subtle bg-surface-050 opacity-50 cursor-not-allowed"
                  : varyClothing
                    ? "border-accent-champagne bg-champagne-alpha-05"
                    : "border-border-subtle bg-surface-050 hover:border-border-default"
              )}
              aria-pressed={varyClothing && !useCustomBackground}
            >
              <div
                className={cn(
                  "w-10 h-6 rounded-full relative transition-colors flex-shrink-0",
                  varyClothing && !useCustomBackground ? "bg-accent-champagne" : "bg-surface-200"
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                    varyClothing && !useCustomBackground ? "left-5" : "left-1"
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {varyClothing && !useCustomBackground ? "Roupa variando" : "Variar roupa entre criativos"}
                </p>
                <p className="text-xs text-text-muted">
                  Desligado, a pessoa usa o mesmo tipo de roupa do template em todos os criativos. Ligado, a roupa varia (sempre do mesmo tipo de peça).
                </p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* === COLUNA DIREITA: BRAND KIT + LOGO === */}
      <div className="space-y-8">

      {/* Divider só em telas pequenas (em xl as colunas já se separam) */}
      <div className="border-t border-border-subtle xl:hidden" />

      {/* === BRAND KIT === */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Brand Kit</h3>
            <p className="text-xs text-text-muted">Selecione o brand kit para os criativos</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              brandKits.length === 0
                ? "bg-accent-champagne text-surface-900"
                : "border border-border-subtle text-text-secondary hover:bg-surface-200"
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Criar Brand Kit
          </button>
        </div>

        {brandKitsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : brandKitsError ? (
          <p className="text-sm text-accent-red">{brandKitsError}</p>
        ) : brandKits.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <Palette className="w-8 h-8 text-text-muted mx-auto" />
            <p className="text-sm text-text-muted">Nenhum brand kit cadastrado.</p>
            <p className="text-xs text-text-muted">
              Clique em &quot;Criar Brand Kit&quot; acima para começar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {brandKits.map((kit) => {
              const isSelected = brandKitId === kit.id;
              return (
                <button
                  key={kit.id}
                  onClick={() => handleSelectBrandKit(kit)}
                  className={cn(
                    "flex h-full flex-col justify-between gap-3 rounded-2xl border p-3 text-left transition-all",
                    isSelected
                      ? "border-accent-champagne bg-champagne-alpha-05"
                      : "border-border-subtle bg-surface-050 hover:border-border-default"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{kit.name}</h3>
                    {isSelected ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-accent-champagne" />
                    ) : (
                      <div className="w-5 h-5 flex-shrink-0 rounded-full border-2 border-border-subtle" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        Cores
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(kit.colors)
                          .filter(([, v]) => typeof v === "string" && v.startsWith("#"))
                          .slice(0, 4)
                          .map(([key, color]) => (
                            <div
                              key={key}
                              className="h-4 w-4 rounded-md border border-border-subtle"
                              style={{ backgroundColor: color }}
                              title={`${key}: ${color}`}
                            />
                          ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        Fontes
                      </span>
                      <span className="truncate text-xs text-text-secondary">
                        {getFontFamily(kit.fonts?.heading)} / {getFontFamily(kit.fonts?.body)}
                      </span>
                    </div>

                    {kit.logo_path && (
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-text-muted" />
                        <span className="text-[10px] text-text-muted">Logo configurado</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border-subtle" />

      {/* === LOGO === */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-text-primary mb-1">Logo</h3>
          <p className="text-xs text-text-muted">
            Selecione ou suba um logo para os criativos
          </p>
        </div>

        {/* Toggle logo */}
        <button
          onClick={() => updateProject({ showLogo: !showLogo })}
          className={cn(
            "w-full flex items-center gap-4 p-4 rounded-xl border transition-all",
            showLogo
              ? "border-accent-champagne bg-champagne-alpha-05"
              : "border-border-subtle bg-surface-050 hover:border-border-default"
          )}
        >
          <div
            className={cn(
              "w-10 h-6 rounded-full relative transition-colors flex-shrink-0",
              showLogo ? "bg-accent-champagne" : "bg-surface-200"
            )}
          >
            <div
              className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                showLogo ? "left-5" : "left-1"
              )}
            />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-text-primary">Usar logo no criativo</p>
            <p className="text-xs text-text-muted">
              {showLogo ? "Logo será incluído no criativo" : "Criativo sem logo"}
            </p>
          </div>
          <ImageIcon className={cn("w-5 h-5 ml-auto", showLogo ? "text-accent-champagne" : "text-text-muted")} />
        </button>

        {showLogo && (
          <>
            {logosLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3">
                {/* Brand kit logo (if exists) */}
                {selectedBrandKit?.logo_path && (
                  <button
                    onClick={() => updateProject({ logoId: null, logoUrl: null })}
                    className={cn(
                      "relative aspect-square rounded-xl overflow-hidden border-2 flex items-center justify-center bg-surface-050 transition-all",
                      !logoId
                        ? "border-accent-champagne ring-1 ring-accent-champagne"
                        : "border-transparent hover:border-border-default"
                    )}
                  >
                    <img
                      src={selectedBrandKit.logo_url ?? selectedBrandKit.logo_path}
                      alt="Logo do brand kit"
                      className="w-3/4 h-3/4 object-contain"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-surface-100/80 p-1">
                      <p className="text-[8px] text-text-muted text-center truncate">Brand kit</p>
                    </div>
                  </button>
                )}

                {/* Org logos */}
                {logos.map((logo) => {
                  const isSelected = logoId === logo.id;
                  const isDeleting = deletingLogoId === logo.id;
                  return (
                    <div key={logo.id} className="relative group">
                      <button
                        onClick={() => selectLogo(logo)}
                        disabled={isDeleting}
                        className={cn(
                          "relative aspect-square w-full rounded-xl overflow-hidden border-2 flex items-center justify-center bg-surface-050 transition-all",
                          isSelected
                            ? "border-accent-champagne ring-1 ring-accent-champagne"
                            : "border-transparent hover:border-border-default",
                          isDeleting && "opacity-50"
                        )}
                      >
                        <img
                          src={logo.url || logo.file_path}
                          alt={logo.label || "Logo"}
                          className="w-3/4 h-3/4 object-contain"
                        />
                        {logo.label && (
                          <div className="absolute bottom-0 inset-x-0 bg-surface-100/80 p-1">
                            <p className="text-[8px] text-text-muted text-center truncate">{logo.label}</p>
                          </div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLogoDelete(logo);
                        }}
                        disabled={isDeleting}
                        aria-label="Remover logo"
                        title="Remover logo"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent-red text-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Upload logo button */}
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="aspect-square rounded-xl border-2 border-dashed border-border-subtle hover:border-accent-champagne flex flex-col items-center justify-center gap-1 transition-all"
                >
                  {uploadingLogo ? (
                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-text-muted" />
                      <span className="text-[8px] text-text-muted">Subir logo</span>
                    </>
                  )}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                />
              </div>
            )}

            <p className="text-[10px] text-text-muted">
              Fundo transparente recomendado. PNG ou SVG, máximo 2MB.
            </p>

            {/* Logo status */}
            <p className="text-xs text-text-muted">
              {logoId ? "Logo personalizado" : selectedBrandKit?.logo_path ? "Logo do brand kit" : "Sem logo selecionado"}
            </p>
          </>
        )}
      </div>

      </div>{/* fim coluna direita */}

      {/* Brand Kit Create Modal */}
      {showCreateModal && (
        <BrandKitCreateModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleBrandKitCreated}
        />
      )}
    </div>
  );
}

export const EXPERT_ADJUSTMENT_PRESETS: { id: string; label: string; instruction: string }[] = [
  {
    id: "no-glasses",
    label: "Sem óculos",
    instruction: "Não desenhar óculos na pessoa, mesmo se o template mostrar óculos.",
  },
  {
    id: "no-tie",
    label: "Sem gravata",
    instruction: "Não desenhar gravata, mesmo se o template mostrar gravata.",
  },
  {
    id: "no-beard",
    label: "Sem barba",
    instruction: "Não desenhar barba, mesmo se o template mostrar pessoa com barba.",
  },
  {
    id: "no-hat",
    label: "Sem chapéu ou boné",
    instruction: "Não desenhar chapéu, boné ou qualquer acessório de cabeça.",
  },
  {
    id: "neutral-expression",
    label: "Expressão neutra ou séria",
    instruction: "Manter expressão neutra ou séria. Não fazer a pessoa sorrir, mesmo se o template tiver sorriso.",
  },
  {
    id: "use-expert-clothing",
    label: "Usar roupa das fotos do expert",
    instruction: "Usar a roupa que aparece nas fotos do expert, não a roupa do template. Se o template tem terno mas as fotos mostram camisa social, usar camisa social.",
  },
  {
    id: "preserve-hair",
    label: "Preservar cabelo do expert",
    instruction: "Manter cor, comprimento e estilo do cabelo exatamente como nas fotos do expert. Não trocar pelo cabelo do template.",
  },
  {
    id: "preserve-age",
    label: "Preservar idade real do expert",
    instruction: "Manter a idade aparente do expert das fotos. Não rejuvenescer nem envelhecer.",
  },
  {
    id: "force-brand-colors",
    label: "Forçar paleta da marca",
    instruction: "OBRIGATÓRIO: TODA a paleta visível na arte final (fundo, textos, formas, gradientes, overlays, badges, destaques, sombras coloridas, tints, divisores, ícones decorativos) DEVE estar dentro da paleta de cores da marca configurada no brand kit. JAMAIS use cores do template original — elas servem só pra indicar ONDE vai cada cor, não QUAL. Onde o template usa cor escura/principal → usar Primária da marca. Onde usa cor de destaque → usar Accent. Onde usa cor de fundo → usar Fundo (ou Primária). Onde usa cor clara → manter clara mas dentro da paleta.",
  },
  {
    id: "force-brand-logo",
    label: "Forçar logo da marca",
    instruction: "OBRIGATÓRIO: o ÚNICO logo, selo ou assinatura visual permitido na arte final é o logo da marca anexado. Qualquer outro logo, marca d'água, símbolo de empresa ou assinatura que apareça no template original DEVE SUMIR completamente. Se o template tem logo de outra empresa, REMOVE e substitui pelo logo da marca configurada (mesma posição e tamanho relativo).",
  },
  {
    id: "force-brand-typography",
    label: "Forçar tipografia da marca",
    instruction: "OBRIGATÓRIO: usar APENAS as fontes configuradas no brand kit da marca para todos os textos da arte final. Títulos na fonte de heading da marca, corpo na fonte body da marca. JAMAIS usar a fonte original do template.",
  },
];

interface ExpertAdjustmentsValue {
  presets: string[];
  notes: string;
}

function ExpertAdjustmentsSection({
  value,
  onChange,
}: {
  value: ExpertAdjustmentsValue;
  onChange: (next: ExpertAdjustmentsValue) => void;
}) {
  function togglePreset(id: string) {
    const next = value.presets.includes(id)
      ? value.presets.filter((p) => p !== id)
      : [...value.presets, id];
    onChange({ ...value, presets: next });
  }

  return (
    <div className="mt-6 rounded-xl border border-border-subtle bg-surface-050 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-text-primary">Ajustes do expert</h4>
        <p className="text-[11px] text-text-muted mt-0.5">
          Marque as particularidades do seu expert que não devem ser puxadas do template.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {EXPERT_ADJUSTMENT_PRESETS.map((preset) => {
          const active = value.presets.includes(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => togglePreset(preset.id)}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all",
                active
                  ? "border-accent-champagne/40 bg-champagne-alpha-05 text-text-primary"
                  : "border-border-subtle bg-surface-000 text-text-muted hover:text-text-primary"
              )}
            >
              {active ? (
                <CheckSquare className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent-champagne" />
              ) : (
                <Square className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <span className="leading-snug">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          Particularidades e variação (opcional)
        </label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          placeholder="Ex.: o expert tem sardas, pele clara. Para variar: 'varie o cenário simulando um consultório, cada criativo com um fundo diferente'."
          className="mt-1 w-full resize-none rounded-lg border border-border-subtle bg-surface-000 px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-champagne"
        />
        <p className="mt-1 text-[10px] text-text-muted">
          Dica: peça variação de cenário aqui (ex: &quot;varie o fundo&quot;) e suba várias fotos do expert — cada criativo usará uma foto e um fundo diferente.
        </p>
      </div>
    </div>
  );
}

