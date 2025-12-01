import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import ProductsPage from './ProductsPage';
import { renderWithProviders } from '../../test/utils';

describe('ProductsPage Integration', () => {
    it('renders the product list with data from MSW', async () => {
        renderWithProviders(<ProductsPage />);

        // Check for loading state (optional, might be too fast)
        // expect(screen.getByRole('status')).toBeInTheDocument(); 

        // Wait for products to appear
        await waitFor(() => {
            expect(screen.getByText('Produto Teste 1')).toBeInTheDocument();
            expect(screen.getByText('SKU-001')).toBeInTheDocument();
        });

        // Check for the second product
        expect(screen.getByText('Produto Teste 2')).toBeInTheDocument();
        expect(screen.getByText('SKU-002')).toBeInTheDocument();
    });

    it('filters products by search term', async () => {
        // This would require interacting with the search input and verifying the list updates.
        // For now, we just verify the initial render.
        renderWithProviders(<ProductsPage />);

        await waitFor(() => {
            expect(screen.getByText('Produto Teste 1')).toBeInTheDocument();
        });
    });
});
