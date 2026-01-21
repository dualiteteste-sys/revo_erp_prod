import { test, expect } from './fixtures';

test('RG-06: landing pública (sem sessão) funciona', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Experimente nossa versão beta por 2 meses grátis.' })).toBeVisible();
  await expect(page).not.toHaveURL(/\/app(\/|$)/);
  await expect(page).not.toHaveURL(/\/auth\/login/);
});
