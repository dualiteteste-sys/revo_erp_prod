export type MarketplaceProvider = 'meli' | 'shopee';
export type MarketplaceEntity = 'products' | 'orders' | 'stock' | 'prices';
export type MarketplaceSyncDirection = 'erp_to_marketplace' | 'marketplace_to_erp' | 'bidirectional';
export type MarketplaceConflictPolicy = 'erp_wins' | 'marketplace_wins' | 'last_write_wins' | 'manual_review';

export type MarketplaceConnectorCapabilities = {
  supportsOAuth: boolean;
  supportsApiKey: boolean;
  supportsWebhooks: boolean;
  supportsManualProductSync: boolean;
  supportsAutomaticSync: boolean;
  supportsBidirectionalSync: boolean;
  supportedEntities: MarketplaceEntity[];
};

export type MarketplaceProviderDefinition = {
  id: MarketplaceProvider;
  label: string;
  summary: string;
  capabilities: MarketplaceConnectorCapabilities;
};

export const MARKETPLACE_PROVIDER_DEFINITIONS: Record<MarketplaceProvider, MarketplaceProviderDefinition> = {
  meli: {
    id: 'meli',
    label: 'Mercado Livre',
    summary: 'OAuth + importação de pedidos + operação assistida por jobs',
    capabilities: {
      supportsOAuth: true,
      supportsApiKey: false,
      supportsWebhooks: true,
      supportsManualProductSync: true,
      supportsAutomaticSync: true,
      supportsBidirectionalSync: true,
      supportedEntities: ['orders', 'products', 'stock', 'prices'],
    },
  },
  shopee: {
    id: 'shopee',
    label: 'Shopee',
    summary: 'OAuth + importação de pedidos + sincronização progressiva',
    capabilities: {
      supportsOAuth: true,
      supportsApiKey: false,
      supportsWebhooks: true,
      supportsManualProductSync: true,
      supportsAutomaticSync: true,
      supportsBidirectionalSync: true,
      supportedEntities: ['orders', 'products', 'stock', 'prices'],
    },
  },
};

export const MARKETPLACE_PROVIDER_IDS = Object.keys(MARKETPLACE_PROVIDER_DEFINITIONS) as MarketplaceProvider[];

export function getMarketplaceProviderDefinition(provider: MarketplaceProvider): MarketplaceProviderDefinition {
  return MARKETPLACE_PROVIDER_DEFINITIONS[provider];
}

export function defaultMarketplaceSyncDirection(): MarketplaceSyncDirection {
  return 'bidirectional';
}

export function defaultMarketplaceConflictPolicy(): MarketplaceConflictPolicy {
  return 'erp_wins';
}
