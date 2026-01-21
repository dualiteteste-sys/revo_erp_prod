import { describe, it, expect, vi, beforeEach } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('servicosContratosTemplatesAdmin service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('listContratoTemplatesAdmin lista templates', async () => {
    callRpcMock.mockResolvedValueOnce([{ id: 'tpl-1' }]);
    const { listContratoTemplatesAdmin } = await import('./servicosContratosTemplatesAdmin');

    const res = await listContratoTemplatesAdmin();

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_templates_list', { p_active_only: false });
    expect(res).toEqual([{ id: 'tpl-1' }]);
  });

  it('upsertContratoTemplateAdmin faz upsert e retorna single', async () => {
    callRpcMock.mockResolvedValueOnce({ id: 'tpl-1' });
    const { upsertContratoTemplateAdmin } = await import('./servicosContratosTemplatesAdmin');

    const payload = { slug: 'x', titulo: 'T', corpo: 'C', active: true };
    const res = await upsertContratoTemplateAdmin(payload as any);

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_templates_upsert', { p_payload: payload });
    expect(res).toEqual({ id: 'tpl-1' });
  });

  it('deleteContratoTemplateAdmin deleta por id', async () => {
    callRpcMock.mockResolvedValueOnce(true);
    const { deleteContratoTemplateAdmin } = await import('./servicosContratosTemplatesAdmin');

    await deleteContratoTemplateAdmin('tpl-1');

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_templates_delete', { p_id: 'tpl-1' });
  });
});
