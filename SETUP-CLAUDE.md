# SETUP-CLAUDE.md — Instruções para o Claude Code conduzir a instalação

> Este arquivo é o roteiro que o **Claude Code** segue para instalar o Criativos no
> ambiente do usuário. Quem está lendo: se você é o Claude Code, siga estes passos
> na ordem, fazendo perguntas ao usuário quando precisar de um valor que só ele tem.
> Se você é uma pessoa, abra o `GUIA-INSTALACAO.html` no navegador — é o passo a passo visual.

## Papel do Claude Code nesta instalação

Você vai conduzir o usuário (provavelmente não-técnico) do zero até o sistema rodando
em produção na nuvem. Você FAZ os comandos por ele sempre que puder, e só PEDE a ele
os valores que apenas ele consegue obter (senhas, chaves de API, dados de conta).

Regras de conduta:
- Explique cada passo em linguagem simples antes de executar.
- Nunca invente uma chave de API, senha ou URL. Sempre PEÇA ao usuário e espere a resposta.
- Nunca commite segredos. As chaves vão no `.env.local` (que é ignorado pelo Git).
- Ao terminar cada bloco, confirme com o usuário antes de seguir.

## Valores que você vai precisar PEDIR ao usuário (colete conforme avança)

| Valor | Onde o usuário acha | Vai em |
|-------|---------------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API > Project URL | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API > anon public | `.env.local` + Vercel |
| `SUPABASE_SERVICE_KEY` | Supabase > Project Settings > API > service_role (secret) | `.env.local` + Vercel |
| Senha do banco (DB password) | Supabase > Project Settings > Database (ou "Reset database password") | usada só no `supabase link` |
| Project Ref do Supabase | aparece na URL do projeto: `app.supabase.com/project/<REF>` | `supabase link` |
| `ENCRYPTION_KEY` | VOCÊ gera com `openssl rand -hex 32` | `.env.local` + Vercel |
| Chaves de IA (Gemini / WisGate / OpenRouter) | contas dos provedores de IA | cadastradas DENTRO do app, não no `.env` |

## Passos a executar

### Passo 1 — Verificar pré-requisitos
Rode e confirme versões: `node -v` (>=18), `npm -v`, `git --version`, `supabase --version`.
Se faltar o Supabase CLI: `npm install -g supabase`.

### Passo 2 — Instalar dependências
Na raiz do projeto: `npm install`.

### Passo 3 — Criar o projeto Supabase (guiar o usuário)
Peça ao usuário para criar um projeto em https://supabase.com (anotando a senha do banco).
Quando estiver pronto, peça os 3 valores da aba API (URL, anon, service_role) e o Project Ref.

### Passo 4 — Configurar variáveis de ambiente
- `cp .env.example .env.local`
- Gere a chave: `openssl rand -hex 32` → preencha `ENCRYPTION_KEY`.
- Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
  com os valores que o usuário forneceu. Edite o `.env.local` por ele.
- Avise: o `ENCRYPTION_KEY` é definido UMA vez e não pode mudar depois.

### Passo 5 — Aplicar o banco de dados
- `supabase login` (abre o navegador para o usuário autenticar).
- `supabase link --project-ref <REF>` (peça a senha do banco se solicitado).
- `supabase db push` (cria todas as tabelas, RLS, buckets e a tabela de aceite de licença).
- Confirme que terminou sem erro.

### Passo 6 — Testar localmente (opcional mas recomendado)
- `npm run dev` → abre em http://localhost:3028.
- Peça ao usuário para criar a conta dele e confirmar que o login funciona.
- No primeiro acesso aparece a TELA DE ACEITE DE LICENÇA — o usuário deve ler e aceitar.

### Passo 7 — Deploy na nuvem (Vercel — recomendado)
- Garanta que o código está num repositório Git do próprio usuário (ele clonou de um repo privado;
  oriente a criar um repo PRIVADO próprio se for versionar — NUNCA tornar público, é confidencial).
- Em https://vercel.com: importar o repositório.
- Em Environment Variables, adicionar TODAS as variáveis do `.env.local`
  (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, ENCRYPTION_KEY).
- Deploy. O sistema sobe na URL da Vercel.
- Configurar domínio próprio do usuário (opcional) nas configurações de domínio da Vercel.

### Passo 8 — Cadastrar as chaves de IA (dentro do app)
- Com o sistema no ar, o usuário acessa `/configuracoes`.
- Cadastra pelo menos uma chave de IA (Gemini, WisGate ou OpenRouter). Sem isso, a geração não funciona.

### Passo 9 — Conferência final
- Login funciona, tela de aceite apareceu e foi aceita, geração de um criativo de teste funciona.
- Lembrar o usuário: o uso é restrito (ver LICENSE) — pode usar e liberar para os alunos dele,
  não pode revender nem distribuir o código.

## Notas importantes
- O sistema é proprietário de **Outlier Agency**, licenciado e não vendido (ver `LICENSE`).
- Custos de Supabase e das APIs de IA são do usuário (ele usa as próprias contas/chaves).
- Porta local padrão: 3028. Em produção a Vercel define a porta automaticamente.
