/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import path from 'node:path'

import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ command, mode }) => ({
  ...(command === 'build' && mode === 'production'
    ? (() => {
        const env = loadEnv(mode, process.cwd(), '');
        const missing: string[] = [];
        if (!String(env.VITE_SUPABASE_URL ?? '').trim()) missing.push('VITE_SUPABASE_URL');
        if (!String(env.VITE_SUPABASE_ANON_KEY ?? '').trim()) missing.push('VITE_SUPABASE_ANON_KEY');
        if (missing.length) {
          throw new Error(`Missing required env vars for production build: ${missing.join(', ')}`);
        }
        return {};
      })()
    : {}),
  plugins: [
    react(),
    // Sentry plugin can slow down local/test workflows; keep it only for production builds.
    command === 'build' &&
      mode === 'production' &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: (() => {
      const base = ['**/node_modules/**', '**/dist/**', '**/e2e/**'];
      // Quando executamos testes dentro de um worktree, o path absoluto contém `.worktrees/`,
      // então o glob `**/.worktrees/**` excluiria TODO o projeto. Mantemos a exclusão apenas
      // quando rodando no root do repo, para evitar duplicar trabalho ao ter múltiplos worktrees.
      const configDir = fileURLToPath(new URL('.', import.meta.url));
      const isInsideWorktree = configDir.includes(`${path.sep}.worktrees${path.sep}`);
      return isInsideWorktree ? base : [...base, '**/.worktrees/**'];
    })(),
    testTimeout: 15000,
    hookTimeout: 15000,
  },
}))
