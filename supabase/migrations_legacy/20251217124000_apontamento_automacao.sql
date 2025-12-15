-- Aplica automação no apontamento: auto-avanço e bloqueio por refugo (threshold)
begin;

drop function if exists public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text);
create or replace function public.industria_operacao_apontar_execucao(
  p_operacao_id uuid,
  p_acao text, -- 'iniciar' | 'pausar' | 'concluir'
  p_qtd_boas numeric default 0,
  p_qtd_refugadas numeric default 0,
  p_motivo_refugo text default null,
  p_observacoes text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_auto_avancar boolean := true;
  v_refugo_percent numeric := 5;
  v_ordem_id uuid;
  v_sequencia int;
  v_planejada numeric;
  v_prod numeric;
  v_ref numeric;
  v_percent_refugo numeric;
  v_next_op uuid;
begin
  if not exists (select 1 from public.industria_producao_operacoes where id = p_operacao_id and empresa_id = v_emp) then
    raise exception 'Operação não encontrada.';
  end if;

  select ordem_id, sequencia, quantidade_planejada, quantidade_produzida, quantidade_refugo
    into v_ordem_id, v_sequencia, v_planejada, v_prod, v_ref
  from public.industria_producao_operacoes
  where id = p_operacao_id and empresa_id = v_emp;

  -- Config atual (defaults se não existir)
  begin
    v_auto_avancar := coalesce((public.industria_automacao_get()->>'auto_avancar')::boolean, true);
  exception when others then
    v_auto_avancar := true;
  end;
  begin
    v_refugo_percent := coalesce((public.industria_automacao_get()->>'alerta_refugo_percent')::numeric, 5);
  exception when others then
    v_refugo_percent := 5;
  end;

  if p_acao = 'iniciar' then
    update public.industria_producao_operacoes
       set status = 'em_execucao',
           data_inicio_real = coalesce(data_inicio_real, now()),
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

    update public.industria_producao_ordens
       set status = case when status in ('planejada','em_programacao') then 'em_producao' else status end,
           updated_at = now()
     where id = v_ordem_id and empresa_id = v_emp;

  elsif p_acao = 'pausar' then
    update public.industria_producao_operacoes
       set status = 'em_espera',
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

  elsif p_acao = 'concluir' then
    -- Atualiza quantidades
    update public.industria_producao_operacoes
       set quantidade_produzida = quantidade_produzida + coalesce(p_qtd_boas,0),
           quantidade_refugo    = quantidade_refugo    + coalesce(p_qtd_refugadas,0),
           status = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) >= quantidade_planejada
                         then 'concluida' else 'pendente' end,
           data_fim_real = case when (quantidade_produzida + coalesce(p_qtd_boas,0)) >= quantidade_planejada
                         then now() else data_fim_real end,
           updated_at = now()
     where id = p_operacao_id and empresa_id = v_emp;

    -- Apontamento
    insert into public.industria_producao_apontamentos (
      empresa_id, operacao_id, quantidade_boa, quantidade_refugo, motivo_refugo, observacoes, tipo
    ) values (
      v_emp, p_operacao_id, coalesce(p_qtd_boas,0), coalesce(p_qtd_refugadas,0), p_motivo_refugo, p_observacoes,
      'conclusao'
    );

    -- Recarrega totais p/ regra de refugo
    select quantidade_planejada, quantidade_produzida, quantidade_refugo
      into v_planejada, v_prod, v_ref
    from public.industria_producao_operacoes
    where id = p_operacao_id and empresa_id = v_emp;

    if (v_prod + v_ref) > 0 then
      v_percent_refugo := round((v_ref / (v_prod + v_ref)) * 100, 2);
    else
      v_percent_refugo := 0;
    end if;

    if v_percent_refugo >= v_refugo_percent and v_refugo_percent > 0 then
      update public.industria_producao_operacoes
         set status = 'em_espera',
             updated_at = now()
       where id = p_operacao_id and empresa_id = v_emp;
    end if;

    -- Auto avançar próxima etapa quando concluir (e não bloqueou por refugo)
    if v_auto_avancar and (select status from public.industria_producao_operacoes where id = p_operacao_id) = 'concluida' then
      select id into v_next_op
        from public.industria_producao_operacoes
       where empresa_id = v_emp
         and ordem_id = v_ordem_id
         and sequencia > v_sequencia
         and status in ('na_fila', 'pendente')
       order by sequencia asc
       limit 1;

      if v_next_op is not null then
        update public.industria_producao_operacoes
           set status = 'pendente',
               updated_at = now()
         where id = v_next_op and empresa_id = v_emp;
      end if;

      -- Se todas concluídas, fecha a ordem
      if not exists (
        select 1 from public.industria_producao_operacoes
         where empresa_id = v_emp and ordem_id = v_ordem_id and status <> 'concluida'
      ) then
        update public.industria_producao_ordens
           set status = 'concluida',
               updated_at = now()
         where id = v_ordem_id and empresa_id = v_emp;
      end if;
    end if;
  else
    raise exception 'Ação inválida. Use iniciar|pausar|concluir.';
  end if;

  perform pg_notify('app_log', '[RPC] industria_operacao_apontar_execucao op='||p_operacao_id||' acao='||p_acao);
end;
$$;

grant execute on function public.industria_operacao_apontar_execucao(uuid, text, numeric, numeric, text, text) to authenticated, service_role;

commit;

