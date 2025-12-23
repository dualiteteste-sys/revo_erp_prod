import { test, expect } from './fixtures';

const email = process.env.E2E_USER;
const password = process.env.E2E_PASS;

test.describe('Smoke template (real, no mocks)', () => {
  test.skip(!email || !password, 'Set E2E_USER and E2E_PASS to run this test.');

  test('feature smoke flow', async ({ page }) => {
    // 1) Login
    await page.goto('/auth/login');
    await page.getByPlaceholder('seu@email.com').fill(email as string);
    await page.getByLabel('Senha').fill(password as string);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app/);

    // 2) Navegar para o recurso (ajuste aqui)
    await page.goto('/app/industria/ordens?tipo=beneficiamento');

    // 3) Verificação mínima de carregamento (ajuste aqui)
    await expect(page.getByRole('button', { name: 'Nova Ordem' })).toBeVisible();

    // 4) Executar ação principal (ajuste aqui)
    await page.getByRole('button', { name: 'Nova Ordem' }).click();
    await expect(page.getByText('Nova Ordem')).toBeVisible();
  });
});
