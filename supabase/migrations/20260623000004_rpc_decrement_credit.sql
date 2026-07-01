-- EP-14.03: RPC atômica decrement_credit (débito de crédito + log de geração na MESMA função).
--
-- PROBLEMA QUE RESOLVE
--   O endpoint /api/generate/one fazia read-then-write do saldo (lê credit_balance, decide,
--   depois UPDATE) com o INSERT do log solto em outro ponto. Sob concorrência isso permite
--   overspend (dois requests leem o mesmo "último crédito" e ambos debitam) e o cenário
--   inconsistente "debitou mas não logou" (ou "logou sem debitar").
--
-- COMO RESOLVE
--   Move UPDATE de saldo + INSERT de log pra dentro de UMA função PL/pgSQL. A função executa
--   numa única transação implícita, então débito e log são atômicos: ou os dois acontecem ou
--   nenhum. O UPDATE usa o padrão ...WHERE credit_balance > 0 RETURNING, que pega o lock de
--   linha implícito do Postgres; dois requests concorrentes NÃO conseguem ambos debitar do
--   mesmo último crédito (resolve a race de overspend).
--
-- CONTRATO DE RETORNO (jsonb) que o caller (EP-14.04) usa pra decidir 429 ou seguir:
--   {"status":"unlimited", "balance": null}  -> org ilimitada (credit_balance IS NULL); logou, não debitou.
--   {"status":"ok",        "balance": <int>} -> debitou 1 crédito e logou; balance = saldo pós-débito (>= 0).
--   {"status":"denied",    "balance": 0}     -> saldo era 0; NÃO logou, NÃO debitou; caller responde 429.
--
-- REGRAS DURAS
--   CON-007: a função SÓ faz UPDATE de saldo + INSERT de log. NUNCA deleta nada (o fluxo só acumula).
--   SECURITY DEFINER + SET search_path = public: roda com privilégio do owner sem expor UPDATE
--   direto da tabela ao cliente; o search_path fixo evita search_path hijack (boa prática
--   obrigatória pra SECURITY DEFINER).
--   Grant restrito: só service_role executa. authenticated/anon NÃO podem chamar (REVOKE FROM PUBLIC).

