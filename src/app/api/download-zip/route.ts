import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * POST /api/download-zip
 * Recebe { creativeIds: string[] } e retorna signed URLs para download individual.
 */
export async function POST(request: NextRequest) {
  try {
    const { creativeIds } = await request.json();
    const { supabase, orgId } = await requireAuth();

    if (!creativeIds || !Array.isArray(creativeIds) || creativeIds.length === 0) {
      return NextResponse.json({ error: "creativeIds obrigatorio (array nao vazio)" }, { status: 400 });
    }

    if (creativeIds.length > 100) {
      return NextResponse.json({ error: "Maximo 100 criativos por vez" }, { status: 400 });
    }

    // Buscar criativos com file_path
    const { data: creatives, error } = await supabase
      .from("criativos_creatives")
      .select("id, file_path, status, project_id")
      .in("id", creativeIds)
      .not("file_path", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!creatives || creatives.length === 0) {
      return NextResponse.json({ error: "Nenhum criativo encontrado com ficheiro" }, { status: 404 });
    }

    // Verificar ownership: todos os projetos devem pertencer Ã  org do usuÃ¡rio
    const projectIds = [...new Set(creatives.map(c => c.project_id))];
    const { data: projects } = await supabase
      .from("criativos_generation_projects")
      .select("id")
      .in("id", projectIds)
      .eq("org_id", orgId);

    const allowedProjectIds = new Set(projects?.map(p => p.id) ?? []);
    const allowedCreatives = creatives.filter(c => allowedProjectIds.has(c.project_id));

    if (allowedCreatives.length === 0) {
      return NextResponse.json({ error: "Nenhum criativo encontrado com ficheiro" }, { status: 404 });
    }

    // Gerar signed URLs EM LOTE (1 round-trip) ao invÃ©s de N chamadas.
    const paths = allowedCreatives.map((c) => c.file_path!);
    const { data: signedList } = await supabase.storage
      .from("creatives")
      .createSignedUrls(paths, 3600);
    const urlByPath = new Map<string, string>();
    for (const s of signedList || []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }

    const urls = allowedCreatives.map((c, index) => ({
      id: c.id,
      url: urlByPath.get(c.file_path!) ?? null,
      filename: `criativo-${String(index + 1).padStart(2, "0")}-${c.id.slice(0, 8)}.png`,
    }));

    // Filtrar os que conseguiram gerar URL
    const validUrls = urls.filter((u) => u.url !== null);

    return NextResponse.json({ urls: validUrls, total: validUrls.length });
  } catch (err) {
    return handleAuthError(err);
  }
}

