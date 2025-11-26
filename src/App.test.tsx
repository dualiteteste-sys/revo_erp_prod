import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from './pages/landing/LandingPage';

// Mock useAuth to avoid AuthProvider dependency
vi.mock('@/contexts/AuthProvider', () => ({
    useAuth: () => ({
        session: null,
        loading: false,
        user: null,
        signOut: vi.fn(),
    }),
}));

describe('App Smoke Test', () => {
    it('renders LandingPage without crashing', () => {
        render(
            <MemoryRouter>
                <LandingPage />
            </MemoryRouter>
        );

        // Check for some text that should be on the landing page
        // Based on the component names (Hero, Pricing, etc), we expect some content.
        // Since we don't know the exact text, we just check if it renders without throwing.
        // But let's try to find a button or link if possible.
        // Header has onLoginClick, maybe there is a "Login" button?
        // Let's just check if the container is present for now, or use a generic query.
        expect(document.body).toBeInTheDocument();
    });
});
