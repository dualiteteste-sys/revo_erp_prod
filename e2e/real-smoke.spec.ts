import { test, expect } from './fixtures';

const email = process.env.E2E_USER;
const password = process.env.E2E_PASS;

test.describe('Real smoke (no mocks)', () => {
  test.skip(!email || !password, 'Set E2E_USER and E2E_PASS to run this test.');

  test('login and open Beneficiamento wizard', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('seu@email.com').fill(email as string);
    await page.getByLabel('Senha').fill(password as string);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/app/);

    await page.goto('/app/industria/ordens?tipo=beneficiamento');
    await expect(page.getByRole('button', { name: 'Nova Ordem' })).toBeVisible();
    await page.getByRole('button', { name: 'Nova Ordem' }).click();

    await expect(page.getByText('Nova Ordem de Beneficiamento')).toBeVisible();
    await expect(page.getByText('Material do Cliente')).toBeVisible();
  });
});
