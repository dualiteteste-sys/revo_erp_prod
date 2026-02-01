import { http, HttpResponse } from 'msw';
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

        if (functionName === 'empresas_list_for_current_user') {
            return HttpResponse.json([
                {
                    id: 'empresa-1',
                    nome: 'Empresa Teste',
                    razao_social: 'Empresa Teste',
                    fantasia: 'Fantasia Teste',
                    nome_razao_social: 'Empresa Teste',
                    cnpj: '00000000000191',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
            ]);
        }

        if (functionName === 'active_empresa_get_for_current_user') {
            return HttpResponse.json('empresa-1');
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

        if (functionName === 'empresa_features_get') {
            return HttpResponse.json([
                {
                    revo_send_enabled: true,
                    nfe_emissao_enabled: true,
                    plano_mvp: 'ambos',
                    max_users: 999,
                    max_nfe_monthly: 999,
                    servicos_enabled: true,
                    industria_enabled: true,
                    updated_at: new Date().toISOString(),
                }
            ]);
        }

        if (functionName === 'empresa_features_set') {
            // Best-effort merge para simular update.
            const patch = (body?.p_patch ?? {}) as any;
            return HttpResponse.json([
                {
                    revo_send_enabled: patch.revo_send_enabled ?? true,
                    nfe_emissao_enabled: patch.nfe_emissao_enabled ?? true,
                    plano_mvp: patch.plano_mvp ?? 'ambos',
                    max_users: patch.max_users ?? 999,
                    max_nfe_monthly: patch.max_nfe_monthly ?? 999,
                    servicos_enabled: patch.servicos_enabled ?? true,
                    industria_enabled: patch.industria_enabled ?? true,
                    updated_at: new Date().toISOString(),
                }
            ]);
        }

        // Default fallback for unhandled RPCs
        return HttpResponse.json({ error: `Unhandled RPC: ${functionName}` }, { status: 500 });
    }),

    // Mock Table Selects (e.g. user_active_empresa)
    http.get(`${supabaseUrl}/rest/v1/user_active_empresa`, ({ request }) => {
        console.log('[MSW] GET user_active_empresa', request.url);
        // Supabase `select(...).limit(1)` retorna array de rows
        return HttpResponse.json([{ empresa_id: 'empresa-1' }]);
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

  http.get(`${supabaseUrl}/rest/v1/empresa_features`, ({ request }) => {
        console.log('[MSW] GET empresa_features', request.url);
        return HttpResponse.json({
            empresa_id: 'empresa-1',
            revo_send_enabled: false,
            nfe_emissao_enabled: false,
            plano_mvp: 'ambos',
            max_users: 999,
            servicos_enabled: true,
            industria_enabled: true,
        });
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

    // Catch-all: tests must never hit real network.
    http.all('*', async ({ request }) => {
        console.log('[MSW] Unhandled request:', request.method, request.url);
        return HttpResponse.json(
            { error: 'Unhandled request', method: request.method, url: request.url },
            { status: 500 }
        );
    }),
];
