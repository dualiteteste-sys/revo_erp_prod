/*
  Tesouraria → Conciliação: importação de extrato (CSV/OFX) precisa ser:
  - idempotente (reimportar o mesmo extrato não duplica)
  - mas permitir 2+ lançamentos idênticos no mesmo extrato (ex.: 2 PIX iguais)

  Problema atual:
  - hash_importacao é calculado por campos (data/descrição/tipo/valor/doc/id_banco),
    então 2 linhas iguais viram o mesmo hash → ON CONFLICT ignora a segunda.

  Solução "estado da arte":
  - Continuar usando o hash base (compatível com importações antigas).
  - Se houver duplicidade no payload (mesmo hash base repetido), manter o 1º com o hash base,
    e as ocorrências seguintes recebem sufixo "#N" (ex.: "<hash>#2", "<hash>#3"...).
  - Assim:
    - reimport do mesmo extrato: mesmos hashes → não duplica
    - 2 linhas idênticas no mesmo extrato: hashes distintos → importa ambas
*/

begin;

create or replace function public.financeiro_extratos_bancarios_importar(p_conta_corrente_id uuid, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_count integer := 0;
  r record;
  v_hash text;
begin
  perform public.require_permission_for_current_user('tesouraria', 'create');

  if jsonb_typeof(p_itens) <> 'array' then
    raise exception 'p_itens deve ser um array JSON.';
  end if;

  if not exists (
    select 1 from public.financeiro_contas_correntes cc
    where cc.id = p_conta_corrente_id
      and cc.empresa_id = v_empresa
  ) then
    raise exception 'Conta corrente não encontrada ou acesso negado.';
  end if;

  /*
    Pré-processa o payload:
    - calcula o "hash_base" (compatível com versões anteriores)
    - conta duplicidades do hash_base dentro do mesmo payload
    - gera um índice por grupo (dup_idx) preservando a ordem original
  */
  for r in
    with elems as (
      select
        e.item as item,
        e.ord::int as ord,
        (e.item->>'data_lancamento')::date as data_lancamento,
        (e.item->>'valor')::numeric as valor,
        coalesce(e.item->>'tipo_lancamento', 'credito') as tipo_lancamento,
        e.item->>'descricao' as descricao,
        e.item->>'documento_ref' as documento_ref,
        e.item->>'identificador_banco' as identificador_banco,
        e.item->>'linha_bruta' as linha_bruta,
        e.item->>'hash_importacao' as hash_importacao_raw
      from jsonb_array_elements(p_itens) with ordinality as e(item, ord)
    ),
    norm as (
      select
        item,
        ord,
        data_lancamento,
        valor,
        case when tipo_lancamento in ('credito','debito') then tipo_lancamento else 'credito' end as tipo_lancamento,
        descricao,
        documento_ref,
        identificador_banco,
        linha_bruta,
        nullif(btrim(hash_importacao_raw), '') as hash_importacao_raw,
        md5(
          coalesce(data_lancamento::text,'') || '|' ||
          coalesce(descricao,'') || '|' ||
          coalesce(case when tipo_lancamento in ('credito','debito') then tipo_lancamento else 'credito' end,'') || '|' ||
          coalesce(valor::text,'') || '|' ||
          coalesce(documento_ref,'') || '|' ||
          coalesce(identificador_banco,'')
        ) as hash_base
      from elems
    ),
    grp as (
      select
        n.*,
        count(*) over (partition by n.hash_base) as dup_count,
        row_number() over (partition by n.hash_base order by n.ord) as dup_idx
      from norm n
    )
    select * from grp order by ord
  loop
    if r.data_lancamento is null or r.valor is null or r.valor <= 0 then
      continue;
    end if;

    -- Se o frontend já mandou hash, respeita.
    if r.hash_importacao_raw is not null then
      v_hash := r.hash_importacao_raw;
    else
      -- Mantém compatibilidade: primeiro item usa hash_base; duplicados ganham sufixo "#N".
      if r.dup_count > 1 and r.dup_idx > 1 then
        v_hash := r.hash_base || '#' || r.dup_idx::text;
      else
        v_hash := r.hash_base;
      end if;
    end if;

    insert into public.financeiro_extratos_bancarios (
      empresa_id, conta_corrente_id, data_lancamento, descricao, identificador_banco, documento_ref,
      tipo_lancamento, valor, saldo_apos_lancamento, origem_importacao, hash_importacao, linha_bruta, conciliado
    ) values (
      v_empresa,
      p_conta_corrente_id,
      r.data_lancamento,
      r.descricao,
      r.identificador_banco,
      r.documento_ref,
      r.tipo_lancamento,
      r.valor,
      (r.item->>'saldo_apos_lancamento')::numeric,
      'upload_json',
      v_hash,
      r.linha_bruta,
      false
    )
    on conflict (empresa_id, conta_corrente_id, hash_importacao)
      where hash_importacao is not null and btrim(hash_importacao) <> ''
    do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.financeiro_extratos_bancarios_importar(uuid, jsonb) from public;
grant execute on function public.financeiro_extratos_bancarios_importar(uuid, jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

