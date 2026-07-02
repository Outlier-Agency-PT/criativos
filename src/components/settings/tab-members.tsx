"use client";


import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Send, RefreshCw, Clock, Check, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Invite {
  id: string;
  email: string;
  org_id: string;
  role: string;
  status: "pending" | "accepted" | "expired";
  invited_by: string;
  expires_at: string;
  created_at: string;
}

interface TabMembersProps {
  orgId: string;
}

const ROLE_OPTIONS = [
  { value: "editor", label: "Editor", description: "Pode criar e editar criativos" },
  { value: "admin", label: "Admin", description: "Acesso a configurações e API keys" },
  { value: "owner", label: "Owner", description: "Controlo total da organização" },
];

export function TabMembers({ orgId }: TabMembersProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "expired" | "all">("pending");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [expiringId, setExpiringId] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [creditBalance, setCreditBalance] = useState<string>("500");
  const [saving, setSaving] = useState(false);

  const fetchInvites = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/invite?org_id=${orgId}&status=${statusFilter}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInvites(data.invites || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar convites");
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchInvites();
  }, [fetchInvites]);

  async function handleInvite() {
    if (!email.trim()) {
      setError("Email é obrigatório");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = {
        email: email.trim(),
        org_id: orgId,
        role,
      };

      if (creditBalance && creditBalance !== "0") {
        const n = Number(creditBalance);
        if (Number.isInteger(n) && n >= 0) {
          body.credit_balance = n;
        }
      }

      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao enviar convite");
      }

      setSuccess(`Convite enviado para ${email}`);
      setEmail("");
      setRole("editor");
      setCreditBalance("500");
      setShowCreate(false);
      await fetchInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar convite");
    } finally {
      setSaving(false);
    }
  }

  async function handleResend(inviteId: string) {
    setResendingId(inviteId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_id: inviteId,
          action: "resend",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reenviar convite");

      setSuccess("Convite reenviado com sucesso");
      await fetchInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao reenviar convite");
    } finally {
      setResendingId(null);
    }
  }

  async function handleExpire(inviteId: string) {
    setExpiringId(inviteId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_id: inviteId,
          action: "expire",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao expirar convite");

      setSuccess("Convite expirado");
      await fetchInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao expirar convite");
    } finally {
      setExpiringId(null);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-medium">
            <Clock className="w-3 h-3" /> Pendente
          </span>
        );
      case "accepted":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-medium">
            <Check className="w-3 h-3" /> Aceito
          </span>
        );
      case "expired":
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-medium">
            <X className="w-3 h-3" /> Expirado
          </span>
        );
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-2">
        <Users className="w-5 h-5 text-text-muted mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Membros e Convites</h3>
          <p className="text-xs text-text-muted mt-0.5 max-w-xl">
            Convide utilizadores por email para entrar na sua organização. Eles receberão um link de confirmação.
          </p>
        </div>
      </div>

      {/* Mensagens de feedback */}
      {error && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-300">{success}</p>
        </div>
      )}

      {/* Formulário de convite */}
      {showCreate && (
        <div className="bg-surface-050 rounded-xl border border-border-subtle p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-primary">Convidar Utilizador</h4>
            <button
              onClick={() => setShowCreate(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="utilizador@empresa.com"
                className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-2">
                Papel na Organização
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      role === opt.value
                        ? "border-accent-champagne bg-accent-champagne/5"
                        : "border-border-subtle bg-surface-100 hover:border-border-subtle/80"
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 accent-accent-champagne"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-text-primary">{opt.label}</span>
                      <p className="text-xs text-text-muted mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Saldo de créditos */}
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Saldo de Créditos Inicial (opcional)
              </label>
              <input
                type="number"
                value={creditBalance}
                onChange={(e) => setCreditBalance(e.target.value)}
                placeholder="500"
                min="0"
                className="w-full px-3 py-2 rounded-lg bg-surface-100 border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-accent-champagne"
              />
              <p className="text-xs text-text-muted/70 mt-1">
                Pacotes nominais: 50, 500, 1000. Deixe em branco para não provisionar créditos.
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleInvite}
                disabled={saving || !email.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {saving ? "Enviando..." : "Enviar Convite"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-surface-100 text-text-secondary text-sm hover:bg-surface-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão para adicionar convite */}
      {!showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-champagne text-surface-900 text-sm font-medium hover:bg-accent-champagne/90"
        >
          <Plus className="w-4 h-4" />
          Convidar Utilizador
        </button>
      )}

      {/* Filtros de status */}
      <div className="flex gap-2">
        {(["pending", "accepted", "expired", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              statusFilter === s
                ? "bg-accent-champagne text-surface-900"
                : "bg-surface-100 text-text-secondary hover:bg-surface-200"
            )}
          >
            {s === "pending" && "Pendentes"}
            {s === "accepted" && "Aceitos"}
            {s === "expired" && "Expirados"}
            {s === "all" && "Todos"}
          </button>
        ))}
      </div>

      {/* Lista de convites */}
      {invites.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">
          {statusFilter === "pending"
            ? "Nenhum convite pendente. Clique em \"Convidar Utilizador\" para começar."
            : "Nenhum convite neste status."}
        </div>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="bg-surface-050 rounded-xl border border-border-subtle p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-sm font-semibold text-text-primary truncate">
                    {invite.email}
                  </span>
                  {getStatusBadge(invite.status)}
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="px-1.5 py-0.5 rounded bg-surface-100">
                    {invite.role === "owner" ? "Owner" : invite.role === "admin" ? "Admin" : "Editor"}
                  </span>
                  <span>Criado em {formatDate(invite.created_at)}</span>
                  {invite.status === "pending" && (
                    <span>Expira em {formatDate(invite.expires_at)}</span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {invite.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleResend(invite.id)}
                      disabled={resendingId === invite.id}
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-champagne hover:bg-surface-100 transition-colors disabled:opacity-50"
                      title="Reenviar convite"
                    >
                      {resendingId === invite.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleExpire(invite.id)}
                      disabled={expiringId === invite.id}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      title="Expirar convite"
                    >
                      {expiringId === invite.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
