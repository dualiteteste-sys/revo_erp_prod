module.exports = {
  ci: {
    collect: {
      startServerCommand: 'yarn preview --host 127.0.0.1 --port 4173 --strictPort',
      startServerReadyPattern: 'Local:',
      url: ['http://127.0.0.1:4173/', 'http://127.0.0.1:4173/auth/login'],
      numberOfRuns: 1,
      settings: {
        chromeFlags: ['--no-sandbox', '--headless=new'],
      },
    },
    assert: {
      assertions: {
        // Baseline CI: calibrado no estado atual do bundle/SSR-less. Podemos subir esse budget progressivamente.
        'categories:performance': ['error', { minScore: 0.55 }],
        'categories:accessibility': ['error', { minScore: 0.85 }],
        'categories:best-practices': ['error', { minScore: 0.85 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
