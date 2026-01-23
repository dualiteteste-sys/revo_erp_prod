/*
  Fix PROD error 42P10 on financeiro_extratos_bancarios_importar:
  The function was redefined with:
    ON CONFLICT (empresa_id, conta_corrente_id, hash_importacao) DO NOTHING
  but the project uses a PARTIAL UNIQUE index for this key:
    ... WHERE hash_importacao IS NOT NULL AND btrim(hash_importacao) <> ''

  Postgres requires the ON CONFLICT target to match a UNIQUE/EXCLUSION constraint
  (including predicate inference for partial indexes). Therefore we must restore
  the WHERE clause on the conflict target to match the partial unique index.
*/

begin;

create or replace function public.financeiro_extratos_bancarios_importar(p_conta_corrente_id uuid, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_item jsonb;
  v_count integer := 0;
  v_data date;
  v_desc text;
  v_doc text;
  v_tipo text;
  v_valor numeric;
  v_saldo numeric;
  v_id_banco text;
  v_hash text;
  v_linha text;
begin
  perform public.require_permission_for_current_user('tesouraria', 'create');

  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array JSON.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_data     := (v_item->>'data_lancamento')::date;
    v_desc     := v_item->>'descricao';
    v_doc      := v_item->>'documento_ref';
    v_tipo     := coalesce(v_item->>'tipo_lancamento', 'credito');
    v_valor    := (v_item->>'valor')::numeric;
    v_saldo    := (v_item->>'saldo_apos_lancamento')::numeric;
    v_id_banco := v_item->>'identificador_banco';
    v_hash     := v_item->>'hash_importacao';
    v_linha    := v_item->>'linha_bruta';

    if v_data is null or v_valor is null or v_valor <= 0 then
      continue;
    end if;

    if v_tipo not in ('credito','debito') then
      v_tipo := 'credito';
    end if;

    if v_hash is null or btrim(v_hash) = '' then
      v_hash := md5(
        coalesce(v_data::text,'') || '|' ||
        coalesce(v_desc,'') || '|' ||
        coalesce(v_tipo,'') || '|' ||
        coalesce(v_valor::text,'') || '|' ||
        coalesce(v_doc,'') || '|' ||
        coalesce(v_id_banco,'')
      );
    end if;

    insert into public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) values (
      v_empresa,
      p_conta_corrente_id,
      v_data,
      v_desc,
      v_id_banco,
      v_doc,
      v_tipo,
      v_valor,
      v_saldo,
      'upload_json',
      v_hash,
      v_linha,
      false
    )
    on conflict (empresa_id, conta_corrente_id, hash_importacao)
      where hash_importacao is not null and btrim(hash_importacao) <> ''
    do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_importar(uuid, jsonb) from public;
grant execute on function public.financeiro_extratos_bancarios_importar(uuid, jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

