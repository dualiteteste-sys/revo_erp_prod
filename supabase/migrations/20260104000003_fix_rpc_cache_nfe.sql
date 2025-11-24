-- fix_rpc_fiscal_nfe_import_register.sql
-- Garante a função fiscal_nfe_import_register(jsonb) + GRANT + reload do cache

-- 1) (Re)cria a função com assinatura correta e idempotente
create or replace function public.fiscal_nfe_import_register(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp     uuid := public.current_empresa_id();
  v_id      uuid;
  v_chave   text := trim(coalesce(p_payload->>'chave_acesso',''));
  v_items   jsonb := coalesce(p_payload->'items','[]'::jsonb);
  v_it      jsonb;
begin
  if v_chave = '' then
    raise exception 'chave_acesso é obrigatória.';
  end if;

  -- upsert do cabeçalho por (empresa, chave)
  insert into public.fiscal_nfe_imports (
    empresa_id, origem_upload, chave_acesso,
    numero, serie, emitente_cnpj, emitente_nome,
    destinat_cnpj, destinat_nome, data_emissao,
    total_produtos, total_nf, xml_raw, status, last_error
  ) values (
    v_emp,
    coalesce(p_payload->>'origem_upload','xml'),
    v_chave,
    p_payload->>'numero',
    p_payload->>'serie',
    p_payload->>'emitente_cnpj',
    p_payload->>'emitente_nome',
    p_payload->>'destinat_cnpj',
    p_payload->>'destinat_nome',
    (p_payload->>'data_emissao')::timestamptz,
    (p_payload->>'total_produtos')::numeric,
    (p_payload->>'total_nf')::numeric,
    p_payload->>'xml_raw',
    'registrado',
    null
  )
  on conflict (empresa_id, chave_acesso) do update set
    origem_upload  = excluded.origem_upload,
    numero         = excluded.numero,
    serie          = excluded.serie,
    emitente_cnpj  = excluded.emitente_cnpj,
    emitente_nome  = excluded.emitente_nome,
    destinat_cnpj  = excluded.destinat_cnpj,
    destinat_nome  = excluded.destinat_nome,
    data_emissao   = excluded.data_emissao,
    total_produtos = excluded.total_produtos,
    total_nf       = excluded.total_nf,
    xml_raw        = excluded.xml_raw,
    status         = 'registrado',
    last_error     = null,
    updated_at     = now()
  returning id into v_id;

  -- Recarrega itens (estratégia simples: limpa e insere para garantir consistência)
  delete from public.fiscal_nfe_import_items
  where empresa_id = v_emp
    and import_id  = v_id;

  for v_it in select * from jsonb_array_elements(v_items)
  loop
    insert into public.fiscal_nfe_import_items (
      empresa_id, import_id, n_item, cprod, ean, xprod, ncm, cfop,
      ucom, qcom, vuncom, vprod, cst, utrib, qtrib, vuntrib
    ) values (
      v_emp, v_id,
      (v_it->>'n_item')::int,
      v_it->>'cprod',
      v_it->>'ean',
      v_it->>'xprod',
      v_it->>'ncm',
      v_it->>'cfop',
      v_it->>'ucom',
      (v_it->>'qcom')::numeric,
      (v_it->>'vuncom')::numeric,
      (v_it->>'vprod')::numeric,
      v_it->>'cst',
      v_it->>'utrib',
      (v_it->>'qtrib')::numeric,
      (v_it->>'vuntrib')::numeric
    );
  end loop;

  -- Notifica log (opcional)
  perform pg_notify('app_log', '[RPC] fiscal_nfe_import_register: '||v_id);
  return v_id;
end;
$$;

-- 2) Garante privilégios de execução
revoke all on function public.fiscal_nfe_import_register(jsonb) from public;
grant execute on function public.fiscal_nfe_import_register(jsonb) to authenticated, service_role;

-- 3) CRÍTICO: Força reload do cache do PostgREST para reconhecer a função imediatamente
notify pgrst, 'reload schema';
