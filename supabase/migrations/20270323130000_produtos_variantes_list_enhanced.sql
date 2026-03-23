-- Enhance produtos_variantes_list_for_current_user to return GTIN, estoque,
-- imagem_url and atributos_summary for the redesigned VariacoesTab.
-- DROP required because RETURNS TABLE columns are changing.

drop function if exists public.produtos_variantes_list_for_current_user(uuid);

create or replace function public.produtos_variantes_list_for_current_user(p_produto_pai_id uuid)
returns table(
  id uuid,
  nome text,
  sku text,
  gtin text,
  status public.status_produto,
  unidade text,
  preco_venda numeric,
  estoque numeric,
  imagem_url text,
  atributos_summary text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_empresa uuid := public.current_empresa_id();
begin
  if p_produto_pai_id is null then
    raise exception 'p_produto_pai_id é obrigatório.';
  end if;

  return query
  select
    p.id,
    p.nome,
    p.sku,
    p.gtin,
    p.status,
    p.unidade,
    p.preco_venda,
    coalesce(es.saldo, 0) as estoque,
    (
      select pi.url
      from public.produto_imagens pi
      where pi.produto_id = p.id
        and pi.empresa_id = v_empresa
      order by pi.principal desc nulls last, pi.ordem asc
      limit 1
    ) as imagem_url,
    (
      select string_agg(
        a.nome || ': ' || coalesce(
          pa.valor_text,
          case when pa.valor_num is not null then trim(to_char(pa.valor_num, 'FM999999999990D999999')) end,
          case when pa.valor_bool is not null then (case when pa.valor_bool then 'Sim' else 'Não' end) end,
          case when pa.valor_json is not null then pa.valor_json::text end
        ),
        ' • '
        order by a.nome
      )
      from public.produto_atributos pa
      join public.atributos a on a.id = pa.atributo_id
      where pa.empresa_id = v_empresa
        and pa.produto_id = p.id
    ) as atributos_summary,
    p.created_at,
    p.updated_at
  from public.produtos p
  left join public.estoque_saldos es
    on es.produto_id = p.id
   and es.empresa_id = v_empresa
  where p.empresa_id = v_empresa
    and p.produto_pai_id = p_produto_pai_id
  order by p.nome;
end;
$$;

revoke all on function public.produtos_variantes_list_for_current_user(uuid) from public, anon;
grant execute on function public.produtos_variantes_list_for_current_user(uuid) to authenticated, service_role;
