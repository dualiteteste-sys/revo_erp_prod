/*
  # Recebimento (XML) -> Materiais de Clientes (auto-sync)

  Objetivo:
  - Ao finalizar um recebimento via XML (NF-e), criar/atualizar automaticamente
    registros em `public.industria_materiais_cliente` para o cliente (emitente)
    e os itens vinculados a produtos do sistema.

  Observações:
  - Idempotente via ON CONFLICT (empresa_id, cliente_id, produto_id, codigo_cliente).
  - Tolerante a bases que ainda não possuem `industria_materiais_cliente`.
  - `finalizar_recebimento` continua funcionando mesmo se o sync falhar (best-effort).
*/

create schema if not exists public;

-- ------------------------------------------------------------
-- 1) RPC: sync de materiais do cliente a partir do recebimento
-- ------------------------------------------------------------
create or replace function public.recebimento_sync_materiais_cliente(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_import_id uuid;
  v_emit_cnpj_raw text;
  v_emit_nome text;
  v_emit_cnpj text;
  v_chave text;
  v_numero text;
  v_serie text;
  v_cliente_id uuid;
  v_upserted int := 0;
begin
  if to_regclass('public.industria_materiais_cliente') is null then
    return jsonb_build_object('status','skipped','reason','industria_materiais_cliente_missing');
  end if;

  if to_regclass('public.pessoas') is null then
    return jsonb_build_object('status','skipped','reason','pessoas_missing');
  end if;

  select
    r.fiscal_nfe_import_id,
    n.emitente_cnpj,
    n.emitente_nome,
    n.chave_acesso,
    n.numero,
    n.serie
  into
    v_import_id,
    v_emit_cnpj_raw,
    v_emit_nome,
    v_chave,
    v_numero,
    v_serie
  from public.recebimentos r
  join public.fiscal_nfe_imports n on n.id = r.fiscal_nfe_import_id
  where r.id = p_recebimento_id
    and r.empresa_id = v_emp
  limit 1;

  if v_import_id is null then
    raise exception 'Recebimento não encontrado.';
  end if;

  v_emit_cnpj := nullif(regexp_replace(coalesce(v_emit_cnpj_raw,''), '\\D', '', 'g'), '');
  if v_emit_cnpj is null then
    return jsonb_build_object('status','skipped','reason','emitente_cnpj_missing');
  end if;

  -- 1) Resolve/Cria cliente (emitente) na tabela pessoas
  select p.id into v_cliente_id
  from public.pessoas p
  where p.empresa_id = v_emp
    and p.deleted_at is null
    and regexp_replace(coalesce(p.doc_unico,''), '\\D', '', 'g') = v_emit_cnpj
  order by p.created_at desc
  limit 1;

  if v_cliente_id is null then
    begin
      -- Insere somente campos básicos para manter compatibilidade entre esquemas.
      insert into public.pessoas (
        empresa_id, nome, fantasia, doc_unico
      ) values (
        v_emp,
        coalesce(nullif(v_emit_nome,''), 'Cliente (NF-e)'),
        coalesce(nullif(v_emit_nome,''), 'Cliente (NF-e)'),
        v_emit_cnpj
      )
      returning id into v_cliente_id;
    exception when others then
      -- Não bloqueia o recebimento: apenas retorna motivo para debug
      return jsonb_build_object('status','skipped','reason','cliente_upsert_failed','error',SQLERRM);
    end;
  end if;

  -- 2) Upsert de Materiais de Cliente para cada item vinculado
  insert into public.industria_materiais_cliente (
    empresa_id,
    cliente_id,
    produto_id,
    codigo_cliente,
    nome_cliente,
    unidade,
    ativo,
    observacoes
  )
  select distinct
    v_emp,
    v_cliente_id,
    ri.produto_id,
    left(
      coalesce(
        nullif(fi.cprod,''),
        nullif(fi.ean,''),
        'IMPORT-'||left(v_import_id::text,8)||'-'||coalesce(fi.n_item::text,'0')
      ),
      120
    ) as codigo_cliente,
    nullif(fi.xprod,'') as nome_cliente,
    nullif(fi.ucom,'') as unidade,
    true,
    left(
      'Gerado via Recebimento XML NF-e '||
      coalesce(nullif(v_numero,''),'?')||'/'||coalesce(nullif(v_serie,''),'?')||
      ' chave='||coalesce(nullif(v_chave,''),'?'),
      250
    ) as observacoes
  from public.recebimento_itens ri
  join public.fiscal_nfe_import_items fi
    on fi.id = ri.fiscal_nfe_item_id
   and fi.empresa_id = v_emp
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null
  on conflict (empresa_id, cliente_id, produto_id, codigo_cliente)
  do update set
    nome_cliente = coalesce(excluded.nome_cliente, public.industria_materiais_cliente.nome_cliente),
    unidade      = coalesce(excluded.unidade, public.industria_materiais_cliente.unidade),
    ativo        = true,
    updated_at   = now();

  get diagnostics v_upserted = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'cliente_id', v_cliente_id,
    'upserted', v_upserted
  );
end;
$$;

revoke all on function public.recebimento_sync_materiais_cliente(uuid) from public;
grant execute on function public.recebimento_sync_materiais_cliente(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2) Hook: finalizar_recebimento chama sync (best-effort)
-- ------------------------------------------------------------
create or replace function public.finalizar_recebimento(
  p_recebimento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_item record;
  v_divergente boolean := false;
  v_import_id uuid;
  v_matches jsonb;
  v_sync jsonb;
  v_sync_count int := 0;
begin
  for v_item in
    select * from public.recebimento_itens
    where recebimento_id = p_recebimento_id and empresa_id = v_emp
  loop
    if v_item.quantidade_conferida <> v_item.quantidade_xml then
      v_divergente := true;
    end if;
  end loop;

  if v_divergente then
    update public.recebimentos set status = 'divergente', updated_at = now()
    where id = p_recebimento_id;
    return jsonb_build_object('status', 'divergente', 'message', 'Existem divergências na conferência.');
  end if;

  select fiscal_nfe_import_id into v_import_id
  from public.recebimentos
  where id = p_recebimento_id;

  select jsonb_agg(
           jsonb_build_object(
             'item_id', ri.fiscal_nfe_item_id,
             'produto_id', ri.produto_id
           )
         )
  into v_matches
  from public.recebimento_itens ri
  where ri.recebimento_id = p_recebimento_id
    and ri.empresa_id = v_emp
    and ri.produto_id is not null;

  perform public.beneficiamento_process_from_import(v_import_id, coalesce(v_matches, '[]'::jsonb));

  -- Best-effort: não bloqueia finalização do recebimento
  begin
    v_sync := public.recebimento_sync_materiais_cliente(p_recebimento_id);
    v_sync_count := coalesce((v_sync->>'upserted')::int, 0);
  exception when others then
    v_sync := jsonb_build_object('status','error','error',SQLERRM);
    v_sync_count := 0;
  end;

  update public.recebimentos set status = 'concluido', updated_at = now()
  where id = p_recebimento_id;

  return jsonb_build_object(
    'status', 'concluido',
    'message',
      case
        when v_sync_count > 0 then
          'Recebimento finalizado, estoque atualizado e Materiais de Cliente sincronizados ('||v_sync_count||').'
        else
          'Recebimento finalizado e estoque atualizado.'
      end,
    'materiais_cliente_sync', v_sync
  );
end;
$$;

revoke all on function public.finalizar_recebimento(uuid) from public;
grant execute on function public.finalizar_recebimento(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
