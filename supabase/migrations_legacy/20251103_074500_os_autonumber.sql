-- 20251103_074500_os_autonumber.sql
-- Auto-numeração de OS por empresa_id (segura e idempotente)
-- Logs: [DB][OS][AUTONUM]

/*
  ## Descrição
  - Cria helper para próximo número de OS por empresa (com advisory lock).
  - Cria trigger BEFORE INSERT para atribuir `numero` quando nulo.
  - Garante unicidade (empresa_id, numero) opcional via índice UNIQUE.

  ## Segurança
  - Funções com `set search_path = pg_catalog, public`.
  - Não altera RLS; apenas preenche coluna obrigatória.

  ## Performance
  - Consulta `max(numero)` por empresa (rápida com índice).
  - Lock é por transação e por empresa (granular).

  ## Reversibilidade
  - DROP TRIGGER / DROP FUNCTION / DROP INDEX.
*/

-- Índice para buscas/ordenação e suporte ao max(numero)
create index if not exists idx_os_empresa_numero on public.ordem_servicos(empresa_id, numero);

-- (Opcional porém recomendado) Garantir integridade lógica
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public' and indexname = 'uq_os_empresa_numero'
  ) then
    begin
      create unique index uq_os_empresa_numero
        on public.ordem_servicos(empresa_id, numero);
    exception when others then
      -- Se já houver duplicados, apenas registra; não falhar migração.
      perform pg_notify('app_log', '[DB][OS][AUTONUM] UNIQUE (empresa_id, numero) não criado (duplicados existentes).');
    end;
  end if;
end$$;

-- Helper: próximo número por empresa (com lock por empresa)
create or replace function public.os_next_numero(p_empresa_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_next int;
begin
  if p_empresa_id is null then
    raise exception '[OS][AUTONUM] empresa_id nulo' using errcode='22004';
  end if;

  -- Lock por empresa para evitar corrida
  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id::text, 0));

  select coalesce(max(numero), 0) + 1
    into v_next
    from public.ordem_servicos
   where empresa_id = p_empresa_id;

  return v_next;
end;
$$;

-- Trigger: preenche numero se vier nulo
create or replace function public.tg_os_set_numero()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.numero is null then
    new.numero := public.os_next_numero(new.empresa_id);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_os_set_numero on public.ordem_servicos;
create trigger tg_os_set_numero
before insert on public.ordem_servicos
for each row
execute function public.tg_os_set_numero();
