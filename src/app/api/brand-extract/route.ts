import { NextRequest, NextResponse } from "next/server";
import { extractBrand } from "@/lib/brand-extractor";
import { requireAuth, handleAuthError, isPublicUrl } from "@/lib/api-auth";

/**
 * POST /api/brand-extract
 * Extrai branding (cores, fontes, logo) de uma URL.
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    await requireAuth();

    if (!url) {
      return NextResponse.json({ error: "url obrigatório" }, { status: 400 });
    }

    // Validar URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    // Validar URL pública (previne SSRF)
    if (!isPublicUrl(url)) {
      return NextResponse.json({ error: "URL não permitida" }, { status: 400 });
    }

    const brand = await extractBrand(url);

    return NextResponse.json({
      colors: brand.colors,
      fonts: brand.fonts,
      logo_url: brand.logoUrl,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

