import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * POST /api/projects/save-progress
 * Cria ou atualiza um projeto incrementalmente.
 * Chamado a cada mudanÃ§a de step no wizard para persistir progresso.
 *
 * Se projectId fornecido: atualiza o projeto existente.
 * Se nÃ£o: cria novo projeto com status 'incomplete'.
 */
export async function POST(request: NextRequest) {
  try {
    const RESULT_STEP = 4;
    const body = await request.json();
    const {
      projectId,
      projectName,
      personaId,
      brandKitId,
      format,
      selectedFormats,
      showLogo,
      selectedTemplates,
      copies,
      selectedPhotos,
      chatHistory,
      currentStep,
      preferredModel,
      expertAdjustments,
      copyPattern,
      activeCopyFields,
      useCustomBackground,
      backgroundMode,
      selectedBackgrounds,
      blockColors,
      variationEnabled,
      varyClothing,
    } = body;

    const { orgId, supabase } = await requireAuth();

    // Determinar status baseado no progresso
    const progressStatus = currentStep >= RESULT_STEP ? "complete" : "incomplete";

    if (projectId) {
      // --- ATUALIZAR projeto existente ---

      // Verificar propriedade
      const { data: existing } = await supabase
        .from("criativos_generation_projects")
        .select("id, org_id, status")
        .eq("id", projectId)
        .eq("org_id", orgId)
        .single();

      if (!existing) {
        return NextResponse.json({ error: "Projeto nÃ£o encontrado" }, { status: 404 });
      }

      // NÃ£o atualizar projetos jÃ¡ completos
      if (existing.status === "complete") {
        return NextResponse.json({ projectId, status: "complete" });
      }

      const shouldPreserveExistingStatus = ["generating", "completed", "complete", "partial", "error"].includes(
        existing.status || ""
      );
      const resolvedStatus = shouldPreserveExistingStatus ? existing.status : progressStatus;

      // Atualizar dados do projeto
      // (current_step e preferred_model: colunas pendentes de migration â€” escritas omitidas pra evitar 500)
      void currentStep;
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        status: resolvedStatus,
      };

      if (projectName !== undefined) updateData.name = projectName || `Projeto ${new Date().toLocaleDateString("pt-BR")}`;
      if (personaId !== undefined) updateData.persona_id = personaId || null;
      if (brandKitId !== undefined) updateData.brand_kit_id = brandKitId || null;
      if (format) {
        updateData.format = typeof format.label === "string" ? format.label : `${format.width}x${format.height}`;
        updateData.width = format.width;
        updateData.height = format.height;
      }
      if (Array.isArray(selectedFormats)) {
        updateData.selected_formats = selectedFormats.length > 0
          ? selectedFormats
          : format
            ? [{ width: format.width, height: format.height, label: format.label || `${format.width}x${format.height}` }]
            : null;
      }
      if (showLogo !== undefined) updateData.show_logo = showLogo;
      if (chatHistory !== undefined) updateData.chat_history = chatHistory?.length ? chatHistory : null;
      if (expertAdjustments !== undefined) {
        updateData.expert_adjustments = {
          presets: Array.isArray(expertAdjustments?.presets) ? expertAdjustments.presets : [],
          notes: typeof expertAdjustments?.notes === "string" ? expertAdjustments.notes : "",
        };
      }
      // BLOCO A/B â€” padrÃ£o de copy + campos ativos (nÃ­vel projeto)
      if (copyPattern === "estatico" || copyPattern === "mini_copy") {
        updateData.copy_pattern = copyPattern;
      }
      if (Array.isArray(activeCopyFields)) {
        updateData.active_copy_fields = activeCopyFields;
      }
      if (useCustomBackground !== undefined) updateData.use_custom_background = useCustomBackground === true;
      if (backgroundMode === "full" || backgroundMode === "split-top" || backgroundMode === "split-bottom") updateData.background_mode = backgroundMode;
      if (Array.isArray(blockColors)) {
        updateData.block_colors = blockColors.filter((c) => typeof c === "string");
      }
      if (variationEnabled !== undefined) updateData.variation_enabled = variationEnabled === true;
      if (varyClothing !== undefined) updateData.vary_clothing = varyClothing === true;
      void preferredModel;

      await supabase
        .from("criativos_generation_projects")
        .update(updateData)
        .eq("id", projectId);

      // Atualizar templates (delete + insert)
      if (selectedTemplates !== undefined) {
        await supabase
          .from("criativos_project_templates")
          .delete()
          .eq("project_id", projectId);

        if (selectedTemplates.length > 0) {
          await supabase
            .from("criativos_project_templates")
            .insert(
              selectedTemplates.map((t: { id: string }, i: number) => ({
                project_id: projectId,
                template_id: t.id,
                sort_order: i,
              }))
            );
        }
      }

      // Atualizar copies (delete + insert)
      if (copies !== undefined) {
        await supabase
          .from("criativos_project_copies")
          .delete()
          .eq("project_id", projectId);

        if (copies.length > 0) {
          await supabase
            .from("criativos_project_copies")
            .insert(
              copies.map(
                (c: { id?: string; content: Record<string, string>; source: string }, i: number) => ({
                  id: c.id,
                  project_id: projectId,
                  content: c.content,
                  source: c.source || "manual",
                  sort_order: i,
                })
              )
            );
        }
      }

      // Atualizar fotos (delete + insert, com dedupe por photo_id)
      if (selectedPhotos !== undefined) {
        await supabase
          .from("criativos_project_photos")
          .delete()
          .eq("project_id", projectId);

        if (selectedPhotos.length > 0) {
          const seen = new Set<string>();
          const uniquePhotos = (selectedPhotos as Array<{ id: string }>).filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
          await supabase
            .from("criativos_project_photos")
            .insert(
              uniquePhotos.map((p, i) => ({
                project_id: projectId,
                photo_id: p.id,
                sort_order: i,
              }))
            );
        }
      }

      // Atualizar fundos prÃ³prios (delete + insert, com dedupe por file_path)
      if (selectedBackgrounds !== undefined) {
        await supabase
          .from("criativos_project_backgrounds")
          .delete()
          .eq("project_id", projectId);

        const rows = buildBackgroundRows(selectedBackgrounds, projectId);
        if (rows.length > 0) {
          await supabase.from("criativos_project_backgrounds").insert(rows);
        }
      }

      return NextResponse.json({ projectId, status: resolvedStatus });
    }

    // --- CRIAR novo projeto ---
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .insert({
        org_id: orgId,
        persona_id: personaId || null,
        brand_kit_id: brandKitId || null,
        name: projectName || `Projeto ${new Date().toLocaleDateString("pt-BR")}`,
        format: format?.label || `${format?.width || 1080}x${format?.height || 1350}`,
        width: format?.width || 1080,
        height: format?.height || 1350,
        selected_formats: Array.isArray(selectedFormats) && selectedFormats.length > 0
          ? selectedFormats
          : [{ width: format?.width || 1080, height: format?.height || 1350, label: format?.label || `${format?.width || 1080}x${format?.height || 1350}` }],
        show_logo: showLogo ?? false,
        use_custom_background: useCustomBackground === true,
        background_mode: backgroundMode === "split-top" || backgroundMode === "split-bottom" ? backgroundMode : "full",
        block_colors: Array.isArray(blockColors) ? blockColors.filter((c) => typeof c === "string") : [],
        variation_enabled: variationEnabled === true,
        vary_clothing: varyClothing === true,
        status: progressStatus,
        chat_history: chatHistory?.length ? chatHistory : null,
        expert_adjustments: expertAdjustments
          ? {
              presets: Array.isArray(expertAdjustments?.presets) ? expertAdjustments.presets : [],
              notes: typeof expertAdjustments?.notes === "string" ? expertAdjustments.notes : "",
            }
          : {},
        copy_pattern: copyPattern === "mini_copy" ? "mini_copy" : "estatico",
        active_copy_fields: Array.isArray(activeCopyFields) ? activeCopyFields : null,
      })
      .select("id")
      .single();

    if (projError || !project) {
      return NextResponse.json(
        { error: `Erro ao criar projeto: ${projError?.message}` },
        { status: 500 }
      );
    }

    const newProjectId = project.id;

    // Inserir templates
    if (selectedTemplates?.length) {
      await supabase
        .from("criativos_project_templates")
        .insert(
          selectedTemplates.map((t: { id: string }, i: number) => ({
            project_id: newProjectId,
            template_id: t.id,
            sort_order: i,
          }))
        );
    }

    // Inserir copies
    if (copies?.length) {
      await supabase
        .from("criativos_project_copies")
        .insert(
          copies.map(
            (c: { id?: string; content: Record<string, string>; source: string }, i: number) => ({
              id: c.id,
              project_id: newProjectId,
              content: c.content,
              source: c.source || "manual",
              sort_order: i,
            })
          )
        );
    }

    // Inserir fotos
    if (selectedPhotos?.length) {
      await supabase
        .from("criativos_project_photos")
        .insert(
          selectedPhotos.map((p: { id: string }, i: number) => ({
            project_id: newProjectId,
            photo_id: p.id,
            sort_order: i,
          }))
        );
    }

    // Inserir fundos prÃ³prios (dedupe por file_path)
    const newBackgroundRows = buildBackgroundRows(selectedBackgrounds, newProjectId);
    if (newBackgroundRows.length > 0) {
      await supabase.from("criativos_project_backgrounds").insert(newBackgroundRows);
    }

    return NextResponse.json({ projectId: newProjectId, status: progressStatus }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * Monta as linhas de criativos_project_backgrounds a partir do estado do wizard.
 * Dedupe por file_path (espelha o tratamento de fotos por id). Ignora itens sem filePath.
 */
function buildBackgroundRows(
  selectedBackgrounds: unknown,
  projectId: string
): Array<{ project_id: string; file_path: string; file_name: string | null; sort_order: number }> {
  if (!Array.isArray(selectedBackgrounds)) return [];
  const seen = new Set<string>();
  const rows: Array<{ project_id: string; file_path: string; file_name: string | null; sort_order: number }> = [];
  for (const raw of selectedBackgrounds as Array<{ filePath?: string; label?: string }>) {
    const filePath = typeof raw?.filePath === "string" ? raw.filePath : "";
    if (!filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    rows.push({
      project_id: projectId,
      file_path: filePath,
      file_name: typeof raw?.label === "string" ? raw.label : null,
      sort_order: rows.length,
    });
  }
  return rows;
}

