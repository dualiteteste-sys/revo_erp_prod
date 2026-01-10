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

describe('servicosContratosTemplatesAdmin service', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('listContratoTemplatesAdmin lista templates', async () => {
    fromMock.mockReturnValueOnce(createQueryBuilder({ data: [{ id: 'tpl-1' }], error: null }));
    const { listContratoTemplatesAdmin } = await import('./servicosContratosTemplatesAdmin');

    const res = await listContratoTemplatesAdmin();

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_templates');
    expect(res).toEqual([{ id: 'tpl-1' }]);
  });

  it('upsertContratoTemplateAdmin faz upsert e retorna single', async () => {
    fromMock.mockReturnValueOnce(createQueryBuilder({ data: { id: 'tpl-1' }, error: null }));
    const { upsertContratoTemplateAdmin } = await import('./servicosContratosTemplatesAdmin');

    const payload = { slug: 'x', titulo: 'T', corpo: 'C', active: true };
    const res = await upsertContratoTemplateAdmin(payload as any);

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_templates');
    const qb = fromMock.mock.results[0]!.value;
    expect(qb.upsert).toHaveBeenCalledWith(payload);
    expect(res).toEqual({ id: 'tpl-1' });
  });

  it('deleteContratoTemplateAdmin deleta por id', async () => {
    const qb = createQueryBuilder({ data: null, error: null });
    qb.eq = vi.fn(async () => ({ data: null, error: null }));
    fromMock.mockReturnValueOnce(qb);
    const { deleteContratoTemplateAdmin } = await import('./servicosContratosTemplatesAdmin');

    await deleteContratoTemplateAdmin('tpl-1');

    expect(fromMock).toHaveBeenCalledWith('servicos_contratos_templates');
    expect(qb.delete).toHaveBeenCalled();
    expect(qb.eq).toHaveBeenCalledWith('id', 'tpl-1');
  });
});

