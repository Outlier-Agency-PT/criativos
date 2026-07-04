import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const ALLOWED_EXTENSIONS = [".txt", ".md"];

interface ParsedBlock {
  index: number;
  text: string;
  headline: string;
  body: string | null;
  charCount: number;
}

function parseBlocks(content: string): ParsedBlock[] {
  // Normalizar line endings
  const normalized = content.replace(/\r\n/g, "\n");

  // Tentar split por headers markdown primeiro
  const mdParts = normalized.split(/^(?=##\s)/m);
  let rawBlocks: string[];

  if (mdParts.length > 1) {
    rawBlocks = mdParts;
  } else {
    // Fallback: split por double newline
    rawBlocks = normalized.split(/\n\n+/);
  }

  return rawBlocks
    .map((text) => text.trim())
    .filter((text) => text.length > 10)
    .map((text, index) => {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      let headline = lines[0] || text;
      let body: string | null = null;

      // Se começa com ## header, usar como headline
      if (headline.startsWith("## ") || headline.startsWith("### ")) {
        headline = headline.replace(/^#{2,3}\s+/, "");
        body = lines.slice(1).join("\n") || null;
      } else if (lines.length > 1) {
        body = lines.slice(1).join("\n");
      }

      return { index, text, headline, body, charCount: text.length };
    });
}

/**
 * POST /api/copy-library/import-file
 * Parse: recebe ficheiro, retorna blocos parseados.
 * Import: recebe blocos selecionados + orgId, cria copies em batch.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Modo 1: Upload de ficheiro (FormData) — retorna blocos parseados
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const orgId = formData.get("orgId") as string | null;

      await requireAuth(orgId);

      if (!file) {
        return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
      }

      // Validar extensão
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json({ error: "Formato não suportado. Aceitos: .txt, .md" }, { status: 400 });
      }

      // Validar tamanho
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "Ficheiro muito grande. Máximo: 1MB" }, { status: 400 });
      }

      const content = await file.text();
      const blocks = parseBlocks(content);

      return NextResponse.json({ blocks });
    }

    // Modo 2: Import de blocos selecionados (JSON)
    const body = await request.json();
    const { org_id, orgId, blocks, campaign_id } = body;
    const resolvedOrgId = org_id || orgId;

    const { supabase, user } = await requireAuth(resolvedOrgId);

    if (!resolvedOrgId) {
      return NextResponse.json({ error: "org_id obrigatório" }, { status: 400 });
    }

    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return NextResponse.json({ error: "blocks obrigatório (array)" }, { status: 400 });
    }

    // Batch insert
    const copies = blocks.map((block: ParsedBlock) => ({
      org_id: resolvedOrgId,
      headline: block.headline,
      body: block.body,
      raw_text: block.text,
      source: "upload" as const,
      campaign_id: campaign_id || null,
      created_by: user.id,
    }));

    const { data, error } = await supabase
      .from("copy_library")
      .insert(copies)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      imported: data?.length || 0,
      copies: data,
    }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

