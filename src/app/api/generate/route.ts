import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";
import { getCreditBalance } from "@/lib/usage";

export const maxDuration = 60;

/**
 * POST /api/generate
 * PREPARA criativos para geração — NÃO gera em background.
 * Frontend chama /api/generate/one para cada criativo individualmente.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      projectId,
      generationMode: requestedMode,
      selectedCopyIds,
      selectedCopyIndexes,
    }: {
      projectId?: string;
      generationMode?: "matrix" | "per_copy";
      selectedCopyIds?: string[];
      selectedCopyIndexes?: number[];
    } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
    }

    const { orgId, supabase: authSupabase } = await requireAuth();

    // Verificar ownership do projeto com client autenticado (RLS)
    const { data: projectCheck } = await authSupabase
      .from("criativos_generation_projects")
      .select("id")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (!projectCheck) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    // Service key para operações internas
    const supabase = await createServiceSupabase();

    // Buscar projeto completo
    const { data: project, error: projError } = await supabase
      .from("criativos_generation_projects")
      .select("*, persona:criativos_personas(*), brand_kit:criativos_brand_kits(*)")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (projError || !project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    // Buscar templates, copies e fotos
    const [templatesRes, copiesRes, photosRes] = await Promise.all([
      supabase.from("criativos_project_templates").select("*, template:criativos_templates(*)").eq("project_id", projectId).order("sort_order"),
      supabase.from("criativos_project_copies").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("criativos_project_photos").select("*, photo:criativos_expert_photos(*)").eq("project_id", projectId).order("sort_order"),
    ]);

    const templates = templatesRes.data ?? [];
    const allCopies = copiesRes.data ?? [];
    const selectedCopiesById = selectedCopyIds?.length
      ? allCopies.filter((copy) => selectedCopyIds.includes(copy.id))
      : [];
    const selectedCopiesByIndex = selectedCopyIndexes?.length
      ? allCopies.filter((_, index) => selectedCopyIndexes.includes(index))
      : [];
    const hasExplicitSelection = Boolean(selectedCopyIds?.length || selectedCopyIndexes?.length);
    const expectedSelectionCount = selectedCopyIds?.length ?? selectedCopyIndexes?.length ?? 0;
    const copies = !hasExplicitSelection
      ? allCopies
      : selectedCopiesById.length === expectedSelectionCount
        ? selectedCopiesById
        : selectedCopiesByIndex.length === expectedSelectionCount
          ? selectedCopiesByIndex
          : selectedCopiesById.length > 0
            ? selectedCopiesById
            : selectedCopiesByIndex;
    const photos = photosRes.data ?? [];

    if (!copies.length) {
      return NextResponse.json(
        { error: "Projeto precisa de pelo menos 1 copy" },
        { status: 400 }
      );
    }

    // NÃO apagar criativos anteriores. Re-gerar ACUMULA os novos junto dos antigos
    // — o usuário não perde (nem paga 2x por) trabalho já gerado. Para remover,
    // ele apaga manualmente os criativos que não quer.
    // (Antes: este bloco deletava TODOS os criativos do projeto a cada geração.)

    // EP08: Validar limite de 14 imagens de referência
    const totalRefs = templates.length + photos.length + (project.show_logo && project.brand_kit?.logo_path ? 1 : 0);
    if (totalRefs > 14) {
      return NextResponse.json(
        { error: `Máximo de 14 referências. Atual: ${totalRefs}. Reduza templates ou fotos.` },
        { status: 400 }
      );
    }

    // Modo de geração: "per_copy" ou "matrix" (templates × copies)
    const generationMode = requestedMode === "matrix" || requestedMode === "per_copy"
      ? requestedMode
      : templates.length > 1 ? "matrix" : "per_copy";

    // Formatos selecionados pelo usuário (1+ tamanhos). Fallback: formato único do projeto.
    type FormatSpec = { width: number; height: number; label: string };
    const rawFormats = Array.isArray(project.selected_formats) ? project.selected_formats : null;
    const formats: FormatSpec[] = (rawFormats && rawFormats.length > 0
      ? rawFormats
      : [{ width: project.width, height: project.height, label: project.format }]
    ).map((f: { width: number; height: number; label?: string }) => ({
      width: f.width,
      height: f.height,
      label: f.label || `${f.width}x${f.height}`,
    }));

    type CreativeRow = {
      project_id: string;
      copy_id: string;
      template_id?: string;
      status: string;
      width: number;
      height: number;
      format_label: string;
    };
    let creativesToGenerate: CreativeRow[] = [];

    if (generationMode === "matrix" && templates.length > 0) {
      for (const tmpl of templates) {
        for (const copy of copies) {
          for (const fmt of formats) {
            creativesToGenerate.push({
              project_id: projectId,
              copy_id: copy.id,
              template_id: tmpl.template_id,
              status: "pending",
              width: fmt.width,
              height: fmt.height,
              format_label: fmt.label,
            });
          }
        }
      }
    } else {
      for (const copy of copies) {
        for (const fmt of formats) {
          creativesToGenerate.push({
            project_id: projectId,
            copy_id: copy.id,
            status: "pending",
            width: fmt.width,
            height: fmt.height,
            format_label: fmt.label,
          });
        }
      }
    }

    // EP-14.05: gate de batch (UX / fail-fast). Antes de enfileirar os N creatives,
    // checa o saldo de créditos da org e cria APENAS os que cabem no saldo (geração
    // parcial). Isto evita enfileirar dezenas de jobs que estourariam no crédito 1 e
    // acumulariam creatives órfãos em status error (CON-007: este endpoint só faz
    // INSERT, nunca delete; o corte é por criar MENOS, não por apagar).
    //
    // Decisão travada:
    //   credit_balance IS NULL (ilimitada) -> bypassa, cria todos N.
    //   credit_balance >= N               -> cria todos N.
    //   0 < credit_balance < N            -> cria apenas credit_balance creatives, partial=true.
    //   credit_balance == 0               -> 429, cria 0 creatives.
    //
    // NÃO debita aqui. O débito acontece no /api/generate/one quando cada criativo
    // de fato gera, via RPC atômica decrement_credit (EP-14.04), que continua sendo o
    // ponto de verdade final sob concorrência. Este gate é só UX/fail-fast.
    const requested = creativesToGenerate.length;
    const creditBalance = await getCreditBalance(supabase, orgId);

    let partial = false;
    let reason = "ok";

    if (creditBalance !== null) {
      if (creditBalance <= 0) {
        return NextResponse.json(
          {
            error: "Saldo de créditos esgotado, recarregue.",
            enqueued: 0,
            requested,
            partial: false,
            reason: "no_credits",
            creditBalance,
          },
          { status: 429 }
        );
      }
      if (creditBalance < requested) {
        // Trunca a lista para caber no saldo. A lista já está montada na ordem de
        // geração (templates x copies x formatos); cortar pelo início preserva a
        // prioridade de enfileiramento e cria só os primeiros credit_balance itens.
        creativesToGenerate = creativesToGenerate.slice(0, creditBalance);
        partial = true;
        reason = "partial_credits";
      }
    }

    const { data: creatives, error: insertError } = await supabase
      .from("criativos_creatives")
      .insert(creativesToGenerate)
      .select("id");

    if (insertError) {
      return NextResponse.json({ error: `Falha ao criar criativos: ${insertError.message}` }, { status: 500 });
    }

    // total_creatives = total acumulado no projeto (não só os novos desta rodada)
    const { count: totalCount } = await supabase
      .from("criativos_creatives")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    await supabase
      .from("criativos_generation_projects")
      .update({ status: "generating", total_creatives: totalCount ?? creatives!.length })
      .eq("id", projectId);

    // Retorna lista de IDs para o frontend gerar 1 por vez.
    // Contrato EP-14.05: enqueued/requested/partial/reason indicam geração parcial
    // (saldo insuficiente para todos os solicitados). Campos legados (total,
    // creativeIds) preservados para não quebrar o frontend que já consome este endpoint.
    const enqueued = creatives!.length;
    return NextResponse.json({
      projectId,
      total: enqueued,
      creativeIds: creatives!.map((c) => c.id),
      enqueued,
      requested,
      partial,
      reason,
      creditBalance,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

