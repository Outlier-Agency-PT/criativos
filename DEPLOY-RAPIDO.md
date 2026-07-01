# ⚡ Deploy Rápido — Checklist de 5 Minutos

**TL;DR:** Se você quer só saber a ordem de prioridade, está aqui.

---

## 🔴 BLOQUEADORES CRÍTICOS (FIX AGORA)

Seu código tem 3 problemas de segurança que IMPEDEM deploy:

| # | Arquivo | Problema | Solução | Tempo |
|---|---------|----------|---------|-------|
| 1 | `src/middleware.ts` linha 17-18 | Auth totalmente desabilitada | Delete: `return NextResponse.next();` | 30s |
| 2 | `src/app/(auth)/layout.tsx` linhas 16-19 | Dados fake hardcoded | Ver REVERT-PATCHES.md | 2min |
| 3 | `next.config.ts` linha 8 | TypeScript ignora erros | Delete: bloco `typescript: {...}` | 30s |

**Status:** ⚠️ Sua app **NÃO PODE** ir para produção com estes. ⚠️

---

## ✅ Ordem de Execução (Rodar nesta sequência)

### Fase 1: Reparar código (5 min)

```bash
# 1. Abra src/middleware.ts
# DELETE linhas 17-18:
#   // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
#   return NextResponse.next();

# 2. Abra src/app/(auth)/layout.tsx
# Use: REVERT-PATCHES.md (Patch 2) para ver código completo correto
# Tem que:
#   - Adicionar imports: LicenseGate, requireAuth
#   - Deletar dados fake (Usuario Teste, etc)
#   - Chamar requireAuth() para dados reais
#   - Wrappear <LicenseGate> no JSX

# 3. Abra next.config.ts
# DELETE linhas 7-9 (bloco typescript com ignoreBuildErrors)

# Salve tudo.
```

### Fase 2: Validar localmente (2 min)

```bash
npm run build      # Deve suceder sem erros
npm run lint       # Deve passar
npm run dev        # Rodar local

# Testar:
# - Acesso sem login → redireciona para /login ✅
# - Login → apareça LicenseGate (overlay bloqueante) ✅
# - Checkbox "Li e aceito" → botão ativa ✅
# - Clicar "Aceitar" → dashboard com dados REAIS (não "Usuario Teste") ✅
```

### Fase 3: Preparar variáveis de produção (1 min)

```bash
# Copie seu .env.local
cat .env.local
# Esperado:
# NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# SUPABASE_SERVICE_KEY=eyJ...
# ENCRYPTION_KEY=a1b2c3d4... (64 caracteres hex)
# NODE_ENV=production  # ← MUDE para "production"
```

### Fase 4: Deploy em Vercel (3 min) — RECOMENDADO

```bash
# 1. Fazer git commit das mudanças
git add .
git commit -m "Fix: security reverts for production"
git push

# 2. Em https://vercel.com/dashboard
# - Clicar "Add New Project"
# - Selecionar repo criativos
# - Vercel auto-detecta Next.js

# 3. Environment Variables (antes de deploy):
# Adicionar 5 vars (copiar de .env.local):
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
ENCRYPTION_KEY
NODE_ENV=production

# 4. Clicar "Deploy"
# Espera 3-5 minutos, pronto!

# URL fica: https://seu-projeto.vercel.app
```

### Fase 5: Testar em produção (2 min)

```
1. Abrir https://seu-projeto.vercel.app
2. Clicar "Criar conta"
3. Email + senha
4. Deveria ver LicenseGate
5. Aceitar termos
6. Dashboard com dados reais
7. Ir a /configuracoes → Cadastrar uma chave Gemini ou OpenRouter
8. Tentar gerar um criativo
9. Sucesso = tudo rodando ✅
```

---

## 📋 Variáveis de Ambiente — O que cada uma faz

| Variável | Onde sai | Onde vai | Exemplo |
|----------|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings > API > Project URL | Frontend + Backend | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings > API > `anon` key | Frontend + Backend | `eyJhbGc...` |
| `SUPABASE_SERVICE_KEY` | Supabase Settings > API > `service_role` | Backend ONLY (nunca frontend) | `eyJhbGc...` |
| `ENCRYPTION_KEY` | Gere com: `openssl rand -hex 32` | Backend ONLY | `a1b2c3d4e5...` (64 chars) |
| `NODE_ENV` | Você | Backend | `production` (em prod) |

