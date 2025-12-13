import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmbalagemFormPanel from '../EmbalagemFormPanel';
import * as EmbalagensService from '../../../services/embalagens';
import * as UnidadesService from '../../../services/unidades';
import { AuthProvider } from '../../../contexts/AuthProvider';
import { ToastProvider } from '../../../contexts/ToastProvider';

// Mock dependencies
vi.mock('../../../services/embalagens');
vi.mock('../../../services/unidades');

// Completely mock the Auth module
vi.mock('../../../contexts/AuthProvider', () => ({
    useAuth: () => ({ activeEmpresaId: 'empresa-123' }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Completely mock the Toast module
vi.mock('../../../contexts/ToastProvider', () => ({
    useToast: () => ({ addToast: vi.fn() }),
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock UI components that might be problematic in jsdom
vi.mock('../products/PackagingIllustration', () => ({
    default: () => <div data-testid="packaging-illustration" />
}));

const renderWithProviders = (ui: React.ReactElement) => {
    return render(ui);
};

describe('EmbalagemFormPanel', () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock units listing
        (UnidadesService.listUnidades as any).mockResolvedValue([
            { id: 'u1', sigla: 'un', descricao: 'Unidade' },
            { id: 'u2', sigla: 'kg', descricao: 'Quilograma' }
        ]);
    });

    it('renders the form correctly when open', async () => {
        renderWithProviders(
            <EmbalagemFormPanel
                isOpen={true}
                onClose={mockOnClose}
                onSave={mockOnSave}
            />
        );

        expect(screen.getByText('Nova Embalagem')).toBeInTheDocument();
        expect(screen.getByLabelText(/Nome da Embalagem/i)).toBeInTheDocument();
        // Wait for units to load
        await waitFor(() => {
            expect(UnidadesService.listUnidades).toHaveBeenCalled();
        });
    });

    it('shows validation error when submitting empty required fields', async () => {
        renderWithProviders(
            <EmbalagemFormPanel
                isOpen={true}
                onClose={mockOnClose}
                onSave={mockOnSave}
            />
        );

        const submitBtn = screen.getByRole('button', { name: /Salvar/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(screen.getByText('Nome é obrigatório')).toBeInTheDocument();
        });

        expect(EmbalagensService.createEmbalagem).not.toHaveBeenCalled();
    });

    it('submits correct data when form is valid', async () => {
        (EmbalagensService.createEmbalagem as any).mockResolvedValue({ id: 'new-id' });

        renderWithProviders(
            <EmbalagemFormPanel
                isOpen={true}
                onClose={mockOnClose}
                onSave={mockOnSave}
            />
        );

        // Fill form
        fireEvent.change(screen.getByLabelText(/Nome da Embalagem/i), { target: { value: 'Caixa Teste' } });
        fireEvent.change(screen.getByLabelText(/Código Interno/i), { target: { value: 'CX-TEST' } });

        const submitBtn = screen.getByRole('button', { name: /Salvar/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(EmbalagensService.createEmbalagem).toHaveBeenCalledWith(expect.objectContaining({
                nome: 'Caixa Teste',
                codigo_interno: 'CX-TEST',
                empresa_id: 'empresa-123',
                tipo: 'pacote_caixa' // default
            }));
        });

        expect(mockOnSave).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
    });
});
