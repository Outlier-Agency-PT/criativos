"use client";


import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import {
  Loader2,
  Upload,
  Trash2,
  Plus,
  Camera,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  is_active: boolean;
  created_at: string;
  url: string;
}

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_DIMENSION = 2048;

async function resizeIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_PHOTO_SIZE) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size > MAX_PHOTO_SIZE && quality > 0.4) {
              quality -= 0.1;
              tryCompress();
              return;
            }
            const jpgName = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], jpgName, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error("Erro ao processar imagem"));
    img.src = URL.createObjectURL(file);
  });
}

export default function FotosPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Init org
  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (membership) setOrgId(membership.org_id);
    }
    init();
  }, []);

  // Fetch photos
  const fetchPhotos = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/photos?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotos(data.photos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fotos");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchPhotos();
  }, [orgId, fetchPhotos]);

  // Upload
  async function handleUpload(files: FileList | File[]) {
    if (!orgId) return;
    const fileArray = Array.from(files);
    const supported = fileArray.filter((f) => {
      if (!PHOTO_TYPES.includes(f.type)) {
        showToast(`${f.name}: tipo nao suportado`, "error");
        return false;
      }
      return true;
    });
    if (supported.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      let count = 0;
      for (const file of supported) {
        const processed = await resizeIfNeeded(file);

        const formData = new FormData();
        formData.append("file", processed);
        formData.append("bucket", "expert-photos");
        formData.append("path", orgId);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error);

        const dbRes = await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_id: orgId,
            file_path: uploadData.file_path,
            file_name: uploadData.file_name,
            mime_type: uploadData.mime_type,
            is_active: true,
          }),
        });
        const dbData = await dbRes.json();
        if (!dbRes.ok) throw new Error(dbData.error);
        count++;
      }
      showToast(`${count} foto${count > 1 ? "s" : ""} adicionada${count > 1 ? "s" : ""}`);
      await fetchPhotos();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro no upload", "error");
    } finally {
      setUploading(false);
    }
  }

  // Delete
  async function handleDelete(id: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/photos?id=${id}&orgId=${orgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setDeleteConfirm(null);
      showToast("Foto excluida");
      await fetchPhotos();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Erro ao excluir", "error");
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  if (!orgId && !loading) {
    return (
      <div className="text-center py-24 text-text-muted text-sm">
        Organizacao nao encontrada. Faca login novamente.
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg",
            toast.type === "success" ? "bg-green-900/90 text-green-100" : "bg-red-900/90 text-red-100"
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Camera className="w-7 h-7 text-accent-champagne" />
            Fotos Expert
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Banco de fotos para usar nos criativos. {photos.length} foto{photos.length !== 1 ? "s" : ""} cadastrada{photos.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-champagne text-surface-900 text-sm font-semibold hover:bg-accent-champagne/90 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {uploading ? "Subindo..." : "Subir fotos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
      </div>

      {error && <p className="text-sm text-accent-red">{error}</p>}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
        </div>
      ) : photos.length === 0 ? (
        /* Empty state with drag & drop */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files); }}
          className={cn(
            "flex flex-col items-center justify-center py-24 rounded-2xl border-2 border-dashed transition-all",
            dragOver ? "border-accent-champagne bg-champagne-alpha-05" : "border-border-subtle"
          )}
        >
          <Upload className="w-12 h-12 text-text-muted mb-4" />
          <p className="text-lg font-semibold text-text-primary mb-1">Nenhuma foto cadastrada</p>
          <p className="text-sm text-text-muted mb-4">Arraste fotos aqui ou clique no botao acima</p>
          <p className="text-xs text-text-muted">PNG, JPEG ou WebP. Fotos grandes sao redimensionadas automaticamente.</p>
        </div>
      ) : (
        /* Photo grid with drag & drop */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files); }}
          className={cn(
            "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 rounded-2xl p-2 transition-all",
            dragOver && "border-2 border-dashed border-accent-champagne bg-champagne-alpha-05"
          )}
        >
          {photos.map((photo) => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden border border-border-subtle bg-surface-050 transition-all hover:border-border-default">
              {/* Image */}
              <button
                onClick={() => setPreviewPhoto(photo)}
                className="w-full aspect-square overflow-hidden cursor-pointer"
              >
                <img
                  src={photo.url}
                  alt={photo.file_name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              </button>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* Actions overlay */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setPreviewPhoto(photo)}
                  className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                  title="Ver"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {deleteConfirm === photo.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(photo.id)}
                      className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-medium hover:bg-red-700"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 rounded-lg bg-black/50 text-white text-[10px] hover:bg-black/70"
                    >
                      Nao
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(photo.id)}
                    className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-600 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Info */}
              <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[11px] text-white font-medium truncate">{photo.file_name}</p>
                <p className="text-[10px] text-white/60">{formatDate(photo.created_at)}</p>
              </div>
            </div>
          ))}

          {/* Upload card */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-xl border-2 border-dashed border-border-subtle hover:border-accent-champagne flex flex-col items-center justify-center gap-2 transition-all"
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
            ) : (
              <>
                <Plus className="w-6 h-6 text-text-muted" />
                <span className="text-xs text-text-muted">Subir foto</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-12 right-0 p-2 rounded-lg text-white/70 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewPhoto.url}
              alt={previewPhoto.file_name}
              className="w-full h-full object-contain rounded-xl"
            />
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">{previewPhoto.file_name}</p>
                <p className="text-xs text-white/50">
                  {formatDate(previewPhoto.created_at)}
                  {previewPhoto.width && previewPhoto.height && ` | ${previewPhoto.width}x${previewPhoto.height}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setDeleteConfirm(null);
                  handleDelete(previewPhoto.id);
                  setPreviewPhoto(null);
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 text-xs hover:bg-red-600/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

