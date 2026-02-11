import type { ConciliacaoTituloCandidate } from '@/services/conciliacaoTitulos';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function autoAllocateFifoByVencimento(params: {
  titulos: ConciliacaoTituloCandidate[];
  total: number;
}): Record<string, number> {
  const total = roundMoney(params.total);
  if (!Number.isFinite(total) || total <= 0) return {};

  const titulos = (params.titulos ?? [])
    .slice()
    .sort((a, b) => {
      const da = String(a.data_vencimento || '');
      const db = String(b.data_vencimento || '');
      if (da < db) return -1;
      if (da > db) return 1;
      return String(a.titulo_id).localeCompare(String(b.titulo_id));
    });

  const allocations: Record<string, number> = {};
  let remaining = total;

  for (const titulo of titulos) {
    if (remaining <= 0) break;
    const saldo = roundMoney(Number(titulo.saldo_aberto || 0));
    if (!Number.isFinite(saldo) || saldo <= 0) continue;
    const applied = roundMoney(Math.min(saldo, remaining));
    if (applied <= 0) continue;
    allocations[titulo.titulo_id] = applied;
    remaining = roundMoney(remaining - applied);
  }

  return allocations;
}

