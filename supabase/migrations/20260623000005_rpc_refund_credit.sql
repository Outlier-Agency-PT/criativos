-- EP-14.04: RPC atômica refund_credit (estorno de 1 crédito quando a geração falha pós-débito).
--
-- PROBLEMA QUE RESOLVE
--   No catch de compensação de /api/generate/one, o estorno era read-then-write: lia
--   getCreditBalance() e depois fazia UPDATE credit_balance = current + 1. Sob concorrência
--   (duas falhas estornando ao mesmo tempo, ou um decrement_credit intercalado) isso estorna
--   de menos: os dois leem o mesmo "current" e gravam current+1, perdendo um estorno.
--
-- COMO RESOLVE
--   Incremento atômico cru no banco: UPDATE credit_balance = credit_balance + 1 dentro de UMA
--   função PL/pgSQL. O Postgres pega o lock de linha implícito no UPDATE, então estornos
--   concorrentes serializam e nenhum é perdido (cada um soma exatamente +1).
--
-- GUARDA ILIMITADA
--   O WHERE credit_balance IS NOT NULL garante que org ilimitada (credit_balance IS NULL)
--   NUNCA é incrementada: estornar numa org ilimitada transformaria NULL em número e quebraria
--   o bypass. Org sem row também não é tocada (0 rows afetadas).
--
-- CONTRATO DE RETORNO (integer):
--   saldo pós-estorno (>= 1) quando estornou de fato.
--   NULL quando nada foi estornado (org ilimitada, org sem row, ou saldo NULL).
--
-- REGRAS DURAS
--   CON-007: a função SÓ faz UPDATE de saldo. NUNCA deleta nada (o catch marca o log como
--   'failed' separadamente, sem deletar).
--   SECURITY DEFINER + SET search_path = public: roda com privilégio do owner sem expor UPDATE
--   direto da tabela ao cliente; o search_path fixo evita search_path hijack (boa prática
--   obrigatória pra SECURITY DEFINER).
--   Grant restrito: só service_role executa. authenticated/anon NÃO podem chamar (REVOKE FROM PUBLIC).

CREATE OR REPLACE FUNCTION public.refund_credit(
  p_org_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  -- Incremento atômico cru. WHERE credit_balance IS NOT NULL protege org ilimitada (NULL)
  -- e org sem saldo conhecido: nesses casos 0 rows são afetadas e v_balance fica NULL.
  UPDATE criativos_org_limits
     SET credit_balance = credit_balance + 1,
         updated_at     = now()
   WHERE org_id = p_org_id
     AND credit_balance IS NOT NULL
  RETURNING credit_balance INTO v_balance;

  RETURN v_balance;
END;
$$;

COMMENT ON FUNCTION public.refund_credit(uuid) IS
  'Estorna 1 credito (incremento atomico credit_balance + 1) quando a geracao falha pos-debito. '
  'WHERE credit_balance IS NOT NULL nunca incrementa org ilimitada. Retorna o saldo pos-estorno '
  'ou NULL se nada foi estornado. SECURITY DEFINER, chamavel so por service_role. NUNCA deleta (CON-007).';

-- =========================================================================
-- GRANT RESTRITO
--   Tira o EXECUTE default de PUBLIC (que cobre authenticated e anon) e concede apenas a
--   service_role. authenticated/anon NAO conseguem chamar a RPC; so o backend com a service key.
-- =========================================================================
REVOKE ALL ON FUNCTION public.refund_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_credit(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.refund_credit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid) TO service_role;

-- =========================================================================
-- TESTE DE CONCORRENCIA (documentado, AC-6)
--   Cenario: org com credit_balance = 0, duas chamadas concorrentes de refund_credit.
--   Resultado esperado: saldo final = 2 (cada estorno soma exatamente +1, nenhum perdido).
--   No padrao antigo read-then-write os dois liam 0 e gravavam 1, perdendo um estorno.
--
--   Caso ilimitado (credit_balance IS NULL): retorna NULL, NAO altera saldo (continua NULL).
--   Caso sem row: retorna NULL, nada acontece.
-- =========================================================================
