-- Alinhamento DEV/PROD com o schema esperado pelo baseline (VERIFY):
-- - Enum `pessoa_tipo`: adiciona valores legados ausentes.
-- - Enum `tipo_produto`: garante valores 'produto' e 'servico'.
-- - Coluna `industria_roteiros.versao`: converte para text quando estiver como integer.

begin;

-- pessoa_tipo: alguns ambientes ficaram com enum "curto" (cliente/fornecedor/ambos)
do $$ begin
  alter type public.pessoa_tipo add value if not exists 'transportadora';
  alter type public.pessoa_tipo add value if not exists 'colaborador';
exception when undefined_object then
  raise notice 'Enum public.pessoa_tipo não existe; pulando.';
end $$;

-- tipo_produto: baseline espera pelo menos 'produto' e 'servico'
do $$ begin
  alter type public.tipo_produto add value if not exists 'produto';
  alter type public.tipo_produto add value if not exists 'servico';
exception when undefined_object then
  raise notice 'Enum public.tipo_produto não existe; pulando.';
end $$;

-- industria_roteiros.versao: baseline define text, mas alguns PROD legados têm integer
do $$
declare
  v_typ regtype;
begin
  if to_regclass('public.industria_roteiros') is null then
    raise notice 'Tabela public.industria_roteiros não existe; pulando.';
    return;
  end if;

  select a.atttypid::regtype into v_typ
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'industria_roteiros'
     and a.attname = 'versao'
     and a.attnum > 0
     and not a.attisdropped;

  if v_typ::text = 'integer' then
    execute 'alter table public.industria_roteiros alter column versao type text using versao::text';
  end if;

  if v_typ::text in ('integer','text','character varying') then
    begin
      execute 'alter table public.industria_roteiros alter column versao set default ''1.0''::text';
    exception when others then
      raise notice 'Não foi possível ajustar default de industria_roteiros.versao: %', SQLERRM;
    end;
  end if;
end $$;

commit;

