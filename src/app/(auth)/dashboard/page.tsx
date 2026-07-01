"use client";


import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  LayoutDashboard,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { AI_MODELS } from "@/lib/models";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ProjectGroup } from "@/components/dashboard/project-group";
import type { ProjectGroupData } from "@/components/dashboard/project-group";

// Taxa USD->BRL. Uniformizada com a pÃ¡gina /uso (que busca a taxa real online,
// fallback 5.65). Mantemos 5.65 aqui pra os dois lugares baterem.
const USD_TO_BRL = 5.65;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface Stats {
  completedCount: number;
  estimatedCostBRL: number;
  costPerCreativeBRL: number;
}

// PERF: limite de criativos trazidos pro dashboard. O dashboard ordena por
// created_at desc, entÃ£o os mais recentes cobrem os Ãºltimos 30 dias com folga.
// Os PROJETOS sÃ£o buscados separadamente (sem limite) pra garantir que nenhum
// projeto suma da tela mesmo que seus criativos sejam antigos.
const DASHBOARD_CREATIVES_LIMIT = 200;

interface RawCreative {
  id: string;
  status: string;
  model_used: string | null;
  created_at: string;
  project_id: string | null;
}

interface RawProject {
  id: string;
  name: string;
  status: string;
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-xl bg-surface-100/80" />
          <div className="h-4 w-72 rounded-lg bg-surface-100/60" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-12 w-full rounded-xl bg-surface-100/60 sm:w-[280px]" />
          <div className="h-12 w-36 rounded-xl bg-surface-100/80" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="theme-panel h-32 rounded-[22px] bg-surface-050/70" />
        <div className="theme-panel h-32 rounded-[22px] bg-surface-050/70" />
        <div className="theme-panel h-32 rounded-[22px] bg-surface-050/70" />
      </div>

      <section className="theme-panel rounded-[26px] p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-6 w-40 rounded-lg bg-surface-100/70" />
            <div className="h-4 w-80 rounded-lg bg-surface-100/55" />
          </div>
          <div className="h-5 w-24 rounded-lg bg-surface-100/65" />
        </div>

