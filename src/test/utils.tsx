import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthProvider';
import { ToastProvider } from '../contexts/ToastProvider';
import { ConfirmProvider } from '../contexts/ConfirmProvider';
import { SupabaseProvider } from '../providers/SupabaseProvider';

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: {
            retry: false, // Turn off retries for testing
        },
    },
});

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
        ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    };
}
