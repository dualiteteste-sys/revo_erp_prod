/*
  IND-01 / IND-02 hardening
  - IND-01: travas de estados + ordens concluídas/canceladas readonly; bloquear edição estrutural após gerar execução.
  - IND-02: normalizar status de operações (na_fila/pendente -> planejada/liberada) e mapear update_status.
*/

begin;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public._ind01_normalize_status(p_status text)
returns text
language sql
immutable
as $$
  select lower(coalesce(nullif(btrim(p_status),''), ''));
$$;

-- -----------------------------------------------------------------------------
-- IND-02: Normalização de status de Operações (UI <-> DB)
--  DB: na_fila | pendente | em_execucao | em_espera | em_inspecao | concluida | cancelada
--  UI: planejada | liberada | em_execucao | em_espera | em_inspecao | concluida | cancelada
-- -----------------------------------------------------------------------------
create or replace function public._ind02_op_status_to_ui(p_status text)
returns text
language sql
immutable
as $$
  select
    case public._ind01_normalize_status(p_status)
      when 'na_fila' then 'planejada'
      when 'pendente' then 'liberada'
      when 'pausada' then 'em_espera'
      else public._ind01_normalize_status(p_status)
    end;
$$;

create or replace function public._ind02_op_status_to_db(p_status text)
returns text
language sql
immutable
as $$
  select
    case public._ind01_normalize_status(p_status)
      when 'planejada' then 'na_fila'
      when 'liberada' then 'pendente'
      else public._ind01_normalize_status(p_status)
    end;
$$;

-- -----------------------------------------------------------------------------
-- IND-02: Corrige industria_operacoes_list (mapeia status e filtros)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.industria_operacoes_list(text, uuid, text, text)') is null then
    raise notice 'IND-02: industria_operacoes_list não encontrado; pulando.';
    return;
  end if;

  execute $sql$
    create or replace function public.industria_operacoes_list(
      p_view text default 'lista',
      p_centro_id uuid default null,
      p_status text default null,
      p_search text default null
    ) returns table (
      id uuid,
      ordem_id uuid,
      ordem_numero bigint,
      tipo_ordem text,
      produto_nome text,
      cliente_nome text,
      centro_trabalho_id uuid,
      centro_trabalho_nome text,
      status text,
      prioridade int,
      data_prevista_inicio timestamptz,
      data_prevista_fim timestamptz,
      percentual_concluido numeric,
      atrasada boolean,
      updated_at timestamptz
    )
    language plpgsql
    security definer
    set search_path = public, extensions, pg_catalog
    as $body$
    declare
      v_emp uuid := public.current_empresa_id();
      v_status_ui text := nullif(public._ind01_normalize_status(p_status), '');
    begin
      return query
      select
        op.id,
        op.ordem_id,
        prd.numero::bigint as ordem_numero,
        case
          when iord.tipo_ordem = 'beneficiamento' then 'beneficiamento'::text
          else 'producao'::text
        end as tipo_ordem,
        prod.nome as produto_nome,
        cli.nome as cliente_nome,
        op.centro_trabalho_id,
        ct.nome as centro_trabalho_nome,
        public._ind02_op_status_to_ui(op.status) as status,
        coalesce(prd.prioridade, 0) as prioridade,
        prd.data_prevista_inicio::timestamptz,
        prd.data_prevista_fim::timestamptz,
        case when op.quantidade_planejada > 0
             then round((op.quantidade_produzida / op.quantidade_planejada) * 100, 2)
             else 0 end as percentual_concluido,
        case
          when (public._ind02_op_status_to_ui(op.status) not in ('concluida', 'cancelada'))
           and prd.data_prevista_fim is not null
           and prd.data_prevista_fim < now()
          then true else false
        end as atrasada,
        op.updated_at
      from public.industria_producao_operacoes op
      join public.industria_producao_ordens prd on prd.id = op.ordem_id
      left join public.industria_centros_trabalho ct on ct.id = op.centro_trabalho_id
      join public.produtos prod on prod.id = prd.produto_final_id
      left join public.industria_ordens iord
        on iord.execucao_ordem_id = prd.id
       and iord.empresa_id = v_emp
      left join public.pessoas cli
        on cli.id = iord.cliente_id
      where prd.empresa_id = v_emp
        and (p_centro_id is null or op.centro_trabalho_id = p_centro_id)
        and (
          v_status_ui is null
          or public._ind02_op_status_to_ui(op.status) = v_status_ui
        )
        and (
          p_search is null
          or prod.nome ilike '%'||p_search||'%'
          or coalesce(prd.numero::text, '') ilike '%'||p_search||'%'
          or coalesce(prd.documento_ref, '') ilike '%'||p_search||'%'
          or coalesce(cli.nome, '') ilike '%'||p_search||'%'
          or coalesce(iord.numero::text, '') ilike '%'||p_search||'%'
        )
      order by coalesce(prd.prioridade,0) desc, op.created_at desc;
    end;
    $body$;
  $sql$;
