import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, checkSuperAdmin, createServiceSupabase } from "@/lib/api-auth";

const OUTLIER_ORG_ID = "6b9e8609-d092-4b60-bc34-b6943eb1ff05";

/**
 * GET /api/admin/clientes
 *
 * Lista os clientes ativos (membros da org Outlier Agency com is_super_admin = false)
 * e os convites pendentes. Exige que o actor seja super admin.
 *
 * Resposta:
 *   { clientes: [...], invites: [...] }
 *
 *   clientes[]:  { user_id, email, full_name, role, joined_at }
 *   invites[]:   { id, email, role, status, expires_at, created_at }
 */
export async function GET() {
  try {
    const { orgId, supabase } = await requireAuth();

    if (!(await checkSuperAdmin(supabase, orgId))) {
      return NextResponse.json(
        { error: "Apenas super admins podem aceder a esta rota." },
        { status: 403 }
      );
    }

    const service = await createServiceSupabase();

    // 1) Membros da org Outlier que NÃO são super admin.
    //    Usamos service key para poder ler auth.users via RPC.
    const { data: members, error: membersError } = await service
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", OUTLIER_ORG_ID)
      .order("created_at", { ascending: false });

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    // Filtrar super admins: buscar quem tem is_super_admin = true na org.
    const { data: superAdminLimits } = await service
      .from("criativos_org_limits")
      .select("is_super_admin")
      .eq("org_id", OUTLIER_ORG_ID)
      .maybeSingle();

    // Buscar user_ids que são super admins (têm role owner/admin E a org tem is_super_admin).
    // Como todos estão na mesma org, o critério de "funcionário" é is_super_admin na org.
    // Identificamos clientes como membros cujo user_id não seja funcionário conhecendo-os
    // pelo role editor (convidados têm role editor; funcionários são owner/admin).
    const clientMembers = (members ?? []).filter(
      (m) => m.role === "editor"
    );

    // Buscar dados de auth (email, nome) dos clientes via admin API.
    const clientsWithEmail = await Promise.all(
      clientMembers.map(async (m) => {
        const { data: authUser } = await service.auth.admin.getUserById(m.user_id);
        return {
          user_id: m.user_id,
          email: authUser?.user?.email ?? null,
          full_name: authUser?.user?.user_metadata?.full_name ?? null,
          role: m.role,
          joined_at: m.created_at,
        };
      })
    );

    // 2) Convites pendentes da org Outlier.
    const { data: invites, error: invitesError } = await service
      .from("criativos_invites")
      .select("id, email, role, status, expires_at, created_at")
      .eq("org_id", OUTLIER_ORG_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (invitesError) {
      return NextResponse.json({ error: invitesError.message }, { status: 500 });
    }

    return NextResponse.json({
      clientes: clientsWithEmail,
      invites: invites ?? [],
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
