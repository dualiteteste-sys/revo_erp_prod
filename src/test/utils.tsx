import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthProvider';
import { ToastProvider } from '../contexts/ToastProvider';
import { ConfirmProvider } from '../contexts/ConfirmProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';

const _testQueryClients = new Set<QueryClient>();

export function cleanupTestQueryClients() {
    for (const qc of _testQueryClients) {
        try {
            qc.cancelQueries();
            qc.cancelMutations?.();
        } catch {
            // best-effort
        }
        try {
            qc.getQueryCache().clear();
            qc.getMutationCache().clear();
            qc.clear();
        } catch {
            // best-effort
        }
    }
    _testQueryClients.clear();
}

const createTestQueryClient = () => {
    const qc = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false, // Turn off retries for testing
            // Avoid timers that keep the process alive after tests finish.
            gcTime: Infinity,
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
        },
        mutations: {
            gcTime: Infinity,
            retry: false,
        },
    },
    });
    _testQueryClients.add(qc);
    return qc;
};

interface ExtendedRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    route?: string;
}

import { vi } from 'vitest';
import { supabase } from '../lib/supabaseClient';

export function renderWithProviders(
    ui: React.ReactElement,
    { route = '/', ...renderOptions }: ExtendedRenderOptions = {}
) {
    const queryClient = createTestQueryClient();

    // Mock session by default
    const mockSession = {
        access_token: 'fake-token',
        refresh_token: 'fake-refresh-token',
        expires_in: 3600,
        token_type: 'bearer' as const,
        user: {
            id: 'user-123',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
        },
    };

    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: mockSession },
        error: null,
    });

    vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation(((callback: any) => {
        // Fire callback immediately with session
        callback('SIGNED_IN', mockSession);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as any);

    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <SupabaseProvider>
                    <ToastProvider>
                        <ConfirmProvider>
                            <AuthProvider>
                                <MemoryRouter initialEntries={[route]}>
                                    {children}
                                </MemoryRouter>
                            </AuthProvider>
                        </ConfirmProvider>
                    </ToastProvider>
                </SupabaseProvider>
            </QueryClientProvider>
        );
    }

    return {
        user: undefined, // Setup userEvent if needed later
        queryClient,
        ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    };
}
