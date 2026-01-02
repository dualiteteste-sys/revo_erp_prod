import axios from 'axios';
import { withRetry } from '@/lib/retry';

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

export const searchNcm = async (query: string): Promise<NcmResult[]> => {
  const q = (query ?? '').trim();
  if (q.length < 2) return [];
  const { data } = await withRetry(
    async () =>
      http.get<NcmResult[] | NcmResult>(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(q)}`),
    { maxAttempts: 3, shouldRetry: isRetryableHttpError }
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
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
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
  try {
    const { data } = await withRetry(
      async () => http.get<CnpjData>(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`),
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
    );
    return data;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      throw new Error('CNPJ não encontrado na base da Receita Federal.');
    }
    throw new Error('Falha ao consultar o CNPJ. Verifique sua conexão.');
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
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
    );
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }
    return data;
  } catch (error: any) {
    throw new Error(error.message || 'Falha ao consultar o CEP.');
  }
};
