import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

const storageClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/templates/thumbnails
 * Gera signed URLs frescas para uma lista de template IDs.
 */
export async function POST(request: NextRequest) {
  try {
    const { templateIds } = await request.json();
    if (!templateIds?.length) {
      return NextResponse.json({ urls: {} });
    }

    const { supabase } = await requireAuth();

    const { data: templates } = await supabase
      .from("criativos_templates")
      .select("id, file_path")
      .in("id", templateIds);

    const urls: Record<string, string> = {};

    if (templates && templates.length > 0) {
      // Gera signed URLs EM LOTE (1 round-trip) ao invés de N chamadas.
      const withPath = templates.filter(
        (t): t is { id: string; file_path: string } => Boolean(t.file_path)
      );
      const paths = withPath.map((t) => t.file_path);
      if (paths.length > 0) {
        const { data: signedList } = await storageClient.storage
          .from("templates")
          .createSignedUrls(paths, 3600);
        const urlByPath = new Map<string, string>();
        for (const s of signedList || []) {
          if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
        }
        for (const t of withPath) {
          const u = urlByPath.get(t.file_path);
          if (u) urls[t.id] = u;
        }
      }
    }

    return NextResponse.json({ urls });
  } catch (err) {
    return handleAuthError(err);
  }
}

