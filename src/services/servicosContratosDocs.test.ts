import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

describe('servicosContratosDocs service', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('listContratoTemplates chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: 'tpl-1' }], error: null });
    const { listContratoTemplates } = await import('./servicosContratosDocs');

    const res = await listContratoTemplates({ activeOnly: true });

    expect(rpcMock).toHaveBeenCalledWith('servicos_contratos_templates_list', { p_active_only: true });
    expect(res).toEqual([{ id: 'tpl-1' }]);
  });

  it('createContratoDocumento chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { doc_id: 'doc-1', token: 'tok', path: '/portal/contrato/tok', expires_at: '2026-01-01T00:00:00Z' },
      error: null,
    });
    const { createContratoDocumento } = await import('./servicosContratosDocs');

    const res = await createContratoDocumento({ contratoId: 'ctr-1', templateId: 'tpl-1', expiresInDays: 10 });

    expect(rpcMock).toHaveBeenCalledWith('servicos_contratos_document_create', {
      p_contrato_id: 'ctr-1',
      p_template_id: 'tpl-1',
      p_expires_in_days: 10,
    });
    expect(res).toEqual({ docId: 'doc-1', token: 'tok', path: '/portal/contrato/tok', expiresAt: '2026-01-01T00:00:00Z' });
  });

  it('listContratoDocumentos chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: 'doc-1' }], error: null });
    const { listContratoDocumentos } = await import('./servicosContratosDocs');

    const res = await listContratoDocumentos({ contratoId: 'ctr-1', limit: 5 });

    expect(rpcMock).toHaveBeenCalledWith('servicos_contratos_document_list', { p_contrato_id: 'ctr-1', p_limit: 5 });
    expect(res).toEqual([{ id: 'doc-1' }]);
  });

  it('revokeContratoDocumento chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: { revoked_at: '2026-01-10T10:00:00Z' }, error: null });
    const { revokeContratoDocumento } = await import('./servicosContratosDocs');

    const res = await revokeContratoDocumento({ docId: 'doc-1' });

    expect(rpcMock).toHaveBeenCalledWith('servicos_contratos_document_revoke', { p_doc_id: 'doc-1' });
    expect(res).toEqual({ revokedAt: '2026-01-10T10:00:00Z' });
  });
});

