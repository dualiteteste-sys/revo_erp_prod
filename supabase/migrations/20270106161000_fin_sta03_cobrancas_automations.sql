/*
  FIN-STA-03: Cobranças — automações (MVP “sem suporte”)

  Objetivo
  - Rodar rotinas automáticas para reduzir suporte:
    - detectar cobranças vencidas e registrar evento 1x (idempotente)
    - detectar cobranças próximas do vencimento (ex.: 3 dias) e registrar evento 1x
  - Não envia mensagens aqui (WhatsApp/email) — apenas gera trilha e base para alertas/UI.

  Execução
  - Worker (GitHub Actions) chama `financeiro_cobrancas_bancarias_autotick_admin(...)` periodicamente.
*/

begin;

-- Índices idempotentes (1 evento por cobrança por tipo)
create unique index if not exists ux_fin_cobr_evt_auto_overdue
  on public.financeiro_cobrancas_bancarias_eventos (empresa_id, cobranca_id, tipo_evento)
  where tipo_evento = 'auto_overdue';

create unique index if not exists ux_fin_cobr_evt_auto_due_3d
  on public.financeiro_cobrancas_bancarias_eventos (empresa_id, cobranca_id, tipo_evento)
  where tipo_evento = 'auto_due_3d';

drop function if exists public.financeiro_cobrancas_bancarias_autotick_admin(int);
create or replace function public.financeiro_cobrancas_bancarias_autotick_admin(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit int := greatest(1, least(5000, coalesce(p_limit, 500)));
  v_overdue int := 0;
  v_due3 int := 0;
  r record;
begin
  -- Somente worker (service_role)
  if current_user <> 'service_role' then
    raise exception 'Somente service_role' using errcode='42501';
  end if;

  -- 1) Vencidas (1x)
  for r in
    select c.empresa_id, c.id as cobranca_id, c.status, c.data_vencimento
    from public.financeiro_cobrancas_bancarias c
    where c.data_vencimento < current_date
      and c.data_liquidacao is null
      and c.status not in ('liquidada','baixada','cancelada')
    order by c.data_vencimento asc
    limit v_limit
  loop
    insert into public.financeiro_cobrancas_bancarias_eventos (
      empresa_id, cobranca_id, tipo_evento, status_anterior, status_novo, mensagem
    ) values (
      r.empresa_id, r.cobranca_id, 'auto_overdue', r.status, r.status,
      'Cobrança vencida (automação).'
    )
    on conflict do nothing;
    v_overdue := v_overdue + 1;
  end loop;

  -- 2) Próximas do vencimento (3 dias) (1x)
  for r in
    select c.empresa_id, c.id as cobranca_id, c.status, c.data_vencimento
    from public.financeiro_cobrancas_bancarias c
    where c.data_vencimento between current_date and (current_date + interval '3 days')::date
      and c.data_liquidacao is null
      and c.status not in ('liquidada','baixada','cancelada')
    order by c.data_vencimento asc
    limit v_limit
  loop
    insert into public.financeiro_cobrancas_bancarias_eventos (
      empresa_id, cobranca_id, tipo_evento, status_anterior, status_novo, mensagem
    ) values (
      r.empresa_id, r.cobranca_id, 'auto_due_3d', r.status, r.status,
      'Cobrança perto do vencimento (3 dias).'
    )
    on conflict do nothing;
    v_due3 := v_due3 + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'overdue_checked', v_overdue,
    'due_3d_checked', v_due3
  );
end;
$$;

revoke all on function public.financeiro_cobrancas_bancarias_autotick_admin(int) from public;
grant execute on function public.financeiro_cobrancas_bancarias_autotick_admin(int) to service_role;

commit;

notify pgrst, 'reload schema';

