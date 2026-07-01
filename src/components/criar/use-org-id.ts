"use client";


import { useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

/**
 * Carrega o org_id do usuÃ¡rio logado (primeira membership).
 * Compartilhado pelas rotas /criar, /criar/novo e /criar/[projectId].
 */
export function useOrgId(): { orgId: string | null; loading: boolean } {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadOrg() {
      const supabase = createBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (active) setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!active) return;
      if (membership) setOrgId(membership.org_id);
      setLoading(false);
    }
    loadOrg();
    return () => {
      active = false;
    };
  }, []);

  return { orgId, loading };
}

