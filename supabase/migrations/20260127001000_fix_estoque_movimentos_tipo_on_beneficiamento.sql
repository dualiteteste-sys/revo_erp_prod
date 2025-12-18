/*
  Fix: finalizar_recebimento -> null em estoque_movimentos.tipo

  Contexto:
  - `public.finalizar_recebimento` chama `public.beneficiamento_process_from_import`.
  - Em alguns ambientes, `public.estoque_movimentos.tipo` é NOT NULL (entrada/saida/ajuste),
    mas a rotina de beneficiamento insere movimentos sem preencher `tipo`, causando:
    "null value in column \"tipo\" of relation \"estoque_movimentos\" violates not-null constraint".

  Ação (idempotente):
  - Garante que a coluna `tipo` exista e tenha default 'entrada'.
  - Backfill de linhas existentes com `tipo` NULL.
  - Recria `beneficiamento_process_from_import` preenchendo `tipo='entrada'`.
  - Força reload do schema cache do PostgREST (evita 404 por cache).
*/

begin;

create schema if not exists public;

-- 1) Compat: garantir coluna `tipo` em estoque_movimentos
do $$
begin
  if to_regclass('public.estoque_movimentos') is null then
    raise notice 'Tabela public.estoque_movimentos não existe; pulando.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estoque_movimentos'
      and column_name = 'tipo'
  ) then
    execute 'alter table public.estoque_movimentos add column tipo text';
  end if;

  -- Preenche nulos (evita violação de NOT NULL em ambientes que já exigem)
  execute $sql$update public.estoque_movimentos set tipo = 'entrada' where tipo is null$sql$;

  -- Default para inserts que não informam `tipo`
  begin
    execute $sql$alter table public.estoque_movimentos alter column tipo set default 'entrada'$sql$;
  exception when others then
    raise notice 'Não foi possível ajustar default de estoque_movimentos.tipo: %', SQLERRM;
  end;

  -- Em ambientes onde o NOT NULL é desejado e ainda não existe, tenta aplicar (sem quebrar compat)
  begin
    execute $sql$alter table public.estoque_movimentos alter column tipo set not null$sql$;
  exception when others then
    -- Se falhar por dados ou incompatibilidade, mantém apenas default/backfill.
    raise notice 'Não foi possível aplicar NOT NULL em estoque_movimentos.tipo: %', SQLERRM;
  end;
end $$;

-- 2) Recria RPC para sempre setar `tipo='entrada'`
create or replace function public.beneficiamento_process_from_import(
  p_import_id uuid,
  p_matches   jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp   uuid := public.current_empresa_id();
  v_stat  text;
  v_row   record;
  v_prod  uuid;
begin
  select status into v_stat
  from public.fiscal_nfe_imports
  where id = p_import_id
    and empresa_id = v_emp
  for update;

  if v_stat is null then
    raise exception 'Import não encontrado.';
  end if;

  if v_stat = 'processado' then
    return;
  end if;

  for v_row in
    select fi.*
    from public.fiscal_nfe_import_items fi
    where fi.import_id = p_import_id
      and fi.empresa_id = v_emp
    order by fi.n_item
  loop
    select p.id into v_prod
    from public.produtos p
    where (p.sku = v_row.cprod and v_row.cprod is not null and v_row.cprod <> '')
       or (p.gtin = v_row.ean and v_row.ean is not null and v_row.ean <> '')
    limit 1;

    if v_prod is null and p_matches is not null then
      select (m->>'produto_id')::uuid into v_prod
      from jsonb_array_elements(p_matches) m
      where (m->>'item_id')::uuid = v_row.id;
    end if;

    if v_prod is null then
      raise exception 'Item % sem mapeamento de produto. Utilize preview e envie p_matches.', v_row.n_item;
    end if;

    insert into public.estoque_movimentos (
      empresa_id, produto_id, data_movimento,
      tipo, tipo_mov, quantidade, valor_unitario,
      origem_tipo, origem_id, observacoes
    ) values (
      v_emp, v_prod, current_date,
      'entrada', 'entrada_beneficiamento', v_row.qcom, v_row.vuncom,
      'nfe_beneficiamento', p_import_id,
      'NF-e entrada para beneficiamento - chave='||(
        select chave_acesso from public.fiscal_nfe_imports where id = p_import_id
      )
    )
    on conflict (empresa_id, origem_tipo, origem_id, produto_id, tipo_mov) do update set
      tipo           = excluded.tipo,
      quantidade     = excluded.quantidade,
      valor_unitario = excluded.valor_unitario,
      updated_at     = now();
  end loop;

  update public.fiscal_nfe_imports
  set status = 'processado', processed_at = now(), last_error = null
  where id = p_import_id
    and empresa_id = v_emp;

  perform pg_notify('app_log', '[RPC] beneficiamento_process_from_import: '||p_import_id);
exception
  when others then
    update public.fiscal_nfe_imports
    set status = 'erro', last_error = sqlerrm, updated_at = now()
    where id = p_import_id
      and empresa_id = v_emp;
    raise;
end;
$$;

revoke all on function public.beneficiamento_process_from_import(uuid, jsonb) from public;
grant execute on function public.beneficiamento_process_from_import(uuid, jsonb) to authenticated, service_role;

-- 3) Force PostgREST schema cache reload (evita erro de cache em pushes)
notify pgrst, 'reload schema';

commit;
