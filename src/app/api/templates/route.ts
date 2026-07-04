import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, handleAuthError, whitelist, createServiceSupabase } from "@/lib/api-auth";

// Client direto com service key — usado APENAS para storage (signed URLs)
const storageClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Verifica se a org do usuário é Super Admin (curadoria de templates globais).
 * Fonte canônica única: criativos_org_limits.is_super_admin (EP-14.01).
 * Só o Super Admin pode marcar/editar is_global=TRUE; cliente comum nunca.
 */
async function isSuperAdminOrg(
  supabase: SupabaseClient,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("criativos_org_limits")
    .select("is_super_admin")
    .eq("org_id", orgId)
    .maybeSingle();
  return data?.is_super_admin === true;
}

/**
 * GET /api/templates?orgId=xxx&category=xxx
 * Lista templates da organização.
 */
export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");
    const category = request.nextUrl.searchParams.get("category");
    const search = request.nextUrl.searchParams.get("search");
    const { supabase } = await requireAuth(orgId);

    if (!orgId) {
      return NextResponse.json({ error: "orgId obrigatório" }, { status: 400 });
    }

    // Templates globais (swipe file padrão do admin, is_global=true) aparecem
    // pra TODAS as orgs; os demais só pra org dona. (is_global OR org_id = orgId)
    let query = supabase
      .from("criativos_templates")
      .select("*")
      .or(`is_global.eq.true,org_id.eq.${orgId}`)
      .order("created_at", { ascending: false });

    if (category && category !== "todos") {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,tags.cs.{${search}}`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Gerar signed URLs EM LOTE (1 round-trip) com service key (client direto).
    // createSignedUrls evita N chamadas de rede quando há muitos templates.
    const rows = data || [];
    const paths = rows
      .map((t: Record<string, unknown>) =>
        typeof t.file_path === "string" ? t.file_path : null
      )
      .filter((p): p is string => Boolean(p));

    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedList } = await storageClient.storage
        .from("templates")
        .createSignedUrls(paths, 3600);
      for (const s of signedList || []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }

    const templates = rows.map((t: Record<string, unknown>) => ({
      ...t,
      imageUrl:
        typeof t.file_path === "string"
          ? urlByPath.get(t.file_path) ?? null
          : null,
    }));

    return NextResponse.json({ templates });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * POST /api/templates
 * Cria novo template.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, tags, file_path, copy_elements, mini_prompt, org_id,
            advertiser, niche, offer_type, source_format, visual_style, hook, cta,
            has_logo, logo_position, logo_size_pct, has_person, person_pose, dominant_colors,
            background, text_layout, person, spacing, analyzed_at, is_global } = body;
    const { supabase } = await requireAuth(org_id);

    if (!name || !category || !file_path || !org_id) {
      return NextResponse.json({ error: "name, category, file_path e org_id obrigatórios" }, { status: 400 });
    }

    // Guard de mutação global (FR-014b): só o Super Admin pode criar template
    // is_global=TRUE. Cliente comum que tentar promover leva 403 explícito.
    // Cliente criando template normal (sem is_global ou is_global=false) segue igual.
    const wantsGlobal = is_global === true;
    let writeClient = supabase;
    if (wantsGlobal) {
      const isAdmin = await isSuperAdminOrg(supabase, org_id);
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Apenas o Super Admin pode criar templates globais." },
          { status: 403 }
        );
      }
      // Promoção a global é mutação privilegiada: usa service key no backend.
      writeClient = await createServiceSupabase();
    }

    // slug eh NOT NULL em criativos_templates. Gera a partir do nome (kebab-case)
    // + sufixo curto pra garantir unicidade. Padrao: "nome-do-template-a1b2c3".
    const slugBase = String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'template';
    const slug = `${slugBase}-${crypto.randomUUID().slice(0, 6)}`;

    const { data, error } = await writeClient
      .from("criativos_templates")
      .insert({
        name,
        slug,
        category,
        tags: tags || [],
        file_path,
        thumbnail_path: file_path,
        copy_elements: copy_elements || null,
        mini_prompt: mini_prompt || null,
        advertiser: advertiser || null,
        niche: niche || null,
        offer_type: offer_type || null,
        source_format: source_format || null,
        visual_style: visual_style || null,
        hook: hook || null,
        cta: cta || null,
        has_logo: typeof has_logo === "boolean" ? has_logo : null,
        logo_position: logo_position || null,
        logo_size_pct: typeof logo_size_pct === "number" ? logo_size_pct : null,
        has_person: typeof has_person === "boolean" ? has_person : null,
        person_pose: person_pose || null,
        dominant_colors: Array.isArray(dominant_colors) ? dominant_colors : null,
        background: background || null,
        text_layout: text_layout || null,
        person: person || null,
        spacing: spacing || null,
        analyzed_at: analyzed_at || null,
        org_id,
        // is_global só vai pra TRUE quando o Super Admin promove (já validado acima).
        // Cliente comum nunca chega aqui com wantsGlobal=true, então cai pra FALSE.
        is_global: wantsGlobal,
        is_system: false,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    return handleAuthError(err);
  }
}

/**
 * PATCH /api/templates
 * Atualiza template existente.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, orgId, org_id, ...rest } = body;
    // requireAuth resolve a org efetiva (se não veio no body, pega a do usuário).
    const { supabase, orgId: resolvedOrgId } = await requireAuth(orgId || org_id);

    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    // Guard de mutação global (FR-014b): PROMOVER um template a is_global=TRUE
    // só é permitido pro Super Admin. O gatilho do 403 espelha o POST: só dispara
    // quando is_global === true (promoção real), não quando a chave simplesmente
    // aparece no body. Assim um cliente que mande is_global:false (idempotente,
    // ex: PATCH de campos próprios) NÃO toma 403 indevido.
    const wantsPromoteGlobal = rest.is_global === true;
    let isAdmin = false;
    let writeClient = supabase;
    if (wantsPromoteGlobal) {
      isAdmin = await isSuperAdminOrg(supabase, resolvedOrgId);
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Apenas o Super Admin pode editar templates globais." },
          { status: 403 }
        );
      }
      // Promoção a global é mutação privilegiada: usa service key no backend.
      writeClient = await createServiceSupabase();
    }

    // is_global entra na whitelist SÓ pro Super Admin promovendo (já validado acima).
    // Pro cliente comum, o campo é removido do update mesmo que venha no body
    // (is_global:false não promove nada, e não deixamos cliente rebaixar global).
    const allowedFields = [
      "name", "category", "tags", "copy_elements", "mini_prompt", "is_active", "is_favorite",
      "rating", "quality_status", "file_path", "thumbnail_path",
      "advertiser", "niche", "offer_type", "source_format", "visual_style", "hook", "cta",
      "has_logo", "logo_position", "logo_size_pct", "has_person", "person_pose", "dominant_colors",
      "background", "text_layout", "person", "spacing", "analyzed_at",
    ];
    if (wantsPromoteGlobal && isAdmin) {
      allowedFields.push("is_global");
    }
    const safeUpdates = whitelist(rest, allowedFields);

    const { data, error } = await writeClient
      .from("criativos_templates")
      .update(safeUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ template: data });
  } catch (err) {
    return handleAuthError(err);
  }
}

