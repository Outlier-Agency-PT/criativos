"use client";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

/**
 * Tela de aceite de convite B2B (EP-14.10).
 *
 * O cliente chega aqui apos clicar no magic link e o auth/callback ter trocado o code por sessao
 * (redirectTo aponta /auth/callback?next=/convite). Aqui chamamos /api/admin/invite/accept, que le
 * o org_id/role do metadata do convite e vincula o usuario a org EXISTENTE, sem criar org nova.
 *
 * Esta rota e publica no middleware (PUBLIC_ROUTES) para que a checagem de org do middleware NAO
 * crie uma org orfa antes de a membership ser estabelecida por este fluxo.
 */
export default function ConvitePage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function accept() {
      try {
        const res = await fetch("/api/admin/invite/accept", { method: "POST" });
        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setState("error");
          setMessage(data?.error || "Nao foi possivel aceitar o convite.");
          return;
        }

        setState("ok");
        // Vinculo criado: segue para o app. O middleware ja encontra a membership.
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 800);
      } catch {
        if (!active) return;
        setState("error");
        setMessage("Erro de rede ao aceitar o convite. Tente novamente.");
      }
    }

    accept();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold text-text-accent">Criativos</h1>

        {state === "loading" && (
          <div className="space-y-3">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-text-accent" />
            <p className="text-text-secondary">Confirmando seu convite...</p>
          </div>
        )}

        {state === "ok" && (
          <div className="space-y-2">
            <p className="text-text-primary font-medium">Convite aceito!</p>
            <p className="text-text-secondary">Entrando na sua organizacao...</p>
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <p className="text-accent-red">{message}</p>
            <Link href="/login" className="inline-block text-text-accent hover:underline">
              Voltar ao login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

