-- EP-14.06: RPC atomica recharge_credit (recarga/ajuste de saldo + registro do ajuste na MESMA funcao).
--
-- PROBLEMA QUE RESOLVE
--   O endpoint POST /api/billing/recharge precisa mexer em DUAS tabelas: atualizar o saldo em
--   criativos_org_limits (credit_balance, credits_total, last_recharge_at) E inserir uma linha de
--   auditoria em criativos_credit_adjustments. Feito em duas queries separadas no backend, uma
--   falha intermediaria (rede, timeout, erro) deixa estado inconsistente: saldo recarregado sem
--   registro de ajuste, ou registro sem o saldo correspondente. Some-se concorrencia (duas
--   recargas no mesmo instante com delta) e o read-then-write do saldo perde incrementos.
--
-- COMO RESOLVE
--   Move UPDATE de saldo + INSERT de ajuste pra dentro de UMA funcao PL/pgSQL. A funcao roda numa
--   unica transacao implicita: ou as duas operacoes acontecem ou nenhuma (atomicidade saldo+ajuste).
--   No modo delta, o UPDATE usa credit_balance = COALESCE(credit_balance, 0) + p_delta com o lock
--   de linha implicito do Postgres, serializando recargas concorrentes (nenhum incremento perdido).
--
-- DOIS MODOS (exatamente um por chamada, validado no backend antes de chamar):
--   delta  (p_delta NOT NULL, p_set_to NULL): incrementa o saldo. delta > 0 = recarga,
--           delta < 0 = correcao/estorno administrativo. credits_total so cresce em delta > 0.
--   set_to (p_set_to NOT NULL, p_delta NULL): define o saldo absoluto. O ajuste registrado tem
--           delta = novo_saldo - saldo_anterior (a variacao efetiva). credits_total cresce apenas
--           se a variacao efetiva for positiva.
--
-- DECISAO: ORG ILIMITADA (credit_balance IS NULL)
--   Org ilimitada NAO usa saldo decrementavel; recarregar com delta nao faz sentido (somar a um
--   saldo que e bypassado). Por isso:
--     - modo delta numa org ilimitada: retorna status 'unlimited_no_delta' SEM mutar nada. O backend
--       traduz pra 400 "org ilimitada nao usa saldo; use set_to pra defini-lo".
--     - modo set_to numa org ilimitada: PERMITIDO. Tira a org do ilimitado e fixa um saldo finito
--       (caso de uso: converter um cliente ilimitado em pre-pago). delta do ajuste = set_to - 0
--       (saldo anterior tratado como 0 pra fins de registro, ja que NULL nao e numero).
--
-- CONTRATO DE RETORNO (jsonb) que o backend usa:
--   {"status":"ok", "credit_balance": <int>, "credits_total": <int>, "adjustment_id": <uuid>, "delta": <int>}
--       recarga/ajuste aplicado; credit_balance = saldo pos-operacao.
--   {"status":"unlimited_no_delta"}  -> tentou delta numa org ilimitada; nada mutado; backend responde 400.
--   {"status":"no_org"}              -> org sem row em criativos_org_limits; nada mutado; backend responde 404.
--
-- REGRAS DURAS
--   CON-007: a funcao SO faz UPDATE de saldo + INSERT de ajuste. NUNCA deleta nada.
--   SECURITY DEFINER + SET search_path = public: roda com privilegio do owner sem expor UPDATE/INSERT
--   direto das tabelas ao cliente; o search_path fixo evita search_path hijack (boa pratica
--   obrigatoria pra SECURITY DEFINER).
--   Grant restrito: so service_role executa. authenticated/anon NAO podem chamar (REVOKE FROM PUBLIC).

