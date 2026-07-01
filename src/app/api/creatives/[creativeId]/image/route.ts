import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

const storageClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * GET /api/creatives/[creativeId]/image
 * Retorna signed URL para a imagem de um criativo gerado.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ creativeId: string }> }
) {
  try {
    const { creativeId } = await params;
    const { orgId } = await requireAuth();

    const { data: creative } = await storageClient
      .from("criativos_creatives")
      .select("id, file_path, project_id")
      .eq("id", creativeId)
      .single();

    if (!creative?.file_path) {
      return NextResponse.json({ url: null });
    }

    // Verificar ownership via project
    const { data: project } = await storageClient
      .from("criativos_generation_projects")
      .select("id")
      .eq("id", creative.project_id)
      .eq("org_id", orgId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const { data } = await storageClient.storage
      .from("creatives")
      .createSignedUrl(creative.file_path, 3600);

    return NextResponse.json({ url: data?.signedUrl || null });
  } catch (err) {
    return handleAuthError(err);
  }
}
