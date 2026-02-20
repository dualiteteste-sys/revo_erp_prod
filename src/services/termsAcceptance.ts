import { callRpc } from '@/lib/api';

export const ULTRIA_ERP_TERMS_KEY = 'ultria_erp_terms';

export type TermsDocumentDto = {
  key: string;
  version: string;
  body: string;
  body_sha256: string;
};

export type TermsAcceptanceStatusDto = {
  is_accepted: boolean;
  acceptance_id: string | null;
  accepted_at: string | null;
  version: string;
  document_sha256: string;
};

export type TermsAcceptanceDto = {
  acceptance_id: string;
  accepted_at: string;
  version: string;
  document_sha256: string;
};

export async function getCurrentTermsDocument(): Promise<TermsDocumentDto> {
  const rows = await callRpc<TermsDocumentDto[]>('terms_document_current_get', { p_key: ULTRIA_ERP_TERMS_KEY });
  const doc = rows?.[0] ?? null;
  if (!doc) throw new Error('TERMS_DOCUMENT_NOT_FOUND');
  return doc;
}

export async function getTermsAcceptanceStatus(): Promise<TermsAcceptanceStatusDto> {
  const rows = await callRpc<TermsAcceptanceStatusDto[]>('terms_acceptance_status_get', { p_key: ULTRIA_ERP_TERMS_KEY });
  const status = rows?.[0] ?? null;
  if (!status) throw new Error('TERMS_STATUS_NOT_FOUND');
  return status;
}

export async function acceptCurrentTerms(input: { origin: 'web' | 'mobile'; userAgent: string | null }): Promise<TermsAcceptanceDto> {
  const rows = await callRpc<TermsAcceptanceDto[]>('terms_accept_current', {
    p_key: ULTRIA_ERP_TERMS_KEY,
    p_origin: input.origin,
    p_user_agent: input.userAgent,
  });
  const acceptance = rows?.[0] ?? null;
  if (!acceptance) throw new Error('TERMS_ACCEPT_FAILED');
  return acceptance;
}