CREATE OR REPLACE FUNCTION public.recharge_credit(
  p_org_id uuid,
  p_delta  integer,
  p_set_to integer,
  p_reason text,
  p_actor  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_unlimited  boolean;
  v_prev_balance  integer;
  v_new_balance   integer;
  v_effective     integer;
  v_adjustment_id uuid;
  v_credits_total integer;
BEGIN
  -- (0) Le o estado atual da org target. Trava a row (FOR UPDATE) pra serializar recargas
  --     concorrentes no modo delta. Se nao existe row, devolve no_org (backend responde 404).
  SELECT credit_balance, (credit_balance IS NULL)
    INTO v_prev_balance, v_is_unlimited
    FROM criativos_org_limits
   WHERE org_id = p_org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_org');
  END IF;

  -- (1) Calcula o novo saldo conforme o modo.
  IF p_set_to IS NOT NULL THEN
    -- Modo set_to: define o saldo absoluto. Funciona inclusive pra org ilimitada (tira do NULL).
    v_new_balance := p_set_to;
    -- delta efetivo do ajuste = variacao real. Saldo anterior NULL (ilimitado) conta como 0.
    v_effective := p_set_to - COALESCE(v_prev_balance, 0);
  ELSE
    -- Modo delta. Numa org ilimitada nao faz sentido somar; sinaliza pro backend (400).
    IF v_is_unlimited THEN
      RETURN jsonb_build_object('status', 'unlimited_no_delta');
    END IF;
    v_new_balance := v_prev_balance + p_delta;
    v_effective := p_delta;
  END IF;

  -- (2) Atualiza o saldo. credits_total so cresce com variacao efetiva positiva (total ja concedido
  --     nunca diminui em correcao/estorno). last_recharge_at marca a operacao.
  UPDATE criativos_org_limits
     SET credit_balance   = v_new_balance,
         credits_total    = credits_total + GREATEST(v_effective, 0),
         last_recharge_at = now(),
         updated_at       = now()
   WHERE org_id = p_org_id
  RETURNING credits_total INTO v_credits_total;

  -- (3) Registra o ajuste de auditoria na MESMA transacao (atomico com o UPDATE acima).
  --     delta registrado = variacao efetiva (positiva em recarga, negativa em correcao/estorno).
  INSERT INTO criativos_credit_adjustments (org_id, delta, reason, actor_user_id)
  VALUES (p_org_id, v_effective, p_reason, p_actor)
  RETURNING id INTO v_adjustment_id;

  RETURN jsonb_build_object(
    'status',        'ok',
    'credit_balance', v_new_balance,
    'credits_total',  v_credits_total,
    'adjustment_id',  v_adjustment_id,
    'delta',          v_effective
  );
END;
$$;

COMMENT ON FUNCTION public.recharge_credit(uuid, integer, integer, text, uuid) IS
  'Recarga/ajuste de saldo (delta ou set_to) + INSERT do ajuste na MESMA funcao atomica. '
  'Modo delta em org ilimitada retorna unlimited_no_delta (nada mutado); set_to tira do ilimitado. '
  'credits_total so cresce com variacao positiva. Retorna jsonb {status, credit_balance, credits_total, '
  'adjustment_id, delta}. SECURITY DEFINER, chamavel so por service_role. NUNCA deleta (CON-007).';

-- =========================================================================
-- GRANT RESTRITO
--   Tira o EXECUTE default de PUBLIC (que cobre authenticated e anon) e concede apenas a
--   service_role. authenticated/anon NAO conseguem chamar a RPC; so o backend com a service key.
-- =========================================================================
REVOKE ALL ON FUNCTION public.recharge_credit(uuid, integer, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recharge_credit(uuid, integer, integer, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.recharge_credit(uuid, integer, integer, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recharge_credit(uuid, integer, integer, text, uuid) TO service_role;

-- =========================================================================
-- TESTE (documentado, AC-6)
--   Cenario principal: org com credit_balance = 0, recarga de +500 (modo delta).
--     SELECT public.recharge_credit(
--       '00000000-0000-0000-0000-000000000000'::uuid,  -- p_org_id
--       500::integer,                                   -- p_delta
--       NULL::integer,                                  -- p_set_to
--       'recarga manual',                               -- p_reason
--       '11111111-1111-1111-1111-111111111111'::uuid    -- p_actor
--     );
--   Esperado: {"status":"ok","credit_balance":500,"credits_total":500,"adjustment_id":...,"delta":500}.
--   Verificacao:
--     SELECT credit_balance, credits_total, last_recharge_at FROM criativos_org_limits
--      WHERE org_id = '00000000-0000-0000-0000-000000000000';   -- 500 / 500 / now()
--     SELECT delta, actor_user_id FROM criativos_credit_adjustments
--      WHERE org_id = '00000000-0000-0000-0000-000000000000' ORDER BY created_at DESC LIMIT 1; -- 500 / actor
--
--   delta negativo (correcao): recharge_credit(org, -50, NULL, 'estorno', actor) numa org com saldo 500
--     resulta em credit_balance = 450, credits_total inalterado (GREATEST(-50,0) = 0), ajuste delta = -50.
--
--   set_to absoluto: recharge_credit(org, NULL, 1000, 'set saldo', actor) numa org com saldo 450
--     resulta em credit_balance = 1000, credits_total += 550, ajuste delta = 550.
--
--   org ilimitada + delta: retorna {"status":"unlimited_no_delta"}, nada muta (backend -> 400).
--   org ilimitada + set_to: define saldo finito (tira do ilimitado), ajuste delta = set_to.
--   org sem row: retorna {"status":"no_org"} (backend -> 404).
-- =========================================================================
