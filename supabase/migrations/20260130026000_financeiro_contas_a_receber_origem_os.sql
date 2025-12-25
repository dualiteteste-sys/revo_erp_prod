/*
  Financeiro: vínculo Conta a Receber ↔ Origem (OS)

  - Permite gerar Conta a Receber a partir de uma Ordem de Serviço concluída
  - Previne duplicidade por (empresa_id, origem_tipo, origem_id)
*/

alter table public.contas_a_receber
  add column if not exists origem_tipo text,
  add column if not exists origem_id uuid;

create unique index if not exists contas_a_receber_origem_unique
  on public.contas_a_receber (empresa_id, origem_tipo, origem_id)
  where origem_id is not null;

create or replace function public.financeiro_conta_a_receber_from_os_get(p_os_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select c.id
  from public.contas_a_receber c
  where c.empresa_id = public.current_empresa_id()
    and c.origem_tipo = 'OS'
    and c.origem_id = p_os_id
  limit 1
$$;

revoke all on function public.financeiro_conta_a_receber_from_os_get(uuid) from public;
grant execute on function public.financeiro_conta_a_receber_from_os_get(uuid) to authenticated, service_role;

create or replace function public.financeiro_conta_a_receber_from_os_create(
  p_os_id uuid,
  p_data_vencimento date default null
)
returns public.contas_a_receber
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_os public.ordem_servicos;
  v_existing_id uuid;
  v_due date := coalesce(p_data_vencimento, (current_date + 7));
  v_rec public.contas_a_receber;
begin
  if v_empresa is null then
    raise exception '[FIN][A_RECEBER][OS] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  select * into v_os
  from public.ordem_servicos os
  where os.id = p_os_id
    and os.empresa_id = v_empresa
  limit 1;

  if not found then
    raise exception '[FIN][A_RECEBER][OS] Ordem de Serviço não encontrada' using errcode = 'P0002';
  end if;

  if v_os.status <> 'concluida'::public.status_os then
    raise exception '[FIN][A_RECEBER][OS] A OS precisa estar concluída para gerar a conta a receber.' using errcode = '23514';
  end if;

  if v_os.cliente_id is null then
    raise exception '[FIN][A_RECEBER][OS] A OS não possui cliente vinculado.' using errcode = '23514';
  end if;

  select public.financeiro_conta_a_receber_from_os_get(p_os_id) into v_existing_id;
  if v_existing_id is not null then
    select * into v_rec
    from public.contas_a_receber c
    where c.id = v_existing_id
      and c.empresa_id = v_empresa;
    return v_rec;
  end if;

  begin
    insert into public.contas_a_receber (
      empresa_id,
      cliente_id,
      descricao,
      valor,
      data_vencimento,
      status,
      observacoes,
      origem_tipo,
      origem_id
    )
    values (
      v_empresa,
      v_os.cliente_id,
      format('OS #%s - %s', v_os.numero::text, coalesce(v_os.descricao, '')),
      coalesce(v_os.total_geral, 0),
      v_due,
      'pendente'::public.status_conta_receber,
      'Gerado automaticamente a partir de Ordem de Serviço concluída.',
      'OS',
      p_os_id
    )
    returning * into v_rec;
  exception
    when unique_violation then
      select * into v_rec
      from public.contas_a_receber c
      where c.empresa_id = v_empresa
        and c.origem_tipo = 'OS'
        and c.origem_id = p_os_id
      limit 1;
  end;

  return v_rec;
end;
$$;

revoke all on function public.financeiro_conta_a_receber_from_os_create(uuid, date) from public;
grant execute on function public.financeiro_conta_a_receber_from_os_create(uuid, date) to authenticated, service_role;

