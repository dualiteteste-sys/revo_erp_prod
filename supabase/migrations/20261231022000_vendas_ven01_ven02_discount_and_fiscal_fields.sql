/*
  VEN-01/VEN-02:
  - Expor "impostos básicos" do produto (NCM/CFOP/CST/CSOSN) nos itens do pedido.
  - Regras mínimas: desconto com permissão + validações server-side.
*/

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) Expandir allowed actions em public.permissions (compat)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_action'
      AND conrelid = 'public.permissions'::regclass
  ) THEN
    ALTER TABLE public.permissions DROP CONSTRAINT ck_action;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'permissions_action_chk'
      AND conrelid = 'public.permissions'::regclass
  ) THEN
    ALTER TABLE public.permissions DROP CONSTRAINT permissions_action_chk;
  END IF;
END $$;

ALTER TABLE public.permissions
  ADD CONSTRAINT ck_action
  CHECK (action = ANY (ARRAY['view'::text,'create'::text,'update'::text,'delete'::text,'manage'::text,'discount'::text])) NOT VALID;
ALTER TABLE public.permissions VALIDATE CONSTRAINT ck_action;

-- -----------------------------------------------------------------------------
-- 1) Nova permissão: vendas.discount (idempotente)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions(module, action)
VALUES ('vendas', 'discount')
ON CONFLICT (module, action) DO NOTHING;

-- OWNER/ADMIN podem sempre aplicar desconto
INSERT INTO public.role_permissions(role_id, permission_id, allow)
SELECT r.id, p.id, true
FROM public.roles r
JOIN public.permissions p ON p.module = 'vendas' AND p.action = 'discount'
WHERE r.slug IN ('OWNER','ADMIN')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2) Detalhes do pedido: inclui campos fiscais do produto nos itens
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_get_pedido_details(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_pedido  jsonb;
  v_itens   jsonb;
begin
  -- cabeçalho
  select
    to_jsonb(p.*)
    || jsonb_build_object('cliente_nome', c.nome)
  into v_pedido
  from public.vendas_pedidos p
  join public.pessoas c
    on c.id = p.cliente_id
  where p.id = p_id
    and p.empresa_id = v_empresa;

  if v_pedido is null then
    return null;
  end if;

  -- itens
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',        i.id,
               'pedido_id', i.pedido_id,
               'produto_id', i.produto_id,
               'produto_nome', pr.nome,
               'produto_ncm', pr.ncm,
               'produto_cfop', pr.cfop_padrao,
               'produto_cst', pr.cst_padrao,
               'produto_csosn', pr.csosn_padrao,
               'quantidade', i.quantidade,
               'preco_unitario', i.preco_unitario,
               'desconto', i.desconto,
               'total', i.total,
               'observacoes', i.observacoes
             )
             order by i.created_at, i.id
           ),
           '[]'::jsonb
         )
  into v_itens
  from public.vendas_itens_pedido i
  join public.produtos pr
    on pr.id = i.produto_id
  where i.pedido_id = p_id
    and i.empresa_id = v_empresa;

  return v_pedido || jsonb_build_object('itens', v_itens);
