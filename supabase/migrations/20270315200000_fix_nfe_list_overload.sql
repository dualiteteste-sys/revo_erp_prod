/*
  Fix: fiscal_nfe_emissoes_list tinha 2 overloads coexistentes:
    1. (text, text, int)           — versão nova COM campos de draft (natureza, pagamento, transporte, peso)
    2. (text, text, int, date, date) — versão ANTIGA SEM esses campos

  O frontend envia p_data_inicio + p_data_fim → PostgREST resolvia para a versão antiga
  → campos de draft nunca apareciam na listagem → "não persistem".

  Fix: drop ambas, recriar UMA ÚNICA versão com 5 params + todos os campos novos.
*/

-- Drop ambas as overloads
drop function if exists public.fiscal_nfe_emissoes_list(text, text, int, date, date);
drop function if exists public.fiscal_nfe_emissoes_list(text, text, int);

create or replace function public.fiscal_nfe_emissoes_list(
  p_status      text default null,
  p_q           text default null,
  p_limit       int  default 200,
  p_data_inicio date default null,
  p_data_fim    date default null
)
returns table(
  id                       uuid,
  status                   text,
  numero                   int,
  serie                    int,
  chave_acesso             text,
  destinatario_pessoa_id   uuid,
  destinatario_nome        text,
  ambiente                 text,
  natureza_operacao        text,
  natureza_operacao_id     uuid,
  valor_total              numeric,
  total_produtos           numeric,
  total_descontos          numeric,
  total_frete              numeric,
  total_impostos           numeric,
  total_nfe                numeric,
  payload                  jsonb,
  last_error               text,
  rejection_code           text,
  reprocess_count          int,
  created_at               timestamptz,
  updated_at               timestamptz,
  pedido_origem_id         uuid,
  danfe_url                text,
  xml_url                  text,
  forma_pagamento          text,
  condicao_pagamento_id    uuid,
  condicao_pagamento_nome  text,
  transportadora_id        uuid,
  transportadora_nome      text,
  modalidade_frete         text,
  duplicatas               jsonb,
  peso_bruto               numeric,
  peso_liquido             numeric,
  quantidade_volumes       int,
  especie_volumes          text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status  text := nullif(btrim(coalesce(p_status, '')), '');
  v_q       text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit   int  := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa.' using errcode='42501';
  end if;

  perform public.assert_empresa_role_at_least('member');

  return query
  select
    e.id,
    e.status::text,
    e.numero,
    e.serie,
    e.chave_acesso,
    e.destinatario_pessoa_id,
    p.nome                          as destinatario_nome,
    e.ambiente::text,
    e.natureza_operacao,
    e.natureza_operacao_id,
    e.valor_total,
    e.total_produtos,
    e.total_descontos,
    e.total_frete,
    e.total_impostos,
    e.total_nfe,
    e.payload,
    e.last_error,
    e.rejection_code,
    e.reprocess_count,
    e.created_at,
    e.updated_at,
    e.pedido_origem_id,
    e.danfe_url,
    e.xml_url,
    e.forma_pagamento,
    e.condicao_pagamento_id,
    cp.nome                         as condicao_pagamento_nome,
    e.transportadora_id,
    t.nome                          as transportadora_nome,
    e.modalidade_frete,
    e.duplicatas,
    e.peso_bruto,
    e.peso_liquido,
    e.quantidade_volumes,
    e.especie_volumes
  from public.fiscal_nfe_emissoes e
  left join public.pessoas p on p.id = e.destinatario_pessoa_id
  left join public.financeiro_condicoes_pagamento cp on cp.id = e.condicao_pagamento_id
  left join public.logistica_transportadoras t on t.id = e.transportadora_id
  where e.empresa_id = v_empresa
    and (v_status is null or e.status::text = v_status)
    and (
      v_q is null or (
        coalesce(e.chave_acesso, '') ilike '%' || v_q || '%'
        or coalesce(p.nome, '') ilike '%' || v_q || '%'
        or coalesce(e.status::text, '') ilike '%' || v_q || '%'
        or coalesce(e.numero::text, '') ilike '%' || v_q || '%'
        or coalesce(e.serie::text, '') ilike '%' || v_q || '%'
      )
    )
    and (p_data_inicio is null or e.created_at::date >= p_data_inicio)
    and (p_data_fim    is null or e.created_at::date <= p_data_fim)
  order by e.updated_at desc
  limit v_limit;
end;
$$;

revoke all on function public.fiscal_nfe_emissoes_list(text, text, int, date, date) from public, anon;
grant execute on function public.fiscal_nfe_emissoes_list(text, text, int, date, date) to authenticated, service_role;

-- Notify PostgREST schema reload
select pg_notify('pgrst','reload schema');
