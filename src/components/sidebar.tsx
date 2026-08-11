"use client";


import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  Image,
  Camera,
  BookOpen,
  Library,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Criar", href: "/criar", icon: Plus },
  { label: "Galeria", href: "/galeria", icon: Image },
  { label: "Fotos Expert", href: "/fotos", icon: Camera },
  { label: "Swipe File", href: "/swipe-file", icon: BookOpen },
  { label: "Biblioteca", href: "/biblioteca", icon: Library },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
  { label: "Uso", href: "/uso", icon: BarChart3 },
];

const adminNavItems = [
  { label: "Clientes", href: "/admin/clientes", icon: Users },
];

interface SidebarProps {
  userName?: string;
  userEmail?: string;
  isSuperAdmin?: boolean;
}

export function Sidebar({ userName, userEmail, isSuperAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("criativos-sidebar-collapsed") === "true";
  });

  useEffect(() => {
    const width = desktopCollapsed ? "5.5rem" : "16rem";
    document.documentElement.style.setProperty("--app-sidebar-width", width);
    window.localStorage.setItem("criativos-sidebar-collapsed", String(desktopCollapsed));

    return () => {
      document.documentElement.style.setProperty("--app-sidebar-width", "16rem");
    };
  }, [desktopCollapsed]);

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn("flex h-16 items-center justify-between border-b border-border-subtle/80", desktopCollapsed ? "px-3" : "px-6")}>
        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "font-bold text-text-accent transition-all",
            desktopCollapsed ? "mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent-alpha-20)] bg-[linear-gradient(135deg,var(--accent-alpha-12),var(--accent-alpha-05))] text-lg shadow-[var(--shadow-accent-glow)]" : "text-lg"
          )}
          aria-label="Outlier Criativos"
        >
          {desktopCollapsed ? (
            <span aria-hidden="true" className="leading-none text-[#2B9E8F]">✓</span>
          ) : (
            <img src="/logooutiliercriativos.png" alt="Outlier Criativos" className="h-8 w-auto" />
          )}
        </Link>
        <button
          onClick={() => setDesktopCollapsed((value) => !value)}
          className="hidden md:flex p-1.5 rounded-lg text-text-muted hover:text-text-primary"
          title={desktopCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {desktopCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary md:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          // "Criar" deve SEMPRE voltar pra lista de projetos (/criar), mesmo
          // quando já estamos dentro do wizard (/criar/novo ou /criar/[id]).
          // Um Link comum pra /criar não remonta se a rota atual começa com
          // /criar, então forçamos a navegação via router.push.
          const isCriar = item.href === "/criar";
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                setMobileOpen(false);
                if (isCriar && pathname !== "/criar") {
                  e.preventDefault();
                  router.push("/criar");
                }
              }}
              className={cn(
                "flex items-center rounded-xl text-sm transition-all",
                desktopCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-[linear-gradient(135deg,var(--accent-alpha-12),var(--accent-alpha-05))] text-text-accent border border-[var(--accent-alpha-20)] shadow-[var(--shadow-accent-glow)]"
                  : "text-text-secondary border border-transparent hover:bg-champagne-alpha-10 hover:text-text-primary hover:border-white/5"
              )}
              title={desktopCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!desktopCollapsed && <span>{item.label}</span>}
              {isActive && !desktopCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-champagne" />
              )}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <>
            {!desktopCollapsed && (
              <div className="pt-3 pb-1 px-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted/50">
                  Admin
                </p>
              </div>
            )}
            {desktopCollapsed && <div className="pt-2 border-t border-border-subtle/50 mx-1" />}
            {adminNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center rounded-xl text-sm transition-all",
                    desktopCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                    isActive
                      ? "bg-[linear-gradient(135deg,var(--accent-alpha-12),var(--accent-alpha-05))] text-text-accent border border-[var(--accent-alpha-20)] shadow-[var(--shadow-accent-glow)]"
                      : "text-text-secondary border border-transparent hover:bg-champagne-alpha-10 hover:text-text-primary hover:border-white/5"
                  )}
                  title={desktopCollapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!desktopCollapsed && <span>{item.label}</span>}
                  {isActive && !desktopCollapsed && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-champagne" />
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border-subtle/80">
        <div className={cn("flex items-center", desktopCollapsed ? "justify-center" : "gap-3")}>
          {!desktopCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-text-primary truncate">
                  {userName || "Utilizador"}
                </p>
                <span className="flex-shrink-0 text-[10px] text-text-muted/70 font-mono bg-surface-100 px-1.5 py-0.5 rounded">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-text-muted truncate">
                {userEmail || ""}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-text-muted hover:text-accent-red hover:bg-accent-red-dim transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header */}
      <div className="theme-sidebar md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 border-b border-border-subtle/80">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 rounded-lg text-text-muted hover:text-text-primary"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="ml-3" aria-label="Outlier Criativos">
          <img src="/logooutiliercriativos.png" alt="Outlier Criativos" className="h-8 w-auto" />
        </Link>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop: static, mobile: slide-in */}
      <aside
        className={cn(
          "theme-sidebar flex flex-col h-screen border-r border-border-subtle/80 transition-[width]",
          desktopCollapsed ? "md:w-[5.5rem]" : "md:w-64",
          // Desktop: always visible
          "hidden md:flex",
          // Mobile: overlay drawer
          mobileOpen && "!flex fixed inset-y-0 left-0 z-50 w-64"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

