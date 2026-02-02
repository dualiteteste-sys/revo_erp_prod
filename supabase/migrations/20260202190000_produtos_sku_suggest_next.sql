-- Sugere o próximo SKU numérico disponível para a empresa atual.
-- Objetivo: evitar colisões e "voltar para 1" em fluxos que geram SKU sequencial (ex.: ER001, ER002...).
-- Segurança: multi-tenant via current_empresa_id(), permission guard, SECURITY DEFINER com search_path fixo.

begin;

create or replace function public.produtos_sku_suggest_next_for_current_user(
  p_current_sku text,
  p_width int default 3 -- largura mínima do sufixo numérico (ex.: 3 => 001)
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_sku text := nullif(trim(p_current_sku), '');
  v_prefix text;
  v_digits text;
  v_next int;
  v_candidate text;
  v_tries int := 0;
begin
  perform public.require_permission_for_current_user('produtos','view');

  if v_sku is null then
    raise exception 'p_current_sku é obrigatório.';
  end if;
  if p_width is null or p_width < 1 or p_width > 12 then
    raise exception 'p_width inválido (1..12).';
  end if;

  -- Extrair prefixo + sufixo numérico final, se existir.
  v_digits := substring(v_sku from '([0-9]+)$');
  if v_digits is null then
    -- sem sufixo numérico: apenas retorna o sku atual (nada a sugerir)
    return v_sku;
  end if;
  v_prefix := substring(v_sku from '^(.*?)[0-9]+$');
  v_prefix := coalesce(v_prefix, '');

  -- Próximo número = max(prefix+num) + 1 dentro da empresa.
  select coalesce(max((substring(sku from '([0-9]+)$'))::int), 0) + 1
    into v_next
  from public.produtos
  where empresa_id = v_empresa
    and sku like v_prefix || '%'
    and substring(sku from '([0-9]+)$') is not null;

  -- Garantir que sugerimos um SKU não usado (defensivo).
  loop
    v_candidate := v_prefix || lpad(v_next::text, p_width, '0');
    exit when not exists (
      select 1 from public.produtos where empresa_id = v_empresa and sku = v_candidate
    );
    v_next := v_next + 1;
    v_tries := v_tries + 1;
    if v_tries > 5000 then
      raise exception 'Não foi possível sugerir um SKU único (tentativas excedidas).';
    end if;
  end loop;

  return v_candidate;
end;
$$;

commit;

