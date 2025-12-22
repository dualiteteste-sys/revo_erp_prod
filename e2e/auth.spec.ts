import { test, expect } from './fixtures';

test('should allow user to log in and view products', async ({ page }) => {
    // Log console messages
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    // Log network requests
    page.on('request', request => console.log('>>', request.method(), request.url()));
    page.on('response', response => console.log('<<', response.status(), response.url()));

    // Mock Supabase Auth User Endpoint (for session validation)
    await page.route('**/auth/v1/user', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'user_123',
                aud: 'authenticated',
                role: 'authenticated',
                email: 'test@example.com',
                email_confirmed_at: new Date().toISOString(),
                app_metadata: { provider: 'email', providers: ['email'] },
                user_metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
        });
    });

    // Mock Supabase Auth Token Endpoint
    await page.route('**/auth/v1/token?grant_type=password', async route => {
        const json = {
            access_token: 'fake-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'fake-refresh-token',
            user: {
                id: 'user-123',
                aud: 'authenticated',
                role: 'authenticated',
                email: 'test@example.com',
            },
        };
        await route.fulfill({ json });
    });

    // Mock Supabase User Endpoint
    await page.route('**/auth/v1/user', async route => {
        const json = {
            id: 'user-123',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com',
        };
        await route.fulfill({ json });
    });

    // Mock User Active Empresa
    await page.route('**/rest/v1/user_active_empresa*', async route => {
        await route.fulfill({
            json: { empresa_id: 'empresa-1' }
        });
    });

    // Mock Empresa Usuarios
    await page.route('**/rest/v1/empresa_usuarios*', async route => {
        const url = new URL(route.request().url());
        const select = url.searchParams.get('select') || '';

        // useEmpresaRole() faz `.select('role')...maybeSingle()` e espera OBJETO.
        if (select === 'role' || select.includes('role')) {
          await route.fulfill({ json: { role: 'member' } });
          return;
        }

        // useEmpresas() lista empresas do usuário e espera ARRAY.
        await route.fulfill({
          json: [
            {
              role: 'member',
              empresa: {
                id: 'empresa-1',
                nome_razao_social: 'Empresa Teste E2E',
                nome_fantasia: 'Fantasia E2E',
                cnpj: '00000000000191',
                endereco_logradouro: 'Rua Teste',
                telefone: '11999999999',
              },
            },
          ],
        });
    });

    // Mock Products List RPC
    await page.route('**/rest/v1/rpc/produtos_list_for_current_user', async route => {
        await route.fulfill({
            json: [
                {
                    id: 'prod-1',
                    nome: 'Produto E2E',
                    sku: 'SKU-E2E',
                    preco_venda: 100,
                    status: 'ativo'
                }
            ]
        });
    });

    // Mock Products Count RPC
    await page.route('**/rest/v1/rpc/produtos_count_for_current_user', async route => {
        await route.fulfill({ json: 1 });
    });

    // Go to login page
    await page.goto('/auth/login');

    // Fill login form
    await page.getByPlaceholder('seu@email.com').fill('test@example.com');
    await page.getByLabel('Senha').fill('password123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Expect to be redirected to the app
    // Mock Subscriptions
    await page.route('**/rest/v1/subscriptions*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'sub_123',
                empresa_id: 'empresa-1',
                status: 'active',
                current_period_end: new Date(Date.now() + 86400000).toISOString(),
                stripe_price_id: 'price_123'
            })
        });
    });

    // Mock Plans (if needed by SubscriptionProvider)
    await page.route('**/rest/v1/plans*', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 'plan_123',
                name: 'Pro',
                stripe_price_id: 'price_123'
            })
        });
    });

    // Wait for login to complete and redirect to app
    await expect(page).toHaveURL(/\/app/);

    // Go to products page directly (simulating deep link or navigation after login)
    await page.goto('/app/products');

    // Wait for network to settle
    await page.waitForLoadState('networkidle');

    // Debug: Dump HTML
    const content = await page.content();
    console.log('PAGE CONTENT DUMP:', content);

    // Check if the active company is loaded
    await expect(page.getByText('Fantasia E2E')).toBeVisible();

    // Check if the mocked product is visible
    await expect(page.getByText('Produto E2E')).toBeVisible();
});