CREATE OR REPLACE FUNCTION public.decrement_credit(
  p_org_id     uuid,
  p_creative_id uuid,
  p_model      text,
  p_provider   text,
  p_cost_usd   numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_unlimited boolean;
  v_balance      integer;
  v_rowcount     integer;
BEGIN
  -- (1) Determina se a org é ilimitada (credit_balance IS NULL). Lê a row uma vez.
  --     Se não existe row pra a org, tratamos como saldo 0 (negado) por segurança: uma org
  --     cliente sem row NÃO deve gerar de graça. O backfill da EP-14.01 já materializa uma
  --     row pra cada org, então o caminho "sem row" é defensivo.
  SELECT (credit_balance IS NULL)
    INTO v_is_unlimited
    FROM criativos_org_limits
   WHERE org_id = p_org_id;

  IF NOT FOUND THEN
    -- Sem row de limite: nega sem logar (sem saldo conhecido = sem crédito).
    RETURN jsonb_build_object('status', 'denied', 'balance', 0);
  END IF;

  -- (2) Caso ILIMITADO: não muta saldo, mas AINDA registra o log (auditoria/custo).
  --     Não há race de saldo aqui porque nada é decrementado.
  IF v_is_unlimited THEN
    INSERT INTO criativos_generation_logs
      (org_id, creative_id, model_used, provider, cost_usd, status)
    VALUES
      (p_org_id, p_creative_id, p_model, p_provider, p_cost_usd, 'completed');

    RETURN jsonb_build_object('status', 'unlimited', 'balance', NULL);
  END IF;

  -- (3) Caso SALDO FINITO: UPDATE atômico com guarda credit_balance > 0 e RETURNING.
  --     O WHERE credit_balance > 0 impede saldo negativo; o RETURNING + lock de linha
  --     implícito serializa requests concorrentes (resolve overspend).
  UPDATE criativos_org_limits
     SET credit_balance = credit_balance - 1,
         updated_at     = now()
   WHERE org_id = p_org_id
     AND credit_balance > 0
  RETURNING credit_balance INTO v_balance;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount = 0 THEN
    -- Saldo era 0 (ou foi zerado por outro request concorrente): NÃO loga, NÃO debita.
    RETURN jsonb_build_object('status', 'denied', 'balance', 0);
  END IF;

  -- (4) Débito bem-sucedido: insere o log na MESMA função (atômico com o UPDATE acima).
  --     Impossível debitar sem logar ou logar sem debitar.
  INSERT INTO criativos_generation_logs
    (org_id, creative_id, model_used, provider, cost_usd, status)
  VALUES
    (p_org_id, p_creative_id, p_model, p_provider, p_cost_usd, 'completed');

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

COMMENT ON FUNCTION public.decrement_credit(uuid, uuid, text, text, numeric) IS
  'Debita 1 crédito (saldo finito) e grava o log de geração na MESMA função atômica. '
  'Retorna jsonb {status: unlimited|ok|denied, balance}. '
  'SECURITY DEFINER, chamável só por service_role. NUNCA deleta (CON-007).';

-- =========================================================================
-- GRANT RESTRITO
--   Tira o EXECUTE default de PUBLIC (que cobre authenticated e anon) e concede apenas a
--   service_role. authenticated/anon NÃO conseguem chamar a RPC; só o backend com a service key.
-- =========================================================================
REVOKE ALL ON FUNCTION public.decrement_credit(uuid, uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_credit(uuid, uuid, text, text, numeric) FROM authenticated;
REVOKE ALL ON FUNCTION public.decrement_credit(uuid, uuid, text, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.decrement_credit(uuid, uuid, text, text, numeric) TO service_role;

-- =========================================================================
-- TESTE DE CONCORRÊNCIA (documentado, AC-6)
--   Cenário: org com credit_balance = 1, duas chamadas concorrentes de decrement_credit.
--   Resultado esperado: exatamente 1 retorno {status:'ok', balance:0} (com 1 log novo) e
--   1 retorno {status:'denied', balance:0} (sem log). Saldo final = 0, exatamente 1 log novo.
--
--   Setup (rodar como service_role / owner; troque o UUID por uma org de teste):
--     UPDATE criativos_org_limits SET credit_balance = 1
--      WHERE org_id = '00000000-0000-0000-0000-000000000000';
--
--   Concorrência real (2 sessões psql simultâneas, cada uma):
--     BEGIN;
--     SELECT public.decrement_credit(
--       '00000000-0000-0000-0000-000000000000'::uuid,  -- p_org_id
--       NULL::uuid,                                     -- p_creative_id
--       'gemini-3-pro-image-preview',                   -- p_model
--       'wisgate',                                       -- p_provider
--       0.039::numeric                                   -- p_cost_usd
--     );
--     -- (manter a 1a transação aberta enquanto a 2a tenta; depois COMMIT nas duas)
--     COMMIT;
--   A sessão que pega o lock primeiro retorna 'ok' (balance 0); a outra, ao liberar o lock,
--   reavalia o WHERE credit_balance > 0 (agora 0), atinge 0 rows e retorna 'denied'.
--
--   Verificação:
--     SELECT credit_balance FROM criativos_org_limits
--      WHERE org_id = '00000000-0000-0000-0000-000000000000';   -- esperado: 0
--     SELECT count(*) FROM criativos_generation_logs
--      WHERE org_id = '00000000-0000-0000-0000-000000000000';   -- esperado: +1 em relação ao baseline
--
--   Caso ilimitado (credit_balance IS NULL): retorna {status:'unlimited', balance:null},
--   NÃO altera saldo e insere 1 log.
--   Caso negado (credit_balance = 0): retorna {status:'denied', balance:0}, sem log.
-- =========================================================================
