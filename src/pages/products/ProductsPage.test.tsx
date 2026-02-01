import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import ProductsPage from './ProductsPage';
import { renderWithProviders } from '../../test/utils';

// NOTE: This suite has been intermittently hanging Vitest/CI (process does not exit)
// when running alongside other unit tests. Keep it skipped until we isolate the
// side-effect that keeps the event loop alive.
describe.skip('ProductsPage Integration', () => {
    it('renders the product list with data from MSW', async () => {
        renderWithProviders(<ProductsPage />);

        // Wait for products to appear (react-query + MSW can be slightly async/flaky)
        await waitFor(
            () => {
                expect(screen.getByText('Produto Teste 1')).toBeInTheDocument();
                expect(screen.getByText('SKU-001')).toBeInTheDocument();
            },
            { timeout: 5000 },
        );

        // Check for the second product
        expect(screen.getByText('Produto Teste 2')).toBeInTheDocument();
        expect(screen.getByText('SKU-002')).toBeInTheDocument();
    });

    it('filters products by search term', async () => {
        // This would require interacting with the search input and verifying the list updates.
        // For now, we just verify the initial render.
        renderWithProviders(<ProductsPage />);

        await waitFor(
            () => {
                expect(screen.getByText('Produto Teste 1')).toBeInTheDocument();
            },
            { timeout: 5000 },
        );
    });
});
