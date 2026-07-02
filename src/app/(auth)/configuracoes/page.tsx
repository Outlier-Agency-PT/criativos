"use client";


import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import {
  Users,
  Camera,
  Palette,
  Key,
  UserCircle,
  Paintbrush,
  Type,
  Info,
  Loader2,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TabPersonas } from "@/components/settings/tab-personas";
import { TabPhotos } from "@/components/settings/tab-photos";
import { TabBrandKits } from "@/components/settings/tab-brand-kits";
import { TabApiKeys } from "@/components/settings/tab-api-keys";
import { TabTextModel } from "@/components/settings/tab-text-model";
import { TabAccount } from "@/components/settings/tab-account";
import { TabTheme } from "@/components/settings/tab-theme";
import { TabAbout } from "@/components/settings/tab-about";
import { TabMembers } from "@/components/settings/tab-members";

const ALL_TABS = [
  { id: "personas", label: "Personas", icon: Users, adminOnly: false },
  { id: "fotos", label: "Fotos", icon: Camera, adminOnly: false },
  { id: "brand-kits", label: "Brand Kits", icon: Palette, adminOnly: false },
  { id: "aparencia", label: "Aparencia", icon: Paintbrush, adminOnly: false },
  { id: "membros", label: "Membros", icon: UserPlus, adminOnly: true },
  { id: "api-keys", label: "API Keys", icon: Key, adminOnly: true },
  { id: "modelo-texto", label: "Modelo de texto", icon: Type, adminOnly: true },
  { id: "conta", label: "Conta", icon: UserCircle, adminOnly: false },
  { id: "sobre", label: "Sobre", icon: Info, adminOnly: false },
] as const;

type TabId = (typeof ALL_TABS)[number]["id"];

// Validar que "membros" é admin-only (tipo de segurança)
const ADMIN_TABS = ["membros", "api-keys", "modelo-texto"] as const;

export default function ConfiguracoesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") as TabId) || "personas"
  );
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("member");
  const [loading, setLoading] = useState(true);

  const isAdmin = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    async function init() {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        setOrgId(membership.org_id);
        setUserRole(membership.role || "member");
      }
      setLoading(false);
    }
    init();
  }, []);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    router.replace(`/configuracoes?tab=${tab}`, { scroll: false });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="text-center py-24 text-text-muted text-sm">
        Organizacao nao encontrada. Faca login novamente.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Configurações</h1>
        <p className="text-sm text-text-muted mt-1">
          Gerencie personas, fotos, brand kits, membros, API keys e conta.
        </p>
      </div>

      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-border-subtle pb-px overflow-x-auto">
        {ALL_TABS.filter((tab) => !tab.adminOnly || isAdmin).map((tab) => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
                isActive
                  ? "border-accent-champagne text-accent-champagne"
                  : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-subtle"
              )}
            >
              <TabIcon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === "personas" && <TabPersonas orgId={orgId} />}
        {activeTab === "fotos" && <TabPhotos orgId={orgId} />}
        {activeTab === "brand-kits" && <TabBrandKits orgId={orgId} />}
        {activeTab === "aparencia" && <TabTheme />}
        {activeTab === "membros" && <TabMembers orgId={orgId} />}
        {activeTab === "api-keys" && <TabApiKeys orgId={orgId} />}
        {activeTab === "modelo-texto" && <TabTextModel orgId={orgId} />}
        {activeTab === "conta" && <TabAccount orgId={orgId} />}
        {activeTab === "sobre" && <TabAbout />}
      </div>
    </div>
  );
}

