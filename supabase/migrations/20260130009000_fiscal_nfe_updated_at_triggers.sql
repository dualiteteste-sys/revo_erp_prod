/*
  Fiscal (NF-e) - housekeeping:
  - Garante triggers de updated_at nas tabelas relacionadas à emissão
  - Adiciona índice para listagem por data (painéis/listas)
*/

-- empresa_feature_flags
drop trigger if exists tg_empresa_feature_flags_updated_at on public.empresa_feature_flags;
create trigger tg_empresa_feature_flags_updated_at
before update on public.empresa_feature_flags
for each row
execute function public.tg_set_updated_at();

-- fiscal_nfe_emissao_configs
drop trigger if exists tg_fiscal_nfe_emissao_configs_updated_at on public.fiscal_nfe_emissao_configs;
create trigger tg_fiscal_nfe_emissao_configs_updated_at
before update on public.fiscal_nfe_emissao_configs
for each row
execute function public.tg_set_updated_at();

-- fiscal_nfe_emissoes
drop trigger if exists tg_fiscal_nfe_emissoes_updated_at on public.fiscal_nfe_emissoes;
create trigger tg_fiscal_nfe_emissoes_updated_at
before update on public.fiscal_nfe_emissoes
for each row
execute function public.tg_set_updated_at();

create index if not exists idx_fiscal_nfe_emissoes_empresa_updated_at
  on public.fiscal_nfe_emissoes (empresa_id, updated_at desc);

select pg_notify('pgrst', 'reload schema');

