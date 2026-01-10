import { describe, it, expect, vi, beforeEach } from 'vitest';

type FromResult = { data: any; error: any };

function createQueryBuilder(result: Promise<FromResult> | FromResult) {
  const resolved = Promise.resolve(result as any);

  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    single: vi.fn(async () => resolved),
    delete: vi.fn(() => builder),
  };

  // Torna o builder "thenable" para suportar `await sb.from(...).select(...)...`
  builder.then = (...args: any[]) => resolved.then(...args);
  builder.catch = (...args: any[]) => resolved.catch(...args);

  return builder;
}

const fromMock = vi.fn();

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => fromMock(...args),
  },
}));

describe('servicosContratosItens service', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('listItensByContratoId lista por contrato_id e ordena', async () => {
    fromMock.mockReturnValueOnce(
      createQueryBuilder({
        data: [{ id: 'it-1' }, { id: 'it-2' }],
        error: null,
      }),
    );
    const { listItensByContratoId } = await import('./servicosContratosItens');

    const res = await listItensByContratoId('ctr-1');

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_itens');
    const qb = fromMock.mock.results[0]!.value;
    expect(qb.eq).toHaveBeenCalledWith('contrato_id', 'ctr-1');
    expect(res).toEqual([{ id: 'it-1' }, { id: 'it-2' }]);
  });

  it('upsertContratoItem faz upsert e retorna single', async () => {
    fromMock.mockReturnValueOnce(createQueryBuilder({ data: { id: 'it-1' }, error: null }));
    const { upsertContratoItem } = await import('./servicosContratosItens');

    const payload = { contrato_id: 'ctr-1', titulo: 'Suporte', quantidade: 1, valor_unitario: 100 };
    const res = await upsertContratoItem(payload as any);

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_itens');
    const qb = fromMock.mock.results[0]!.value;
    expect(qb.upsert).toHaveBeenCalledWith(payload);
    expect(res).toEqual({ id: 'it-1' });
  });

  it('deleteContratoItem deleta por id', async () => {
    const qb = createQueryBuilder({ data: null, error: null });
    qb.eq = vi.fn(async () => ({ data: null, error: null }));
    fromMock.mockReturnValueOnce(qb);
    const { deleteContratoItem } = await import('./servicosContratosItens');

    await deleteContratoItem('it-1');

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_itens');
    expect(qb.delete).toHaveBeenCalled();
    expect(qb.eq).toHaveBeenCalledWith('id', 'it-1');
  });
});
