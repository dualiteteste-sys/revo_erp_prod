/**
 * Banco Inter API V3 — shared helpers for Edge Functions.
 *
 * Handles: mTLS client creation, OAuth token acquisition, API calls.
 */

import { aesGcmDecryptFromString } from "./crypto.ts";

// ── Base URLs ────────────────────────────────────────────

const INTER_BASE = {
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
  producao: "https://cdpj.partners.bancointer.com.br",
} as const;

export type InterAmbiente = "sandbox" | "producao";

export function interBaseUrl(ambiente: InterAmbiente): string {
  return INTER_BASE[ambiente];
}

// ── Types ────────────────────────────────────────────────

export interface InterCredentials {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  ambiente: InterAmbiente;
}

export interface InterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface InterCobrancaRequest {
  seuNumero: string;
  valorNominal: number;
  dataVencimento: string; // YYYY-MM-DD
  numDiasAgenda?: number;
  pagador: {
    cpfCnpj: string;
    tipoPessoa: "FISICA" | "JURIDICA";
    nome: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    email?: string;
    ddd?: string;
    telefone?: string;
  };
  mensagem?: {
    linha1?: string;
    linha2?: string;
    linha3?: string;
    linha4?: string;
    linha5?: string;
  };
  multa?: {
    codigoMulta: string;
    valor?: number;
    taxa?: number;
  };
  mora?: {
    codigoMora: string;
    valor?: number;
    taxa?: number;
  };
  desconto?: {
    codigoDesconto: string;
    valor?: number;
    taxa?: number;
    data?: string;
  };
}

export interface InterCobrancaResponse {
  codigoSolicitacao: string;
}

export interface InterCobrancaDetail {
  codigoSolicitacao: string;
  nossoNumero: string;
  seuNumero: string;
  situacao: string; // A_RECEBER, PAGO, CANCELADO, EXPIRADO, VENCIDO, EMABERTO
  dataVencimento: string;
  valorNominal: number;
  dataPagamento?: string | null;
  valorTotalRecebido?: number | null;
  linhaDigitavel?: string;
  codigoBarras?: string;
  pagador?: {
    cpfCnpj: string;
    tipoPessoa: string;
    nome: string;
  };
}

export interface InterWebhookPayload {
  codigoSolicitacao?: string;
  nossoNumero?: string;
  seuNumero?: string;
  situacao?: string;
  dataPagamento?: string;
  valorTotalRecebido?: number;
}

// ── mTLS HTTP Client ─────────────────────────────────────

export function createInterHttpClient(creds: InterCredentials): Deno.HttpClient {
  // @ts-ignore — Deno.createHttpClient available in Edge Runtime
  return Deno.createHttpClient({
    caCerts: [],
    certChain: creds.certPem,
    privateKey: creds.keyPem,
  });
}

// ── OAuth Token ──────────────────────────────────────────

const SCOPES = [
  "boleto-cobranca.read",
  "boleto-cobranca.write",
  "cob.read",
  "cob.write",
  "cobv.read",
  "cobv.write",
  "pix.read",
  "webhook.read",
  "webhook.write",
].join(" ");

