"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Mail,
  Send,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  UserPlus,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const OUTLIER_ORG_ID = "6b9e8609-d092-4b60-bc34-b6943eb1ff05";

interface Cliente {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  joined_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Expirado";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

export default function ClientesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/clientes");
    if (res.status === 403) {
      router.replace("/dashboard");
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes ?? []);
    setInvites(data.invites ?? []);
    setAuthorized(true);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setSendError("");
    setSendSuccess("");
    setSending(true);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, org_id: OUTLIER_ORG_ID, role: "editor" }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSendError(data?.error || "Não foi possível enviar o convite.");
      setSending(false);
      return;
    }

    setSendSuccess(`Convite enviado para ${email}.`);
    setEmail("");
    setSending(false);
    fetchData();
  }

  async function handleResend(inviteId: string) {
    setActionLoading(inviteId);
    await fetch("/api/admin/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId, action: "resend" }),
    });
    setActionLoading(null);
    fetchData();
  }

  async function handleExpire(inviteId: string) {
    setActionLoading(inviteId);
    await fetch("/api/admin/invite", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_id: inviteId, action: "expire" }),
    });
    setActionLoading(null);
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Clientes</h1>
        <p className="text-sm text-text-muted mt-1">
          Convide clientes e gerencie o acesso à plataforma Outlier Criativos.
        </p>
      </div>

      {/* Convidar */}
      <section className="theme-panel rounded-[22px] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-alpha-12)] border border-[var(--accent-alpha-20)]">
            <UserPlus className="w-4 h-4 text-text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Convidar cliente</h2>
            <p className="text-xs text-text-muted">O cliente receberá um link para definir a senha e aceder à plataforma.</p>
          </div>
        </div>

        <form onSubmit={handleInvite} className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@cliente.com"
              required
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-surface-050 border border-border-subtle rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-alpha-20)] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-black rounded-xl disabled:opacity-50 transition-all hover:translate-y-[-1px]"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-light))" }}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar convite
          </button>
        </form>

        {sendError && (
          <p className="mt-3 text-sm text-accent-red flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {sendError}
          </p>
        )}
        {sendSuccess && (
          <p className="mt-3 text-sm text-[var(--green,#34C77B)] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {sendSuccess}
          </p>
        )}
      </section>

      {/* Convites pendentes */}
      {invites.length > 0 && (
        <section className="theme-panel rounded-[22px] p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-alpha-12)] border border-[var(--accent-alpha-20)]">
                <Clock className="w-4 h-4 text-text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Convites pendentes</h2>
                <p className="text-xs text-text-muted">{invites.length} convite{invites.length !== 1 ? "s" : ""} a aguardar resposta</p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Email</th>
                  <th className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Enviado</th>
                  <th className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Validade</th>
                  <th className="text-right pb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {invites.map((inv) => {
                  const isExpired = new Date(inv.expires_at) < new Date();
                  const remaining = daysLeft(inv.expires_at);
                  return (
                    <tr key={inv.id}>
                      <td className="py-3 pr-4 text-text-primary font-medium">{inv.email}</td>
                      <td className="py-3 pr-4 text-text-muted">{formatDate(inv.created_at)}</td>
                      <td className="py-3 pr-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                          isExpired
                            ? "bg-red-500/10 text-red-400"
                            : "bg-amber-500/10 text-amber-400"
                        )}>
                          {remaining}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResend(inv.id)}
                            disabled={actionLoading === inv.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg border border-border-subtle hover:border-[var(--accent-alpha-30)] hover:text-text-accent transition-all disabled:opacity-50"
                            title="Reenviar convite"
                          >
                            {actionLoading === inv.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RotateCcw className="w-3 h-3" />
                            }
                            Reenviar
                          </button>
                          <button
                            onClick={() => handleExpire(inv.id)}
                            disabled={actionLoading === inv.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-muted rounded-lg border border-border-subtle hover:border-red-500/30 hover:text-red-400 transition-all disabled:opacity-50"
                            title="Cancelar convite"
                          >
                            <XCircle className="w-3 h-3" />
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Clientes ativos */}
      <section className="theme-panel rounded-[22px] p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-alpha-12)] border border-[var(--accent-alpha-20)]">
            <Users className="w-4 h-4 text-text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Clientes ativos</h2>
            <p className="text-xs text-text-muted">{clientes.length} cliente{clientes.length !== 1 ? "s" : ""} com acesso à plataforma</p>
          </div>
        </div>

        {clientes.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum cliente ativo ainda.</p>
            <p className="text-xs mt-1">Convide o primeiro cliente através do formulário acima.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Cliente</th>
                  <th className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Email</th>
                  <th className="text-left pb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Membro desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {clientes.map((c) => (
                  <tr key={c.user_id}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent-alpha-12)] border border-[var(--accent-alpha-20)] flex-shrink-0">
                          <span className="text-xs font-semibold text-text-accent">
                            {(c.full_name || c.email || "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <span className="text-text-primary font-medium">
                          {c.full_name || <span className="text-text-muted italic">Sem nome</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-text-muted">{c.email ?? "—"}</td>
                    <td className="py-3 text-text-muted">{formatDate(c.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
