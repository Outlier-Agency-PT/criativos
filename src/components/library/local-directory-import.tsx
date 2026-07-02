"use client";


import { useState } from "react";
import {
  FolderSearch,
  Loader2,
  CheckSquare,
  Square,
  FileText,
  AlertCircle,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LocalFile {
  name: string;
  content: string;
  path: string;
  relativePath?: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface LocalDirectoryImportProps {
  orgId: string;
  campaigns: Campaign[];
  onImportComplete: () => void;
}

export function LocalDirectoryImport({
  orgId,
  campaigns,
  onImportComplete,
}: LocalDirectoryImportProps) {
  const [directoryPath, setDirectoryPath] = useState("");
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  async function handleFetchFiles() {
    if (!directoryPath.trim()) return;
    setFetching(true);
    setError(null);
    setFiles([]);
    setSelected(new Set());
    setSuccessCount(0);

    try {
      const res = await fetch("/api/copy-library/import-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directoryPath: directoryPath.trim(), orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao buscar ficheiros");

      setFiles(data.files || []);
      // Select all by default
      setSelected(new Set((data.files || []).map((_: LocalFile, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar ficheiros");
    } finally {
      setFetching(false);
    }
  }

  function toggleFile(index: number) {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((_, i) => i)));
    }
  }

  async function handleImport() {
    const selectedFiles = files.filter((_, i) => selected.has(i));
    if (selectedFiles.length === 0) return;

    setImporting(true);
    setError(null);
    setProgress({ current: 0, total: selectedFiles.length });

    let imported = 0;
    let errors = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress({ current: i + 1, total: selectedFiles.length });

      try {
        // Step 1: Analyze text with AI
        const analyzeRes = await fetch("/api/copy-library/analyze-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: file.content, orgId }),
        });

        if (!analyzeRes.ok) {
          errors++;
          continue;
        }

        const analyzeData = await analyzeRes.json();
        const copies: Array<{
          headline: string;
          mini_copy: string;
          list_items: string;
          cta: string;
          body: string;
        }> = analyzeData.copies || [];

        // Step 2: Save each copy to the library
        for (const copy of copies) {
          try {
            await fetch("/api/copy-library", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orgId,
                headline: copy.headline,
                mini_copy: copy.mini_copy,
                list_items: copy.list_items,
                cta: copy.cta,
                body: copy.body || null,
                source: "local-import",
                campaign_id: campaignId || null,
                tags: ["importado"],
              }),
            });
            imported++;
          } catch {
            errors++;
          }
        }
      } catch {
        errors++;
      }
    }

    setImporting(false);
    setSuccessCount(imported);

    if (imported > 0) {
      onImportComplete();
    }

    if (errors > 0 && imported === 0) {
      setError("Nenhuma copy foi importada. Verifique o conteúdo dos ficheiros.");
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-050 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle bg-surface-100">
        <HardDrive className="w-4 h-4 text-accent-champagne" />
        <h3 className="text-sm font-medium text-text-primary">
          Importar de Diretorio Local
        </h3>
        <span className="ml-auto text-[10px] text-text-muted px-2 py-0.5 rounded-full bg-accent-champagne/10 text-accent-champagne border border-accent-champagne/20">
          dev only
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Directory path input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={directoryPath}
            onChange={(e) => setDirectoryPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFetchFiles();
            }}
            placeholder="/caminho/para/diretorio/com/copies"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface-000 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-champagne"
            disabled={fetching || importing}
          />
          <button
            onClick={handleFetchFiles}
            disabled={fetching || importing || !directoryPath.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50 hover:bg-accent-champagne/90 transition-colors whitespace-nowrap"
          >
            {fetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderSearch className="w-4 h-4" />
            )}
            Buscar ficheiros
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20">
            <AlertCircle className="w-4 h-4 text-accent-red flex-shrink-0 mt-0.5" />
            <p className="text-xs text-accent-red">{error}</p>
          </div>
        )}

        {/* Success message */}
        {successCount > 0 && !importing && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-green/10 border border-accent-green/20">
            <CheckSquare className="w-4 h-4 text-accent-green flex-shrink-0" />
            <p className="text-xs text-accent-green">
              {successCount} cop{successCount !== 1 ? "ies" : "y"} importada
              {successCount !== 1 ? "s" : ""} com sucesso!
            </p>
          </div>
        )}

        {/* Progress */}
        {importing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Processando ficheiros com IA...
              </span>
              <span>
                {progress.current} de {progress.total}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-surface-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-champagne transition-all duration-300"
                style={{
                  width: `${
                    progress.total > 0
                      ? (progress.current / progress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        {files.length > 0 && !importing && (
          <>
            {/* Campaign selector + select all */}
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-surface-000 text-text-primary"
              >
                <option value="">Sem campanha</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={toggleAll}
                className="text-xs text-accent-champagne hover:underline"
              >
                {selected.size === files.length
                  ? "Desselecionar todos"
                  : "Selecionar todos"}
              </button>
              <span className="ml-auto text-xs text-text-muted">
                {files.length} ficheiro{files.length !== 1 ? "s" : ""} encontrado
                {files.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Files */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((file, i) => (
                <button
                  key={i}
                  onClick={() => toggleFile(i)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3",
                    selected.has(i)
                      ? "border-accent-champagne/40 bg-champagne-alpha-05"
                      : "border-border-subtle bg-surface-000 hover:border-border-default"
                  )}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {selected.has(i) ? (
                      <CheckSquare className="w-4 h-4 text-accent-champagne" />
                    ) : (
                      <Square className="w-4 h-4 text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                      <span className="text-xs font-medium text-text-primary truncate">
                        {file.relativePath || file.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted mt-1 line-clamp-2">
                      {file.content.slice(0, 150).replace(/\n/g, " ")}
                      {file.content.length > 150 ? "..." : ""}
                    </p>
                    <span className="text-[10px] text-text-muted mt-0.5 block">
                      {(file.content.length / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Import button */}
            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={selected.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent-champagne text-surface-900 disabled:opacity-50 hover:bg-accent-champagne/90 transition-colors"
              >
                Importar selecionados ({selected.size})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

