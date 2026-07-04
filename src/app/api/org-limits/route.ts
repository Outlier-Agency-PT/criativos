import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleAuthError, createServiceSupabase } from "@/lib/api-auth";

/**
 * GET /api/org-limits
 * Retorna o limite mensal de geração da org (NULL = ilimitado).
 */
export async function GET(_request: NextRequest) {
  try {
    const { orgId, supabase } = await requireAuth();
    const { data } = await supabase
      .from("criativos_org_limits")
      .select("monthly_generation_limit, plan_label")
      .eq("org_id", orgId)
      .maybeSingle();

    return NextResponse.json({
      monthlyGenerationLimit: data?.monthly_generation_limit ?? null,
      planLabel: data?.plan_label ?? null,
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PUT /api/org-limits
 * Define o limite mensal de geração da org. Admin/owner apenas.
 * Body: { monthlyGenerationLimit: number | null }
 *   null  -> ilimitado
 *   >= 0  -> teto mensal de criativos
 */
export async function PUT(request: NextRequest) {
  try {
    const { orgId, user, supabase } = await requireAuth();

    // Somente owner/admin podem mexer em limite/billing.
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .maybeSingle();
    const role = membership?.role ?? "member";
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Apenas admin/owner pode alterar o limite." }, { status: 403 });
    }

    const body = await request.json();
    const raw = body?.monthlyGenerationLimit;
    let limit: number | null;
    if (raw === null || raw === undefined || raw === "") {
      limit = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "Limite inválido. Use um inteiro >= 0 ou vazio para ilimitado." }, { status: 400 });
      }
      limit = Math.floor(n);
    }

    // Upsert via service key (RLS já validada acima por membership + role).
    const service = await createServiceSupabase();
    const { error } = await service
      .from("criativos_org_limits")
      .upsert(
        { org_id: orgId, monthly_generation_limit: limit, updated_at: new Date().toISOString() },
        { onConflict: "org_id" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ monthlyGenerationLimit: limit });
  } catch (err) {
    return handleAuthError(err);
  }
}

