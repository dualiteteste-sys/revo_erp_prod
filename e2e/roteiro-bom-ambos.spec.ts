import { test, expect } from './fixtures';

const email = process.env.E2E_USER;
const password = process.env.E2E_PASS;

test.describe('Roteiro/BOM: tipo "Ambos"', () => {
  test.skip(!email || !password, 'Set E2E_USER and E2E_PASS to run this test.');

  test('abrir modais e validar opção "Ambos" nos formulários', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('seu@email.com').fill(email as string);
    await page.getByLabel('Senha').fill(password as string);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/app/);

    await page.goto('/app/industria/roteiros');
    await expect(page.getByRole('button', { name: 'Novo Roteiro' })).toBeVisible();
    await page.getByRole('button', { name: 'Novo Roteiro' }).click();
    await expect(page.getByLabel('Utilizar em')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ambos' })).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.goto('/app/industria/boms');
    await expect(page.getByRole('button', { name: 'Nova Ficha Técnica' })).toBeVisible();
    await page.getByRole('button', { name: 'Nova Ficha Técnica' }).click();
    await expect(page.getByLabel('Utilizar em')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ambos' })).toBeVisible();
  });
});
