import {
  type EcommerceConnection,
  type EcommerceConnectionDiagnostics,
  type WooSecretsSaveResult,
} from '@/services/ecommerceIntegrations';
import { type MarketplaceProvider } from '@/services/marketplaceFramework';

type Provider = MarketplaceProvider;

function connectionStatusScore(status: string | null | undefined): number {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'connected') return 0;
  if (normalized === 'pending') return 1;
  if (normalized === 'error') return 2;
  if (normalized === 'disconnected') return 4;
  return 3;
}

function connectionCompletenessScore(connection: EcommerceConnection): number {
  const provider = String(connection.provider ?? '').toLowerCase();
  if (provider === 'woo') {
    const hasStoreUrl = String(connection.config?.store_url ?? '').trim().length > 0;
    return hasStoreUrl ? 0 : 1;
  }
  const hasExternalAccount = String(connection.external_account_id ?? '').trim().length > 0;
  return hasExternalAccount ? 0 : 1;
}

export function pickPreferredEcommerceConnection(
  rows: EcommerceConnection[],
  provider: Provider,
  preferredConnectionId?: string | null,
): EcommerceConnection | null {
  const sameProvider = rows.filter((row) => row.provider === provider);
  if (sameProvider.length === 0) return null;

  if (preferredConnectionId) {
    const explicit = sameProvider.find((row) => row.id === preferredConnectionId);
    if (explicit) return explicit;
  }

  const sorted = [...sameProvider].sort((left, right) => {
    const statusDiff = connectionStatusScore(left.status) - connectionStatusScore(right.status);
    if (statusDiff !== 0) return statusDiff;

    const completenessDiff = connectionCompletenessScore(left) - connectionCompletenessScore(right);
    if (completenessDiff !== 0) return completenessDiff;

    const updatedAtLeft = new Date(left.updated_at).getTime();
    const updatedAtRight = new Date(right.updated_at).getTime();
    if (updatedAtLeft !== updatedAtRight) return updatedAtRight - updatedAtLeft;

    const createdAtLeft = new Date(left.created_at).getTime();
    const createdAtRight = new Date(right.created_at).getTime();
    return createdAtRight - createdAtLeft;
  });

  return sorted[0] ?? null;
}

export function buildPreferredEcommerceConnectionsMap(
  rows: EcommerceConnection[],
  providers: readonly Provider[],
  preferredConnectionByProvider?: Partial<Record<Provider, string | null>>,
): Map<Provider, EcommerceConnection> {
  const map = new Map<Provider, EcommerceConnection>();
  for (const provider of providers) {
    const preferred = pickPreferredEcommerceConnection(rows, provider, preferredConnectionByProvider?.[provider] ?? null);
    if (preferred) map.set(provider, preferred);
  }
  return map;
}

export function mergeWooDiagnosticsWithSnapshot(params: {
  diagnostics: EcommerceConnectionDiagnostics;
  snapshot: WooSecretsSaveResult | null;
}): { diagnostics: EcommerceConnectionDiagnostics; backendConfirmsCredentials: boolean } {
  const diagnosticsHasStoredCredentials =
    params.diagnostics.has_consumer_key === true &&
    params.diagnostics.has_consumer_secret === true;

  const snapshotHasStoredCredentials =
    params.snapshot?.has_consumer_key === true &&
    params.snapshot?.has_consumer_secret === true;

  if (!snapshotHasStoredCredentials || diagnosticsHasStoredCredentials) {
    return {
      diagnostics: params.diagnostics,
      backendConfirmsCredentials: diagnosticsHasStoredCredentials,
    };
  }

  return {
    diagnostics: {
      ...params.diagnostics,
      has_consumer_key: true,
      has_consumer_secret: true,
    },
    backendConfirmsCredentials: false,
  };
}
