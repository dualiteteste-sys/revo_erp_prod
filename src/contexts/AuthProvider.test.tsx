import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { useAuth } from './AuthProvider';
import { renderWithProviders } from '../test/utils';
import { supabase } from '@/lib/supabaseClient';

const TestComponent = () => {
    const { session, activeEmpresa, loading } = useAuth();
    const user = session?.user;

    if (loading) return <div>Loading Auth...</div>;
    if (!user) return <div>No User</div>;

    return (
        <div>
            <div>User: {(user as any).email}</div>
            <div>Active Empresa: {activeEmpresa?.id}</div>
        </div>
    );
};

describe('AuthProvider Integration', () => {
    it('initializes with user and active empresa from MSW', async () => {
        renderWithProviders(<TestComponent />);

        // Should start loading
        expect(screen.getByText('Loading Auth...')).toBeInTheDocument();

        // Should eventually show user and empresa
        await waitFor(() => {
            expect(screen.getByText('User: test@example.com')).toBeInTheDocument();
            expect(screen.getByText('Active Empresa: empresa-1')).toBeInTheDocument();
        });
    });

    it('hard-resets cached state on signOut (anti-tenant-leak)', async () => {
        const signOutSpy = vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null } as any);

        sessionStorage.setItem('revo_active_empresa_id', 'empresa-1');
        localStorage.setItem('sb-test-auth-token', 'token');
        localStorage.setItem('revo_some_cache', 'x');
        localStorage.setItem('other_app_key', 'keep');

        const LogoutButton = () => {
            const { signOut, session, loading } = useAuth();
            return (
                <div>
                    <div>State: {loading ? 'loading' : (session?.user ? 'signed-in' : 'signed-out')}</div>
                    <button onClick={() => void signOut()}>Sair</button>
                </div>
            );
        };

        const { queryClient } = renderWithProviders(<LogoutButton />);
        queryClient.setQueryData(['leak-test'], [{ empresa_id: 'empresa-1' }]);

        await waitFor(() => {
            expect(screen.getByText('State: signed-in')).toBeInTheDocument();
        });

        // Ensure there's tenant context persisted before sign-out, so we can assert cleanup.
        sessionStorage.setItem('revo_active_empresa_id', 'empresa-1');

        expect(queryClient.getQueryData(['leak-test'])).toBeTruthy();
        expect(localStorage.getItem('sb-test-auth-token')).toBe('token');
        expect(localStorage.getItem('revo_some_cache')).toBe('x');
        expect(localStorage.getItem('other_app_key')).toBe('keep');

        fireEvent.click(screen.getByText('Sair'));
        await waitFor(() => expect(signOutSpy).toHaveBeenCalled());
        expect(queryClient.getQueryData(['leak-test'])).toBeUndefined();
        expect(sessionStorage.getItem('revo_active_empresa_id')).toBeNull();
        expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
        expect(localStorage.getItem('revo_some_cache')).toBeNull();
        expect(localStorage.getItem('other_app_key')).toBe('keep');
    });
});