        <div className="space-y-3">
          <div className="h-32 rounded-[22px] bg-surface-050/70" />
          <div className="h-32 rounded-[22px] bg-surface-050/70" />
          <div className="h-32 rounded-[22px] bg-surface-050/70" />
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const [rawCreatives, setRawCreatives] = useState<RawCreative[]>([]);
  const [rawProjects, setRawProjects] = useState<RawProject[]>([]);
  const [completedCount30d, setCompletedCount30d] = useState(0);
  const [totalCostUSD30d, setTotalCostUSD30d] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Usuario");
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createBrowserSupabase();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuario");
        }

        // PERF: o dashboard NÃƒO carrega imagens (signed URLs). Buscava 349 criativos
        // e gerava 349 signed URLs (~700ms cada) â€” travava por minutos. Agora sÃ³ os
        // dados leves (sem file_path nas thumbs), e zero signed URL. As imagens ficam
        // na Galeria e no Criar, nÃ£o no dashboard.
        //
        // PERF (paginaÃ§Ã£o): em vez de trazer TODOS os 349+ criativos com join (o que
        // bloqueava a main thread no mount), buscamos:
        //  1) a lista de PROJETOS separadamente, SEM limite (sÃ£o poucos â€” ~32 â€” e leves).
        //     Isso garante que nenhum projeto suma da tela, mesmo que seus criativos sejam antigos.
        //  2) os criativos LIMITADOS aos mais recentes (DASHBOARD_CREATIVES_LIMIT), sem join.
        //  3) os agregados de custo/contagem dos Ãºltimos 30 dias via query filtrada por
        //     created_at >= 30 dias (limite alto), sem trazer as 349 rows pro client.
        const thirtyDaysAgoIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

        const [projectsRes, creativesRes, recentRes] = await Promise.all([
          // 1) Projetos â€” fonte de verdade da lista (nenhum projeto some).
          supabase
            .from("criativos_generation_projects")
            .select("id, name, status")
            .order("created_at", { ascending: false }),
          // 2) Criativos recentes â€” limitados, sem join.
          supabase
            .from("criativos_creatives")
            .select("id, status, model_used, created_at, project_id")
            .order("created_at", { ascending: false })
            .limit(DASHBOARD_CREATIVES_LIMIT),
          // 3) Criativos concluÃ­dos dos Ãºltimos 30 dias â€” sÃ³ p/ custo/contagem (sem join).
          supabase
            .from("criativos_creatives")
            .select("model_used")
            .eq("status", "completed")
            .gte("created_at", thirtyDaysAgoIso)
            .limit(5000),
        ]);

        setRawProjects(projectsRes.data ?? []);
        setRawCreatives((creativesRes.data ?? []) as RawCreative[]);

        // Agregado de custo/contagem (30 dias) â€” calculado sobre a query filtrada,
        // nÃ£o sobre todas as rows. MantÃ©m o mesmo nÃºmero que aparecia antes.
        const costMap = new Map(AI_MODELS.map((model) => [model.id, model.costPerImage]));
        const recent = recentRes.data ?? [];
        let totalCostUSD = 0;
        for (const row of recent) {
          const modelId = (row as { model_used: string | null }).model_used || "gemini-2.5-flash";
          totalCostUSD += costMap.get(modelId) ?? 0.039;
        }
        setCompletedCount30d(recent.length);
        setTotalCostUSD30d(totalCostUSD);
      } catch (error) {
        console.error("Erro ao carregar dashboard", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // PERF: agrupar criativos por projeto SÃ“ quando os dados mudam (nÃ£o a cada render).
  // Parte dos PROJETOS (lista completa) â€” assim nenhum projeto some, mesmo sem
  // criativos recentes. Os criativos limitados sÃ£o anexados ao grupo do seu projeto.
  const projectGroups = useMemo<ProjectGroupData[]>(() => {
    const groupMap = new Map<string, ProjectGroupData>();
    // Ãndice de ordem do projeto (created_at desc jÃ¡ vem do banco) â€” fallback de
    // ordenaÃ§Ã£o pra projetos sem criativo recente carregado.
    const projectOrder = new Map<string, number>();

    rawProjects.forEach((project, index) => {
      projectOrder.set(project.id, index);
      groupMap.set(project.id, {
        project_id: project.id,
        project_name: project.name || "Projeto sem nome",
        project_status: project.status || "draft",
        creatives: [],
      });
    });

    for (const creative of rawCreatives) {
      if (!creative.project_id) continue;
      const group = groupMap.get(creative.project_id);
      if (!group) continue; // criativo Ã³rfÃ£o (projeto nÃ£o listado) â€” ignora
      // Sem signed_url â€” dashboard nÃ£o exibe thumbnails (perf).
      group.creatives.push({
        id: creative.id,
        status: creative.status,
        file_path: null,
        signed_url: null as string | null,
        created_at: creative.created_at,
      });
    }

    // Ordem da tela: igual ao comportamento anterior â€” projetos com criativo mais
    // recente primeiro (por created_at do criativo mais novo). Projetos sem criativo
    // recente carregado caem na ordem do projeto (created_at desc do banco).
    return Array.from(groupMap.values()).sort((left, right) => {
      const leftDate = left.creatives[0]?.created_at ?? "";
      const rightDate = right.creatives[0]?.created_at ?? "";
      if (leftDate && rightDate) return rightDate.localeCompare(leftDate);
      if (leftDate) return -1; // quem tem criativo recente vem antes
      if (rightDate) return 1;
      // ambos sem criativo recente â€” usa a ordem do projeto (created_at desc)
      return (projectOrder.get(left.project_id) ?? 0) - (projectOrder.get(right.project_id) ?? 0);
    });
  }, [rawProjects, rawCreatives]);

  const stats = useMemo<Stats>(() => {
    const estimatedCostBRL = totalCostUSD30d * USD_TO_BRL;
    return {
      completedCount: completedCount30d,
      estimatedCostBRL,
      costPerCreativeBRL: completedCount30d > 0 ? estimatedCostBRL / completedCount30d : 0,
    };
  }, [completedCount30d, totalCostUSD30d]);

  const filteredProjectGroups = useMemo(() => {
    if (!searchValue.trim()) return projectGroups;
    const query = searchValue.toLowerCase();

    return projectGroups.filter((group) => {
      if (group.project_name.toLowerCase().includes(query)) return true;
      return group.creatives.some((creative) => creative.status.toLowerCase().includes(query));
    });
  }, [projectGroups, searchValue]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const isEmpty = projectGroups.length === 0;

  if (isEmpty) {
    return (
      <div className="theme-panel-strong mx-auto flex max-w-4xl flex-col items-center justify-center space-y-6 rounded-[28px] px-8 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-champagne-alpha-10 text-accent-champagne shadow-[var(--shadow-accent-glow)]">
          <Sparkles className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Bem-vindo ao Criativos, {userName}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-secondary">
            Gere os primeiros projetos para acompanhar resultados, custo estimado e volume recente em um unico lugar.
          </p>
        </div>
        <Link
          href="/criar"
          className="inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-cta)] px-6 py-3 text-sm font-semibold text-surface-000 shadow-[var(--glow-cta)]"
        >
          <Plus className="h-4 w-4" />
          Criar primeiro projeto
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[2rem] font-semibold tracking-[-0.03em] text-text-primary">
            <LayoutDashboard className="h-7 w-7 text-text-accent" />
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-muted">Ola, {userName}. Acompanhe volume, custo e projetos recentes dos ultimos 30 dias.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Buscar projeto ou status..."
              className="w-full rounded-xl border border-white/8 bg-white/3 py-3 pl-10 pr-4 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-[var(--accent-alpha-20)] focus:shadow-[0_0_0_2px_var(--accent-alpha-08)]"
            />
          </label>

          <Link
            href="/criar"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-cta)] px-5 py-3 text-sm font-semibold text-surface-000 shadow-[var(--glow-cta)]"
          >
            <Plus className="h-4 w-4" />
            Novo Projeto
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 space-y-3">
          <KpiCards
            completedCount={stats?.completedCount ?? 0}
            estimatedCostBRL={stats?.estimatedCostBRL ?? 0}
            costPerCreativeBRL={stats?.costPerCreativeBRL ?? 0}
          />

          <section className="theme-panel rounded-[26px] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Criativos por projeto</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Abra um projeto para revisar configuracao, copies, visual e os criativos ja gerados.
                </p>
              </div>

              <Link
                href="/galeria"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent-champagne hover:underline"
              >
                Ver galeria
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {filteredProjectGroups.map((group) => (
                <ProjectGroup key={group.project_id} group={group} />
              ))}

              {filteredProjectGroups.length === 0 && (
                <div className="rounded-[22px] border border-border-subtle bg-white/2 px-5 py-8 text-center text-sm text-text-muted">
                  Nenhum projeto encontrado para a busca atual.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

