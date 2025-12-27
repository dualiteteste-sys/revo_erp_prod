/*
  NFE-04: Motor fiscal v1 (cálculo/validação + preview do XML)

  Objetivo:
  - Validar dados mínimos para emissão (emitente/destinatário/itens).
  - Calcular ICMS v1 (simplificado) e persistir em `fiscal_nfe_emissao_itens.impostos`.
  - Manter `fiscal_nfe_emissoes.total_impostos` e `total_nfe` consistentes.
  - Gerar um preview de XML (não assinado) antes da integração real (NFE-05).

  Importante:
  - Este XML é apenas PREVIEW para o usuário; não substitui o XML oficial assinado/autorizado.
  - Aliquota de ICMS é parametrizável por UF (tabela fiscal_nfe_icms_aliquotas). Default = 0.
*/

BEGIN;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Parâmetros: alíquota ICMS por UF (simplificado)
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_nfe_icms_aliquotas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  uf_origem text null,
  uf_destino text not null,
  aliquota numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_nfe_icms_aliquotas_uf_destino_chk check (uf_destino ~ '^[A-Z]{2}$'),
  constraint fiscal_nfe_icms_aliquotas_aliquota_chk check (aliquota >= 0 and aliquota <= 100),
  constraint fiscal_nfe_icms_aliquotas_unique unique (empresa_id, uf_origem, uf_destino)
);

alter table public.fiscal_nfe_icms_aliquotas enable row level security;

drop trigger if exists tg_fiscal_nfe_icms_aliquotas_updated_at on public.fiscal_nfe_icms_aliquotas;
create trigger tg_fiscal_nfe_icms_aliquotas_updated_at
before update on public.fiscal_nfe_icms_aliquotas
for each row execute function public.tg_set_updated_at();

drop policy if exists fiscal_nfe_icms_aliquotas_select on public.fiscal_nfe_icms_aliquotas;
create policy fiscal_nfe_icms_aliquotas_select
  on public.fiscal_nfe_icms_aliquotas
  for select
  to authenticated
  using (empresa_id = public.current_empresa_id());

drop policy if exists fiscal_nfe_icms_aliquotas_admin_write on public.fiscal_nfe_icms_aliquotas;
create policy fiscal_nfe_icms_aliquotas_admin_write
  on public.fiscal_nfe_icms_aliquotas
  for all
  to authenticated
  using (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  )
  with check (
    empresa_id = public.current_empresa_id()
    and public.empresa_role_rank(public.current_empresa_role()) >= public.empresa_role_rank('admin')
  );

