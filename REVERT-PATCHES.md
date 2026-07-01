# Patches para Revertir Alterações Temporárias

**Use este arquivo para restaurar o código à segurança de produção.**

---

## Patch 1: src/middleware.ts — Remover bypass de autenticação

### Antes (INSEGURO — atual)
```typescript
export async function middleware(request: NextRequest) {
  // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
  return NextResponse.next();  // ← REMOVE ISTO

  const { pathname } = request.nextUrl;
  // ... resto do código
}
```

### Depois (SEGURO)
```typescript
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // ... resto do código (linhas 20+ ficam iguais)
}
```

### Como aplicar

**Opção 1: Manual**
1. Abra `src/middleware.ts`
2. Delete as linhas 17-18:
   ```
   // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
   return NextResponse.next();
   ```
3. Salve

**Opção 2: Bash/sed**
```bash
cd /caminho/do/projeto
sed -i '17,18d' src/middleware.ts
```

### Validação
```bash
grep -n "return NextResponse.next()" src/middleware.ts
# Esperado: nada (linha não deve existir no middleware principal)
```

---

## Patch 2: src/app/(auth)/layout.tsx — Remover dados fake e restaurar LicenseGate

### Antes (INSEGURO — atual)
```typescript
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TEMP: bypass de auth só pra navegação visual local. REMOVER depois.
  const userName = "Usuario Teste";
  const userEmail = "teste@local.com";
  const orgId = "";

  return (
    <ThemeProvider orgId={orgId}>
        <div className="theme-shell flex h-screen overflow-hidden rounded-none md:m-3 md:h-[calc(100vh-1.5rem)] md:rounded-[28px]">
          <Sidebar userName={userName} userEmail={userEmail} />
          <main className="relative flex-1 overflow-y-auto">
            <div className="p-4 pt-[4.25rem] md:p-6 md:pt-6">
              {children}
            </div>
          </main>
        </div>
    </ThemeProvider>
  );
}
```

### Depois (SEGURO)
```typescript
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { LicenseGate } from "@/components/license-gate";
import { requireAuth } from "@/lib/api-auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

### Como aplicar

**Opção 1: Substituir arquivo inteiro**
```bash
# Copiar o código acima (bloco "Depois")
# Colar inteiro em src/app/(auth)/layout.tsx
```

**Opção 2: Edição manual**
1. Abra `src/app/(auth)/layout.tsx`
2. **No topo, adicione imports:**
   ```typescript
   import { LicenseGate } from "@/components/license-gate";
   import { requireAuth } from "@/lib/api-auth";
   ```
3. **Delete linhas 16-19 (os dados fake)**
4. **Adicione antes do return:**
   ```typescript
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
   ```
5. **No JSX, wrappa o div principal com `<LicenseGate>`:**
   ```typescript
   return (
     <ThemeProvider orgId={orgId}>
       <LicenseGate>
         <div className="...">
           {/* resto */}
         </div>
       </LicenseGate>
     </ThemeProvider>
   );
   ```

### Validação
```bash
grep -n "Usuario Teste\|teste@local.com" src/app/\(auth\)/layout.tsx
# Esperado: nada (strings fake não devem existir)

grep -n "LicenseGate\|requireAuth" src/app/\(auth\)/layout.tsx
# Esperado: imports e uso aparecem
```

---

## Patch 3: next.config.ts — Habilitar erros de TypeScript

### Antes (INSEGURO — atual)
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,  // ← REMOVE ISTO
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
```

### Depois (SEGURO)
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
```

### Como aplicar

**Opção 1: Manual**
1. Abra `next.config.ts`
2. Delete as linhas 7-9:
   ```
   typescript: {
     ignoreBuildErrors: true,
   },
   ```
3. Salve

**Opção 2: Bash/sed**
```bash
cd /caminho/do/projeto
sed -i '7,9d' next.config.ts
```

### Validação
```bash
grep -n "ignoreBuildErrors" next.config.ts
# Esperado: nada (linha não deve existir)

npm run build
# Esperado: sucesso OU erros TypeScript reais (para você corrigir)
```

---

## Aplicar Todos os 3 Patches de Uma Vez

### Script completo (Bash)

```bash
#!/bin/bash
set -e

REPO="/caminho/do/projeto"
cd "$REPO"

