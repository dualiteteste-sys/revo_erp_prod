# Project Setup
    
    To run this project, follow these steps:
    
    1. Extract the zip file.
    2. Run `npm install` to install dependencies.
    3. Run `npm run dev` to start the development server.
    
    This project was generated through Alpha. For more information, visit [dualite.dev](https://dualite.dev).

## Deploy

Consulte `docs/deploy.md` para o checklist completo de deploy e sincronização de migrations com produção.

## Desenvolvimento local (sem Stripe)

Para testar o ERP localmente sem depender do checkout do Stripe (que costuma bloquear `localhost` quando não está configurado), existe um bypass **somente local/dev**:

1. No seu `.env.local` (ou `.env` do Vite), adicione:
   - `VITE_LOCAL_BILLING_BYPASS=true`
   - (opcional) `VITE_LOCAL_PLAN_SLUG=SCALE` (`ESSENCIAL|PRO|MAX|INDUSTRIA|SCALE`)
2. Reinicie o `yarn dev`.

Isso ativa uma assinatura “fake” apenas quando `import.meta.env.DEV` e `hostname` é `localhost/127.0.0.1`, liberando os módulos para testes sem Stripe.
