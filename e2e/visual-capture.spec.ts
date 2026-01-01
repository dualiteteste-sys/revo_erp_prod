import { test, expect } from './fixtures';
import fs from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

test('QA+-02: captura visual (artefatos) — landing + login', async ({ page }) => {
  const outDir = path.join(process.cwd(), 'test-results', 'visual');
  await ensureDir(outDir);

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'REVO ERP', exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'landing.png'), fullPage: true });

  await page.goto('/auth/login');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'login.png'), fullPage: true });
});
