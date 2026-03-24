-- Fix P1: format() error "unrecognized format() type specifier '.'"
-- in fiscal_nfe_preview_xml.
--
-- Root cause: format('...Assumindo 0%%.', ...) — PostgreSQL sees '%%' as
-- escaped '%', then '.' as an invalid type specifier after '%'.
-- Fix: replace format() with string concatenation (||) for that line.

do $body$
declare
  _old_pattern text := $pat$format('ICMS: alíquota não configurada (%s→%s). Assumindo 0%%.', upper(coalesce(v_emitente.endereco_uf,'')), upper(coalesce(v_dest_end.uf,'')))$pat$;
  _new_pattern text := $pat$'ICMS: alíquota não configurada (' || upper(coalesce(v_emitente.endereco_uf,'')) || '→' || upper(coalesce(v_dest_end.uf,'')) || '). Assumindo 0%.'$pat$;
  _full_def text;
begin
  select pg_get_functiondef(p.oid) into _full_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fiscal_nfe_preview_xml';

  if _full_def is null then
    raise notice 'fiscal_nfe_preview_xml not found — skipping';
    return;
  end if;

  if position(_old_pattern in _full_def) = 0 then
    raise notice 'Pattern already patched or not found — skipping';
    return;
  end if;

  _full_def := replace(_full_def, _old_pattern, _new_pattern);

  execute _full_def;

  raise notice 'fiscal_nfe_preview_xml: format%% bug patched';
end;
$body$;
