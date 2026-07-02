"use client";


import { useState, useEffect, useCallback } from "react";
import { optimizeImageForUpload } from "@/lib/client-image-optimization";
import {
  Loader2,
  Upload,
  X,
  ImageIcon,
  Eye,
  EyeOff,
} from "lucide-react";

interface Photo {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  is_active: boolean;
  url: string;
  created_at: string;
}

interface TabPhotosProps {
  orgId: string;
}

export function TabPhotos({ orgId }: TabPhotosProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/photos?orgId=${orgId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotos(data.photos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar fotos");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  async function uploadFile(file: File) {
    const optimizedFile = await optimizeImageForUpload(file);
    const formData = new FormData();
    formData.append("file", optimizedFile);
    formData.append("bucket", "expert-photos");
    formData.append("path", orgId);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const metaRes = await fetch("/api/photos", {
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
    const metaData = await metaRes.json();
    if (!metaRes.ok) throw new Error(metaData.error);
  }

  async function handleFiles(files: FileList | File[]) {
    setUploading(true);
    setError(null);
    try {
      await Promise.all(Array.from(files).map(uploadFile));
      await fetchPhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function toggleActive(photo: Photo) {
    try {
      const res = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id, is_active: !photo.is_active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchPhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar foto");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/photos?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      await fetchPhotos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar foto");
    }
  }

  const activeCount = photos.filter((p) => p.is_active !== false).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-text-muted" />
        <span className="text-sm text-text-secondary">
          {activeCount} foto{activeCount !== 1 ? "s" : ""} ativa{activeCount !== 1 ? "s" : ""}
          {photos.length > activeCount && ` (${photos.length - activeCount} inativa${photos.length - activeCount !== 1 ? "s" : ""})`}
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("settings-photo-input")?.click()}
        className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          dragOver ? "border-accent-champagne bg-accent-champagne/5" : "border-border-subtle hover:border-accent-champagne/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        ) : (
          <>
            <Upload className="w-6 h-6 text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">Arraste fotos ou clique para selecionar</p>
            <p className="text-xs text-text-muted">PNG, JPG, WebP</p>
          </>
        )}
        <input
          id="settings-photo-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>

      {/* Grade de fotos */}
      {photos.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          Nenhuma foto enviada ainda.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className={`relative group aspect-square rounded-lg overflow-hidden bg-surface-100 border ${
                photo.is_active !== false ? "border-border-subtle" : "border-red-500/30 opacity-60"
              }`}
            >
              <img
                src={photo.url}
                alt={photo.file_name}
                className="w-full h-full object-cover"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(photo); }}
                  className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                  title={photo.is_active !== false ? "Desativar" : "Reativar"}
                >
                  {photo.is_active !== false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                  className="p-1.5 rounded-full bg-black/60 text-white hover:bg-red-500/80"
                  title="eliminar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Status badge */}
              {photo.is_active === false && (
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] bg-red-500/80 text-white">
                  Inativa
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

