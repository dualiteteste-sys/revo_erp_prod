module.exports = {
  ci: {
    collect: {
      startServerCommand: 'yarn preview --host 127.0.0.1 --port 4173 --strictPort',
      startServerReadyPattern: '127\\.0\\.0\\.1:4173',
      startServerReadyTimeout: 30000,
      url: ['http://127.0.0.1:4173/', 'http://127.0.0.1:4173/auth/login'],
      numberOfRuns: 1,
      settings: {
        chromeFlags: ['--no-sandbox', '--headless=new'],
      },
    },
    assert: {
      assertions: {
        // Baseline CI: calibrado no estado atual do bundle/SSR-less. Podemos subir esse budget progressivamente.
        // OBS: performance no CI é sensível a variação de runner/network; manter um piso baixo e subir gradualmente.
        'categories:performance': ['error', { minScore: 0.45 }],
        'categories:accessibility': ['error', { minScore: 0.85 }],
        'categories:best-practices': ['error', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
