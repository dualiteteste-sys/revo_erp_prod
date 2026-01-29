/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ command, mode }) => ({
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
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
}))
