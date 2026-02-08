import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductFormPanel from '../ProductFormPanel';
import * as ProdutoGruposService from '../../../services/produtoGrupos';
import * as UnidadesService from '../../../services/unidades';

// Mock Provider
vi.mock('../../../contexts/ToastProvider', () => ({
    useToast: () => ({ addToast: vi.fn() }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Services used by Tabs
vi.mock('../../../services/produtoGrupos');
vi.mock('../../../services/unidades');

// Mock Validation logic to avoid blocking saves due to complex logic
vi.mock('@/services/products.normalize', () => ({
    normalizeProductPayload: (data: any) => data
}));
vi.mock('@/services/products.validate', () => ({
    validatePackaging: () => [] // Returns empty array = Valid
}));

vi.mock('@/contexts/AuthProvider', () => ({
    useAuth: () => ({ loading: false, activeEmpresaId: 'empresa-1' }),
}));

describe('ProductFormPanel (Integration)', () => {
    const mockOnClose = vi.fn();
    const mockOnSaveSuccess = vi.fn();
    const mockSaveProduct = vi.fn();

    const defaultProps = {
        product: null,
        onClose: mockOnClose,
        onSaveSuccess: mockOnSaveSuccess,
        saveProduct: mockSaveProduct
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Setup service mocks
        (ProdutoGruposService.listProdutoGrupos as any).mockResolvedValue([
            { id: 'g1', nome: 'Grupo 1' }
        ]);
        (UnidadesService.listUnidades as any).mockResolvedValue([
            { id: 'u1', sigla: 'un', descricao: 'Unidade' }
        ]);
    });

    it('validates required name field before saving', async () => {
        render(<ProductFormPanel {...defaultProps} />);

        // Expect validation error (real-time validation)
        expect(await screen.findByText('O nome do produto é obrigatório.')).toBeInTheDocument();

        // Save should be disabled while invalid
        const saveButton = screen.getByRole('button', { name: /Salvar Produto/i });
        expect(saveButton).toHaveAttribute('disabled');

        // Ensure saveProduct was NOT called
        expect(mockSaveProduct).not.toHaveBeenCalled();
    });

    it('updates state and submits data when valid', async () => {
        const savedProductMock = { id: 'prod-1', nome: 'Produto Real' };
        mockSaveProduct.mockResolvedValue(savedProductMock);

        render(<ProductFormPanel {...defaultProps} />);

        // Fill Name (Select by Label)
        // Note: The Label includes "*"
        const nameInput = screen.getByRole('textbox', { name: /Nome do Produto/i });
        fireEvent.change(nameInput, { target: { value: 'Produto Real' } });

        // Fill SKU
        const skuInput = screen.getByRole('textbox', { name: /SKU/i });
        fireEvent.change(skuInput, { target: { value: 'SKU-123' } });

        // Click save
        const saveButton = screen.getByRole('button', { name: /Salvar Produto/i });
        await waitFor(() => expect(saveButton).not.toHaveAttribute('disabled'));
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(mockSaveProduct).toHaveBeenCalledWith(expect.objectContaining({
                nome: 'Produto Real',
                sku: 'SKU-123'
            }));
        });

        // Verify success callback
        expect(mockOnSaveSuccess).toHaveBeenCalledWith(savedProductMock);
    });

    it('switches to Service mode correctly', async () => {
        // Mock a service product
        const serviceProduct: any = { tipo: 'servico', nome: 'Serviço X', id: 'srv-1', empresa_id: 'emp-1' };

        render(<ProductFormPanel {...defaultProps} product={serviceProduct} />);

        // Verify "Salvar Serviço" button
        expect(screen.getByRole('button', { name: /Salvar Serviço/i })).toBeInTheDocument();

        // Verify "Mídia" tab is NOT present
        expect(screen.queryByText('Mídia')).not.toBeInTheDocument();
    });
});
