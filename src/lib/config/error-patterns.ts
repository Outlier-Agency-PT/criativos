/**
 * Deteccao robusta de erros de provider de IA.
 *
 * Substitui checagens fragis por `message.includes("rate")` que davam falso
 * positivo/negativo. Checa primeiro o status HTTP (quando disponivel), depois
 * cai pra regex sobre a mensagem.
 *
 * Hierarquia de uso no rotador:
 *   1. isOutOfCredit  -> pula a key imediatamente (nao adianta retentar)
 *   2. isRateLimit    -> retry com backoff na mesma key
 *   3. (senao)        -> erro definitivo, marca e pula
 */

const RATE_LIMIT_RE = /quota|rate.?limit|exhaust|overload|too many/i;
const OUT_OF_CREDIT_RE =
  /insufficient|billing|credit|payment|exceeded your current quota|out of credit|no credit/i;

/**
 * Rate-limit / sobrecarga temporaria: vale a pena retentar com backoff.
 * Status 429 (Too Many Requests) e 503 (Service Unavailable) sao os sinais fortes.
 */
export function isRateLimit(message: string, status?: number): boolean {
  if (status === 429 || status === 503) return true;
  return RATE_LIMIT_RE.test(message);
}

/**
 * Sem credito / billing esgotado: NAO adianta retentar, pular a key na hora.
 * Status 402 (Payment Required) e 403 (Forbidden, billing) sao os sinais fortes.
 */
export function isOutOfCredit(message: string, status?: number): boolean {
  if (status === 402 || status === 403) return true;
  return OUT_OF_CREDIT_RE.test(message);
}

/**
 * Extrai o status HTTP de uma mensagem de erro quando ele aparece inline
 * (ex: "wisgate 429: ...", "openai 402: ..."). Retorna undefined se nao achar.
 */
export function parseStatusFromMessage(message: string): number | undefined {
  const m = message.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