end;
$$;
REVOKE ALL ON FUNCTION public.vendas_get_pedido_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_get_pedido_details(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) VEN-02: descontos com permissão + validações (itens)
--
-- Obs: em ambientes onde SEC-02 existe, a função pública pode estar "wrapada"
-- e a implementação real vira _vendas_manage_item. Mantemos o wrapper e
-- atualizamos também a implementação.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._vendas_manage_item(
  p_pedido_id uuid,
  p_item_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_desconto numeric,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
declare
  v_empresa uuid := public.current_empresa_id();
  v_status  text;
  v_total   numeric;
  v_max_desc numeric;
begin
  if p_pedido_id is null then
    raise exception 'p_pedido_id é obrigatório.';
  end if;

  if p_action is null then
    p_action := 'add';
  end if;

  if p_action not in ('add','update','remove') then
    raise exception 'p_action inválido. Use add, update ou remove.';
  end if;

  -- valida pedido e status
  select status
  into v_status
  from public.vendas_pedidos p
  where p.id = p_pedido_id
    and p.empresa_id = v_empresa;

  if v_status is null then
    raise exception 'Pedido não encontrado ou acesso negado.';
  end if;

  if v_status <> 'orcamento' then
    raise exception 'Só é permitido alterar itens de pedidos em status "orcamento".';
  end if;

  if p_action in ('add','update') then
    if p_produto_id is null then
      raise exception 'p_produto_id é obrigatório para add/update.';
    end if;

    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'p_quantidade deve ser > 0.';
    end if;

    if p_preco_unitario is null or p_preco_unitario < 0 then
      raise exception 'p_preco_unitario deve ser >= 0.';
    end if;

    if p_desconto is null then
      p_desconto := 0;
    end if;

    if p_desconto < 0 then
      raise exception 'p_desconto deve ser >= 0.';
    end if;

    if p_desconto > 0 and not public.has_permission_for_current_user('vendas','discount') then
      raise exception 'PERMISSION_DENIED_DISCOUNT';
    end if;

    v_max_desc := round((p_quantidade * p_preco_unitario)::numeric, 2);
    if p_desconto > v_max_desc then
      raise exception 'p_desconto não pode ser maior que o total do item.';
    end if;

    v_total := greatest(round((p_quantidade * p_preco_unitario - p_desconto)::numeric, 2), 0);

    -- garante produto existente
    if not exists (
      select 1 from public.produtos pr where pr.id = p_produto_id
    ) then
      raise exception 'Produto não encontrado.';
    end if;
  end if;

  if p_action = 'remove' then
    if p_item_id is null then
      raise exception 'p_item_id é obrigatório para remove.';
    end if;

    delete from public.vendas_itens_pedido i
    where i.id = p_item_id
      and i.pedido_id = p_pedido_id
      and i.empresa_id = v_empresa;
  elsif p_action = 'add' then
    insert into public.vendas_itens_pedido (
      empresa_id,
      pedido_id,
      produto_id,
      quantidade,
      preco_unitario,
      desconto,
      total
    ) values (
      v_empresa,
      p_pedido_id,
      p_produto_id,
      round(p_quantidade::numeric, 3),
      round(p_preco_unitario::numeric, 2),
      round(p_desconto::numeric, 2),
      v_total
    );
  elsif p_action = 'update' then
    if p_item_id is null then
      raise exception 'p_item_id é obrigatório para update.';
    end if;

    update public.vendas_itens_pedido i
    set
      produto_id     = p_produto_id,
      quantidade     = round(p_quantidade::numeric, 3),
      preco_unitario = round(p_preco_unitario::numeric, 2),
      desconto       = round(p_desconto::numeric, 2),
      total          = v_total
    where i.id = p_item_id
      and i.pedido_id = p_pedido_id
      and i.empresa_id = v_empresa;
  end if;

  -- Recalcula totais do pedido
  perform public.vendas_recalcular_totais(p_pedido_id);

  perform pg_notify(
    'app_log',
    '[RPC] _vendas_manage_item: pedido='||p_pedido_id||' action='||p_action
  );
end;
$$;
REVOKE ALL ON FUNCTION public._vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) TO service_role;

