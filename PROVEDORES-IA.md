# 🤖 Análise Completa: Provedores de IA no Criativos

**Última atualização:** 2026-06-30  
**Escopo:** Geração de copy/texto + imagens para criativos

---

## 📊 Resumo Executivo

| Tarefa | Provedor | Modelo | API Key Obrigatória? |
|--------|----------|--------|----------------------|
| **Gerar IMAGENS** | Google Gemini (direto OU WisGate) | `gemini-3-pro-image-preview` | ✅ SIM |
| **Gerar COPY/TEXTO** | Claude (Anthropic) OU GPT-4o mini OU Gemini 2.5 Flash | Configurable | ✅ SIM (≥1) |

**Fluxo:**
1. Usuário cadastra API keys em `/configuracoes`
2. Sistema armazena encriptadas no banco (AES-256-GCM)
3. Ao gerar criativo → busca key disponível → rotaciona entre elas
4. Se uma falhar/tiver limite, tenta próxima automaticamente

---

## 🎨 GERAÇÃO DE IMAGENS

### Modelo Obrigatório: `gemini-3-pro-image-preview`

**Specs:**
- **Nome comercial:** Nano Banana Pro (Google Gemini 3)
- **Compatibilidade:** Aceita imagem + texto como input
- **Custo:** ~$0.096 por imagem (via WisGate) ou ~$0.039 (direto Google, se usar)
- **Timeout:** 90 segundos por geração
- **Resolução:** Até 1K (1024x1024)
- **Qualidade:** Avançado — referência visual em anúncios/posts/stories

**Código relevante:** `src/lib/config/image-models.ts`
```typescript
export const REQUIRED_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const REQUIRE_GEMINI3_FOR_IMAGE = true; // ← Bloqueio de qualidade
```

### Por que Gemini 3 é obrigatório?

Porque:
1. **Suporta referência visual** — Pode receber imagem do template + fotos como entrada
2. **Qualidade superior** — Respeta layout do template, insere copy corretamente
3. **Modelos alternativos (Imagen) não funcionam bem:**
   - Imagen 4 Fast, Standard, Ultra NÃO aceitam imagens de referência
   - Gemini 2.5 Flash (versão anterior) é inferior em qualidade

**Verificação no código (src/lib/models.ts:128-137):**
```typescript
export const REQUIRE_GEMINI3_FOR_IMAGE = true;

export function isGemini3ImageModel(modelId: string): boolean {
  return /^gemini-3(\.\d+)?-.*image/i.test(modelId);
}
// Se true, key com outro modelo é IGNORADA na rotação
```

### Provedores de Acesso para `gemini-3-pro-image-preview`

Você pode obter essa chave de **2 formas**:

#### Opção 1: Google Gemini (direto) ✅ Mais barato
- **URL:** https://ai.google.dev
- **API Key:** Gemini API key (grátis com quota mensal)
- **Custo:** ~$0.039 por imagem
- **Limite:** ~1000 imagens/mês grátis (quota), depois cobrado
- **Usado quando:** Key do Google Gemini cadastrada

#### Opção 2: WisGate (relay/proxy) ✅ Fallback confiável
- **URL:** https://wisgate.ai
- **O que é:** Proxy que fornece acesso a múltiplos modelos (Gemini, Claude, GPT, etc.)
- **API Key:** WisGate API key (conta separada)
- **Custo:** ~$0.096 por imagem (mais caro que direto, mas confiável)
- **Limite:** Conforme crédito pré-pago
- **Usado quando:** Key do WisGate cadastrada

**Fluxo de Roteamento (src/lib/api-key-rotator.ts):**
```typescript
// Se tiver key Gemini ou WisGate com modelo Gemini 3:
if (keyRecord.provider === "gemini" && isGemini3ImageModel(keyRecord.model)) {
  // Se a key é de WisGate → usa wisgate.ts
  if (keyRecord.isWisgate) {
    return wisgate.generateCreative(decryptedKey, input, model);
  }
  // Se é Google direto → usa gemini.ts
  return gemini.generateCreative(decryptedKey, input, model);
}
```