grant select on table public.fiscal_nfe_icms_aliquotas to authenticated, service_role;
grant insert, update, delete on table public.fiscal_nfe_icms_aliquotas to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Helper: escape básico para XML
-- ---------------------------------------------------------------------------
create or replace function public.fiscal_digits_only(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

revoke all on function public.fiscal_digits_only(text) from public, anon;
grant execute on function public.fiscal_digits_only(text) to authenticated, service_role, postgres;

create or replace function public.fiscal_xml_escape(p text)
returns text
language sql
immutable
as $$
  select
    replace(
      replace(
        replace(
          replace(
            replace(coalesce(p, ''), '&', '&amp;'),
          '<', '&lt;'),
        '>', '&gt;'),
      '"', '&quot;'),
    '''', '&apos;');
$$;

revoke all on function public.fiscal_xml_escape(text) from public, anon;
grant execute on function public.fiscal_xml_escape(text) to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 3) Recalc totais: somar impostos pelos itens (impostos.total)
-- ---------------------------------------------------------------------------
create or replace function public.fiscal_nfe_recalc_totais(p_emissao_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_total_produtos numeric := 0;
  v_total_descontos numeric := 0;
  v_total_frete numeric := 0;
  v_total_impostos numeric := 0;
begin
  if public.is_service_role() then
    select
      coalesce(sum(i.quantidade * i.valor_unitario), 0),
      coalesce(sum(i.valor_desconto), 0),
      coalesce(sum(nullif(i.impostos->>'total','')::numeric), 0)
    into v_total_produtos, v_total_descontos, v_total_impostos
    from public.fiscal_nfe_emissao_itens i
    where i.emissao_id = p_emissao_id;

    update public.fiscal_nfe_emissoes e
    set
      total_produtos = v_total_produtos,
      total_descontos = v_total_descontos,
      total_frete = coalesce(e.total_frete, 0),
      total_impostos = coalesce(v_total_impostos, 0),
      total_nfe = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(v_total_impostos, 0)),
      valor_total = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(v_total_impostos, 0)),
      updated_at = now()
    where e.id = p_emissao_id;
    return;
  end if;

  if v_emp is null then
    return;
  end if;

  if not exists (
    select 1
    from public.fiscal_nfe_emissoes e
    where e.id = p_emissao_id
      and e.empresa_id = v_emp
  ) then
    return;
  end if;

  select
    coalesce(sum(i.quantidade * i.valor_unitario), 0),
    coalesce(sum(i.valor_desconto), 0),
    coalesce(sum(nullif(i.impostos->>'total','')::numeric), 0)
  into v_total_produtos, v_total_descontos, v_total_impostos
  from public.fiscal_nfe_emissao_itens i
  where i.emissao_id = p_emissao_id
    and i.empresa_id = v_emp;

  update public.fiscal_nfe_emissoes e
  set
    total_produtos = v_total_produtos,
    total_descontos = v_total_descontos,
    total_frete = coalesce(e.total_frete, 0),
    total_impostos = coalesce(v_total_impostos, 0),
    total_nfe = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(v_total_impostos, 0)),
    valor_total = greatest(0, v_total_produtos - v_total_descontos + coalesce(e.total_frete, 0) + coalesce(v_total_impostos, 0)),
    updated_at = now()
  where e.id = p_emissao_id
    and e.empresa_id = v_emp;
end;
$$;

revoke all on function public.fiscal_nfe_recalc_totais(uuid) from public, anon;
grant execute on function public.fiscal_nfe_recalc_totais(uuid) to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4) RPC: validar + calcular + gerar XML preview
-- ---------------------------------------------------------------------------
create or replace function public.fiscal_nfe_preview_xml(p_emissao_id uuid)
returns table (
  ok boolean,
  errors text[],
  warnings text[],
  xml text,
  payload jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_emp uuid := public.current_empresa_id();
  v_emissao public.fiscal_nfe_emissoes%rowtype;
  v_emitente public.fiscal_nfe_emitente%rowtype;
  v_num public.fiscal_nfe_numeracao%rowtype;
  v_dest public.pessoas%rowtype;
  v_dest_end public.pessoa_enderecos%rowtype;
  v_uf_origem text;
  v_uf_dest text;
  v_crt int;
  v_it record;
  v_errors text[] := '{}';
  v_warn text[] := '{}';
  v_total_impostos numeric := 0;
  v_payload jsonb := '{}'::jsonb;
  v_xml text := '';
  v_emit_cnpj text;
  v_dest_doc text;
  v_det_xml text := '';
  v_n int := 0;
begin
  -- service_role pode rodar sem empresa ativa; caso contrário exige empresa ativa
  if not public.is_service_role() and v_emp is null then
    ok := false;
    errors := array['Nenhuma empresa ativa.'];
    warnings := '{}';
    xml := null;
    payload := null;
    return;
  end if;

  select * into v_emissao
  from public.fiscal_nfe_emissoes e
  where e.id = p_emissao_id
    and (public.is_service_role() or e.empresa_id = v_emp);

  if not found then
    ok := false;
    errors := array['Emissão não encontrada na empresa atual.'];
    warnings := '{}';
    xml := null;
    payload := null;
    return;
  end if;

  select * into v_emitente
  from public.fiscal_nfe_emitente fe
  where fe.empresa_id = v_emissao.empresa_id;

  if not found then
    v_errors := array_append(v_errors, 'Emitente não cadastrado (Fiscal → Configurações de NF-e).');
  end if;

  select * into v_num
  from public.fiscal_nfe_numeracao n
  where n.empresa_id = v_emissao.empresa_id
    and n.serie = coalesce(v_emissao.serie, 1)
  limit 1;

  if not found then
    v_warn := array_append(v_warn, 'Numeração não encontrada para a série (será necessário configurar antes de emitir).');
  end if;

  if v_emissao.destinatario_pessoa_id is null then
    v_errors := array_append(v_errors, 'Destinatário não informado.');
  else
    select * into v_dest
    from public.pessoas p
    where p.id = v_emissao.destinatario_pessoa_id
      and p.empresa_id = v_emissao.empresa_id;
    if not found then
      v_errors := array_append(v_errors, 'Destinatário não encontrado.');
    else
      select * into v_dest_end
      from public.pessoa_enderecos e
      where e.pessoa_id = v_dest.id
        and e.empresa_id = v_emissao.empresa_id
      order by (case when upper(coalesce(e.tipo_endereco,'')) = 'PRINCIPAL' then 0 else 1 end), e.created_at asc
      limit 1;

      if not found then
        v_errors := array_append(v_errors, 'Destinatário sem endereço cadastrado.');
      end if;
    end if;
  end if;

  if coalesce(nullif(v_emissao.natureza_operacao,''), '') = '' then
    v_errors := array_append(v_errors, 'Natureza da operação é obrigatória.');
  end if;

  -- valida emitente
  v_emit_cnpj := public.fiscal_digits_only(v_emitente.cnpj);
  if v_emit_cnpj = '' or length(v_emit_cnpj) <> 14 then
    v_errors := array_append(v_errors, 'Emitente: CNPJ inválido (14 dígitos).');
  end if;
  if coalesce(nullif(v_emitente.razao_social,''), '') = '' then
    v_errors := array_append(v_errors, 'Emitente: razão social é obrigatória.');
  end if;
  v_uf_origem := upper(coalesce(v_emitente.endereco_uf,''));
  if v_uf_origem !~ '^[A-Z]{2}$' then
    v_errors := array_append(v_errors, 'Emitente: UF inválida.');
  end if;
  if public.fiscal_digits_only(v_emitente.endereco_municipio_codigo) !~ '^[0-9]{7}$' then
    v_errors := array_append(v_errors, 'Emitente: código IBGE do município é obrigatório (7 dígitos).');
  end if;
  if public.fiscal_digits_only(v_emitente.endereco_cep) !~ '^[0-9]{8}$' then
    v_errors := array_append(v_errors, 'Emitente: CEP é obrigatório (8 dígitos).');
  end if;

  -- valida destinatário
  if v_dest.id is not null then
    v_dest_doc := public.fiscal_digits_only(v_dest.doc_unico);
    if v_dest_doc = '' or (length(v_dest_doc) <> 11 and length(v_dest_doc) <> 14) then
      v_errors := array_append(v_errors, 'Destinatário: CPF/CNPJ inválido (11 ou 14 dígitos).');
    end if;
    if coalesce(nullif(v_dest.nome,''), '') = '' then
      v_errors := array_append(v_errors, 'Destinatário: nome/razão social é obrigatório.');
    end if;
  end if;

  if v_dest_end.id is not null then
    v_uf_dest := upper(coalesce(v_dest_end.uf,''));
    if v_uf_dest !~ '^[A-Z]{2}$' then
      v_errors := array_append(v_errors, 'Destinatário: UF inválida no endereço.');
    end if;
    if public.fiscal_digits_only(v_dest_end.cep) !~ '^[0-9]{8}$' then
      v_errors := array_append(v_errors, 'Destinatário: CEP inválido no endereço (8 dígitos).');
    end if;
    if public.fiscal_digits_only(v_dest_end.cidade_codigo) !~ '^[0-9]{7}$' then
      v_errors := array_append(v_errors, 'Destinatário: código IBGE do município é obrigatório no endereço (7 dígitos).');
    end if;
    if coalesce(public.fiscal_digits_only(v_dest_end.pais_codigo), '1058') !~ '^[0-9]{4}$' then
      v_errors := array_append(v_errors, 'Destinatário: código do país inválido (4 dígitos).');
    end if;
  end if;

  -- valida itens
  if not exists (select 1 from public.fiscal_nfe_emissao_itens i where i.emissao_id = p_emissao_id and i.empresa_id = v_emissao.empresa_id) then
    v_errors := array_append(v_errors, 'Adicione ao menos 1 item.');
  end if;

  v_crt := v_emitente.crt;
  for v_it in
    select *
    from public.fiscal_nfe_emissao_itens i
    where i.emissao_id = p_emissao_id
      and i.empresa_id = v_emissao.empresa_id
    order by i.ordem asc
    loop
      v_n := v_n + 1;
    if coalesce(nullif(v_it.descricao,''), '') = '' then
      v_errors := array_append(v_errors, format('Item %s: descrição é obrigatória.', v_n));
    end if;
    if public.fiscal_digits_only(v_it.ncm) !~ '^[0-9]{8}$' then
      v_errors := array_append(v_errors, format('Item %s: NCM inválido (8 dígitos).', v_n));
    end if;
    if public.fiscal_digits_only(v_it.cfop) !~ '^[0-9]{4}$' then
      v_errors := array_append(v_errors, format('Item %s: CFOP inválido (4 dígitos).', v_n));
    end if;

    if v_crt in (1,2) then
      if public.fiscal_digits_only(v_it.csosn) !~ '^[0-9]{3}$' then
        v_errors := array_append(v_errors, format('Item %s: CSOSN inválido (3 dígitos) para Simples Nacional.', v_n));
      end if;
    else
      if public.fiscal_digits_only(v_it.cst) !~ '^[0-9]{2}$' then
        v_errors := array_append(v_errors, format('Item %s: CST inválido (2 dígitos) para Regime Normal.', v_n));
      end if;
    end if;

    if coalesce(v_it.quantidade, 0) <= 0 then
      v_errors := array_append(v_errors, format('Item %s: quantidade deve ser > 0.', v_n));
    end if;
    if coalesce(v_it.valor_unitario, 0) < 0 then
      v_errors := array_append(v_errors, format('Item %s: valor unitário inválido.', v_n));
    end if;
    if coalesce(v_it.valor_desconto, 0) < 0 then
      v_errors := array_append(v_errors, format('Item %s: desconto inválido.', v_n));
    end if;
  end loop;

  if array_length(v_errors, 1) is not null then
    ok := false;
    errors := v_errors;
    warnings := v_warn;
    xml := null;
    payload := null;
    return;
  end if;

  -- Cálculo ICMS v1 e persistência em impostos
  v_total_impostos := 0;
  v_n := 0;
  for v_it in
    select *
    from public.fiscal_nfe_emissao_itens i
    where i.emissao_id = p_emissao_id
      and i.empresa_id = v_emissao.empresa_id
    order by i.ordem asc
  loop
    v_n := v_n + 1;
    declare
      v_prod numeric := coalesce(v_it.quantidade, 0) * coalesce(v_it.valor_unitario, 0);
      v_desc numeric := coalesce(v_it.valor_desconto, 0);
      v_base numeric := greatest(0, v_prod - v_desc);
      v_aliq numeric := 0;
      v_icms numeric := 0;
      v_imp jsonb;
    begin
      select a.aliquota into v_aliq
      from public.fiscal_nfe_icms_aliquotas a
      where a.empresa_id = v_emissao.empresa_id
        and a.uf_destino = upper(coalesce(v_dest_end.uf,''))
        and (a.uf_origem is null or a.uf_origem = upper(coalesce(v_emitente.endereco_uf,'')))
      order by (case when a.uf_origem is null then 1 else 0 end) asc, a.created_at desc
      limit 1;

      if v_aliq is null then
        v_aliq := 0;
        v_warn := array_append(v_warn, format('ICMS: alíquota não configurada (%s→%s). Assumindo 0%%.', upper(coalesce(v_emitente.endereco_uf,'')), upper(coalesce(v_dest_end.uf,''))));
      end if;

      if v_crt in (1,2) then
        v_icms := 0;
      else
        v_icms := round(v_base * v_aliq / 100.0, 2);
      end if;

      v_imp := jsonb_build_object(
        'icms', jsonb_build_object('aliquota', v_aliq, 'base', v_base, 'valor', v_icms),
        'total', v_icms
      );

      update public.fiscal_nfe_emissao_itens
      set
        ncm = public.fiscal_digits_only(v_it.ncm),
        cfop = public.fiscal_digits_only(v_it.cfop),
        cst = nullif(public.fiscal_digits_only(v_it.cst), ''),
        csosn = nullif(public.fiscal_digits_only(v_it.csosn), ''),
        impostos = v_imp
      where id = v_it.id;

      v_total_impostos := v_total_impostos + v_icms;

      v_det_xml := v_det_xml || format(
        '<det nItem="%s"><prod><cProd>%s</cProd><xProd>%s</xProd><NCM>%s</NCM><CFOP>%s</CFOP><uCom>%s</uCom><qCom>%.4f</qCom><vUnCom>%.4f</vUnCom><vProd>%.2f</vProd><vDesc>%.2f</vDesc></prod><imposto><ICMS><vBC>%.2f</vBC><pICMS>%.2f</pICMS><vICMS>%.2f</vICMS></ICMS></imposto></det>',
        v_n,
        public.fiscal_xml_escape(coalesce(v_it.produto_id::text, '')),
        public.fiscal_xml_escape(coalesce(v_it.descricao, 'Item')),
        public.fiscal_xml_escape(public.fiscal_digits_only(v_it.ncm)),
        public.fiscal_xml_escape(public.fiscal_digits_only(v_it.cfop)),
        public.fiscal_xml_escape(coalesce(v_it.unidade, 'UN')),
        coalesce(v_it.quantidade, 0),
        coalesce(v_it.valor_unitario, 0),
        v_prod,
        v_desc,
        v_base,
        v_aliq,
        v_icms
      );
    end;
  end loop;

  update public.fiscal_nfe_emissoes
  set
    total_impostos = coalesce(v_total_impostos, 0),
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{nfe_preview}',
      jsonb_build_object(
        'version', 1,
        'emissao_id', id,
        'natureza_operacao', natureza_operacao,
        'ambiente', ambiente,
        'emitente', jsonb_build_object(
          'cnpj', public.fiscal_digits_only(v_emitente.cnpj),
          'razao_social', v_emitente.razao_social,
          'crt', v_emitente.crt
        ),
        'destinatario', jsonb_build_object(
          'nome', v_dest.nome,
          'doc', public.fiscal_digits_only(v_dest.doc_unico),
          'uf', upper(coalesce(v_dest_end.uf,'')),
          'cidade_codigo', public.fiscal_digits_only(v_dest_end.cidade_codigo)
        ),
        'totais', jsonb_build_object(
          'total_produtos', total_produtos,
          'total_descontos', total_descontos,
          'total_frete', total_frete,
          'total_impostos', coalesce(v_total_impostos, 0),
          'total_nfe', total_nfe
        )
      ),
      true
    )
  where id = p_emissao_id;

  perform public.fiscal_nfe_recalc_totais(p_emissao_id);

  select * into v_emissao
  from public.fiscal_nfe_emissoes e
  where e.id = p_emissao_id;

  -- Monta XML preview (mínimo)
  v_xml := format(
    '<?xml version="1.0" encoding="utf-8"?>' ||
    '<NFe><infNFe>' ||
    '<ide><natOp>%s</natOp><tpAmb>%s</tpAmb><mod>55</mod></ide>' ||
    '<emit><CNPJ>%s</CNPJ><xNome>%s</xNome><enderEmit><UF>%s</UF><cMun>%s</cMun><xMun>%s</xMun><CEP>%s</CEP></enderEmit></emit>' ||
    '<dest><%s>%s</%s><xNome>%s</xNome><enderDest><UF>%s</UF><cMun>%s</cMun><xMun>%s</xMun><CEP>%s</CEP><cPais>%s</cPais></enderDest></dest>' ||
    '%s' ||
    '<total><ICMSTot><vProd>%.2f</vProd><vDesc>%.2f</vDesc><vFrete>%.2f</vFrete><vICMS>%.2f</vICMS><vNF>%.2f</vNF></ICMSTot></total>' ||
    '</infNFe></NFe>',
    public.fiscal_xml_escape(v_emissao.natureza_operacao),
    case when v_emissao.ambiente = 'producao' then '1' else '2' end,
    public.fiscal_xml_escape(public.fiscal_digits_only(v_emitente.cnpj)),
    public.fiscal_xml_escape(v_emitente.razao_social),
    public.fiscal_xml_escape(upper(coalesce(v_emitente.endereco_uf,''))),
    public.fiscal_xml_escape(public.fiscal_digits_only(v_emitente.endereco_municipio_codigo)),
    public.fiscal_xml_escape(coalesce(v_emitente.endereco_municipio,'')),
    public.fiscal_xml_escape(public.fiscal_digits_only(v_emitente.endereco_cep)),
    case when length(public.fiscal_digits_only(v_dest.doc_unico)) = 11 then 'CPF' else 'CNPJ' end,
    public.fiscal_xml_escape(public.fiscal_digits_only(v_dest.doc_unico)),
    case when length(public.fiscal_digits_only(v_dest.doc_unico)) = 11 then 'CPF' else 'CNPJ' end,
    public.fiscal_xml_escape(v_dest.nome),
    public.fiscal_xml_escape(upper(coalesce(v_dest_end.uf,''))),
    public.fiscal_xml_escape(public.fiscal_digits_only(v_dest_end.cidade_codigo)),
    public.fiscal_xml_escape(coalesce(v_dest_end.cidade,'')),
    public.fiscal_xml_escape(public.fiscal_digits_only(v_dest_end.cep)),
    public.fiscal_xml_escape(coalesce(public.fiscal_digits_only(v_dest_end.pais_codigo), '1058')),
    v_det_xml,
    coalesce(v_emissao.total_produtos, 0),
    coalesce(v_emissao.total_descontos, 0),
    coalesce(v_emissao.total_frete, 0),
    coalesce(v_total_impostos, 0),
    coalesce(v_emissao.total_nfe, 0)
  );

  v_payload := (select payload->'nfe_preview' from public.fiscal_nfe_emissoes where id = p_emissao_id);

  ok := true;
  errors := '{}';
  warnings := v_warn;
  xml := v_xml;
  payload := v_payload;
  return;
end;
$$;

revoke all on function public.fiscal_nfe_preview_xml(uuid) from public, anon;
grant execute on function public.fiscal_nfe_preview_xml(uuid) to authenticated, service_role, postgres;

select pg_notify('pgrst', 'reload schema');

COMMIT;
