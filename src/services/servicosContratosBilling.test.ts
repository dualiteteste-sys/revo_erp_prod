import { describe, it, expect, vi, beforeEach } from 'vitest';

type FromResult = { data: any; error: any };

function createQueryBuilder(result: Promise<FromResult> | FromResult) {
  const resolved = Promise.resolve(result as any);

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => resolved),
    upsert: vi.fn(() => builder),
    single: vi.fn(async () => resolved),
  };

  return builder;
}

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
    rpc: (...args: any[]) => rpcMock(...args),
  },
}));

describe('servicosContratosBilling service', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it('generateSchedule chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: { inserted: 7 }, error: null });
    const { generateSchedule } = await import('./servicosContratosBilling');

    const res = await generateSchedule({ contratoId: 'ctr-1' });

    expect(rpcMock).toHaveBeenCalledWith('servicos_contratos_billing_generate_schedule', {
      p_contrato_id: 'ctr-1',
      p_months_ahead: 12,
    });
    expect(res).toEqual({ inserted: 7 });
  });

  it('generateReceivables chama RPC com params corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: { created: 3, months_ahead: 12 }, error: null });
    const { generateReceivables } = await import('./servicosContratosBilling');

    const res = await generateReceivables({ contratoId: 'ctr-1', until: '2026-01-10' });

    expect(rpcMock).toHaveBeenCalledWith(
      'servicos_contratos_billing_generate_receivables',
      expect.objectContaining({
        p_contrato_id: 'ctr-1',
        p_until: '2026-01-10',
      }),
    );
    expect(res).toEqual({ created: 3, reason: undefined, monthsAhead: 12 });
  });

  it('getBillingRuleByContratoId retorna null quando data é null', async () => {
    fromMock.mockReturnValueOnce(createQueryBuilder({ data: null, error: null }));
    const { getBillingRuleByContratoId } = await import('./servicosContratosBilling');

    const res = await getBillingRuleByContratoId('ctr-1');

    expect(res).toBeNull();
  });

  it('upsertBillingRule usa onConflict empresa_id,contrato_id', async () => {
    fromMock.mockReturnValueOnce(createQueryBuilder({ data: { id: 'rule-1' }, error: null }));
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

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_billing_rules');
    const qb = fromMock.mock.results[0]!.value;
    expect(qb.upsert).toHaveBeenCalledWith(payload, { onConflict: 'empresa_id,contrato_id' });
    expect(res).toEqual({ id: 'rule-1' });
  });
});