**Qual escolher?**
| Fator | Google Direto | WisGate |
|-------|---------------|---------|
| Custo | $0.039/img | $0.096/img |
| Confiabilidade | Boa | Muito boa (proxy) |
| Quota gratuita | Sim (~1000/mês) | Não |
| Setup | Simples | Conta + pagto |
| Recomendação | 🟢 Começar aqui | 🟡 Fallback/backup |

---

## 📝 GERAÇÃO DE COPY/TEXTO

### Modelos Suportados

**3 modelos configuráveis** (usuário escolhe ordem de fallback):

| # | Modelo | Provider | Custo | Recomendação | Quando usar |
|---|--------|----------|-------|--------------|------------|
| 1️⃣ | `claude-haiku-4-5-20251001` | Anthropic | $4/1M tokens out | ✅ DEFAULT | Rápido + barato |
| 2️⃣ | `gpt-4o-mini` | OpenAI | $0.6/1M tokens out | ⚠️ Fallback | GPT minis |
| 3️⃣ | `gemini-2.5-flash` | Google | $2.5/1M tokens out | ⚠️ Fallback | Se Gemini direto |

**Código (src/lib/models.ts:184-216):**
```typescript
export const TEXT_MODELS: TextModel[] = [
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    costPer1MOut: 4,
    recommended: true,  // ← Default primário
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    provider: "openai",
    costPer1MOut: 0.6,
    recommended: false, // ← Fallback 2
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    costPer1MOut: 2.5,
    recommended: false, // ← Fallback 3
  },
];

export const DEFAULT_TEXT_MODEL_CHAIN: string[] = [
  "claude-haiku-4-5-20251001",
  "gpt-4o-mini",
  "gemini-2.5-flash",
];
```

### Sistema de Fallback

Quando gera copy, sistema tenta **na ordem:**

1. **Claude Haiku** (se key cadastrada) → se falhar/limite
2. **GPT-4o mini** (se key cadastrada) → se falhar/limite
3. **Gemini 2.5 Flash** (se key cadastrada) → se falhar
4. **❌ Erro:** Nenhuma key disponível

**Código (src/lib/api-key-rotator.ts:137-151):**
```typescript
export async function getTextModelChain(orgId: string): Promise<string[]> {
  const config = await supabase
    .from("criativos_text_model_config")
    .select("model_chain")
    .eq("org_id", orgId)
    .single();

  if (config?.model_chain?.length) {
    return config.model_chain;
  }

  // Default fallback
  return DEFAULT_TEXT_MODEL_CHAIN; // Haiku → GPT → Gemini
}
```

### Configuração por Usuário

Em `/configuracoes` → aba **"Modelos de Texto"**, usuário ordena fallback:

```
[1] Claude Haiku (recomendado)
    └─ Se falhar, tenta:
[2] GPT-4o mini
    └─ Se falhar, tenta:
[3] Gemini 2.5 Flash
```

**Tabela no banco:** `criativos_text_model_config` (migration 20260605000001)

---

## 🔄 FLUXO DE GERAÇÃO (Ponta a Ponta)

### Geração de Criativo (Imagem + Copy)

```
POST /api/generate/one
  ↓
1. Validar crédito (org tem saldo?)
  ↓
2. Buscar criativo + projeto + templates
  ↓
3. Converter templates + fotos para buffers (PNG)
  ↓
4. [COPY] Buildar prompt de texto
  ↓
5. [COPY] getNextAvailableKey(orgId) → rotaciona entre as keys de texto
  ↓
6. [COPY] Chamar generateTextWithRotation()
     → Tenta Claude Haiku
     → Se falhar, tenta GPT
     → Se falhar, tenta Gemini
  ↓
7. [IMAGEM] Buildar prompt de imagem (copy + templates como referência)
  ↓
8. [IMAGEM] getNextAvailableKey(orgId) → busca key Gemini 3
  ↓
9. [IMAGEM] Chamar generateWithRotation()
     → Tenta WisGate (se key é WisGate)
     → Ou Google direto (se key é Google)
     → Se falhar, tenta próxima key
  ↓
10. Decrementar crédito (RPC decrement_credit)
  ↓
11. Salvar criativo em Storage + log de uso
  ↓
✅ Retornar imagem + metadata
```

**Arquivo:** `src/app/api/generate/one/route.ts`

---

