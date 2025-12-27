# E2E Smoke Checklist (Novos Recursos)

Use este checklist para cada feature nova antes de finalizar:

- Fluxo principal abre sem erros de console (ver `e2e/fixtures.ts`).
- Login real funciona (use `E2E_USER` e `E2E_PASS`).
- Tela principal do recurso carrega com dados reais.
- Ação principal do recurso executa e gera feedback esperado (toast, modal, navegação).
- Voltar/fechar funciona e estado da UI permanece consistente.
- Se houver modais/menus, confirmar que não há clipping de layout.
- Se houver filtros/autocomplete, confirmar seleção e fechamento de lista.
- Se o recurso altera dados, validar persistência ao recarregar a página.

Rodar smoke real:
```
E2E_USER="..." E2E_PASS="..." npm run test:e2e -- e2e/real-smoke.spec.ts
```

## Release Gate (sem mocks)

Para validar o “ponto de lançamento” no CI, usamos um gate que falha em qualquer `console.error`/`pageerror`
(ver `e2e/fixtures.ts`).

- Gate completo: `yarn test:e2e:gate:all`
- Gate por plano:
  - Serviços: `yarn test:e2e:gate:servicos`
  - Indústria: `yarn test:e2e:gate:industria`

Adapte para cada feature criando um novo spec real usando o template abaixo.
