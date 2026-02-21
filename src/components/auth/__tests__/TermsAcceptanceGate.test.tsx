import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as svc from '@/services/termsAcceptance';
import { RpcError } from '@/lib/api';
import TermsAcceptanceGate from '../TermsAcceptanceGate';

vi.mock('@/services/termsAcceptance', async () => {
  const actual = await vi.importActual<any>('@/services/termsAcceptance');
  return {
    ...actual,
    getCurrentTermsDocument: vi.fn(),
    getTermsAcceptanceStatus: vi.fn(),
    acceptCurrentTerms: vi.fn(),
  };
});

function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('TermsAcceptanceGate', () => {
  it('renders children when already accepted', async () => {
    vi.mocked(svc.getCurrentTermsDocument).mockResolvedValue({
      key: 'ultria_erp_terms',
      version: '1.0',
      body: 'Termos…',
      body_sha256: 'hash',
    });
    vi.mocked(svc.getTermsAcceptanceStatus).mockResolvedValue({
      is_accepted: true,
      acceptance_id: 'acc-1',
      accepted_at: new Date().toISOString(),
      version: '1.0',
      document_sha256: 'hash',
    });

    renderWithQuery(
      <TermsAcceptanceGate userId="user-1" empresaId="empresa-1" currentPath="/app/products" onDecline={() => {}}>
        <div>APP_OK</div>
      </TermsAcceptanceGate>,
    );

    expect(await screen.findByText('APP_OK')).toBeInTheDocument();
  });

  it('blocks app until user accepts', async () => {
    let accepted = false;

    vi.mocked(svc.getCurrentTermsDocument).mockResolvedValue({
      key: 'ultria_erp_terms',
      version: '1.0',
      body: 'Termos de Aceite Versão: 1.0',
      body_sha256: 'hash',
    });

    vi.mocked(svc.getTermsAcceptanceStatus).mockImplementation(async () => {
      return {
        is_accepted: accepted,
        acceptance_id: accepted ? 'acc-1' : null,
        accepted_at: accepted ? new Date().toISOString() : null,
        version: '1.0',
        document_sha256: 'hash',
      };
    });

    vi.mocked(svc.acceptCurrentTerms).mockImplementation(async () => {
      accepted = true;
      return {
        acceptance_id: 'acc-1',
        accepted_at: new Date().toISOString(),
        version: '1.0',
        document_sha256: 'hash',
      };
    });

    renderWithQuery(
      <TermsAcceptanceGate userId="user-1" empresaId="empresa-1" currentPath="/app/products" onDecline={() => {}}>
        <div>APP_OK</div>
      </TermsAcceptanceGate>,
    );

    expect(await screen.findByText('Termo de Aceite')).toBeInTheDocument();
    expect(screen.queryByText('APP_OK')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }));

    await waitFor(() => expect(screen.getByText('APP_OK')).toBeInTheDocument());
  });

  it('decline calls onDecline', async () => {
    vi.mocked(svc.getCurrentTermsDocument).mockResolvedValue({
      key: 'ultria_erp_terms',
      version: '1.0',
      body: 'Termos…',
      body_sha256: 'hash',
    });
    vi.mocked(svc.getTermsAcceptanceStatus).mockResolvedValue({
      is_accepted: false,
      acceptance_id: null,
      accepted_at: null,
      version: '1.0',
      document_sha256: 'hash',
    });

    const onDecline = vi.fn();

    renderWithQuery(
      <TermsAcceptanceGate userId="user-1" empresaId="empresa-1" currentPath="/app/products" onDecline={onDecline}>
        <div>APP_OK</div>
      </TermsAcceptanceGate>,
    );

    expect(await screen.findByText('Termo de Aceite')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Não aceito/i }));

    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('does not block terms route while not accepted', async () => {
    vi.mocked(svc.getCurrentTermsDocument).mockResolvedValue({
      key: 'ultria_erp_terms',
      version: '1.0',
      body: 'Termos…',
      body_sha256: 'hash',
    });
    vi.mocked(svc.getTermsAcceptanceStatus).mockResolvedValue({
      is_accepted: false,
      acceptance_id: null,
      accepted_at: null,
      version: '1.0',
      document_sha256: 'hash',
    });

    renderWithQuery(
      <TermsAcceptanceGate userId="user-1" empresaId="empresa-1" currentPath="/app/termos-de-uso" onDecline={() => {}}>
        <div>TERMS_PAGE_OK</div>
      </TermsAcceptanceGate>,
    );

    expect(await screen.findByText('TERMS_PAGE_OK')).toBeInTheDocument();
    expect(screen.queryByText('Termo de Aceite')).not.toBeInTheDocument();
  });

  it('fails open when terms RPC is missing in schema cache (compat mode)', async () => {
    const missingRpc = new RpcError('HTTP_404: Could not find the function public.terms_acceptance_status_get(p_key) in the schema cache');
    missingRpc.code = 'PGRST202';

    vi.mocked(svc.getCurrentTermsDocument).mockRejectedValue(missingRpc);
    vi.mocked(svc.getTermsAcceptanceStatus).mockRejectedValue(missingRpc);

    renderWithQuery(
      <TermsAcceptanceGate userId="user-1" empresaId="empresa-1" currentPath="/app/products" onDecline={() => {}}>
        <div>APP_OK</div>
      </TermsAcceptanceGate>,
    );

    expect(await screen.findByText('APP_OK')).toBeInTheDocument();
    expect(screen.queryByText('Termo indisponível')).not.toBeInTheDocument();
  });
});
