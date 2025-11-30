/*
  # RH - Update Manage Participante RPC (Add Effectiveness)

  ## Impact Summary
  - Atualiza a função rh_manage_participante para suportar avaliação de eficácia (ISO 9001).
  - Adiciona parâmetros: p_parecer_eficacia, p_eficacia_avaliada.
  - Mantém compatibilidade com chamadas existentes via valores default.
*/

-- Drop da versão anterior para recriar com nova assinatura (Regra 14)
drop function if exists public.rh_manage_participante(uuid, uuid, text, text, numeric, text);

create or replace function public.rh_manage_participante(
  p_treinamento_id   uuid,
  p_colaborador_id   uuid,
  p_action           text, -- 'add', 'remove', 'update'
  p_status           text default 'inscrito',
  p_nota             numeric default null,
  p_certificado_url  text default null,
  p_parecer_eficacia text default null,
  p_eficacia_avaliada boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_empresa_id uuid := public.current_empresa_id();
begin
  if p_action = 'remove' then
    delete from public.rh_treinamento_participantes
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  
  elsif p_action = 'add' then
    insert into public.rh_treinamento_participantes (
      empresa_id, treinamento_id, colaborador_id, status
    ) values (
      v_empresa_id, p_treinamento_id, p_colaborador_id, p_status
    )
    on conflict (empresa_id, treinamento_id, colaborador_id) do nothing;
    
  elsif p_action = 'update' then
    update public.rh_treinamento_participantes
    set
      status            = p_status,
      nota_final        = p_nota,
      certificado_url   = p_certificado_url,
      parecer_eficacia  = p_parecer_eficacia,
      eficacia_avaliada = p_eficacia_avaliada,
      updated_at        = now()
    where treinamento_id = p_treinamento_id
      and colaborador_id = p_colaborador_id
      and empresa_id = v_empresa_id;
  end if;

  perform pg_notify(
    'app_log',
    '[RPC] rh_manage_participante: ' || p_action || ' training=' || p_treinamento_id
  );
end;
$$;

revoke all on function public.rh_manage_participante from public;
grant execute on function public.rh_manage_participante to authenticated, service_role;
