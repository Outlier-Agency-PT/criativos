import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/png", "image/svg+xml"];

/**
 * GET /api/logos?orgId=X
 * Lista logos da organizaÃ§Ã£o com signed URLs.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("org_logos")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Gerar signed URLs EM LOTE (1 round-trip) ao invÃ©s de N chamadas.
    const rows = data || [];
    const paths = rows
      .map((l) => l.file_path)
      .filter((p): p is string => Boolean(p));
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedList } = await supabase.storage
        .from("logos")
        .createSignedUrls(paths, 3600);
      for (const s of signedList || []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }

    const logos = rows.map((logo) => ({
      ...logo,
      url: logo.file_path ? urlByPath.get(logo.file_path) ?? null : null,
    }));

    return NextResponse.json({ logos });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST /api/logos
 * Upload de logo via FormData (file + orgId + label).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orgId = formData.get("orgId") as string | null;
    const label = formData.get("label") as string | null;

    const { supabase } = await requireAuth(orgId);

    if (!file) {
      return NextResponse.json({ error: "file obrigatÃ³rio" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatÃ³rio" }, { status: 400 });
    }

    // Validar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo nÃ£o permitido: ${file.type}. Aceitos: PNG, SVG` },
        { status: 400 }
      );
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ficheiro muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. MÃ¡ximo: 2MB` },
        { status: 400 }
      );
    }

    // Upload para storage. Sanitiza a extensÃ£o (Storage rejeita acentos/chars invÃ¡lidos).
    const rawExt = (file.name.split('.').pop() || 'png').toLowerCase();
    const ext = rawExt.replace(/[^a-z0-9]/g, '') || 'png';
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = `${orgId}/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Falha no upload: ${uploadError.message}` }, { status: 500 });
    }

    // Inserir registro na tabela
    const { data, error } = await supabase
      .from("org_logos")
      .insert({
        org_id: orgId,
        file_path: filePath,
        label: label || file.name,
      })
      .select()
      .single();

    if (error) {
      // Rollback: remover ficheiro do storage
      await supabase.storage.from("logos").remove([filePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Gerar signed URL para retorno
    const { data: signedData } = await supabase.storage
      .from("logos")
      .createSignedUrl(filePath, 3600);

    return NextResponse.json(
      { logo: { ...data, url: signedData?.signedUrl || null } },
      { status: 201 }
    );
  } catch (err) {
    return handleAuthError(err);
  }
}

