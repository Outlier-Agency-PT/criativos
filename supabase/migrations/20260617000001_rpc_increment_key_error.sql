-- Incremento atomico de error_count para evitar corrida (read-then-write)
-- entre geracoes concorrentes que marcam erro na mesma key.
CREATE OR REPLACE FUNCTION criativos_increment_key_error(p_key_id uuid)
RETURNS integer LANGUAGE sql AS $$
  UPDATE public.criativos_api_keys
  SET error_count = error_count + 1, last_error = now()
  WHERE id = p_key_id
  RETURNING error_count;
$$;