export async function getInterToken(
  creds: InterCredentials,
  httpClient: Deno.HttpClient,
): Promise<InterTokenResponse> {
  const base = interBaseUrl(creds.ambiente);
  const url = `${base}/oauth/v2/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: SCOPES,
  });

  const res = await fetch(url, {
    // @ts-ignore — client option for Deno
    client: httpClient,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`INTER_OAUTH_ERROR: HTTP ${res.status} — ${text}`);
  }

  return await res.json();
}

// ── Decrypt credentials from DB row ──────────────────────

export async function decryptInterCredentials(
  row: {
    client_id: string;
    client_secret_encrypted: string;
    cert_pem_encrypted: string;
    key_pem_encrypted: string;
    ambiente: InterAmbiente;
    empresa_id: string;
  },
  masterKey: string,
): Promise<InterCredentials> {
  const [clientSecret, certPem, keyPem] = await Promise.all([
    aesGcmDecryptFromString({
      masterKey,
      ciphertext: row.client_secret_encrypted,
      aad: row.empresa_id,
    }),
    aesGcmDecryptFromString({
      masterKey,
      ciphertext: row.cert_pem_encrypted,
      aad: row.empresa_id,
    }),
    aesGcmDecryptFromString({
      masterKey,
      ciphertext: row.key_pem_encrypted,
      aad: row.empresa_id,
    }),
  ]);

  return {
    clientId: row.client_id,
    clientSecret,
    certPem,
    keyPem,
    ambiente: row.ambiente,
  };
}

// ── API Calls ────────────────────────────────────────────

export async function interApiCall<T>(params: {
  method: string;
  path: string;
  token: string;
  httpClient: Deno.HttpClient;
  ambiente: InterAmbiente;
  body?: unknown;
}): Promise<T> {
  const base = interBaseUrl(params.ambiente);
  const url = `${base}${params.path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    // @ts-ignore — client option for Deno
    client: params.httpClient,
    method: params.method,
    headers,
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`INTER_API_ERROR: ${params.method} ${params.path} → HTTP ${res.status} — ${text}`);
  }

  // Some endpoints return empty body (204)
  if (res.status === 204) return {} as T;

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await res.json();
  }
  // PDF endpoints return binary — return as text (base64)
  return await res.text() as unknown as T;
}

// ── Register Boleto ──────────────────────────────────────

export async function registerBoleto(
  token: string,
  httpClient: Deno.HttpClient,
  ambiente: InterAmbiente,
  payload: InterCobrancaRequest,
): Promise<InterCobrancaResponse> {
  return interApiCall<InterCobrancaResponse>({
    method: "POST",
    path: "/cobranca/v3/cobrancas",
    token,
    httpClient,
    ambiente,
    body: payload,
  });
}

// ── Get Boleto Details ───────────────────────────────────

export async function getBoletoDetails(
  token: string,
  httpClient: Deno.HttpClient,
  ambiente: InterAmbiente,
  codigoSolicitacao: string,
): Promise<InterCobrancaDetail> {
  return interApiCall<InterCobrancaDetail>({
    method: "GET",
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}`,
    token,
    httpClient,
    ambiente,
  });
}

// ── Get Boleto PDF ───────────────────────────────────────

export async function getBoletoPdf(
  token: string,
  httpClient: Deno.HttpClient,
  ambiente: InterAmbiente,
  codigoSolicitacao: string,
): Promise<string> {
  const base = interBaseUrl(ambiente);
  const url = `${base}/cobranca/v3/cobrancas/${codigoSolicitacao}/pdf`;

  const res = await fetch(url, {
    // @ts-ignore
    client: httpClient,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`INTER_PDF_ERROR: HTTP ${res.status} — ${text}`);
  }

  // Inter returns PDF as application/pdf binary
  const blob = await res.arrayBuffer();
  const bytes = new Uint8Array(blob);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// ── Cancel Boleto ────────────────────────────────────────

export async function cancelBoleto(
  token: string,
  httpClient: Deno.HttpClient,
  ambiente: InterAmbiente,
  codigoSolicitacao: string,
  motivo: string,
): Promise<void> {
  await interApiCall<unknown>({
    method: "POST",
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`,
    token,
    httpClient,
    ambiente,
    body: { motivoCancelamento: motivo },
  });
}

// ── Register Webhook ─────────────────────────────────────

export async function registerWebhook(
  token: string,
  httpClient: Deno.HttpClient,
  ambiente: InterAmbiente,
  webhookUrl: string,
): Promise<void> {
  await interApiCall<unknown>({
    method: "PUT",
    path: "/cobranca/v3/cobrancas/webhook",
    token,
    httpClient,
    ambiente,
    body: { webhookUrl },
  });
}
