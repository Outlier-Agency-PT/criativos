import Link from "next/link";

/**
 * Registro (EP-14.10): self-signup aberto DESATIVADO.
 *
 * DECISAO DE GATING:
 *   Antes, esta pagina fazia self-signup (supabase.auth.signUp + create_organization_for_user),
 *   criando uma org NOVA para qualquer pessoa. O onboarding B2B passou a ser por convite: o admin
 *   convida por email (/api/admin/invite) e o cliente entra numa org JA provisionada, sem criar org.
 *
 *   Em vez de manter um form de signup que ainda criaria org (e ainda dispararia a auto-criacao de
 *   org no middleware para usuario autenticado sem membership), optamos por DESATIVAR o cadastro
 *   aberto e exibir uma tela informativa apontando para o login. Isso:
 *     - fecha o caminho self-signup-cria-org de forma definitiva (nenhum signUp e disparado aqui);
 *     - NAO quebra logins existentes (a tela de /login e o fluxo de sessao seguem intactos);
 *     - mantem o fluxo de aceite de convite (/convite) como unica porta de entrada de novos usuarios.
 *
 *   A pagina vira um Server Component estatico (sem estado/cliente), ja que nao ha mais form.
 */
export default function RegistroPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-text-accent">Criativos</h1>
          <p className="text-sm text-text-secondary">Acesso por convite</p>
        </div>

        <div className="space-y-3 rounded-lg border border-border-subtle bg-surface-100 p-5 text-left">
          <p className="text-text-primary">
            O registo aberto foi desativado. O acesso ao Criativos agora é feito por convite.
          </p>
          <p className="text-text-secondary text-sm">
            Se você recebeu um convite por email, clique no link da mensagem para definir sua palavra-passe
            e entrar na sua organização. Se ainda não tem convite, fale com o seu administrador.
          </p>
        </div>

        <div className="text-center text-sm">
          <p className="text-text-muted">
            Ja tem conta?{" "}
            <Link href="/login" className="text-text-accent hover:underline">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

