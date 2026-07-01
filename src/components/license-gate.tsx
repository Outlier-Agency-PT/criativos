"use client";


import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

interface LicenseGateProps {
  children: React.ReactNode;
}

/**
 * Tela de aceite bloqueante do Termo de LicenÃ§a e Confidencialidade.
 * Ao montar, checa GET /api/license. Se o usuÃ¡rio ainda nÃ£o aceitou,
 * renderiza um overlay fullscreen bloqueante exigindo o aceite antes de
 * liberar a Ã¡rea logada. Aceite registrado uma Ãºnica vez por usuÃ¡rio.
 */
export function LicenseGate({ children }: LicenseGateProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checked, setCheckbox] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setCheckFailed(false);
    try {
      const res = await fetch("/api/license", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao verificar licenÃ§a");
      const data = await res.json();
      setAccepted(Boolean(data.accepted));
    } catch {
      // Fail-closed: se nÃ£o dÃ¡ pra confirmar o aceite, NÃƒO libera o conteÃºdo.
      // Mostra estado de erro com opÃ§Ã£o de tentar de novo.
      setAccepted(false);
      setCheckFailed(true);
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/license", { method: "POST" });
      if (!res.ok) throw new Error("NÃ£o foi possÃ­vel registrar o aceite");
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar o aceite");
    } finally {
      setSubmitting(false);
    }
  }

  // Enquanto carrega, nÃ£o mostra nada (loader sutil).
  if (accepted === null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  // JÃ¡ aceitou: libera a Ã¡rea logada normalmente.
  if (accepted) {
    return <>{children}</>;
  }

  // NÃ£o aceitou: overlay bloqueante fullscreen.
  return (
    <>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto"
        style={{
          background: "rgba(0,0,0,0.78)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="license-gate-title"
      >
        <div
          className="relative w-full max-w-xl my-8 p-8 rounded-2xl"
          style={{
            background: "var(--surface-050, #0d0d0f)",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{
                background: "rgba(var(--accent-rgb),0.1)",
                border: "1px solid rgba(var(--accent-rgb),0.2)",
              }}
            >
              <ShieldCheck className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <h2
              id="license-gate-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              Termo de LicenÃ§a e Confidencialidade
            </h2>
          </div>

          <div className="space-y-3 text-sm leading-relaxed text-[var(--text-secondary)] max-h-[45vh] overflow-y-auto pr-1">
            <p>
              O Criativos Ã© um software proprietÃ¡rio de Torriani, licenciado e
              nÃ£o vendido. O acesso Ã© concedido a vocÃª de forma pessoal,
              intransferÃ­vel e revogÃ¡vel, exclusivamente para uso restrito nos
              seus prÃ³prios projetos.
            </p>
            <p>
              Ã‰ expressamente proibido revender, sublicenciar, alugar ou
              distribuir o software; disponibilizar ou distribuir o
              cÃ³digo-fonte a terceiros; e criar, operar ou oferecer qualquer
              modelo de assinatura, SaaS ou cobranÃ§a recorrente tendo o
              software como base.
            </p>
            <p>
              O cÃ³digo-fonte Ã© informaÃ§Ã£o confidencial (NDA). VocÃª se
              compromete a nÃ£o divulgÃ¡-lo, publicÃ¡-lo nem espelhÃ¡-lo em
              repositÃ³rio pÃºblico, e a preservar todas as marcas de autoria e
              avisos de copyright presentes no software.
            </p>
            <p className="text-[var(--text-muted)]">
              Ao continuar, vocÃª declara que leu e aceita integralmente estes
              termos. O texto completo estÃ¡ disponÃ­vel em{" "}
              <a
                href="/LICENSE.txt"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                ver licenÃ§a completa
              </a>{" "}
              (arquivo LICENSE no repositÃ³rio).
            </p>
          </div>

          <label className="flex items-start gap-3 mt-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setCheckbox(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--accent)] cursor-pointer flex-shrink-0"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              Li e aceito os termos de licenÃ§a e confidencialidade
            </span>
          </label>

          {checkFailed && (
            <p className="text-sm text-[var(--accent-red)] mt-3">
              NÃ£o foi possÃ­vel verificar seu aceite.{" "}
              <button onClick={check} className="underline hover:no-underline">
                Tentar novamente
              </button>
            </p>
          )}

          {error && (
            <p className="text-sm text-[var(--accent-red)] mt-3">{error}</p>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || submitting}
            className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:translate-y-[-1px]"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-light))",
              boxShadow: "0 4px 20px rgba(var(--accent-rgb),0.25)",
            }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Aceitar e continuar
          </button>
        </div>
      </div>
      {/* A Ã¡rea logada NÃƒO Ã© renderizada atÃ© o aceite (fail-closed): evita
          carregar dados/telas por trÃ¡s do overlay antes do consentimento. */}
    </>
  );
}

