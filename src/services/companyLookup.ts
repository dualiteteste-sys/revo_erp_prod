import axios from 'axios';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';
import { fetchCnpjData } from '@/services/externalApis';

export type CompanyAddressLookup = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  cidade_codigo_ibge: string | null;
  pais: string | null;
  pais_codigo: string | null;
};

export type CompanyLookupResult = {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  email: string | null;
  telefone: string | null;
  inscr_estadual: string | null;
  inscr_municipal: string | null;
  endereco: CompanyAddressLookup | null;
  meta: {
    used_providers: Array<'brasilapi' | 'cnpjws_public'>;
  };
};

type BrasilApiCnpj = Record<string, any>;

type CnpjWsPublic = {
  estabelecimento?: {
    inscricoes_estaduais?: Array<{
      inscricao_estadual?: string | null;
      estado?: { sigla?: string | null } | null;
      ativo?: boolean | null;
    }> | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: { nome?: string | null; ibge_id?: number | string | null } | null;
    estado?: { sigla?: string | null } | null;
    pais?: { nome?: string | null } | null;
  } | null;
};

const http = axios.create({ timeout: 12000 });

const HTTP_RETRY = {
  maxAttempts: 2,
  baseDelayMs: 300,
  maxDelayMs: 2500,
  shouldRetry: (error: any) => {
    const status = error?.response?.status;
    if (status === 429) return true;
    if (status >= 500) return true;
    if (!error?.response && (error?.code || error?.message)) return true;
    return false;
  },
} as const;

function padPaisCodigo4(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(4, '0').slice(-4);
}

