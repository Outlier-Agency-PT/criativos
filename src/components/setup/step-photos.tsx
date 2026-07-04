"use client";


import { useState, useCallback } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { optimizeImageForUpload } from "@/lib/client-image-optimization";

interface Photo {
  id: string;
  url: string;
  fileName: string;
}

interface StepPhotosProps {
  orgId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function StepPhotos({ orgId, onComplete, onSkip }: StepPhotosProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    const optimizedFile = await optimizeImageForUpload(file);
    const formData = new FormData();
    formData.append("file", optimizedFile);
    formData.append("bucket", "expert-photos");
    formData.append("path", orgId);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Salvar metadata
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

    return {
      id: metaData.photo.id,
      url: metaData.photo.url || URL.createObjectURL(optimizedFile),
      fileName: metaData.photo.file_name || optimizedFile.name,
    };
  }

  async function handleFiles(files: FileList | File[]) {
    setUploading(true);
    setError(null);
    try {
      const results = await Promise.all(Array.from(files).map(uploadFile));
      setPhotos((prev) => [...prev, ...results]);
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
  }, [orgId]);

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Suba fotos do expert para usar nos criativos. Recomendado: mínimo 3 fotos, ideal 5+.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("photo-input")?.click()}
        className={`flex flex-col items-center justify-center h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          dragOver ? "border-accent-champagne bg-accent-champagne/5" : "border-border-subtle hover:border-accent-champagne/50"
        }`}
      >
        {uploading ? (
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        ) : (
          <>
            <Upload className="w-6 h-6 text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">Arraste fotos ou clique para selecionar</p>
            <p className="text-xs text-text-muted">PNG, JPG, WebP — máx 10MB cada</p>
          </>
        )}
        <input
          id="photo-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
        />
      </div>

      {/* Grid de fotos */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden bg-surface-100">
              <img src={p.url} alt={p.fileName} className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(p.id)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && photos.length < 3 && (
        <p className="text-xs text-amber-400 flex items-center gap-1">
          <ImageIcon className="w-3.5 h-3.5" />
          Recomendamos pelo menos 3 fotos para melhores resultados
        </p>
      )}

      {error && <p className="text-sm text-accent-red">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onComplete} disabled={photos.length === 0} className="flex-1 px-4 py-2.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90 disabled:opacity-50">
          Continuar com {photos.length} foto{photos.length !== 1 ? "s" : ""}
        </button>
        <button onClick={onSkip} className="px-4 py-2.5 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200">
          Pular
        </button>
      </div>
    </div>
  );
}