echo "🔧 Aplicando patch 1: src/middleware.ts"
sed -i '17,18d' src/middleware.ts
echo "✅ Patch 1 aplicado"

echo "🔧 Aplicando patch 2: src/app/(auth)/layout.tsx"
# Deletar linhas 16-19 (dados fake)
sed -i '16,19d' src/app/\(auth\)/layout.tsx
# Adicionar imports no topo
sed -i "8a import { LicenseGate } from \"@/components/license-gate\";\nimport { requireAuth } from \"@/lib/api-auth\";" src/app/\(auth\)/layout.tsx
# Adicionar lógica dentro da função
sed -i '/children: React.ReactNode;/{n;s/^$/\n  const { user, supabase } = await requireAuth();\n\n  const { data: membership } = await supabase\n    .from("organization_members")\n    .select("org_id, organizations(id, name)")\n    .eq("user_id", user.id)\n    .limit(1)\n    .single();\n\n  const orgId = membership?.org_id || "";\n  const userName = user.user_metadata?.full_name || user.email || "Usuário";\n  const userEmail = user.email || "";/}' src/app/\(auth\)/layout.tsx
# Wrappa com LicenseGate (complexo em sed; fazer manualmente ou usar arquivo completo)
echo "⚠️  Patch 2: Imports adicionados, mas JSX precisa wrap manual com <LicenseGate>"

echo "🔧 Aplicando patch 3: next.config.ts"
sed -i '7,9d' next.config.ts
echo "✅ Patch 3 aplicado"

echo "🔍 Validando..."
grep -q "return NextResponse.next()" src/middleware.ts && echo "❌ Middleware ainda tem bypass!" || echo "✅ Middleware seguro"
grep -q "ignoreBuildErrors" next.config.ts && echo "❌ TypeScript ainda ignora erros!" || echo "✅ TypeScript seguro"

echo ""
echo "⚠️  IMPORTANTE:"
echo "1. Patch 2 (layout.tsx) precisa wrap manual com <LicenseGate>"
echo "2. Rodar: npm run build (para validar TypeScript)"
echo "3. Testar localmente: npm run dev"
```

### Aplicar manualmente (mais seguro)

1. **Copiar os 3 blocos "Depois"** de cada patch acima
2. **Editar os 3 arquivos manualmente** em seu editor favorito
3. **Salvar cada arquivo**
4. **Rodar validação:**
   ```bash
   npm run build    # Deve passar sem erros
   npm run lint     # Deve passar
   ```

---

## Validação Final (Checklist)

Após aplicar todos os 3 patches:

```bash
# 1. Verificar que bypass foi removido
grep -n "return NextResponse.next()" src/middleware.ts
# Esperado: NADA

# 2. Verificar que dados fake foram removidos
grep -n "Usuario Teste\|teste@local.com" src/app/\(auth\)/layout.tsx
# Esperado: NADA

# 3. Verificar que LicenseGate foi adicionado
grep -n "LicenseGate" src/app/\(auth\)/layout.tsx
# Esperado: 2 matches (import + <LicenseGate>)

# 4. Verificar que TypeScript agora valida erros
grep -n "ignoreBuildErrors" next.config.ts
# Esperado: NADA

# 5. Build deve passar ou reportar ERROS REAIS
npm run build
# Esperado: ✅ (se passar zero erros) ou ❌ com mensagens de erro a corrigir
```

---

## Se der problema

### Restaurar de backup (git)
```bash
# Se tiver Git:
git diff src/middleware.ts src/app/\(auth\)/layout.tsx next.config.ts
# Ver o que mudou

git checkout src/middleware.ts  # Restaurar versão anterior
git checkout src/app/\(auth\)/layout.tsx
git checkout next.config.ts
```

### Restaurar manualmente
Se não tem Git, copie os códigos "Depois" exatamente como mostrado acima para cada arquivo.

---

## Próximas validações

Após patchear:

```bash
# 1. Teste local
npm run dev
# Acessar http://localhost:3028
# - Sem login: redireciona para /login ✅
# - Com login: LicenseGate bloqueia até aceitar ✅
# - Após aceitar: dashboard com dados reais ✅

# 2. Build
npm run build
# Esperado: ✅ "compiled successfully"

# 3. Deploy
# Ver PRODUCAO-CHECKLIST.md fase 2 ou 3
```

---

**Documento:** REVERT-PATCHES.md | **Data:** 2026-06-30
