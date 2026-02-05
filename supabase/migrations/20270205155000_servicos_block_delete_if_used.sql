/*
  Serviços: bloquear exclusão quando já utilizado em outros módulos

  Objetivo:
  - Impedir que um serviço do catálogo seja excluído se já foi usado em outros módulos.
  - Retornar mensagem clara para a UI (palatável), evitando erro genérico de FK.

  Cobertura (mínimo):
  - Ordens de Serviço: public.ordem_servico_itens.servico_id
  - Contratos: public.servicos_contratos.servico_id
  - Indústria (beneficiamento): public.industria_benef_ordens.produto_servico_id
*/

begin;

-- 1) Contratos: não permitir apagar serviço referenciado (antes era SET NULL)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'servicos_contratos'
      and column_name = 'servico_id'
  ) then
    alter table public.servicos_contratos
      drop constraint if exists servicos_contratos_servico_id_fkey;

    alter table public.servicos_contratos
      add constraint servicos_contratos_servico_id_fkey
      foreign key (servico_id)
      references public.servicos(id)
      on delete restrict;
  end if;
end $$;

-- 2) RPC: delete com guard + mensagem amigável
create or replace function public.delete_service_for_current_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
  v_used_in text[] := '{}';
  v_used_label text;
begin
  if v_empresa_id is null then
    raise exception '[RPC][DELETE_SERVICE] Nenhuma empresa ativa encontrada' using errcode = '42501';
  end if;

  perform public.require_plano_mvp_allows('servicos');

  -- Guard: se já houve uso em outros módulos, bloquear exclusão e orientar "inativar".
  if to_regclass('public.ordem_servico_itens') is not null then
    if exists (
      select 1
      from public.ordem_servico_itens i
      where i.empresa_id = v_empresa_id
        and i.servico_id = p_id
      limit 1
    ) then
      v_used_in := array_append(v_used_in, 'Ordens de Serviço');
    end if;
  end if;

  if to_regclass('public.servicos_contratos') is not null then
    if exists (
      select 1
      from public.servicos_contratos c
      where c.empresa_id = v_empresa_id
        and c.servico_id = p_id
      limit 1
    ) then
      v_used_in := array_append(v_used_in, 'Contratos');
    end if;
  end if;

  if to_regclass('public.industria_benef_ordens') is not null then
    if exists (
      select 1
      from public.industria_benef_ordens bo
      where bo.empresa_id = v_empresa_id
        and bo.produto_servico_id = p_id
      limit 1
    ) then
      v_used_in := array_append(v_used_in, 'Beneficiamento (Indústria)');
    end if;
  end if;

  if array_length(v_used_in, 1) is not null then
    v_used_label := array_to_string(v_used_in, ', ');
    raise exception using
      errcode = '23503',
      message = format(
        'Não é possível excluir este serviço porque ele já foi utilizado em: %s. Para manter o histórico, marque como “inativo”.',
        v_used_label
      );
  end if;

  delete from public.servicos s
  where s.id = p_id
    and s.empresa_id = v_empresa_id;

  if not found then
    raise exception '[RPC][DELETE_SERVICE] Serviço não encontrado na empresa atual' using errcode='P0002';
  end if;
end;
$$;

revoke all on function public.delete_service_for_current_user(uuid) from public;
grant execute on function public.delete_service_for_current_user(uuid) to authenticated, service_role;

commit;

