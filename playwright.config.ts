import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const shouldUseWebServer = !process.env.PLAYWRIGHT_BASE_URL;

function envFileHasViteSupabaseKeys(): boolean {
  const root = process.cwd();
  const candidates = ['.env.local', '.env'].map((f) => path.join(root, f));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/\bVITE_SUPABASE_URL\s*=/.test(text) && /\bVITE_SUPABASE_ANON_KEY\s*=/.test(text)) return true;
  }
  return false;
}

function portFromBaseUrl(url: string): number {
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // ignore
  }
  return 5173;
}

// Não "repassar" VITE_* explicitamente na linha de comando:
// - quando o env não está setado, isso sobrescreve `.env.local` com string vazia e quebra os E2E locais.
// - no CI, os `VITE_*` já são fornecidos via `env:` do job.
const shouldInjectViteSupabaseEnv =
  !process.env.VITE_SUPABASE_URL &&
  !process.env.VITE_SUPABASE_ANON_KEY &&
  !envFileHasViteSupabaseKeys();

// Local convenience: if no Supabase env is provided at all, inject safe placeholders so the app can boot
// and Playwright can stub network calls. This is skipped when `.env(.local)` already defines the keys.
const viteEnvPrefix = shouldInjectViteSupabaseEnv
  ? 'VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=e2e_dummy '
  : '';

// Prefer `preview` for e2e stability (no HMR websocket / file watching flake).
// Build uses injected VITE_* placeholders when local env isn't configured.
const port = portFromBaseUrl(baseURL);
const webServerCommand = `${viteEnvPrefix}yarn build && ${viteEnvPrefix}yarn preview --host 127.0.0.1 --port ${port} --strictPort`;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // CI must never hang indefinitely; prefer failing fast over burning 1h+ runner time.
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    // HTML reporter is great locally; in CI we want real-time progress and clearer "last test".
    reporter: process.env.CI ? 'line' : 'html',
    // Ensure any accidental waits don't keep the runner alive for hours.
    timeout: process.env.CI ? 60_000 : 30_000,
    expect: {
        timeout: process.env.CI ? 10_000 : 5_000,
    },
    use: {
        baseURL,
        trace: 'on-first-retry',
        // Avoid indefinite hangs caused by missing timeouts in helpers.
        actionTimeout: process.env.CI ? 20_000 : 0,
        navigationTimeout: process.env.CI ? 30_000 : 0,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // {
        //   name: 'firefox',
        //   use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //   name: 'webkit',
        //   use: { ...devices['Desktop Safari'] },
        // },
    ],

    /* Run your local dev server before starting the tests */
    webServer: shouldUseWebServer
      ? {
          command: webServerCommand,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        }
      : undefined,
});
