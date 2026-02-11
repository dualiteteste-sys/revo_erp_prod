import axios from 'axios';
import { withRetry } from '@/lib/retry';
import { supabase } from '@/lib/supabase';

const http = axios.create({
  timeout: 12000,
});

function isRetryableHttpError(error: any): boolean {
  const status = error?.response?.status;
  if (status === 429) return true;
  if (status >= 500) return true;
  // Sem response = rede/timeout
  if (!error?.response && (error?.code || error?.message)) return true;
  return false;
}

// --- NCM (BrasilAPI) ---
export interface NcmResult {
  codigo: string;
  descricao: string;
}

const HTTP_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 4000,
  shouldRetry: isRetryableHttpError,
} as const;

export const searchNcm = async (query: string): Promise<NcmResult[]> => {
  const q = (query ?? '').trim();
  if (q.length < 2) return [];
  const { data } = await withRetry(
    async () =>
      http.get<NcmResult[] | NcmResult>(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(q)}`),
    HTTP_RETRY
  );

  const rawData = Array.isArray(data) ? data : [data].filter(Boolean);
  const uniqueData = Array.from(new Map(rawData.map((item: NcmResult) => [item.codigo, item])).values());
  return uniqueData as NcmResult[];
};

export const fetchNcmByCode = async (code: string): Promise<NcmResult | null> => {
  const cleanCode = (code ?? '').replace(/\D/g, '');
  if (cleanCode.length !== 8) return null;
  try {
    const { data } = await withRetry(
      async () => http.get<NcmResult>(`https://brasilapi.com.br/api/ncm/v1/${cleanCode}`),
      HTTP_RETRY
    );
    return data ?? null;
  } catch {
    return null;
  }
};

// --- CNPJ (BrasilAPI) ---
interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  ddd_telefone_1: string;
}

export const fetchCnpjData = async (cnpj: string): Promise<Partial<CnpjData>> => {
  const cleanedCnpj = cnpj.replace(/\D/g, '');
  if (cleanedCnpj.length !== 14) {
    throw new Error('CNPJ inválido. Deve conter 14 dígitos.');
  }

  // Preferimos Edge Function (proxy) para manter Network/Console limpos e evitar CORS/404 no browser.
  try {
    const { data, error } = await supabase.functions.invoke('cnpj-lookup', { body: { cnpj: cleanedCnpj } });
    if (error) throw error;
    if (!data?.ok) {
      throw new Error(String(data?.message || 'CNPJ não encontrado.'));
    }
    return (data?.data ?? {}) as Partial<CnpjData>;
  } catch (e: any) {
    // Fallback (último recurso) para não quebrar DEV caso a Edge Function não esteja disponível.
    try {
      const { data } = await withRetry(
        async () => http.get<CnpjData>(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`),
        HTTP_RETRY
      );
      return data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        throw new Error('CNPJ não encontrado na base da Receita Federal.');
      }
      throw new Error(e?.message || 'Falha ao consultar o CNPJ. Verifique sua conexão.');
    }
  }
};


// --- CEP (ViaCEP) ---
export interface CepData {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string; // cidade
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

export const fetchCepData = async (cep: string): Promise<Partial<CepData>> => {
  const cleanedCep = cep.replace(/\D/g, '');
  if (cleanedCep.length !== 8) {
    throw new Error('CEP inválido. Deve conter 8 dígitos.');
  }
  try {
    const { data } = await withRetry(
      async () => http.get<CepData>(`https://viacep.com.br/ws/${cleanedCep}/json/`),
      HTTP_RETRY
    );
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }
    return data;
  } catch (error: any) {
    throw new Error(error.message || 'Falha ao consultar o CEP.');
  }
};

// --- IBGE Municípios (BrasilAPI) ---
export interface MunicipioIbge {
  nome: string;
  codigo_ibge: string;
}

const municipiosByUfCache = new Map<string, MunicipioIbge[]>();

export const fetchMunicipiosByUf = async (uf: string): Promise<MunicipioIbge[]> => {
  const cleanUf = String(uf || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cleanUf)) return [];
  const cached = municipiosByUfCache.get(cleanUf);
  if (cached) return cached;

  const { data } = await withRetry(
    async () => http.get<Array<{ nome: string; codigo_ibge: string | number }>>(`https://brasilapi.com.br/api/ibge/municipios/v1/${cleanUf}`),
    HTTP_RETRY,
  );

  const rows = Array.isArray(data) ? data : [];
  const normalized: MunicipioIbge[] = rows
    .map((r) => ({
      nome: String(r?.nome || ''),
      codigo_ibge: String(r?.codigo_ibge ?? '').replace(/\D/g, ''),
    }))
    .filter((r) => r.nome && r.codigo_ibge);

  municipiosByUfCache.set(cleanUf, normalized);
  return normalized;
};
