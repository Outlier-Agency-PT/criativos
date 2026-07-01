"use client";


import { useMemo, useRef, useState } from "react";
import { Loader2, WandSparkles, X, CheckSquare, Square, Upload, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./portal";

interface EditCreativeModalProps {
  creativeId: string;
  imageUrl: string | null;
  label: string;
  onClose: () => void;
  onSaved: (result: { url: string | null }) => void;
}

// Presets sao { label: nome curto mostrado no botao, instruction: texto longo enviado ao modelo }
const PRESETS: Array<{ label: string; instruction: string }> = [
  {
    label: "Trocar rosto pelo expert do projeto",
    instruction: "Trocar o rosto da pessoa pelo rosto do EXPERT do projeto (face swap usando as fotos do expert ja cadastradas no projeto, sem necessidade de subir foto nova). Substitua INTEGRALMENTE rosto, tracos faciais, pele, cabelo e idade aparente pelos da foto do expert. Mantenha EXATAMENTE: pose, enquadramento, iluminacao, roupa e cenario do criativo atual. Nao copie roupa/fundo da foto do expert.",
  },
  {
    label: "Aplicar cores da marca",
    instruction: "Aplicar a PALETA de cores da marca do projeto: substituir todas as cores visiveis (fundo, textos, formas, gradientes, overlays, badges, destaques) pelas cores do brand kit. JAMAIS usar as cores originais do criativo atual onde elas conflitarem com a paleta da marca.",
  },
  {
    label: "Trocar logo pelo logo da marca",
    instruction: "Trocar o LOGO atual pelo logo oficial da marca do projeto. Remover qualquer outro logo, marca, selo ou simbolo de empresa que apareca na arte. O unico logo permitido e o logo oficial anexado, na mesma posicao e tamanho relativo do logo atual.",
  },
  {
    label: "Aplicar tipografia da marca",
    instruction: "Aplicar a TIPOGRAFIA da marca do projeto: todos os textos devem usar APENAS as fontes configuradas no brand kit (heading e body). Substituir a fonte atual mantendo o mesmo tamanho relativo, alinhamento e hierarquia.",
  },
  {
    label: "Remover logo antigo ou marca residual",
    instruction: "Remover logo antigo ou marca residual",
  },
  {
    label: "Remover textos residuais do template",
    instruction: "Remover textos residuais que sobraram do template",
  },
  {
    label: "Restaurar tipografia do template",
    instruction: "Restaurar a tipografia e o tamanho dos textos do template original",
  },
  {
    label: "Ajustar enquadramento da pessoa",
    instruction: "Ajustar enquadramento e proporcao da pessoa sem mudar o layout",
  },
  {
    label: "Expressao neutra/seria",
    instruction: "Trocar o sorriso por expressao neutra/seria, manter o resto identico",
  },
  {
    label: "Remover marcas/selos estranhos",
    instruction: "Remover qualquer marca, logo, selo ou sigla residual da arte que nao seja o logo oficial da marca anexado",
  },
  {
    label: "Remover CTAs nativos do Meta",
    instruction: 'Remover botoes/CTAs nativos do Facebook/Instagram desenhados na arte (Saiba mais, Quero saber mais, icone de link, swipe up, etc.)',
  },
  {
    label: "Adicionar contorno de botao no CTA",
    instruction: "Adicionar contorno de BOTAO retangular ao redor do CTA principal: borda solida, cantos arredondados sutis, fundo preenchido com a cor de destaque da marca, texto centralizado dentro. Sem ficar igual aos CTAs nativos do Instagram/Facebook.",
  },
  {
    label: "Refazer rosto sem oculos",
    instruction: "Refazer o rosto do expert SEM OCULOS, mantendo identidade facial (tracos, pele, cabelo, idade), mesma pose, mesmo enquadramento, mesma iluminacao, mesma roupa. Se a foto de referencia do expert mostra oculos, ignore isso e desenhe sem.",
  },
];

export function EditCreativeModal({ creativeId, imageUrl, label, onClose, onSaved }: EditCreativeModalProps) {
  const [instruction, setInstruction] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Imagem mostrada no preview â€” comeÃ§a com a original, atualiza apÃ³s cada ediÃ§Ã£o bem-sucedida
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(imageUrl);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Foto de referÃªncia subida sÃ³ pra essa ediÃ§Ã£o (face swap)
  const [referencePhoto, setReferencePhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(
    () => instruction.trim().length > 0 || selectedPresets.length > 0 || referencePhoto !== null,
    [instruction, selectedPresets, referencePhoto]
  );

  function handleReferenceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Foto deve ser PNG, JPG ou WEBP");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Foto muito grande (max 8MB)");
      return;
    }
    if (referencePhoto?.previewUrl) URL.revokeObjectURL(referencePhoto.previewUrl);
    setReferencePhoto({ file, previewUrl: URL.createObjectURL(file) });
    setError(null);
  }

  function clearReferencePhoto() {
    if (referencePhoto?.previewUrl) URL.revokeObjectURL(referencePhoto.previewUrl);
    setReferencePhoto(null);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
  }

  function togglePreset(preset: string) {
    setSelectedPresets((prev) =>
      prev.includes(preset) ? prev.filter((item) => item !== preset) : [...prev, preset]
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSaving(true);
    setError(null);

    try {
      let res: Response;
      if (referencePhoto) {
        // Com foto de referÃªncia: usa FormData (multipart)
        const fd = new FormData();
        if (creativeId) fd.append("creativeId", creativeId);
        fd.append("instruction", instruction);
        fd.append("presets", JSON.stringify(selectedPresets));
        fd.append("referencePhoto", referencePhoto.file);
        res = await fetch("/api/generate/edit-one", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/generate/edit-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creativeId,
            instruction,
            presets: selectedPresets,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao editar imagem");
      }

      // Atualiza o preview com a nova versÃ£o (modal continua aberta pra mais ajustes)
      // Cache-bust pra forÃ§ar o <img> a recarregar mesmo se a URL for igual.
      const newUrl = data.url ? `${data.url}${data.url.includes("?") ? "&" : "?"}v=${Date.now()}` : null;
      setCurrentImageUrl(newUrl);
      setLastSavedAt(Date.now());
      setSelectedPresets([]);
      setInstruction("");
      clearReferencePhoto();
      onSaved({ url: data.url || null });
      // NÃƒO fecha â€” usuÃ¡rio continua editando ou fecha manualmente.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao editar imagem");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-[28px] border border-border-subtle bg-surface-000 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Editar imagem</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface-100 p-2 text-text-muted transition-colors hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.9fr)]">
          {/* Coluna esquerda: imagem no topo (igual layout original) */}
          <div className="border-b border-border-subtle bg-surface-050 p-4 lg:border-b-0 lg:border-r">
            <div className="relative overflow-hidden rounded-[22px] border border-border-subtle bg-surface-000">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={label}
                  className="max-h-[72vh] w-full object-contain"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-text-muted">
                  Preview indisponivel
                </div>
              )}
              {saving && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-000/90 px-4 py-3 text-xs text-text-primary">
                    <Loader2 className="h-5 w-5 animate-spin text-accent-champagne" />
                    Gerando nova versao...
                  </div>
                </div>
              )}
              {lastSavedAt && !saving && (
                <div className="absolute bottom-3 right-3 rounded-full bg-accent-champagne/95 px-3 py-1 text-[10px] font-semibold text-surface-000 shadow-lg">
                  Atualizado
                </div>
              )}
            </div>

            {/* Foto de referÃªncia â€” abaixo da imagem do criativo */}
            <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-000 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Foto de referencia (opcional)</p>
                {referencePhoto && (
                  <button type="button" onClick={clearReferencePhoto} className="text-[10px] text-text-muted hover:text-accent-red">
                    Remover
                  </button>
                )}
              </div>
              {referencePhoto ? (
                <div className="mt-2 flex items-center gap-3">
                  <img src={referencePhoto.previewUrl} alt="Referencia" className="h-16 w-16 rounded-lg border border-border-subtle object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs text-text-primary font-medium">{referencePhoto.file.name}</p>
                    <p className="text-[10px] text-text-muted">Sera usada como identidade facial (face swap), substituindo as fotos do projeto.</p>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="edit-modal-reference-photo-input"
                  className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle bg-surface-050 px-3 py-3 text-xs text-text-muted hover:border-accent-champagne hover:text-text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Upload className="h-4 w-4" />
                  Subir foto pra trocar rosto/identidade
                  <ImageIcon className="h-3 w-3 opacity-50" />
                </label>
              )}
              <input
                id="edit-modal-reference-photo-input"
                ref={referenceInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                onChange={handleReferenceUpload}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Coluna direita: 2 zonas â€” ajustes (scroll), instruÃ§Ã£o tamanho original, aÃ§Ãµes fixas */}
          <div className="flex min-h-0 flex-col">

            {/* Zona 1: ajustes rÃ¡pidos COM SCROLL PRÃ“PRIO */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-3">
              <div className="rounded-2xl border border-border-subtle bg-surface-050 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Ajustes rapidos</p>
                <div className="mt-3 grid gap-2">
                  {PRESETS.map((preset) => {
                    const active = selectedPresets.includes(preset.instruction);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => togglePreset(preset.instruction)}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-all",
                          active
                            ? "border-accent-champagne/40 bg-champagne-alpha-05 text-text-primary"
                            : "border-border-subtle bg-surface-000 text-text-muted hover:text-text-primary"
                        )}
                      >
                        {active ? (
                          <CheckSquare className="h-4 w-4 flex-shrink-0 mt-0.5 text-accent-champagne" />
                        ) : (
                          <Square className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        )}
                        <span className="leading-snug">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Zona 2: instruÃ§Ã£o livre (tamanho original, fixo) */}
            <div className="flex-shrink-0 border-t border-border-subtle px-5 pt-4 pb-3">
              <div className="rounded-2xl border border-border-subtle bg-surface-050 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Instrucao da edicao</p>
                <textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Ex.: remova o logo do topo, mantenha a mesma tipografia do template e ajuste o tamanho do CTA para ficar igual ao original."
                  rows={8}
                  className="mt-3 w-full resize-none rounded-2xl border border-border-subtle bg-surface-000 px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-accent-champagne"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                  O sistema usa a imagem atual como base, o template original como referencia visual e as fotos do expert para preservar identidade.
                </p>
              </div>
              {error && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Zona 3: barra de aÃ§Ã£o FIXA embaixo, sempre visÃ­vel */}
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border-subtle bg-surface-050 px-5 py-3">
              <span className="text-[10px] text-text-muted">
                {selectedPresets.length > 0 && `${selectedPresets.length} ajuste${selectedPresets.length > 1 ? "s" : ""} selecionado${selectedPresets.length > 1 ? "s" : ""}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-surface-100 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-150"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || saving}
                  className="flex items-center gap-2 rounded-xl bg-accent-champagne px-5 py-2.5 text-sm font-semibold text-surface-000 transition-colors hover:bg-accent-champagne/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {saving ? "Editando..." : "Editar imagem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

