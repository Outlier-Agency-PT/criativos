import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

export const maxDuration = 120;

/**
 * GET /api/generate/download?projectId=xxx
 * Baixa todos os criativos do projeto (status completed ou approved)
 * empacotados em ZIP. Cada ficheiro no ZIP tem nome legivel baseado
 * no template ou indice sequencial.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    // Download em massa por seleÃ§Ã£o: ?ids=id1,id2,id3 (criativos da galeria).
    const idsParam = request.nextUrl.searchParams.get("ids");
    const selectedIds = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

    if (!projectId && selectedIds.length === 0) {
      return NextResponse.json({ error: "projectId ou ids obrigatorio" }, { status: 400 });
    }

    const { supabase, orgId } = await requireAuth();

    // Validar ownership: pega os project_ids do org pra garantir que os criativos
    // selecionados pertencem ao usuÃ¡rio.
    const { data: orgProjects } = await supabase
      .from("criativos_generation_projects")
      .select("id")
      .eq("org_id", orgId);
    const orgProjectIds = new Set((orgProjects ?? []).map((p) => p.id));

    if (projectId && !orgProjectIds.has(projectId)) {
      return NextResponse.json({ error: "Projeto nao encontrado" }, { status: 404 });
    }

    let query = supabase
      .from("criativos_creatives")
      .select("id, file_path, status, template_id, created_at, project_id")
      .in("status", ["completed", "approved"])
      .not("file_path", "is", null)
      .order("created_at", { ascending: true });

    query = selectedIds.length > 0
      ? query.in("id", selectedIds)
      : query.eq("project_id", projectId!);

    const { data: creativesRaw, error: creativesError } = await query;
    // Em modo seleÃ§Ã£o, filtra sÃ³ os que pertencem a projetos do org (seguranÃ§a).
    const creatives = (creativesRaw ?? []).filter((c) => orgProjectIds.has(c.project_id));

    if (creativesError) {
      return NextResponse.json({ error: creativesError.message }, { status: 500 });
    }

    if (!creatives || creatives.length === 0) {
      return NextResponse.json({ error: "Nenhum criativo concluido neste projeto" }, { status: 404 });
    }

    const zip = new JSZip();
    let added = 0;

    await Promise.all(
      creatives.map(async (creative, index) => {
        if (!creative.file_path) return;
        const { data, error } = await supabase.storage.from("creatives").download(creative.file_path);
        if (error || !data) return;
        const buffer = Buffer.from(await data.arrayBuffer());
        const baseName = creative.file_path.split("/").pop() || `criativo-${index + 1}.png`;
        const prefix = String(index + 1).padStart(2, "0");
        const status = creative.status === "approved" ? "aprovado" : "completo";
        const fileName = `${prefix}-${status}-${baseName}`;
        zip.file(fileName, buffer);
        added += 1;
      })
    );

    if (added === 0) {
      return NextResponse.json({ error: "Nao foi possivel baixar os ficheiros do storage" }, { status: 500 });
    }

    const zipBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const zipBody = new Blob([zipBuffer], { type: "application/zip" });

    // Nome do ZIP: nome do projeto (se download por projeto) ou "criativos-selecionados".
    let projectName = "criativos-selecionados";
    if (projectId) {
      const { data: proj } = await supabase
        .from("criativos_generation_projects")
        .select("name")
        .eq("id", projectId)
        .single();
      projectName = proj?.name || "criativos";
    }
    const safeName = projectName
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "criativos";

    return new NextResponse(zipBody, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="criativos-${safeName}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

