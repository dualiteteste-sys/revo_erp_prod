import { test, expect } from './fixtures';

test('Portal de Contrato: carrega documento e registra aceite', async ({ page }) => {
  // Evita chamadas não mapeadas ao Supabase real (estabiliza no CI).
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: [] });
  });

  // Mocks específicos precisam ser registrados DEPOIS do fallback para terem prioridade.
  await page.route(/.*\/rest\/v1\/rpc\/servicos_contratos_portal_get.*/, async (route) => {
    await route.fulfill({
      json: {
        documento: {
          id: 'doc-1',
          titulo: 'Contrato de Prestação de Serviços — Cliente E2E',
          corpo: 'Conteúdo do contrato.\n\nAssine abaixo.',
          expires_at: null,
          revoked_at: null,
          accepted_at: null,
          accepted_nome: null,
          accepted_email: null,
          created_at: new Date().toISOString(),
        },
        contrato: {
          id: 'ctr-1',
          numero: '0001',
          descricao: 'Suporte mensal',
          status: 'ativo',
          valor_mensal: 120,
          data_inicio: '2026-01-01',
          data_fim: null,
        },
        cliente: {
          id: 'cli-1',
          nome: 'Cliente E2E',
          email: 'cliente@example.com',
        },
      },
    });
  });

  await page.route(/.*\/rest\/v1\/rpc\/servicos_contratos_portal_accept.*/, async (route) => {
    await route.fulfill({
      json: {
        accepted_at: new Date().toISOString(),
      },
    });
  });

  await page.goto('/portal/contrato/tok_123');
  await expect(page.getByText('Contrato de Serviços')).toBeVisible();
  await expect(page.getByText('Contrato de Prestação de Serviços — Cliente E2E')).toBeVisible();
  await expect(page.getByText('Conteúdo do contrato.')).toBeVisible();

  await expect(page.getByLabel('Nome')).toHaveValue('Cliente E2E');
  await expect(page.getByLabel('E-mail')).toHaveValue('cliente@example.com');

  await page.getByRole('button', { name: 'Aceitar contrato' }).click();
  await expect(page.getByText('Aceite registrado com sucesso.')).toBeVisible();

  // Após aceite, botão fica desabilitado e muda texto.
  await expect(page.getByRole('button', { name: 'Já aceito' })).toBeDisabled();
});