**⚠️ Lembrete:** `SUPABASE_SERVICE_KEY` e `ENCRYPTION_KEY` são secretas. Nunca exponha no código ou navegador.

---

## 🗄️ Supabase — O que precisa estar feito

```bash
# Só precisa rodar UMA VEZ:
supabase login
supabase link --project-ref SEU-PROJECT-REF  # Senha do banco quando pedir
supabase db push                              # Cria 103 migrations automaticamente
```

**Pronto!** Banco está completo com:
- ✅ 20+ tabelas
- ✅ RLS em todas (segurança)
- ✅ 5 storage buckets
- ✅ Postgres functions para billing

Não precisa fazer mais nada no banco. Usuários criam conta normalmente.

---

## 🔑 ENCRYPTION_KEY — Muito importante

```bash
# Gerar (fazer UMA única vez):
openssl rand -hex 32
# Saída: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6

# Guardar em lugar MUITO seguro:
# - 1Password
# - LastPass
# - Cofre físico
# - Qualquer lugar que NÃO seja seu código

# ⚠️ Se perder:
# - Todas as chaves de IA salvas no banco ficam ilegíveis
# - Recuperação: nenhuma. Dados perdidos.
# - Solução de emergência: deletar api_keys, usuários recadastram
```

---

## 📊 Timing Total

| Fase | Tempo |
|------|-------|
| Fix código (patches) | 5 min |
| Build + lint local | 2 min |
| Setup Vercel | 3 min |
| Deploy automático | 3-5 min |
| Testar em produção | 2 min |
| **TOTAL** | **~15-20 min** |

---

## 🚨 Red Flags (antes de fazer deploy)

- [ ] `npm run build` falha? Tem um erro TypeScript real
- [ ] Seu `.env.local` tem dados fake (como `ENCRYPTION_KEY=0000...`)? Gera novo: `openssl rand -hex 32`
- [ ] Middleware.ts ainda tem `return NextResponse.next();`? FIX agora!
- [ ] Layout.tsx ainda mostra "Usuario Teste"? FIX agora!
- [ ] Esqueceu de fazer `supabase db push`? Banco vazio!
- [ ] Repo Git é público? Tem código proprietário! Fazer privado!

---

## 📚 Docs Completos

Se precisar mais detalhe:
- **PRODUCAO-CHECKLIST.md** — Guia completo (schema, RLS, troubleshooting)
- **REVERT-PATCHES.md** — Código exato para copiar/colar
- **README.md** — Setup inicial
- **SETUP-CLAUDE.md** — Para automação com Claude Code

---

## Dúvidas Rápidas

**P: Qual hosting devo usar?**  
R: Vercel (recomendado). Se não quiser, qualquer VPS com Node.js funciona (Render, Railway, etc).

**P: E se eu usar VPS próprio?**  
R: `npm run build` → copiar `.next/` → `npm start` em produção. Ver PRODUCAO-CHECKLIST.md Fase 3.

**P: Quanto custa?**  
R: Vercel ≈$20/mês. Supabase grátis até 1GB de dados (suficiente para começar). IA (Gemini, etc.) é conforme usa.

**P: Backup do banco?**  
R: Supabase faz automático (grátis até 7 dias). Enable no painel.

**P: Posso usar 2 Supabase (dev + prod)?**  
R: Sim, e é melhor! Criar projeto separado, rodar `supabase db push` nele também.

**P: Preciso de SSL/HTTPS?**  
R: Vercel fornece automático. VPS: use Let's Encrypt + Nginx.

---

## Next Steps

```
1. Abra REVERT-PATCHES.md
2. Copie o código correto para os 3 arquivos
3. Rodar: npm run build
4. Rodar: npm run dev
5. Testar: http://localhost:3028
6. Commit: git add . && git commit -m "..."
7. Vercel: importar, adicionar vars, deploy
8. Testar: https://seu-projeto.vercel.app
9. Cadastrar IA chave em /configuracoes
10. Gerar criativo de teste
✅ Pronto!
```

---

**Última atualização:** 2026-06-30  
**Status:** Pronto para deploy (após revisar)
