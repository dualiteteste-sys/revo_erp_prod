import { callRpc } from '@/lib/api';

export type AutomacaoConfig = {
  auto_avancar: boolean;
  alerta_parada_minutos: number;
  alerta_refugo_percent: number;
};

export type AutomacaoRegra = {
  chave: string;
  enabled: boolean;
  config: Record<string, any>;
  updated_at: string;
};

let cached: { value: AutomacaoConfig; at: number } | null = null;
const CACHE_MS = 60_000;

export async function getAutomacaoConfig(): Promise<AutomacaoConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = await callRpc<AutomacaoConfig>('industria_automacao_get');
  cached = { value, at: Date.now() };
  return value;
}

export async function listAutomacaoRegras(): Promise<AutomacaoRegra[]> {
  return callRpc<AutomacaoRegra[]>('industria_automacao_list');
}

export async function upsertAutomacaoRegra(chave: string, enabled: boolean, config: Record<string, any>) {
  await callRpc('industria_automacao_upsert', {
    p_chave: chave,
    p_enabled: enabled,
    p_config: config,
  });
  cached = null;
}

