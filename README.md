# Criativos

Sistema de geração e edição de criativos para anúncios e redes sociais (Meta Ads, Instagram), com IA generativa de imagem. Stack: **Next.js 16** + **Supabase** + **Tailwind** + **TypeScript**.

> **Software proprietário de Outlier Agency — licenciado, não vendido.** Uso restrito: veja `LICENSE`. Você pode usar e liberar para seus alunos; não pode revender, distribuir o código ou criar assinatura em cima. O código é confidencial (NDA).

## Instalação (recomendado: na nuvem, com o Claude Code)

A forma mais simples de instalar é deixar o **Claude Code** conduzir. Abra o Claude Code na pasta do projeto e cole:

```
Leia o arquivo SETUP-CLAUDE.md deste projeto e conduza a minha instalação
do Criativos na nuvem do zero, seguindo os passos na ordem. Eu não sou técnico:
execute os comandos por mim, me explique cada passo e me peça os valores
(chaves, senhas, dados de conta) quando precisar. Vamos um passo de cada vez.
```

- **Manual visual com checklist:** abra **`GUIA-INSTALACAO.html`** no navegador (marca o progresso de cada etapa).
- **Roteiro que o Claude segue:** `SETUP-CLAUDE.md`.
- **Contrato de licença (para imprimir/assinar):** `CONTRATO-LICENCA.html`. Termos completos: `LICENSE`.

O passo a passo manual (sem Claude Code) está logo abaixo.

---

## Pré-requisitos

- **Node.js 18+** (recomendado 20+)
- **npm** (vem com o Node)
- Conta no **[Supabase](https://supabase.com)** (plano free serve para começar)
- **Supabase CLI** — `npm install -g supabase` ([docs](https://supabase.com/docs/guides/cli))
- Pelo menos uma **chave de API de IA de imagem** (Gemini / WisGate / OpenRouter). Estas são cadastradas dentro do app, não no `.env`.

---

## Setup do zero ao "rodando"

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar o projeto Supabase

1. Acesse https://supabase.com e crie um novo projeto.
2. Anote a senha do banco (você vai precisar ao linkar).
3. Em **Project Settings > API**, copie:
   - `Project URL` → vai em `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → vai em `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (secreta) → vai em `SUPABASE_SERVICE_KEY`

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Abra `.env.local` e preencha os valores do Supabase. Gere a chave de criptografia:

```bash
openssl rand -hex 32
```

Cole o resultado em `ENCRYPTION_KEY`. **Defina uma vez e não troque depois** (senão as chaves de IA salvas no banco param de descriptografar).

### 4. Aplicar o schema do banco (migrations)

```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF   # o ref aparece na URL do projeto
supabase db push
```

Isso cria todas as tabelas, policies de segurança (RLS) e os buckets de storage (`creatives`, `templates`, `expert-photos`, `brand-assets`, `logos`).

### 5. Rodar

```bash
npm run dev
```

App em **http://localhost:3028**.

### 6. Primeiro acesso

1. Crie um usuário pelo fluxo de cadastro do app (ou via **Authentication** no painel Supabase).
2. Entre em **/configuracoes** e cadastre suas **chaves de API de IA** (Gemini, WisGate ou OpenRouter). Sem isso, a geração de imagem não funciona.
3. Pronto para criar criativos.

> **Admin ilimitado (opcional):** por padrão nenhuma org nasce "ilimitada" (todas começam com 0 créditos). Para tornar a sua org administradora sem limite de consumo:
> ```sql
> UPDATE criativos_org_limits SET is_super_admin = true, credit_balance = NULL
> WHERE org_id = '<id-da-sua-org>';   -- SELECT id FROM organizations;
> ```

---

## Deploy em produção

Funciona em qualquer host que rode Next.js (Vercel, Render, VPS com Node, Docker).

- **Vercel:** importe o repositório, defina as mesmas variáveis de `.env.local` em *Environment Variables* e faça o deploy. O app sobe na porta padrão da plataforma.
- **VPS / Docker:** `npm run build` e depois `npm run start` (porta 3028). Configure as variáveis de ambiente no servidor.

Use o **mesmo projeto Supabase** (com as migrations já aplicadas) em produção, ou crie um separado e rode `supabase db push` nele também.

---

## Scripts disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (porta 3028) |
| `npm run build` | Build de produção |
| `npm run start` | Servir build de produção (porta 3028) |
| `npm run lint` | Checagem de lint |

Scripts utilitários (opcionais, exigem `SUPABASE_SERVICE_KEY` e `NEXT_PUBLIC_SUPABASE_URL` no ambiente) ficam em `scripts/` — importação/análise de templates, seeds e manutenção de imagens.

---

## Estrutura

```
src/                   código da aplicação (Next.js app router, API routes, componentes)
supabase/migrations/   schema do banco (reconstruível com `supabase db push`)
scripts/               utilitários de manutenção (opcionais)
public/                assets estáticos
.env.example           template de variáveis de ambiente
```

---

## Provedores de IA

- **Imagem:** modelo `gemini-3-pro-image-preview` (Nano Banana Pro) em todos os provedores.
- **Texto (copy):** configurável em /configuracoes (Claude Haiku, GPT-4o mini, Gemini Flash) com cadeia de fallback.
- Provedores suportados para imagem: **Gemini direto**, **WisGate**, **OpenRouter** (todos cadastrados dentro do app).

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `npm run dev` falha ao iniciar | dependências não instaladas | `npm install` |
| Login não funciona | Supabase não configurado | confira `.env.local` e se o `supabase db push` rodou |
| "Geração falhou" / nada acontece | sem chave de IA cadastrada | cadastre em /configuracoes |
| Upload da logo falha | bucket `logos` não criado | rode `supabase db push` (migration `20260625000001`) |
| Imagem não atualiza após editar | cache do navegador | recarregue com cache limpo (Cmd+Shift+R) |
