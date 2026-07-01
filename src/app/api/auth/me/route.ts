import { NextResponse } from "next/server";
import { requireAuth, handleAuthError } from "@/lib/api-auth";

/**
 * GET /api/auth/me
 * Retorna user autenticado + orgId.
 */
export async function GET() {
  try {
    const { user, orgId } = await requireAuth();
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      orgId,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

