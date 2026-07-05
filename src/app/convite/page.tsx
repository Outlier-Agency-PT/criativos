"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { getThemeCSSVars, getThemeById } from "@/lib/themes";

/**
 * Tela de aceite de convite B2B (EP-14.10).
 *
 * O cliente chega aqui apos clicar no magic link e o auth/callback ter trocado o code por sessao
 * (redirectTo aponta /auth/callback?next=/convite). A sessao do convite ja existe em cookies (ou,
 * em fluxos de implicit grant, no hash da URL que o supabase-js le automaticamente ao inicializar).
 *
 * Fluxo desta pagina:
 *   1) confirma que ha uma sessao valida (== convite valido); sem sessao, manda para /login;
 *   2) pede ao convidado para definir a propria password (supabase.auth.updateUser);
 *   3) chama /api/admin/invite/accept, que le o org_id/role do metadata do convite e vincula o
 *      usuario a org EXISTENTE, sem criar org nova;
 *   4) redireciona para /setup (configuracao inicial da organizacao).
 *
 * Esta rota e publica no middleware (PUBLIC_ROUTES) para que a checagem de org do middleware NAO
 * crie uma org orfa antes de a membership ser estabelecida por este fluxo.
 */
export default function ConvitePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const theme = getThemeById("cyan");
    const vars = getThemeCSSVars(theme);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function checkInviteSession() {
      const supabase = createBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setChecking(false);
    }

    checkInviteSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setSubmitting(true);

    const supabase = createBrowserSupabase();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "Não foi possível definir a palavra-passe.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/invite/accept", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Não foi possível aceitar o convite.");
        setSubmitting(false);
        return;
      }
    } catch {
      setError("Erro de rede ao aceitar o convite. Tente novamente.");
      setSubmitting(false);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/setup");
      router.refresh();
    }, 800);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: "#000" }}>
      {/* Subtle dot grid */}
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

          <div className="text-center space-y-2 mb-8">
            <img src="/logooutiliercriativos.png" alt="Outlier Criativos" className="h-8 mx-auto" />
            <p className="text-sm text-[var(--text-muted)]">
              {checking
                ? "A validar o seu convite..."
                : done
                ? "Convite aceite. A entrar na sua organização..."
                : "Defina a sua palavra-passe para continuar"}
            </p>
          </div>

          {checking && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          )}

          {!checking && done && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          )}

          {!checking && !done && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]" htmlFor="password">
                  Palavra-passe
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(var(--accent-rgb),0.08)] transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]" htmlFor="confirmPassword">
                  Confirmar palavra-passe
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(var(--accent-rgb),0.08)] transition-all text-sm"
                />
              </div>

              {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 font-semibold text-black text-sm disabled:opacity-50 transition-all hover:translate-y-[-1px]"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
                  boxShadow: "0 4px 20px rgba(var(--accent-rgb),0.25), 0 0 40px rgba(var(--accent-rgb),0.06)",
                }}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Definir palavra-passe e continuar
              </button>
            </form>
          )}

          {!checking && !done && (
            <div className="text-center text-sm mt-6">
              <p className="text-[var(--text-muted)]">
                <Link href="/login" className="text-[var(--text-accent)] hover:underline">
                  Voltar ao login
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
