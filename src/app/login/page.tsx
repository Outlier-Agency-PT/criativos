"use client";


import { Suspense, useState, useEffect } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles, Zap, Image, BookOpen, ChevronRight } from "lucide-react";
import { getThemeCSSVars, getThemeById } from "@/lib/themes";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  // Apply default theme on mount
  useEffect(() => {
    const theme = getThemeById("cyan");
    const vars = getThemeCSSVars(theme);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabase();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message || "Email ou palavra-passe inválidos");
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#000" }}>
      {/* ===== LEFT PANEL â€” Hero / Info ===== */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center p-10 overflow-hidden"
        style={{
          background: "linear-gradient(160deg, rgba(var(--accent-rgb),0.1) 0%, rgba(var(--accent-rgb),0.03) 40%, #000 80%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(var(--accent-rgb),0.05) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 65%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 10%, transparent 65%)",
          }}
        />
        {/* Glow orb top */}
        <div
          className="absolute top-[-100px] left-[10%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(var(--accent-rgb),0.08) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        {/* Glow orb bottom */}
        <div
          className="absolute bottom-[-150px] right-[5%] w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(var(--accent-rgb),0.04) 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />

        <div className="relative z-10 w-full max-w-lg">
          {/* Logo */}
          <div className="text-xl font-semibold text-[var(--accent)] mb-6">
            Criativos
          </div>

          {/* Stats â€” no topo, logo abaixo do logo */}
          <div className="flex gap-8 mb-10">
            {[
              { val: "500+", lbl: "Criativos gerados" },
              { val: "30s", lbl: "Tempo medio" },
              { val: "96x", lbl: "Mais rapido" },
            ].map((s) => (
              <div key={s.lbl}>
                <div className="text-2xl font-semibold text-white" style={{ letterSpacing: "-0.03em" }}>{s.val}</div>
                <div className="text-xs text-[#6b7280]">{s.lbl}</div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div
            className="w-full h-px mb-10"
            style={{ background: "linear-gradient(90deg, rgba(var(--accent-rgb),0.2), rgba(255,255,255,0.06), transparent)" }}
          />

          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] mb-6"
            style={{
              background: "rgba(var(--accent-rgb),0.08)",
              border: "1px solid rgba(var(--accent-rgb),0.15)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 0 6px var(--accent)" }} />
            Plataforma de criacao com IA
          </div>

          {/* Title */}
          <h2 className="text-4xl font-semibold text-white leading-tight mb-4" style={{ letterSpacing: "-0.03em" }}>
            Crie criativos profissionais em minutos
          </h2>

          <p className="text-base text-[#8b949e] leading-relaxed mb-10">
            Carrosseis, stories, reels, tudo no piloto automatico. IA que entende copy, design e conversao.
          </p>

          {/* Feature cards */}
          <div className="space-y-3">
            {[
              { icon: Sparkles, title: "IA Generativa", desc: "7 frameworks de copy + geracao de imagens" },
              { icon: Zap, title: "30 segundos", desc: "De uma headline a um carrossel pronto" },
              { icon: Image, title: "Multi-formato", desc: "Carrossel, stories, reels, feed" },
              { icon: BookOpen, title: "Swipe File", desc: "105 templates de referencia integrados" },
            ].map((feat) => (
              <div
                key={feat.title}
                className="flex items-center gap-4 p-4 backdrop-blur-xl transition-all hover:translate-x-1"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(var(--accent-rgb),0.1)",
                    border: "1px solid rgba(var(--accent-rgb),0.15)",
                  }}
                >
                  <feat.icon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{feat.title}</div>
                  <div className="text-xs text-[#8b949e]">{feat.desc}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-[rgba(255,255,255,0.15)]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== RIGHT PANEL â€” Login ===== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative">
        {/* Subtle dot grid on right too */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "radial-gradient(ellipse 50% 40% at 50% 50%, black 10%, transparent 60%)",
            WebkitMaskImage: "radial-gradient(ellipse 50% 40% at 50% 50%, black 10%, transparent 60%)",
          }}
        />

        <div className="w-full max-w-sm relative z-10">
          {/* Glass login box */}
          <div
            className="relative p-8 backdrop-blur-xl"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(var(--accent-rgb),0.03)",
            }}
          >
            {/* Top glow line */}
            <div
              className="absolute top-0 left-[10%] right-[10%] h-px"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.3), transparent)",
                boxShadow: "0 0 12px rgba(var(--accent-rgb),0.1)",
              }}
            />

            {/* Mobile-only logo (hidden on desktop since left panel has it) */}
            <div className="text-center space-y-2 mb-8">
              <h1 className="text-2xl font-semibold text-[var(--text-accent)]">Criativos</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Faça login para aceder
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(var(--accent-rgb),0.08)] transition-all text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]" htmlFor="password">
                  Palavra-passe
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(var(--accent-rgb),0.08)] transition-all text-sm"
                />
              </div>

              {error && (
                <p className="text-sm text-[var(--accent-red)]">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 font-semibold text-black text-sm disabled:opacity-50 transition-all hover:translate-y-[-1px]"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
                  boxShadow: "0 4px 20px rgba(var(--accent-rgb),0.25), 0 0 40px rgba(var(--accent-rgb),0.06)",
                }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </button>
            </form>

            <div className="text-center text-sm mt-6">
              <p className="text-[var(--text-muted)]">
                Não tem conta?{" "}
                <Link href="/registro" className="text-[var(--text-accent)] hover:underline">
                  Criar conta
                </Link>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-black text-[#8b949e]">Carregando...</div>}>
      <LoginForm />
    </Suspense>
  );
}