## 🔐 Cadastro de API Keys

### Onde Cadastrar

1. Fazer login no Criativos
2. Ir a **`/configuracoes`** → aba **"Chaves de IA"**
3. Clicar **"+ Adicionar chave"**
4. Escolher provider + modelo
5. Colar a chave
6. Sistema criptografa com ENCRYPTION_KEY (AES-256-GCM)

### Fluxo de Cadastro

```
POST /api/api-keys (usuário envia key em plaintext)
  ↓
Backend:
  1. Validar que key é válida (test connection)
  2. Criptografar: encryptKey(plaintext)
  3. Guardar formato: iv:authTag:ciphertext (base64)
  4. Salvar em DB → tabela criativos_api_keys
  5. Retornar ✅ ou ❌
```

**Arquivo:** `src/app/api/api-keys/route.ts`

---

## 📋 API Keys Obrigatórias — Checklist de Produção

### Mínimo para Funcionar (1 de cada)

| Tarefa | Provider | Obrigatório? | Onde obter |
|--------|----------|--------------|-----------|
| **Gerar IMAGENS** | Google Gemini OU WisGate | ✅ SIM | https://ai.google.dev OU https://wisgate.ai |
| **Gerar COPY (primário)** | Anthropic (Claude Haiku) | ✅ SIM | https://console.anthropic.com |
| **Gerar COPY (fallback 1)** | OpenAI (GPT-4o mini) | ⚠️ OPCIONAL | https://platform.openai.com |
| **Gerar COPY (fallback 2)** | Google Gemini | ⚠️ OPCIONAL | https://ai.google.dev |

### Recomendado para Produção

```
✅ Google Gemini (direto)           → Imagens baratas
✅ Anthropic (Claude Haiku)         → Copy primário (rápido + barato)
✅ OpenAI (GPT-4o mini)             → Copy fallback (qualidade)
✅ WisGate                          → Imagens (fallback/backup)
```

**Custo estimado/mês (1000 gerações):**
- Google Gemini imagem: ~$39
- Claude Haiku copy: ~$4
- **Total: ~$43/mês** (muito barato)

---

## ⚙️ O Que É WisGate?

### Definição

**WisGate** é um **proxy/relay** que fornece acesso a múltiplos modelos de IA (Gemini, Claude, GPT, etc.) sob uma API unificada.

### Quando é Útil?

| Cenário | Solução |
|---------|---------|
| Google Gemini quota esgotada | ✅ WisGate Gemini como fallback |
| Firewall corporativo bloqueia Google | ✅ WisGate como intermediário |
| Quer centralizar gastos | ✅ WisGate consolidado |
| Google Gemini não está disponível no país | ✅ WisGate alternativa |

### Endpoints WisGate

```typescript
// Arquivo: src/lib/config/endpoints.ts
const ENDPOINTS = {
  WISGATE_CHAT: "https://api.wisgate.ai/v1/chat/completions",
  WISGATE_GEMINI: "https://api.wisgate.ai/v1beta/models",
  // Usados para gerar imagem via modelo Gemini 3
};
```

### É Obrigatório?

**Não.** WisGate é **opcional**. 

**Suficiente ter:**
- ✅ Google Gemini direto (imagens) +
- ✅ Claude Haiku (copy)

WisGate é para **backup/fallback** quando Google cai ou quota esgota.

---

## 🚀 Setup Mínimo para Produção

### Passo 1: Obter Chaves

1. **Google Gemini (imagens)**
   - Ir: https://ai.google.dev
   - Criar API key
   - Copy a chave

2. **Anthropic (Claude Haiku, copy)**
   - Ir: https://console.anthropic.com
   - Create API key
   - Copy a chave

### Passo 2: Cadastrar no App

1. Login no Criativos
2. `/configuracoes` → "Chaves de IA"
3. Adicionar:
   - Provider: **Google Gemini**
     Model: **gemini-3-pro-image-preview**
     Key: `[sua-chave-google]`
   - Provider: **Anthropic**
     Model: **claude-haiku-4-5-20251001**
     Key: `[sua-chave-anthropic]`
4. Testar gerando um criativo

### Passo 3: (Opcional) Adicionar Fallbacks

