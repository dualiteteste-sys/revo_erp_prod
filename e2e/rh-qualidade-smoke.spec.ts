import { test, expect, type Page } from './fixtures';

async function mockAuthAndEmpresa(page: Page) {
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
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
      },
    });
  });

  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      json: {
        id: 'user-123',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  await page.route('**/rest/v1/user_active_empresa*', async (route) => {
    await route.fulfill({ json: { empresa_id: 'empresa-1' } });
  });

  await page.route('**/rest/v1/empresa_usuarios*', async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get('select') || '';

    if (select === 'role' || select.includes('role')) {
      await route.fulfill({ json: { role: 'member' } });
      return;
    }

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

  await page.route('**/rest/v1/subscriptions*', async (route) => {
    await route.fulfill({
      json: {
        id: 'sub_123',
        empresa_id: 'empresa-1',
        status: 'active',
        current_period_end: new Date(Date.now() + 86400000).toISOString(),
        stripe_price_id: 'price_123',
      },
    });
  });

  await page.route('**/rest/v1/plans*', async (route) => {
    await route.fulfill({
      json: {
        id: 'plan_123',
        name: 'Pro',
        stripe_price_id: 'price_123',
      },
    });
  });
}

test('RH & Qualidade: navegação e render sem erros de console', async ({ page }) => {
  // Fallback: evita chamadas não mapeadas ao Supabase real.
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await mockAuthAndEmpresa(page);

  // RH: dashboard
  await page.route('**/rest/v1/rpc/rh_get_dashboard_stats', async (route) => {
    await route.fulfill({
      json: {
        total_colaboradores: 2,
        total_cargos: 1,
        gaps_identificados: 1,
        treinamentos_concluidos: 0,
        investimento_treinamento: 0,
        top_gaps: [{ nome: 'Leitura e Interpretação', total_gaps: 1 }],
        status_treinamentos: [{ status: 'planejado', total: 1 }],
      },
    });
  });

  // RH: colaboradores
  await page.route('**/rest/v1/rpc/rh_list_colaboradores', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'colab-1',
          nome: 'Ana Silva',
          email: 'ana@exemplo.com',
          documento: null,
          data_admissao: '2025-01-01',
          cargo_id: 'cargo-1',
          cargo_nome: 'Operador',
          ativo: true,
          total_competencias_avaliadas: 0,
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/rh_get_colaborador_details', async (route) => {
    await route.fulfill({
      json: {
        id: 'colab-1',
        nome: 'Ana Silva',
        email: 'ana@exemplo.com',
        documento: null,
        data_admissao: '2025-01-01',
        cargo_id: 'cargo-1',
        cargo_nome: 'Operador',
        ativo: true,
        competencias: [],
      },
    });
  });

  // RH: cargos
  await page.route('**/rest/v1/rpc/rh_list_cargos', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'cargo-1',
          nome: 'Operador',
          descricao: 'Opera máquina',
          responsabilidades: null,
          autoridades: null,
          setor: 'Produção',
          ativo: true,
          total_colaboradores: 1,
          total_competencias: 0,
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/rh_get_cargo_details', async (route) => {
    await route.fulfill({
      json: {
        id: 'cargo-1',
        nome: 'Operador',
        descricao: 'Opera máquina',
        responsabilidades: null,
        autoridades: null,
        setor: 'Produção',
        ativo: true,
        competencias: [],
      },
    });
  });

  // RH: competências
  await page.route('**/rest/v1/rpc/rh_list_competencias', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'comp-1',
          nome: 'Leitura e Interpretação',
          descricao: 'Interpretação de desenho',
          tipo: 'tecnica',
          critico_sgq: true,
          ativo: true,
        },
      ],
    });
  });

  // RH: matriz
  await page.route('**/rest/v1/rpc/rh_get_competency_matrix', async (route) => {
    await route.fulfill({
      json: [
        {
          colaborador_id: 'colab-1',
          colaborador_nome: 'Ana Silva',
          cargo_nome: 'Operador',
          competencias: [
            {
              id: 'comp-1',
              nome: 'Leitura e Interpretação',
              tipo: 'tecnica',
              nivel_requerido: 2,
              nivel_atual: 1,
              gap: -1,
              obrigatorio: true,
            },
          ],
        },
      ],
    });
  });

  // RH: treinamentos
  await page.route('**/rest/v1/rpc/rh_list_treinamentos', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'treino-1',
          nome: 'Integração',
          tipo: 'interno',
          status: 'planejado',
          data_inicio: '2026-01-01',
          instrutor: 'RH',
          total_participantes: 1,
        },
      ],
    });
  });
  await page.route('**/rest/v1/rpc/rh_get_treinamento_details', async (route) => {
    await route.fulfill({
      json: {
        id: 'treino-1',
        empresa_id: 'empresa-1',
        nome: 'Integração',
        descricao: null,
        tipo: 'interno',
        status: 'planejado',
        data_inicio: '2026-01-01',
        data_fim: null,
        carga_horaria_horas: null,
        instrutor: 'RH',
        localizacao: null,
        custo_estimado: null,
        custo_real: null,
        objetivo: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        participantes: [],
      },
    });
  });

  // Qualidade: motivos
  await page.route('**/rest/v1/rpc/qualidade_get_motivos', async (route) => {
    await route.fulfill({
      json: [
        { id: 'mot-1', codigo: 'DIM-01', descricao: 'Dimensão fora da tolerância', tipo: 'refugo' },
      ],
    });
  });

  // Qualidade: planos de inspeção
  await page.route('**/rest/v1/rpc/qualidade_planos_list', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'plano-1',
          nome: 'Plano IP - Produto A',
          tipo: 'ip',
          produto_id: 'prod-1',
          produto_nome: 'Produto A',
          roteiro_nome: null,
          etapa_nome: null,
          ativo: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
  });

  // Qualidade: lotes
  await page.route('**/rest/v1/rpc/qualidade_list_lotes', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'lote-1',
          produto_id: 'prod-1',
          produto_nome: 'Produto A',
          lote: 'L001',
          validade: null,
          saldo: 10,
          status_qa: 'em_analise',
          ultima_inspecao_data: null,
          ultima_inspecao_tipo: null,
          ultima_inspecao_resultado: null,
        },
      ],
    });
  });

  await page.goto('/auth/login');
  await page.getByPlaceholder('seu@email.com').fill('test@example.com');
  await page.getByLabel('Senha').fill('password123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app\//);

  await page.goto('/app/rh/dashboard');
  await expect(page.getByText('Dashboard RH & Qualidade')).toBeVisible();

  await page.goto('/app/rh/colaboradores');
  await expect(page.getByText('Colaboradores')).toBeVisible();
  await expect(page.getByText('Ana Silva')).toBeVisible();

  await page.goto('/app/rh/cargos');
  await expect(page.getByText('Cargos e Funções')).toBeVisible();
  await expect(page.getByText('Operador')).toBeVisible();

  await page.goto('/app/rh/competencias');
  await expect(page.getByText('Banco de Competências')).toBeVisible();
  await expect(page.getByText('Leitura e Interpretação')).toBeVisible();

  await page.goto('/app/rh/matriz');
  await expect(page.getByText('Matriz de Competências')).toBeVisible();
  await expect(page.getByText('Ana Silva')).toBeVisible();

  await page.goto('/app/rh/treinamentos');
  await expect(page.getByText('Treinamentos e Desenvolvimento')).toBeVisible();
  await expect(page.getByText('Integração')).toBeVisible();

  await page.goto('/app/industria/qualidade/motivos');
  await expect(page.getByText('Motivos de Qualidade')).toBeVisible();
  await expect(page.getByText('DIM-01')).toBeVisible();

  await page.goto('/app/industria/qualidade/planos');
  await expect(page.getByText('Planos de Inspeção')).toBeVisible();
  await expect(page.getByText('Plano IP - Produto A')).toBeVisible();

  await page.goto('/app/industria/qualidade/lotes');
  await expect(page.getByText('Lotes & Bloqueios')).toBeVisible();
  await expect(page.getByText('L001')).toBeVisible();
});