end;
$$;

-- -----------------------------------------------------------------------------
-- IND-02: Corrige industria_operacao_update_status__unsafe (mapeia UI -> DB)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.industria_operacao_update_status__unsafe(uuid, text, integer, uuid)') is null
     and to_regprocedure('public.industria_operacao_update_status(uuid, text, integer, uuid)') is null then
    raise notice 'IND-02: industria_operacao_update_status não encontrado; pulando.';
    return;
  end if;

  execute $sql$
    create or replace function public.industria_operacao_update_status__unsafe(
      p_id uuid,
      p_status text,
      p_prioridade int default null,
      p_centro_trabalho_id uuid default null
    )
    returns void
    language plpgsql
    security definer
    set search_path = public, extensions, pg_catalog
    as $body$
    declare
      v_emp uuid := public.current_empresa_id();
      v_ordem_id uuid;
      v_ordem_status text;
      v_status_db text := public._ind02_op_status_to_db(p_status);
    begin
      if v_status_db not in ('na_fila','pendente','em_execucao','em_espera','em_inspecao','concluida','cancelada') then
        raise exception 'Status inválido para operação: %', p_status;
      end if;

      select op.ordem_id, o.status
        into v_ordem_id, v_ordem_status
        from public.industria_producao_operacoes op
        join public.industria_producao_ordens o on o.id = op.ordem_id
       where op.id = p_id
         and op.empresa_id = v_emp
         and o.empresa_id = v_emp;

      if v_ordem_id is null then
        raise exception 'Operação não encontrada.';
      end if;

      if v_ordem_status in ('concluida', 'cancelada') then
        raise exception 'Operação não pode ser alterada: ordem está %.', v_ordem_status;
      end if;

      update public.industria_producao_operacoes
         set status = v_status_db,
             centro_trabalho_id = coalesce(p_centro_trabalho_id, centro_trabalho_id),
             updated_at = now()
       where id = p_id
         and empresa_id = v_emp;

      if p_prioridade is not null then
        update public.industria_producao_ordens
           set prioridade = p_prioridade,
               updated_at = now()
         where id = v_ordem_id
           and empresa_id = v_emp
           and status not in ('concluida', 'cancelada');
      end if;

      perform pg_notify('app_log', '[RPC] industria_operacao_update_status id='||p_id||' status='||v_status_db);
    end;
    $body$;
  $sql$;
end;
$$;

