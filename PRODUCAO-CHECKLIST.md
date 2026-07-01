# 🚀 Guia Completo de Deploy para Produção — Criativos

**Data de análise:** 2026-06-30  
**Projeto:** Criativos v0.1.0 (Next.js 16 + Supabase + TypeScript)  
**Status:** ⚠️ **Contém alterações temporárias que DEVEM ser revertidas antes de deploy**

---

## 📋 RESUMO EXECUTIVO — Antes de qualquer coisa

### ⚠️ BLOQUEADORES CRÍTICOS (REVERTIR ANTES DE QUALQUER DEPLOY)

**Dois arquivos têm código de teste que desabilita a segurança:**

1. **`src/middleware.ts` (linha 17-18)** — Bypass completo de autenticação
   ```typescript
   // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
   return NextResponse.next();  // ← REMOVE ISTO
   ```
   **Impacto:** Qualquer pessoa acessa qualquer rota sem fazer login.

2. **`src/app/(auth)/layout.tsx` (linhas 16-19)** — Dados fake em hardcode
   ```typescript
   // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
   const userName = "Usuario Teste";
   const userEmail = "teste@local.com";
   const orgId = "";
   ```
   **Impacto:** Usuários veem sempre dados fake; sidebar está sem dados reais.

3. **`next.config.ts` (linha 8)** — TypeScript com erros ignorados
   ```typescript
   typescript: {
     ignoreBuildErrors: true,  // ← DESABILITAR EM PRODUÇÃO
   }
   ```
   **Impacto:** Erros de tipo passam silenciosamente, problemas em produção.

**→ AÇÃO IMEDIATA:** Ver seção **"7. Revertir Alterações Temporárias"** abaixo para os patches exatos.

---

## 1️⃣ VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS EM PRODUÇÃO

