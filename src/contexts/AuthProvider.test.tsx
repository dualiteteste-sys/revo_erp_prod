import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useAuth } from './AuthProvider';
import { renderWithProviders } from '../test/utils';

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
});
