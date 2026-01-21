import { describe, it, expect, vi, beforeEach } from 'vitest';

const callRpcMock = vi.fn();

vi.mock('@/lib/api', () => ({
  callRpc: (...args: any[]) => callRpcMock(...args),
}));

describe('servicosContratosBilling service', () => {
  beforeEach(() => {
    callRpcMock.mockReset();
  });

  it('generateSchedule chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce({ inserted: 7 });
    const { generateSchedule } = await import('./servicosContratosBilling');

    const res = await generateSchedule({ contratoId: 'ctr-1' });

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_generate_schedule', {
      p_contrato_id: 'ctr-1',
      p_months_ahead: 12,
    });
    expect(res).toEqual({ inserted: 7 });
  });

  it('generateReceivables chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce({ created: 3, months_ahead: 12 });
    const { generateReceivables } = await import('./servicosContratosBilling');

    const res = await generateReceivables({ contratoId: 'ctr-1', until: '2026-01-10' });

    expect(callRpcMock).toHaveBeenCalledWith(
      'servicos_contratos_billing_generate_receivables',
      expect.objectContaining({
        p_contrato_id: 'ctr-1',
        p_until: '2026-01-10',
      }),
    );
    expect(res).toEqual({ created: 3, reason: undefined, monthsAhead: 12 });
  });

  it('getBillingRuleByContratoId retorna null quando data é null', async () => {
    callRpcMock.mockResolvedValueOnce(null);
    const { getBillingRuleByContratoId } = await import('./servicosContratosBilling');

    const res = await getBillingRuleByContratoId('ctr-1');

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_rule_get', { p_contrato_id: 'ctr-1' });
    expect(res).toBeNull();
  });

  it('upsertBillingRule chama RPC com payload correto', async () => {
    callRpcMock.mockResolvedValueOnce({ id: 'rule-1' });
    const { upsertBillingRule } = await import('./servicosContratosBilling');

    const payload = {
      contrato_id: 'ctr-1',
      tipo: 'mensal' as const,
      ativo: true,
      valor_mensal: 150,
      dia_vencimento: 5,
      primeira_competencia: '2026-01-01',
      centro_de_custo_id: null,
    };

    const res = await upsertBillingRule(payload);

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_rule_upsert', { p_payload: payload });
    expect(res).toEqual({ id: 'rule-1' });
  });

  it('listScheduleByContratoId chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce([{ id: 'sch-1' }, { id: 'sch-2' }]);
    const { listScheduleByContratoId } = await import('./servicosContratosBilling');

    const res = await listScheduleByContratoId('ctr-1', 10);

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_schedule_list', { p_contrato_id: 'ctr-1', p_limit: 10 });
    expect(res).toEqual([{ id: 'sch-1' }, { id: 'sch-2' }]);
  });

  it('cancelFutureBilling chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce({ schedule_cancelled: 10, receivables_cancelled: 2, cobrancas_cancelled: 2 });
    const { cancelFutureBilling } = await import('./servicosContratosBilling');

    const res = await cancelFutureBilling({ contratoId: 'ctr-1', cancelReceivables: true, reason: 'Contrato cancelado' });

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_cancel_future', {
      p_contrato_id: 'ctr-1',
      p_cancel_receivables: true,
      p_reason: 'Contrato cancelado',
    });
    expect(res).toEqual({ scheduleCancelled: 10, receivablesCancelled: 2, cobrancasCancelled: 2 });
  });

  it('addAvulso chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce({ id: 'sch-1', kind: 'avulso' });
    const { addAvulso } = await import('./servicosContratosBilling');

    const res = await addAvulso({ contratoId: 'ctr-1', dataVencimento: '2026-02-10', valor: 99.9, descricao: 'Setup' });

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_add_avulso', {
      p_contrato_id: 'ctr-1',
      p_data_vencimento: '2026-02-10',
      p_valor: 99.9,
      p_descricao: 'Setup',
    });
    expect(res).toEqual({ id: 'sch-1', kind: 'avulso' });
  });

  it('recalcMensalFuture chama RPC com params corretos', async () => {
    callRpcMock.mockResolvedValueOnce({ ok: true, updated: 5 });
    const { recalcMensalFuture } = await import('./servicosContratosBilling');

    const res = await recalcMensalFuture({ contratoId: 'ctr-1', from: '2026-01-01' });

    expect(callRpcMock).toHaveBeenCalledWith('servicos_contratos_billing_recalc_mensal_future', {
      p_contrato_id: 'ctr-1',
      p_from: '2026-01-01',
    });
    expect(res).toEqual({ updated: 5, reason: undefined });
  });
});
