import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

// GET — carrega o draft do usuário
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data } = await supabase
    .from("criativos_creator_drafts")
    .select("state")
    .eq("user_id", user.id)
    .single();

  if (!data?.state) {
    return NextResponse.json({ draft: null });
  }

  // Detectar corrupção — se draft tem {family, weight} objects, deletar
  const raw = JSON.stringify(data.state);
  if (raw.includes('"family"') && raw.includes('"weight"')) {
    await supabase.from("criativos_creator_drafts").delete().eq("user_id", user.id);
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({ draft: data.state });
}

// PUT — salva/atualiza o draft do usuário
export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { state, orgId } = body;
  if (!state || !orgId) {
    return NextResponse.json({ error: "state e orgId obrigatórios" }, { status: 400 });
  }

  const { error } = await supabase
    .from("criativos_creator_drafts")
    .upsert(
      { user_id: user.id, org_id: orgId, state, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE — limpa o draft
export async function DELETE() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  await supabase
    .from("criativos_creator_drafts")
    .delete()
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}

