import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";
import { createServiceSupabase } from "@/lib/api-auth";

const STALE_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutos — items "generating" há mais tempo = orphaned

async function storageObjectExists(
  supabase: Awaited<ReturnType<typeof createServiceSupabase>>,
  filePath: string
) {
  const { data, error } = await supabase.storage
    .from("creatives")
    .createSignedUrl(filePath, 60);

  return !error && !!data?.signedUrl;
}

/**
 * GET /api/generate/status?projectId=xxx
 * Retorna progresso da geração de criativos.
 * Frontend faz polling a cada 2s.
 * Detecta items orphaned (gerando há mais de 3 min) e os marca como erro.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId obrigatório" }, { status: 400 });
    }

    const { supabase, orgId } = await requireAuth();

    // Verificar que o projeto pertence à org do usuário
    const { data: project } = await supabase
      .from("criativos_generation_projects")
      .select("id, org_id, created_at, status")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const { data: creatives, error } = await supabase
      .from("criativos_creatives")
      .select("id, status, template_id, copy_id, file_path, error_message, created_at")
      .eq("project_id", projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!creatives?.length) {
      return NextResponse.json({ error: "Nenhum criativo encontrado para este projeto" }, { status: 404 });
    }

    // Reconciliar items órfãos:
    // 1. "generating" com file_path → já completou, só faltou atualizar status
    // 2. "generating" sem file_path há mais de 3 min → verificar storage ou marcar erro
    // 3. "error" por timeout anterior → re-verificar storage
    const now = Date.now();
    const projectAge = now - new Date(project.created_at).getTime();

    // Caso 1: "generating" mas já tem file_path — corrigir status imediatamente
    const withFilePath = creatives.filter((c) => c.status === "generating" && c.file_path);
    if (withFilePath.length > 0) {
      const serviceSupabase = await createServiceSupabase();
      for (const item of withFilePath) {
        await serviceSupabase
          .from("criativos_creatives")
          .update({ status: "completed", error_message: null })
          .eq("id", item.id);
        item.status = "completed";
        item.error_message = null;
      }
    }

    // Caso 2 e 3: sem file_path, verificar storage
    const reconciliationCandidates = creatives.filter((c) => {
      if (c.file_path) return false;
      if (c.status === "generating") return projectAge > STALE_TIMEOUT_MS;
      return c.status === "error" && c.error_message?.startsWith("Timeout:");
    });

    if (reconciliationCandidates.length > 0) {
      const serviceSupabase = await createServiceSupabase();
      for (const item of reconciliationCandidates) {
        const expectedFilePath = `${project.org_id}/${projectId}/${item.id}.png`;
        const fileExists = await storageObjectExists(serviceSupabase, expectedFilePath);

        if (fileExists) {
          await serviceSupabase
            .from("criativos_creatives")
            .update({
              status: "completed",
              file_path: expectedFilePath,
              error_message: null,
            })
            .eq("id", item.id);
          item.status = "completed";
          item.file_path = expectedFilePath;
          item.error_message = null;
          continue;
        }

        if (item.status === "generating") {
          await serviceSupabase.from("criativos_creatives").update({
            status: "error",
            error_message: "Timeout: geração interrompida (servidor reiniciou ou conexão perdida)",
          }).eq("id", item.id);
          item.status = "error";
          item.error_message = "Timeout: geração interrompida";
        }
      }
    }

    const total = creatives.length;
    const completed = creatives.filter((c) => c.status === "completed").length;
    const errors = creatives.filter((c) => c.status === "error").length;
    const generating = creatives.find((c) => c.status === "generating");
    const pending = creatives.filter((c) => c.status === "pending").length;
    const done = pending === 0 && !generating;

    // Atualizar status do projeto quando todos os criativos estão prontos
    if (done && project.status === "generating") {
      const serviceSupabase = await createServiceSupabase();
      const finalStatus = completed === 0 && errors > 0 ? "error" : errors > 0 ? "partial" : "completed";
      await serviceSupabase.from("criativos_generation_projects").update({ status: finalStatus }).eq("id", projectId);
    }

    return NextResponse.json({
      total,
      completed,
      errors,
      pending,
      done,
      currentItem: generating ? { id: generating.id, templateId: generating.template_id, copyId: generating.copy_id } : null,
      items: creatives.map((c) => ({
        id: c.id,
        status: c.status,
        error: c.error_message,
      })),
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