-- Wrapper (mantém SEC-02): exige permissão 'vendas.update' e delega para _vendas_manage_item.
CREATE OR REPLACE FUNCTION public.vendas_manage_item(
  p_pedido_id uuid,
  p_item_id uuid,
  p_produto_id uuid,
  p_quantidade numeric,
  p_preco_unitario numeric,
  p_desconto numeric,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
begin
  perform public.require_permission_for_current_user('vendas','update');
  perform public._vendas_manage_item(p_pedido_id, p_item_id, p_produto_id, p_quantidade, p_preco_unitario, p_desconto, p_action);
end;
$$;
REVOKE ALL ON FUNCTION public.vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_manage_item(uuid, uuid, uuid, numeric, numeric, numeric, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4) VEN-02: descontos com permissão + normalização (cabeçalho)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_upsert_pedido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
declare
  v_empresa   uuid := public.current_empresa_id();
  v_id        uuid;
  v_cliente   uuid;
  v_status    text;
  v_data_emis date;
  v_data_ent  date;
  v_frete     numeric;
  v_desc      numeric;
  v_canal     text := nullif(p_payload->>'canal','');
  v_vendedor  uuid := nullif(p_payload->>'vendedor_id','')::uuid;
  v_com_pct   numeric := nullif(p_payload->>'comissao_percent','')::numeric;
begin
  v_cliente := (p_payload->>'cliente_id')::uuid;
  if v_cliente is null then
    raise exception 'cliente_id é obrigatório.';
  end if;

  if not exists (
    select 1 from public.pessoas c where c.id = v_cliente
  ) then
    raise exception 'Cliente não encontrado.';
  end if;

  v_status := coalesce(p_payload->>'status', 'orcamento');
  if v_status not in ('orcamento','aprovado','cancelado','concluido') then
    raise exception 'Status de pedido inválido.';
  end if;

  v_data_emis := coalesce(
    (p_payload->>'data_emissao')::date,
    current_date
  );
  v_data_ent  := (p_payload->>'data_entrega')::date;

  v_frete := round(coalesce((p_payload->>'frete')::numeric, 0), 2);
  v_desc  := round(coalesce((p_payload->>'desconto')::numeric, 0), 2);

  if v_frete < 0 then
    raise exception 'frete deve ser >= 0.';
  end if;

  if v_desc < 0 then
    raise exception 'desconto deve ser >= 0.';
  end if;

  if v_desc > 0 and not public.has_permission_for_current_user('vendas','discount') then
    raise exception 'PERMISSION_DENIED_DISCOUNT';
  end if;

  if v_canal is not null and v_canal not in ('erp','pdv') then
    raise exception 'Canal inválido.';
  end if;

  if p_payload->>'id' is not null then
    update public.vendas_pedidos p
    set
      cliente_id         = v_cliente,
      data_emissao       = v_data_emis,
      data_entrega       = v_data_ent,
      status             = v_status,
      frete              = v_frete,
      desconto           = v_desc,
      condicao_pagamento = p_payload->>'condicao_pagamento',
      observacoes        = p_payload->>'observacoes',
      canal              = coalesce(v_canal, p.canal),
      vendedor_id        = coalesce(v_vendedor, p.vendedor_id),
      comissao_percent   = coalesce(v_com_pct, p.comissao_percent)
    where p.id = (p_payload->>'id')::uuid
      and p.empresa_id = v_empresa
    returning p.id into v_id;
  else
    insert into public.vendas_pedidos (
      empresa_id,
      cliente_id,
      data_emissao,
      data_entrega,
      status,
      frete,
      desconto,
      condicao_pagamento,
      observacoes,
      canal,
      vendedor_id,
      comissao_percent
    ) values (
      v_empresa,
      v_cliente,
      v_data_emis,
      v_data_ent,
      v_status,
      v_frete,
      v_desc,
      p_payload->>'condicao_pagamento',
      p_payload->>'observacoes',
      coalesce(v_canal, 'erp'),
      v_vendedor,
      coalesce(v_com_pct, 0)
    )
    returning id into v_id;
  end if;

  perform public.vendas_recalcular_totais(v_id);
  perform pg_notify('app_log', '[RPC] vendas_upsert_pedido: ' || v_id);
  return public.vendas_get_pedido_details(v_id);
end;
$$;
REVOKE ALL ON FUNCTION public.vendas_upsert_pedido(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendas_upsert_pedido(jsonb) TO authenticated, service_role;

SELECT pg_notify('pgrst','reload schema');

COMMIT;