### Variáveis Supabase (OBRIGATÓRIAS)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # Chave pública (pode estar em JS)
SUPABASE_SERVICE_KEY=eyJhbGc...           # Chave secreta — APENAS servidor
```
- **Origem:** Supabase > Project Settings > API
- **Diferença dev/prod:** URLs diferentes se usar 2 projetos Supabase distintos; chaves também mudam
- **Exposição:** `NEXT_PUBLIC_*` vai no frontend; `SUPABASE_SERVICE_KEY` fica NO BACKEND APENAS

### Criptografia de API Keys (OBRIGATÓRIA)
```bash
ENCRYPTION_KEY=a1b2c3d4e5f6...  # Exatamente 64 caracteres hexadecimais (32 bytes)
```
- **Geração:** `openssl rand -hex 32` (rodar UMA única vez)
- **Uso:** Criptografa chaves de IA que usuários cadastram (Gemini, OpenRouter, etc.)
- **⚠️ CRÍTICO:** Se trocar depois, todas as chaves salvas ficam ilegíveis. **NUNCA altere em produção.**
- **Armazenamento:**
  - Local: `.env.local` (ignorado por git)
  - Vercel/hospedagem: Environment Variables da plataforma
  - VPS/Docker: variável de ambiente do sistema ou arquivo `.env` (com restrição de permissões `600`)

### Environment/Modo (OBRIGATÓRIO)
```bash
NODE_ENV=production  # ← MUDE de "development"
```
- **Verificação em código:** `src/app/api/copy-library/import-local/route.ts` linha 72 bloqueia se não for dev
- **Impacto:** Dev tools desabilitam, minificação ativa, cache agressivo

### Endpoints de IA (OPCIONAL — apenas para override)
```bash
ANTHROPIC_URL=...      # Deixar em branco = usa padrão
OPENAI_URL=...         # Deixar em branco = usa padrão
OPENROUTER_URL=...     # Deixar em branco = usa padrão
WISGATE_CHAT_URL=...   # Deixar em branco = usa padrão
WISGATE_GEMINI_URL=... # Deixar em branco = usa padrão
```
- **Definido em:** `src/lib/config/endpoints.ts`
- **Usar apenas se:** Proxy corporativo ou endpoint customizado (raro)

### ❌ O QUE NÃO VAI NO .env

Chaves de IA (Gemini, OpenRouter, etc.) **NÃO** vão no `.env`:
- São cadastradas dentro do app em `/configuracoes` > "Chaves de IA"
- Ficam criptografadas no banco Supabase (tabela `api_keys`)
- Cada organização tem suas próprias chaves

---

## 2️⃣ SCHEMA DO SUPABASE — TABELAS, RLS, FUNCTIONS, MIGRATIONS

### Visão Geral do Schema

**103 migrations aplicadas** (de 2026-03-11 até 2026-06-25) criam:
- **8 tabelas principais:** organizations, organization_members, api_keys, templates, generation_projects, creatives, personas, brand_kits
- **11 tabelas de negócio:** copy_library, billing, invites, etc.
- **3 buckets de storage:** creatives, templates, expert-photos, brand-assets, logos
- **RLS em todas as tabelas:** cada org vê apenas seus dados
- **5 Postgres functions:** RPCs para billing, contagem de erros, etc.

### Tabelas Críticas

#### (1) `organizations` + `organization_members`
- **Propósito:** Multi-tenant; cada org é isolada
- **RLS:** Owner pode editar organização; membros veem apenas suas orgs
- **Ação setup:** Middleware cria org automaticamente no 1º login

```sql
-- Ver migration 20260311000001_create_organizations.sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT,
  owner_id UUID,  -- Dono original
  setup_completed BOOLEAN,
  setup_step INT
);
```

#### (2) `api_keys` (CRÍTICA — chaves criptografadas)
- **Propósito:** Guardar chaves de IA criptografadas (Gemini, OpenRouter, etc.)
- **Criptografia:** AES-256-GCM com ENCRYPTION_KEY
- **RLS:** Acesso isolado por org
- **Função:** `decryptKey()` em `src/lib/crypto.ts` descriptografa em runtime

```sql
-- Ver migration 20260311000006_create_api_keys.sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  org_id UUID,
  provider TEXT,        -- 'gemini', 'openrouter', 'wisgate'
  encrypted_key TEXT,   -- Formato: iv:authTag:ciphertext (base64)
  priority INT,
  is_active BOOLEAN,
  error_count INT       -- Rastreamento de falhas
);
```

#### (3) `templates` + `creatives`
- **Propósito:** Modelos de anúncios/posts/stories; criativos gerados
- **Storage:** Imagens em bucket `templates` e `creatives`
- **Global templates:** Há templates globais (read-only para usuários normais)
- **RLS:** Escrever templates global = service_role only (migration 20260623000002)

#### (4) `criativos_org_limits` + `criativos_generation_logs` (BILLING)
- **Propósito:** Saldo de créditos; log de consumo
- **RLS (HARDENED):** Users veem (SELECT) mas NÃO MUTAM (migration 20260623000003)
  - Qualquer UPDATE/INSERT do user é negado pelo RLS
  - Backend usa service_role para mutar (bypassa RLS)
  - **Previne:** Cliente se auto-recarregar chamando Supabase direto
- **Tabelas:**
  - `criativos_org_limits`: saldo por org, limite mensal
  - `criativos_generation_logs`: linha por geração (provider, custo, timestamp)
  - `criativos_credit_adjustments`: histórico de recargas

#### (5) `license_acceptances`
- **Propósito:** Prova de consentimento do Termo de Licença
- **Fluxo:** LicenseGate checks GET /api/license → se não aceitou, bloqueia fullscreen
- **Tabela:** Uma linha por user + license_version (idempotente)

### RLS (Row Level Security) — Padrão

**TODAS as tabelas de dados do usuário têm RLS habilitada.**

Padrão geral:
```sql
-- Isolamento por org
CREATE POLICY "org_isolation" ON some_table
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
```

**Exceção crítica:** Billing (org_limits, generation_logs) é SELECT-only para authenticated; mutações passam por service_role no backend.

### Postgres Functions (RPC)

Localizados em migration files, usados por API routes:

1. **`increment_key_error()`** (migration 20260617000001)
   - Incrementa contador de erros em api_keys
   - Chama automático quando chave falha em geração

2. **`decrement_credit()`** (migration 20260623000004)
   - Decrementa saldo de créditos após geração
   - Chamado por `/api/generate/one`

3. **`refund_credit()`** (migration 20260623000005)
   - Reembolsa crédito em caso de falha

4. **`recharge_credit()`** (migration 20260623000006)
   - Recarga saldo de org (para endpoint de billing)

### Storage Buckets

| Bucket | Propósito | Acesso |
|--------|-----------|--------|
| `creatives` | Imagens geradas pelos usuários | Public read, org write |
| `templates` | Modelos de anúncios (swipe file) | Public read, system write |
| `expert-photos` | Fotos de personas | Org read/write |
| `brand-assets` | Logos, assets de marca | Org read/write |
| `logos` | Logos cadastrados (migration 20260625000001) | Org read/write |

**RLS no Storage:** Aplicado através de policies nas tabelas + JWT token (role da org).

### ✅ Checklist de Setup do Schema

- [ ] Criar projeto Supabase
- [ ] Rodara `supabase login && supabase link --project-ref <REF>`
- [ ] Confirmar senha do banco
- [ ] Rodar `supabase db push` (aplica todas as 103 migrations)
- [ ] Verificar no painel Supabase que todas as tabelas existem
- [ ] Validar RLS está habilitada: `SELECT tablename FROM pg_tables WHERE schemaname='public';`
- [ ] Testar que storage buckets foram criados automaticamente

---

## 3️⃣ SCRIPTS DE SETUP E SEED

### Scripts Disponíveis

Todos ficam em `scripts/` e exigem `.env.local` configurado.

#### `scripts/seed-templates.ts` — Templates Padrão
```bash
npx tsx scripts/seed-templates.ts <org_id>
```
- **O que faz:** Insere 10 templates padrão (4 anúncios, 3 posts, 3 stories) na org
- **Quando usar:** Após criar org, para dar exemplos iniciais
- **Output:** IDs dos templates criados
- **Nota:** Imagens são placeholders; substitua depois em Storage

#### `scripts/seed-brand-kits.ts` — Brand Kits Padrão
```bash
npx tsx scripts/seed-brand-kits.ts <org_id>
```
- **O que faz:** Insere brand kits de exemplo (cores, fontes)
- **Quando usar:** Opcional; templates já têm padrões embutidos

#### `scripts/import-templates.mjs` — Importar Templates de Arquivo
```bash
node scripts/import-templates.mjs <arquivo_json>
```
- **O que faz:** Bulk import de templates via JSON
- **Uso:** Para migrar templates de sistema anterior

#### `scripts/analyze-all-templates.mjs` — Análise de Templates
```bash
node scripts/analyze-all-templates.mjs
```
- **O que faz:** Percorre templates globais e gera análises visual/textual
- **Uso:** Manutenção; reanalisa modelos após atualizar dados

#### `scripts/optimize-storage-images.mjs` — Otimização de Imagens
```bash
node scripts/optimize-storage-images.mjs
```
- **O que faz:** Comprime/redimensiona imagens no Storage
- **Uso:** Reduzir custos de banda

### ⚠️ Nenhum seed automático em deploy

**Importante:** Nenhum script roda automaticamente em deploy. Você precisa:
1. Rodar `supabase db push` (migrations/schema)
2. Opcionalmente rodar `seed-templates.ts` se quiser templates iniciais
3. Usuários cadastram suas próprias chaves de IA em `/configuracoes`

---

## 4️⃣ ENCRYPTION_KEY — GERAÇÃO, ARMAZENAMENTO E RECUPERAÇÃO

### Geração (Fazer UMA única vez)

```bash
openssl rand -hex 32
# Saída exemplo: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6
```

### Armazenamento Seguro

#### ✅ Desenvolvimento (máquina local)
- `.env.local` (ignorado por git, nunca versionar)

#### ✅ Produção (Vercel)
1. Dashboard Vercel > Project > Settings > Environment Variables
2. Adicionar `ENCRYPTION_KEY=<valor>`
3. Selecionar **Production** environment
4. Deploy automático re-lê a variável

#### ✅ Produção (VPS/Docker)
1. Gerar valor com `openssl rand -hex 32`
2. Armazenar em:
   - Arquivo `.env.production` com permissões `600` (`chmod 600 .env.production`)
   - Ou variável de ambiente do sistema: `export ENCRYPTION_KEY=...`
   - Ou secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
3. Garantir que o arquivo `.env.production` **NÃO** fica em git
4. Em CI/CD, injetar via secrets da plataforma (GitHub Secrets, GitLab CI, etc.)

### Como é usada em Runtime

```typescript
// src/lib/crypto.ts
const key = process.env.ENCRYPTION_KEY;
if (!key || key.length !== 64) {
  throw new Error("ENCRYPTION_KEY não configurada ou inválida...");
}
const buffer = Buffer.from(key, "hex");
// Usa AES-256-GCM para criptografar/descriptografar chaves de IA
```

**Fluxo de uma chave de IA:**
1. Usuário cola chave em `/configuracoes` → POST `/api/api-keys`
2. Backend criptografa: `encryptKey(plaintext)` → `iv:authTag:ciphertext`
3. Salva string criptografada em `api_keys.encrypted_key`
4. Ao usar, descriptografa: `decryptKey(encrypted)` → plaintext
5. Usa plaintext para chamar API da IA

### ⚠️ NUNCA altere depois

Se mudar `ENCRYPTION_KEY` em produção:
- ❌ Todas as chaves salvas ficam ilegíveis
- ❌ Geração falha com erro de descriptografia
- ❌ Sem rollback possível (dados perdidos)

**Proteção:** Salve a chave em lugar MUITO seguro (cofre, 1Password, LastPass, etc.).

### Recuperação em caso de perda

Se perder a chave (cenário desastre):
1. **Não há recuperação.** Os dados estão perdidos.
2. **Solução:** Ir ao banco, deletar linhas antigas de `api_keys` da org, pedir usuários para recadastrar.
3. **Prevenção:** Fazer backup da ENCRYPTION_KEY em lugar seguro (separado do código).

---

## 5️⃣ REQUISITOS DE HOSTING — Features Next.js Específicas

### Features Usadas

✅ **Server Actions** (experimental)
- `serverActions.bodySizeLimit: "10mb"` em next.config.ts
- Impacto: POST de dados até 10MB (para upload de imagens)
- Compatível com: Vercel ✅, self-hosted Node ✅

✅ **Middleware** (next.js nativo)
- Edge Runtime (executa antes do Node server)
- Impacto: Autenticação/redirecionamento antes de carregar página
- Compatível com: Vercel ✅, Node self-hosted ✅ (com supabase SSR middleware)

✅ **API Routes** (Server-side)
- 50+ endpoints em `src/app/api/**`
- Impacto: Processamento de IA, billing, upload em Node.js
- Compatível com: Vercel ✅, Node self-hosted ✅

✅ **Static Assets** (images: unoptimized)
- Imagens não são otimizadas by Next.js Image component
- Impacto: Bucket Supabase entrega direto
- Compatível com: Vercel ✅, self-hosted ✅

### Opções de Hosting

| Plataforma | Custo | Setup | Recomendação |
|------------|-------|-------|-------------|
| **Vercel** (recomendado) | ~$20/mês base | 5 min | ✅ Integração perfeita, auto-scale, variavelsprontamente |
| **Render** | ~$12/mês base | 10 min | ✅ Bom; Node.js nativo, suporte a env vars |
| **Railway** | Pay-as-you-go | 10 min | ✅ Simples; próximo/equivalente a Render |
| **AWS App Runner** | ~$30/mês | 20 min | ⚠️ Mais complexo; para quem já tem AWS |
| **Digital Ocean App Platform** | ~$12-25/mês | 15 min | ✅ Simples; bom custo/benefício |
| **VPS próprio** (Docker) | ~$5-20/mês | 45 min | ⚠️ Requer DevOps; banco + app na mesma VPS é risco |

### ✅ Recomendação: Vercel

**Por quê:**
1. Integração direta com Next.js 16 (maintida pela própria Vercel)
2. Environme Variables simples, secrets gerenciados
3. Deploy com git push automático
4. Escala automática se picos de uso
5. Custom domains fácil
6. Suporte a Edge Middleware (seu middleware.ts roda no edge)
7. Logs e monitoramento integrado

**Setup em Vercel:**
1. Conectar repo Git
2. Importar variavelsenvironment do `.env.local`
3. Deploy com 1 clique
4. URL automática: `seu-projeto.vercel.app`

---

## 6️⃣ ALTERAÇÕES TEMPORÁRIAS QUE DEVEM SER REVERTIDAS

### ⚠️ BLOQUEADOR 1: src/middleware.ts

**Situação:** Autenticação completamente desabilitada

```typescript
// Linhas 16-18 AGORA
export async function middleware(request: NextRequest) {
  // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
  return NextResponse.next();  // ← REMOVE
```

**Problema:**
- Qualquer pessoa acessa qualquer rota (dashboard, configurações, etc.)
- Não valida login
- Não cria org automaticamente
- Middleware inteiro é pulado

**Revert corrigido:**

```typescript
export async function middleware(request: NextRequest) {
  // ← DELETE a linha "return NextResponse.next();"
  
  const { pathname } = request.nextUrl;

  // Rotas públicas não precisam de auth
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // Resto do código fica como está (linhas 28+)
  ...
}
```

**Teste após revert:**
- [ ] Acesso sem login → redireciona para `/login`
- [ ] Login funciona → redireciona para `/setup` ou dashboard
- [ ] Primeira org criada automaticamente na 1ª navegação pós-login

---

### ⚠️ BLOQUEADOR 2: src/app/(auth)/layout.tsx

**Situação:** Dados de usuário fake em hardcode

```typescript
// Linhas 16-19 AGORA
export default async function AuthLayout({...}) {
  // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
  const userName = "Usuario Teste";
  const userEmail = "teste@local.com";
  const orgId = "";
  // ↑ REMOVE TUDO ISTO
```

**Problema:**
- Sidebar sempre mostra "Usuario Teste"
- Sem dados reais de org
- LicenseGate removido (vê abaixo)

**Revert corrigido:**

```typescript
import { requireAuth } from "@/lib/api-auth";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { LicenseGate } from "@/components/license-gate"; // ← ADD

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Buscar usuário e org REAL do Supabase
  const { user, supabase } = await requireAuth();

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, organizations(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const orgId = membership?.org_id || "";
  const userName = user.user_metadata?.full_name || user.email || "Usuário";
  const userEmail = user.email || "";

  return (
    <ThemeProvider orgId={orgId}>
      <LicenseGate>
        <div className="theme-shell flex h-screen overflow-hidden rounded-none md:m-3 md:h-[calc(100vh-1.5rem)] md:rounded-[28px]">
          <Sidebar userName={userName} userEmail={userEmail} />
          <main className="relative flex-1 overflow-y-auto">
            <div className="p-4 pt-[4.25rem] md:p-6 md:pt-6">
              {children}
            </div>
          </main>
        </div>
      </LicenseGate>
    </ThemeProvider>
  );
}
```

**O que mudou:**
- ✅ `requireAuth()` busca usuário real
- ✅ Query ao banco busca org real
- ✅ `LicenseGate` wrappa conteúdo (bloqueia até aceitar licença)
- ✅ Nome/email/org preenchidos dinamicamente

**Teste após revert:**
- [ ] Login → vê nome real na sidebar
- [ ] Email correto na sidebar
- [ ] LicenseGate aparece na 1ª vez (overlay bloqueante)
- [ ] Após aceitar licença, conteúdo aparece
- [ ] Dashboard carrega dados reais

---

### ⚠️ BLOQUEADOR 3: next.config.ts

**Situação:** TypeScript com erros ignorados

```typescript
// Linha 8 AGORA
typescript: {
  ignoreBuildErrors: true,  // ← REMOVE
}
```

**Problema:**
- Erros de tipo (type mismatch, undefined, etc.) são silenciados
- Build de produção não falha mesmo com bugs
- Risco: código quebrado só descobre em runtime

**Revert corrigido:**

```typescript
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // ← DELETE ou comente o bloco typescript inteiro
  // typescript: { ignoreBuildErrors: true }
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["sharp"],
};
```

**Teste após revert:**
- [ ] Rodar `npm run build` → deve falhar se houver erros TypeScript
- [ ] Corrigir erros que aparecerem
- [ ] Build suceder com zero erros

---

## 7️⃣ CHECKLIST DE SEGURANÇA PRÉ-DEPLOY

### Código & Configuração

- [ ] ✅ **Middleware:** Linha 18 (`return NextResponse.next()`) foi REMOVIDA
- [ ] ✅ **Layout auth:** Dados fake removidos, `LicenseGate` adicionado, `requireAuth()` implementado
- [ ] ✅ **TypeScript:** `ignoreBuildErrors: true` foi removido do next.config.ts
- [ ] ✅ **Logs sensíveis:** Procurar por console.log/console.error com chaves/tokens e remover
- [ ] ✅ **Dados hardcoded:** Procurar por URLs, IPs, chaves placeholder no código

### Variáveis de Ambiente

- [ ] ✅ `.env.local` adicionado ao `.gitignore` (já está)
- [ ] ✅ `.env.example` tem apenas placeholders (não valores reais)
- [ ] ✅ `ENCRYPTION_KEY` gerado com `openssl rand -hex 32` (não `000...`)
- [ ] ✅ `NODE_ENV=production` em produção (não `development`)
- [ ] ✅ `SUPABASE_SERVICE_KEY` **NUNCA** em variáveis NEXT_PUBLIC
- [ ] ✅ Chaves de IA cadastradas DENTRO do app (não no .env)

### Supabase & Banco

- [ ] ✅ RLS habilitada em TODAS as tabelas (validar com query acima)
- [ ] ✅ Billing/org_limits é SELECT-only para authenticated (migration 20260623000003 aplicada)
- [ ] ✅ `license_acceptances` tabela existe (migration 20260629000001 aplicada)
- [ ] ✅ Todas as 103 migrations aplicadas: `supabase db push` rodou sem erro
- [ ] ✅ Service role está MUITO restrito (só backend usa; não exponha nos logs)

### Credenciais

- [ ] ✅ Nenhum .env ou arquivo de credencial versionado no git
- [ ] ✅ Chaves salvas em `.local` ou secrets manager (não no código)
- [ ] ✅ ENCRYPTION_KEY armazenada em local seguro (cofre, 1Password, etc.)

### Funcionalidades Críticas

- [ ] ✅ Login funciona (Supabase Auth)
- [ ] ✅ LicenseGate aparece no 1º acesso (bloqueia até aceitar)
- [ ] ✅ Geração de criativo funciona com IA real (não fake)
- [ ] ✅ Saldo de créditos decrementa após geração (não fake)
- [ ] ✅ Não há template global (read-only) que apareça como editável

### Performance & Monitoramento

- [ ] ✅ Build completa sem warnings: `npm run build`
- [ ] ✅ Lint passa: `npm run lint`
- [ ] ✅ Nenhum console.log/debug desnecessário no bundle de produção

### Compliance & Licença

- [ ] ✅ Arquivo `LICENSE` e `LICENSE.txt` presentes
- [ ] ✅ LicenseGate exibe termos corretamente
- [ ] ✅ Copyright e disclaimers no topo dos arquivos principais

---

## 8️⃣ PASSO A PASSO COMPLETO DE DEPLOY

### Fase 0: Verificações Pré-Deploy

```bash
# 1. Revertir alterações temporárias (ver seção 6)
#    - src/middleware.ts
#    - src/app/(auth)/layout.tsx  
#    - next.config.ts

# 2. Verificar integridade do código
npm run lint
npm run build    # Não deve ter erros TypeScript

# 3. Limpar cache local
rm -rf .next/
npm cache clean --force

# 4. Confirmar variáveis de env local
cat .env.local | grep -E "^[A-Z_].*=" 
# Esperado: 5 linhas (SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_KEY, ENCRYPTION_KEY, NODE_ENV)
```

### Fase 1: Preparação do Supabase em Produção

#### Opção A: Usar MESMO projeto Supabase (dev + prod)

```bash
# Já rodou as migrations localmente? Confirmar:
# Ir ao painel Supabase > Database > Tables
# Deve ver: organizations, organization_members, api_keys, templates, etc.

# Se ainda não rodou (primeira vez):
supabase login
supabase link --project-ref <SEU-PROJECT-REF>  # Senha do banco quando pedir
supabase db push                                # Aplica todas as 103 migrations
```

#### Opção B: Criar projeto Supabase NOVO para produção

```bash
# 1. Criar novo projeto em https://supabase.com
# 2. Anotar nova URL, anon key, service key

# 3. Fazer link e aplicar schema
supabase login
supabase link --project-ref <NOVO-PROJECT-REF>
supabase db push
```

#### Validação pós-push

```sql
-- SSH no banco Supabase ou usar SQL Editor no painel
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- Esperado: ~20 tabelas (organizations, api_keys, templates, etc.)

-- Validar RLS
SELECT tablename, array_agg(policyname) as policies 
FROM pg_policies 
WHERE schemaname='public' 
GROUP BY tablename 
ORDER BY tablename;
-- Esperado: TODAS as tabelas de dados têm ≥1 policy
```

### Fase 2: Deploy na Vercel (Recomendado)

#### 2a. Setup do repositório

```bash
# 1. Versionar o projeto em git (seu próprio repo, privado)
git init
git add .
git commit -m "Initial commit: Criativos production-ready"
git remote add origin https://github.com/SEU-USUARIO/criativos.git
git push -u origin main

# IMPORTANTE: repo DEVE ser PRIVADO (pois contém código proprietário)
```

#### 2b. Importar em Vercel

1. Ir a https://vercel.com/dashboard
2. Clicar **"Add New..."** → **"Project"**
3. Selecionar repo Git `criativos` (ele pergunta autorização ao GitHub)
4. Configurar:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `.` (raiz)
   - **Build Command:** `npm run build`
   - **Start Command:** `npm run start`

#### 2c. Adicionar variáveis de ambiente

1. Antes de deploy, ir a **Project Settings** → **Environment Variables**
2. Adicionar as 5 variáveis do seu `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL = https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGc...
SUPABASE_SERVICE_KEY = eyJhbGc...
ENCRYPTION_KEY = a1b2c3d4...
NODE_ENV = production
```

3. Para cada variável, selecionar **Production** environment
4. Salvar

#### 2d. Deploy

1. Clicar **"Deploy"**
2. Vercel constrói e publica em ~3-5 min
3. URL automática: `https://criativos-seu-usuario.vercel.app`

#### 2e. Validação pós-deploy

```bash
# 1. Acessar app: https://criativos-seu-usuario.vercel.app
# 2. Tentar login (deve redirecionar para /login)
# 3. Criar conta nova via Supabase Auth
# 4. Primeira org deve ser criada automaticamente
# 5. LicenseGate deve bloquear (aceitar termos)
# 6. Dashboard deve carregar com dados reais
# 7. Ir a /configuracoes e cadastrar chave de IA
# 8. Gerar um criativo de teste
```

---

### Fase 3: Deploy em VPS Próprio / Docker (Alternativo)

#### 3a. Build e compactação

```bash
# Build de produção localmente
npm run build

# Verificar artifact
ls -lh .next/
# Esperado: pasta .next/ com bundle otimizado

# Compactar para upload
tar czf criativos-build.tar.gz \
  .next/ \
  node_modules/ \
  public/ \
  package.json \
  .env.production  # ← CUIDADO: NÃO versione; injetar no servidor
```

#### 3b. Setup no servidor

```bash
# SSH no seu VPS
ssh user@seu-servidor.com

# Criar pasta do projeto
mkdir -p /var/www/criativos
cd /var/www/criativos

# Extrair build
tar xzf criativos-build.tar.gz

# Criar .env.production (NÃO fazer git clone + .env)
cat > .env.production << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
ENCRYPTION_KEY=...
NODE_ENV=production
EOF

# Restringir permissões
chmod 600 .env.production

# Instalar PM2 (process manager)
npm install -g pm2

# Iniciar app
pm2 start "npm start" --name criativos
pm2 save
pm2 startup  # Reinicia com boot do servidor
```

#### 3c. Reverse proxy (Nginx)

```nginx
# /etc/nginx/sites-available/criativos
server {
    listen 80;
    server_name seu-dominio.com.br;

    location / {
        proxy_pass http://localhost:3028;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Habilitar site
ln -s /etc/nginx/sites-available/criativos /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# SSL com Let's Encrypt
certbot --nginx -d seu-dominio.com.br
```

#### 3d. Validação

```bash
# Verificar app está rodando
curl http://localhost:3028
# Esperado: HTML da página Next.js

# Verificar logs
pm2 logs criativos

# Validar no navegador
# https://seu-dominio.com.br → deve redirecionar para login
```

---

### Fase 4: Pós-Deploy — Configuração Final

#### 1. Cadastrar chaves de IA

1. Acessar app em produção
2. Fazer login
3. Ir a `/configuracoes` → **"Chaves de IA"**
4. Cadastrar pelo menos UMA chave (Gemini, OpenRouter ou WisGate)

#### 2. Testar geração

1. Ir a `/criar` → **"Novo Projeto"**
2. Configurar marca/personas (etapas de setup)
3. Gerar um criativo de teste
4. Validar que imagem foi gerada e saldo decrmentou

#### 3. Monitoramento

```bash
# Vercel: Dashboard > Monitoring
# Ou VPS: pm2 monit

# Observar:
# - CPU / memória
# - Requisições por segundo
# - Erros na tela (Network tab)
# - Logs do servidor
```

#### 4. Backup regular

```bash
# Supabase: Backup automático (diário, grátis até 7 dias)
# Dashboard > Database > Backups > Enable backups

# VPS: Backup manual do banco
pg_dump -h localhost -U postgres criativos > /backups/criativos-$(date +%Y%m%d).sql
```

---

## 9️⃣ TROUBLESHOOTING & QUICK FIXES

| Problema | Causa | Solução |
|----------|-------|---------|
| **Login não funciona** | Supabase não configurado ou URL errada | Validar `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_ANON_KEY` em env |
| **"Geração falhou"** | Sem chave de IA cadastrada | Ir a `/configuracoes` e adicionar chave (Gemini/OpenRouter) |
| **"ENCRYPTION_KEY inválida"** | Comprimento errado ou formato | Gerar nova: `openssl rand -hex 32` (64 caracteres) |
| **LicenseGate nunca some** | Banco sem tabela `license_acceptances` | Rodar `supabase db push` (migration 20260629000001) |
| **RLS bloqueia acesso** | Usuário de org errada | Validar membership em `organization_members` |
| **Imagens não carregam** | Bucket não criado ou permissões | Validar buckets em Storage e RLS policies |
| **Build falha em Vercel** | TypeScript errors | Validar que `ignoreBuildErrors` foi removido de next.config.ts |

---

## 🔟 RESUMO FINAL — ORDEM DE PRIORIDADE

### 🔴 CRÍTICO (fazer agora)
1. ✅ **Revertir 3 bloqueadores:** middleware.ts, layout.tsx, next.config.ts
2. ✅ **Gerar ENCRYPTION_KEY:** `openssl rand -hex 32` (guardar com segurança)
3. ✅ **Testar build:** `npm run build` (zero errors)

### 🟡 IMPORTANTE (antes de deploy)
4. ✅ **Criar/confirmar Supabase:** rodaer `supabase db push`
5. ✅ **Validar variáveis:** 5 vars em `.env.local`
6. ✅ **Rodar testes locais:** login, licença, geração

### 🟢 DEPLOY
7. ✅ **Vercel:** Importar repo, adicionar vars, publicar
8. ✅ **Ou VPS:** Build, .env.production, PM2, Nginx
9. ✅ **Pós-deploy:** Cadastrar IA, testar geração

---

## Próximos passos

1. **Revert os 3 bloqueadores** (seção 6)
2. **Gera ENCRYPTION_KEY** e guarda
3. **Rodar `npm run build`** localmente para confirmar
4. **Escolher hosting** (Vercel recomendado)
5. **Deploy** conforme fase 2 ou 3
6. **Validar** em produção

**Dúvidas?** Ver SETUP-CLAUDE.md para automação com Claude Code.

---

**Documento gerado:** 2026-06-30 | **Versão:** 1.0
