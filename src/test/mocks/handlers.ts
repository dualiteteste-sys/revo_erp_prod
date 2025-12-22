import { http, HttpResponse, passthrough } from 'msw';
import { supabaseUrl } from '../../lib/supabaseClient';

export const handlers = [
    // Mock RPC calls
    http.post(`${supabaseUrl}/rest/v1/rpc/:functionName`, async ({ params, request }) => {
        const { functionName } = params;
        const body = await request.json() as any;

        console.log(`[MSW] Intercepted RPC: ${functionName}`, body);

        if (functionName === 'produtos_list_for_current_user') {
            return HttpResponse.json([
                {
                    id: 'prod-1',
                    nome: 'Produto Teste 1',
                    sku: 'SKU-001',
                    status: 'ativo',
                    preco_venda: 100.0,
                    unidade: 'UN',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    id: 'prod-2',
                    nome: 'Produto Teste 2',
                    sku: 'SKU-002',
                    status: 'inativo',
                    preco_venda: 50.0,
                    unidade: 'KG',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ]);
        }

        if (functionName === 'produtos_count_for_current_user') {
            return HttpResponse.json(2);
        }

        if (functionName === 'secure_bootstrap_empresa_for_current_user') {
            return HttpResponse.json([
                { empresa_id: 'empresa-1', status: 'created_new' }
            ]);
        }

        if (functionName === 'set_active_empresa_for_current_user') {
            return HttpResponse.json(null); // Void return
        }

        if (functionName === 'whoami') {
            return HttpResponse.json({
                user_id: 'user-123',
                email: 'test@example.com'
            });
        }

        if (functionName === 'current_empresa_role') {
            return HttpResponse.json('owner');
        }

        // Default fallback for unhandled RPCs
        return HttpResponse.json({ error: `Unhandled RPC: ${functionName}` }, { status: 500 });
    }),

    // Mock Table Selects (e.g. user_active_empresa)
    http.get(`${supabaseUrl}/rest/v1/user_active_empresa`, ({ request }) => {
        console.log('[MSW] GET user_active_empresa', request.url);
        return HttpResponse.json({
            empresa_id: 'empresa-1'
        });
    }),

    http.get(`${supabaseUrl}/rest/v1/empresa_usuarios`, ({ request }) => {
        console.log('[MSW] GET empresa_usuarios', request.url);
        return HttpResponse.json([
            {
                role: 'owner',
                empresa: {
                    id: 'empresa-1',
                    razao_social: 'Empresa Teste',
                    fantasia: 'Fantasia Teste',
                    cnpj: '00000000000191'
                }
            }
        ]);
    }),

    // Auth endpoints
    http.post(`${supabaseUrl}/auth/v1/token`, ({ request }) => {
        console.log('[MSW] POST token', request.url);
        return HttpResponse.json({
            access_token: 'fake-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'fake-refresh-token',
            user: {
                id: 'user-123',
                email: 'test@example.com'
            }
        });
    }),

    http.get(`${supabaseUrl}/auth/v1/user`, () => {
        return HttpResponse.json({
            id: 'user-123',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com'
        });
    }),

    // Catch-all for debugging
    http.all('*', async ({ request }) => {
        console.log('[MSW] Unhandled request:', request.method, request.url);
        return passthrough();
    }),
];
