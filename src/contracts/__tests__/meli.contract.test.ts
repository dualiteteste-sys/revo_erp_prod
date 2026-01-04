import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../../../supabase/functions/_shared/sanitize';
import { chooseNextPedidoStatus, mapMeliOrderStatus } from '../../../supabase/functions/_shared/meli_mapping';

import meliCancelled from '../fixtures/meli_order_cancelled.json';
import meliPaid from '../fixtures/meli_order_paid.json';

describe('QA-CT-01 Mercado Livre contracts', () => {
  it('maps paid/approved orders to aprovado', () => {
    expect(mapMeliOrderStatus(meliPaid)).toBe('aprovado');
  });

  it('maps cancelled orders to cancelado', () => {
    expect(mapMeliOrderStatus(meliCancelled)).toBe('cancelado');
  });

  it('keeps terminal local statuses', () => {
    expect(chooseNextPedidoStatus('concluido', 'orcamento')).toBe('concluido');
    expect(chooseNextPedidoStatus('cancelado', 'aprovado')).toBe('cancelado');
  });

  it('sanitizes payloads for logs (golden)', () => {
    expect(sanitizeForLog(meliPaid)).toMatchSnapshot();
  });
});

