/*
  VEN-STA-01 (trilha de desconto/preço)

  Motivo:
  - Já existe enforcement server-side para descontos (permissão + validações), mas faltava a trilha
    para responder: quem aplicou desconto, quando e quanto (pedido e itens).

  O que faz:
  - Habilita `audit_logs_trigger` (public.process_audit_log) nas tabelas:
    - public.vendas_pedidos
    - public.vendas_itens_pedido
  Isso captura UPDATEs (e INSERT/DELETE) com:
  - changed_by (auth.uid)
  - changed_at
  - old_data/new_data (inclui desconto/preco_unitario)

  Impacto:
  - Nenhuma mudança de schema nas tabelas de vendas; apenas adiciona triggers (quando disponíveis).

  Reversibilidade:
  - É reversível removendo os triggers `audit_logs_trigger` destas tabelas.
*/

begin;

do $$
begin
  if to_regclass('public.audit_logs') is null or to_regprocedure('public.process_audit_log()') is null then
    raise notice 'VEN-STA-01: audit_logs/process_audit_log não encontrado; pulando triggers.';
    return;
  end if;

  if to_regclass('public.vendas_pedidos') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.vendas_pedidos';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_pedidos for each row execute function public.process_audit_log()';
  end if;

  if to_regclass('public.vendas_itens_pedido') is not null then
    execute 'drop trigger if exists audit_logs_trigger on public.vendas_itens_pedido';
    execute 'create trigger audit_logs_trigger after insert or update or delete on public.vendas_itens_pedido for each row execute function public.process_audit_log()';
  end if;
end;
$$;

select pg_notify('pgrst','reload schema');

commit;