-- -----------------------------------------------------------------------------
-- IND-01: Trava estrutural após gerar execução (industria_ordens)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.industria_ordens') is null then
    raise notice 'IND-01: industria_ordens não encontrada; pulando.';
    return;
  end if;

  execute $sql$
    create or replace function public._ind01_industria_ordens_before_update()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $body$
    declare
      v_old_status text := public._ind01_normalize_status(old.status);
      v_new_status text := public._ind01_normalize_status(new.status);
      v_tipo text := public._ind01_normalize_status(coalesce(new.tipo_ordem, old.tipo_ordem));
      v_cancel_restrito boolean := false;
      v_execucao_gerada boolean := old.execucao_ordem_id is not null;
    begin
      -- Ordens finalizadas são readonly
      if v_old_status in ('concluida','cancelada') then
        raise exception 'Ordem está % e não pode ser alterada.', v_old_status;
      end if;

      -- Beneficiamento: cliente + material obrigatórios para sair do rascunho
      if v_tipo = 'beneficiamento' and v_new_status is distinct from v_old_status then
        if v_new_status in ('planejada','em_programacao','em_beneficiamento','em_inspecao','parcialmente_entregue','concluida') then
          if new.cliente_id is null then
            raise exception 'Beneficiamento exige cliente.';
          end if;
          if new.material_cliente_id is null then
            raise exception 'Beneficiamento exige material do cliente.';
          end if;
        end if;
      end if;

      -- Execução gerada: trava mudanças estruturais (produto/quantidade/unidade/roteiro/cliente/material)
      if v_execucao_gerada then
        if new.tipo_ordem is distinct from old.tipo_ordem
          or new.produto_final_id is distinct from old.produto_final_id
          or new.quantidade_planejada is distinct from old.quantidade_planejada
          or new.unidade is distinct from old.unidade
          or new.cliente_id is distinct from old.cliente_id
          or new.usa_material_cliente is distinct from old.usa_material_cliente
          or new.material_cliente_id is distinct from old.material_cliente_id
          or new.roteiro_aplicado_id is distinct from old.roteiro_aplicado_id
        then
          raise exception 'Ordem travada: execução já gerada. Crie uma revisão ou resete a execução.';
        end if;
      end if;

      -- State machine (mínimo) + exigência de execução para status de execução
      if v_new_status is distinct from v_old_status then
        -- Cancelamento após início exige admin
        if v_new_status = 'cancelada' and v_old_status not in ('rascunho','planejada','em_programacao','aguardando_material') then
          perform public.assert_empresa_role_at_least('admin');
        end if;

        if v_old_status = 'rascunho' and v_new_status not in ('rascunho','planejada','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'planejada' and v_new_status not in ('planejada','em_programacao','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'em_programacao' and v_new_status not in ('em_programacao','aguardando_material','em_producao','em_beneficiamento','em_inspecao','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'aguardando_material' and v_new_status not in ('aguardando_material','em_programacao','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status in ('em_producao','em_beneficiamento') and v_new_status not in (v_old_status,'em_inspecao','parcialmente_concluida','parcialmente_entregue','concluida','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'em_inspecao' and v_new_status not in ('em_inspecao','parcialmente_concluida','parcialmente_entregue','concluida','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status in ('parcialmente_concluida','parcialmente_entregue') and v_new_status not in (v_old_status,'em_inspecao','concluida','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;

        -- Para entrar em execução/inspeção/concluir: execução gerada
        if v_new_status in ('em_producao','em_beneficiamento','em_inspecao','parcialmente_concluida','parcialmente_entregue','concluida')
           and new.execucao_ordem_id is null then
          raise exception 'Gere a execução (operações) antes de mudar para %.', v_new_status;
        end if;
      end if;

      return new;
    end;
    $body$;
  $sql$;

  execute 'drop trigger if exists tg_ind01_industria_ordens_before_update on public.industria_ordens';
  execute 'create trigger tg_ind01_industria_ordens_before_update before update on public.industria_ordens for each row execute function public._ind01_industria_ordens_before_update()';
end;
$$;

-- -----------------------------------------------------------------------------
-- IND-01: Trava estrutural após gerar operações (industria_producao_ordens)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.industria_producao_ordens') is null then
    raise notice 'IND-01: industria_producao_ordens não encontrada; pulando.';
    return;
  end if;

  execute $sql$
    create or replace function public._ind01_industria_producao_ordens_before_update()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, public
    as $body$
    declare
      v_old_status text := public._ind01_normalize_status(old.status);
      v_new_status text := public._ind01_normalize_status(new.status);
      v_has_ops boolean := false;
    begin
      if v_old_status in ('concluida','cancelada') then
        raise exception 'Ordem de produção está % e não pode ser alterada.', v_old_status;
      end if;

      select exists(
        select 1 from public.industria_producao_operacoes
        where empresa_id = old.empresa_id and ordem_id = old.id
      ) into v_has_ops;

      -- Para entrar em execução/inspeção/concluir, é obrigatório ter operações geradas
      if v_new_status in ('em_producao','em_inspecao','concluida') and not v_has_ops then
        raise exception 'Gere operações antes de mudar para %.', v_new_status;
      end if;

      -- Com operações geradas, trava mudanças que mudariam a execução
      if v_has_ops then
        if new.produto_final_id is distinct from old.produto_final_id
          or new.quantidade_planejada is distinct from old.quantidade_planejada
          or new.unidade is distinct from old.unidade
          or new.roteiro_aplicado_id is distinct from old.roteiro_aplicado_id
        then
          raise exception 'Ordem travada: já possui operações geradas. Use Reset/Revisão.';
        end if;
      end if;

      -- State machine mínimo
      if v_new_status is distinct from v_old_status then
        if v_new_status = 'cancelada' and v_old_status not in ('rascunho','planejada','em_programacao') then
          perform public.assert_empresa_role_at_least('admin');
        end if;

        if v_old_status = 'rascunho' and v_new_status not in ('rascunho','planejada','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'planejada' and v_new_status not in ('planejada','em_programacao','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'em_programacao' and v_new_status not in ('em_programacao','em_producao','em_inspecao','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'em_producao' and v_new_status not in ('em_producao','em_inspecao','concluida','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
        if v_old_status = 'em_inspecao' and v_new_status not in ('em_inspecao','concluida','cancelada') then
          raise exception 'Transição inválida (% -> %).', v_old_status, v_new_status;
        end if;
      end if;

      return new;
    end;
    $body$;
  $sql$;

  execute 'drop trigger if exists tg_ind01_industria_producao_ordens_before_update on public.industria_producao_ordens';
  execute 'create trigger tg_ind01_industria_producao_ordens_before_update before update on public.industria_producao_ordens for each row execute function public._ind01_industria_producao_ordens_before_update()';
end;
$$;

-- -----------------------------------------------------------------------------
-- IND-01: Status update RPCs (evitar bypass via update_status__unsafe)
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.industria_update_ordem_status__unsafe(uuid, text, integer)') is not null then
    execute $sql$
      create or replace function public.industria_update_ordem_status__unsafe(
        p_id uuid,
        p_status text,
        p_prioridade int default 0
      )
      returns void
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      declare
        v_empresa_id uuid := public.current_empresa_id();
        v_old_status text;
        v_new_status text := public._ind01_normalize_status(p_status);
      begin
        select status into v_old_status
        from public.industria_ordens
        where id = p_id and empresa_id = v_empresa_id;

        if v_old_status is null then
          raise exception 'Ordem não encontrada ou acesso negado.';
        end if;

        -- A trigger faz validação forte; aqui apenas executa.
        update public.industria_ordens
        set
          status = v_new_status,
          prioridade = coalesce(p_prioridade, 0),
          updated_at = now()
        where id = p_id
          and empresa_id = v_empresa_id;
      end;
      $body$;
    $sql$;
  end if;

  if to_regprocedure('public.industria_producao_update_status__unsafe(uuid, text, integer)') is not null then
    execute $sql$
      create or replace function public.industria_producao_update_status__unsafe(
        p_id uuid,
        p_status text,
        p_prioridade integer
      )
      returns void
      language plpgsql
      security definer
      set search_path = pg_catalog, public
      as $body$
      declare
        v_empresa_id uuid := public.current_empresa_id();
        v_new_status text := public._ind01_normalize_status(p_status);
      begin
        update public.industria_producao_ordens
        set
          status = v_new_status,
          prioridade = coalesce(p_prioridade, 0),
          updated_at = now()
        where id = p_id
          and empresa_id = v_empresa_id;

        if not found then
          raise exception 'Ordem não encontrada ou acesso negado.';
        end if;

        perform pg_notify('app_log', '[RPC] industria_producao_update_status: ' || p_id);
      end;
      $body$;
    $sql$;
  end if;
end;
$$;

select pg_notify('pgrst','reload schema');

commit;
