import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ALLOWED_BUCKETS = ["templates", "expert-photos", "brand-assets", "creatives"];

/**
 * POST /api/upload
 * Upload de imagem para Supabase Storage.
 * FormData: file (File), bucket (string), path (string)
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucket = formData.get("bucket") as string | null;
    const pathPrefix = formData.get("path") as string | null;
    const replaceFile = formData.get("replaceFile") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file obrigatÃ³rio" }, { status: 400 });
    }

    if (!bucket) {
      return NextResponse.json({ error: "bucket obrigatÃ³rio" }, { status: 400 });
    }

    // Validar bucket permitido
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return NextResponse.json({ error: "Bucket nÃ£o permitido" }, { status: 400 });
    }

    // Validar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo nÃ£o permitido: ${file.type}. Aceitos: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validar tamanho
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. MÃ¡ximo: 10MB` },
        { status: 400 }
      );
    }

    // Gerar path Ãºnico. O Supabase Storage rejeita "keys" com acentos/caracteres
    // especiais (erro InvalidKey). Sanitizamos extensao e prefixo de path.
    const sanitizeKeySegment = (s: string) =>
      s
        .replace(/[^a-zA-Z0-9._\/-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-\/]+|[-\/]+$/g, '');
    const rawExt = (file.name.split('.').pop() || 'png').toLowerCase();
    const ext = sanitizeKeySegment(rawExt).replace(/[^a-z0-9]/g, '') || 'png';
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const safePrefix = pathPrefix ? sanitizeKeySegment(pathPrefix) : "";
    const filePath = safePrefix ? `${safePrefix}/${fileName}` : fileName;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Falha no upload: ${uploadError.message}` }, { status: 500 });
    }

    // Se replaceFile foi informado, deletar o arquivo antigo do storage
    if (replaceFile && bucket) {
      await supabase.storage.from(bucket).remove([replaceFile]);
    }

    return NextResponse.json({
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type,
      size: file.size,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