function cleanDigits(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

export function normalizeFromBrasilApi(payload: BrasilApiCnpj): Omit<CompanyLookupResult, 'meta'> {
  const cnpj = cleanDigits(payload?.cnpj);

  const telefone =
    payload?.ddd_telefone_1
      ? String(payload.ddd_telefone_1)
      : payload?.ddd_telefone_2
        ? String(payload.ddd_telefone_2)
        : null;

  const cidadeCodigo =
    payload?.codigo_municipio_ibge != null
      ? String(payload.codigo_municipio_ibge).replace(/\D/g, '') || null
      : null;

  return {
    cnpj,
    razao_social: payload?.razao_social ? String(payload.razao_social) : null,
    nome_fantasia: payload?.nome_fantasia ? String(payload.nome_fantasia) : null,
    email: payload?.email ? String(payload.email) : null,
    telefone,
    inscr_estadual: null,
    inscr_municipal: null,
    endereco: {
      logradouro: payload?.logradouro ? String(payload.logradouro) : null,
      numero: payload?.numero ? String(payload.numero) : null,
      complemento: payload?.complemento ? String(payload.complemento) : null,
      bairro: payload?.bairro ? String(payload.bairro) : null,
      cep: payload?.cep ? String(payload.cep) : null,
      cidade: payload?.municipio ? String(payload.municipio) : null,
      uf: payload?.uf ? String(payload.uf) : null,
      cidade_codigo_ibge: cidadeCodigo,
      pais: payload?.pais ? String(payload.pais) : 'Brasil',
      pais_codigo: padPaisCodigo4(payload?.codigo_pais ?? payload?.pais_codigo ?? '1058'),
    },
  };
}

export function extractIeFromCnpjWs(payload: CnpjWsPublic, preferUf: string | null): { inscr_estadual: string | null } {
  const list = payload?.estabelecimento?.inscricoes_estaduais || [];
  const normalizedUf = (preferUf || '').trim().toUpperCase();

  const hits = (Array.isArray(list) ? list : []).filter((it) => {
    if (!it?.inscricao_estadual) return false;
    if (it?.ativo === false) return false;
    return true;
  });

  const exact = normalizedUf
    ? hits.find((it) => String(it?.estado?.sigla || '').toUpperCase() === normalizedUf)
    : undefined;

  const chosen = exact ?? hits[0];
  const ie = chosen?.inscricao_estadual ? String(chosen.inscricao_estadual).trim() : '';
  return { inscr_estadual: ie || null };
}

export function normalizeEnderecoFromCnpjWs(payload: CnpjWsPublic): Partial<CompanyAddressLookup> {
  const est = payload?.estabelecimento || null;
  const ibgeId = est?.cidade?.ibge_id != null ? String(est.cidade.ibge_id).replace(/\D/g, '') : '';
  return {
    cep: est?.cep ? String(est.cep) : null,
    logradouro: est?.logradouro ? String(est.logradouro) : null,
    numero: est?.numero ? String(est.numero) : null,
    complemento: est?.complemento ? String(est.complemento) : null,
    bairro: est?.bairro ? String(est.bairro) : null,
    cidade: est?.cidade?.nome ? String(est.cidade.nome) : null,
    uf: est?.estado?.sigla ? String(est.estado.sigla) : null,
    cidade_codigo_ibge: ibgeId || null,
    pais: est?.pais?.nome ? String(est.pais.nome) : null,
  };
}

async function fetchCnpjWsPublic(cnpjDigits: string): Promise<CnpjWsPublic | null> {
  const cnpj = cleanDigits(cnpjDigits);
  if (cnpj.length !== 14) return null;

  const url = `https://publica.cnpj.ws/cnpj/${cnpj}`;
  const startedAt = performance.now();
  try {
    const { data } = await withRetry(async () => http.get<CnpjWsPublic>(url), HTTP_RETRY);
    const ms = Math.round(performance.now() - startedAt);
    logger.info('[companyLookup] cnpjws_public ok', { ms, cnpj_last4: cnpj.slice(-4) });
    return (data ?? null) as CnpjWsPublic | null;
  } catch (error: any) {
    const ms = Math.round(performance.now() - startedAt);
    const status = error?.response?.status ?? null;
    logger.warn('[companyLookup] cnpjws_public fail', { ms, status, cnpj_last4: cnpj.slice(-4) });
    return null;
  }
}

function mergeAddress(base: CompanyAddressLookup | null, extra: Partial<CompanyAddressLookup> | null): CompanyAddressLookup | null {
  if (!base && !extra) return null;
  const b = base ?? {
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cep: null,
    cidade: null,
    uf: null,
    cidade_codigo_ibge: null,
    pais: null,
    pais_codigo: null,
  };
  const e = extra ?? {};
  return {
    logradouro: e.logradouro ?? b.logradouro,
    numero: e.numero ?? b.numero,
    complemento: e.complemento ?? b.complemento,
    bairro: e.bairro ?? b.bairro,
    cep: e.cep ?? b.cep,
    cidade: e.cidade ?? b.cidade,
    uf: e.uf ?? b.uf,
    cidade_codigo_ibge: e.cidade_codigo_ibge ?? b.cidade_codigo_ibge,
    pais: e.pais ?? b.pais,
    pais_codigo: e.pais_codigo ?? b.pais_codigo,
  };
}

export async function lookupCompanyByCnpj(cnpjInput: string): Promise<CompanyLookupResult> {
  const cnpjDigits = cleanDigits(cnpjInput);
  if (cnpjDigits.length !== 14) throw new Error('CNPJ inválido. Deve conter 14 dígitos.');

  const used: CompanyLookupResult['meta']['used_providers'] = [];

  const startedAt = performance.now();
  const brasilRaw = (await fetchCnpjData(cnpjDigits)) as unknown as BrasilApiCnpj;
  used.push('brasilapi');
  const fromBrasil = normalizeFromBrasilApi(brasilRaw);

  const preferUf = fromBrasil.endereco?.uf ?? null;
  const cnpjws = await fetchCnpjWsPublic(cnpjDigits);
  if (cnpjws) used.push('cnpjws_public');

  const ie = cnpjws ? extractIeFromCnpjWs(cnpjws, preferUf).inscr_estadual : null;
  const enderecoExtra = cnpjws ? normalizeEnderecoFromCnpjWs(cnpjws) : null;

  const ms = Math.round(performance.now() - startedAt);
  logger.info('[companyLookup] lookupByCnpj ok', { ms, providers: used.join(','), cnpj_last4: cnpjDigits.slice(-4) });

  return {
    ...fromBrasil,
    inscr_estadual: ie ?? fromBrasil.inscr_estadual,
    endereco: mergeAddress(fromBrasil.endereco, enderecoExtra),
    meta: { used_providers: used },
  };
}

