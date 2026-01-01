import { callRpc } from '@/lib/api';

export type MarketplaceTimelineEvent = {
  occurred_at: string;
  kind: string;
  level: string;
  message: string;
  meta: Record<string, unknown> | null;
};

export async function listMarketplaceOrderTimeline(vendasPedidoId: string): Promise<MarketplaceTimelineEvent[]> {
  return callRpc<MarketplaceTimelineEvent[]>('ecommerce_order_timeline', { p_vendas_pedido_id: vendasPedidoId });
}