Se quiser redundância:
- OpenAI GPT-4o mini (copy fallback)
- WisGate (imagem fallback)

---

## 📊 Teste de Rotação de Chaves

Sistema testa automaticamente qual key usar:

```typescript
// Pseudocódigo
function rotateKey() {
  1. Busca keys ativas (is_active = true)
  2. Ordena por priority (menor número = mais prioritário)
  3. Pula keys em cooldown (< 5 min após erro)
  4. Testa conexão (ping rápido)
  5. Retorna primeira disponível
}
```

**Fallback automático (src/lib/api-key-rotator.ts):**
- Key falha com rate limit? → Incrementa error_count, vai para cooldown 5min
- Tenta próxima key automaticamente
- Se última key falhar → Retorna erro ao usuário

---

## 🔍 Checklist: Antes de Deploy

- [ ] ✅ **Google Gemini key cadastrada** em `/configuracoes`
  - Verificar modelo: `gemini-3-pro-image-preview`
  - Testar: Gerar 1 criativo com imagem
- [ ] ✅ **Claude Haiku key cadastrada**
  - Verificar modelo: `claude-haiku-4-5-20251001`
  - Testar: Gerar copy no projeto
- [ ] ✅ **(Opcional) OpenAI key cadastrada** (fallback)
- [ ] ✅ **(Opcional) WisGate key cadastrada** (imagem fallback)
- [ ] ✅ **Testar geração ponta-a-ponta:**
  ```
  1. Criar projeto
  2. Ir a "Gerar" → "Novo"
  3. Setup: marca, personas, templates
  4. Gerar um criativo
  5. Validar: imagem gerou, copy gerou, saldo decrmentou
  ```

---

## 🆘 Troubleshooting

| Erro | Causa | Solução |
|------|-------|---------|
| "Nenhuma chave de IA disponível" | Nenhuma key cadastrada OU todas em falha | Cadastrar key em `/configuracoes` |
| "Gemini quota esgotada" | Google Gemini atingiu limite mensal | Adicionar WisGate como fallback OU aguardar reset |
| "Rate limit" | Too many requests to provider | Sistema vai para cooldown 5min, tenta próxima key |
| "Invalid API key" | Key expirou OU digitada errado | Deletar, cadastrar de novo |
| "Timeout (90s)" | Servidor de IA lento | Tentar novamente, pode ser sobrecarga |

---

## 📚 Referências de Código

| Arquivo | Função |
|---------|--------|
| `src/lib/models.ts` | Definição de modelos (AI_MODELS, TEXT_MODELS) |
| `src/lib/api-key-rotator.ts` | Lógica de rotação e fallback |
| `src/lib/gemini.ts` | Driver Google Gemini direto |
| `src/lib/wisgate.ts` | Driver WisGate (proxy) |
| `src/lib/anthropic.ts` | Driver Anthropic (Claude) |
| `src/lib/openai-text.ts` | Driver OpenAI (GPT) |
| `src/app/api/api-keys/route.ts` | Cadastro de keys (encrypt/decrypt) |
| `src/app/api/generate/one/route.ts` | Endpoint principal de geração |
| `src/app/api/copy-generate/route.ts` | Geração de copy isolada |

---

## 🎓 Resumo Final

### Imagens
- ✅ **Modelo único obrigatório:** `gemini-3-pro-image-preview` (Gemini 3)
- ✅ **Provedores:** Google direto OU WisGate
- ✅ **Custo:** ~$0.04-0.10 por imagem

### Copy/Texto
- ✅ **3 modelos configuráveis:** Claude Haiku (recomendado) → GPT-4o mini → Gemini 2.5 Flash
- ✅ **Fallback automático:** Se primário falha, tenta próximo
- ✅ **Custo:** ~$0.004 por copy

### Mínimo Necessário
1. **Google Gemini** (imagens)
2. **Claude Haiku** (copy)

### Deploy Seguro
1. ✅ Cadastrar keys em `/configuracoes` (nunca em `.env`)
2. ✅ System automaticamente as criptografa
3. ✅ Testar geração de criativo ponta-a-ponta
4. ✅ Sistema faz fallback automático se key falha

---

**Documento:** PROVEDORES-IA.md | **Versão:** 1.0
