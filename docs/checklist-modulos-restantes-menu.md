# Checklist (próxima fase): módulos faltantes no menu

Este checklist existe para fechar as “pontas soltas” do menu: itens que hoje aparecem (ou deveriam aparecer) mas **não têm módulo implementado** (ou estão sem rota) e, por isso, podem gerar fricção/links “mortos”.

> Fonte técnica: `src/config/menuConfig.ts` (itens com `href: '#'`) + rotas em `src/routes/app.routes.tsx`.

## 0) Regra de decisão (pra cada item)

Para cada item abaixo, escolha **uma** estratégia:
- **Implementar MVP** (página + dados mínimos + RBAC) para poder lançar com ele ativo, **ou**
- **Ocultar** (feature flag/plan guard) e deixar “Em breve” só quando necessário, **ou**
- **Remover do menu** (temporário) até existir.

## 1) Cadastros

- [ ] CAD-01 Vendedores (`/app/cadastros/vendedores`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).

## 2) Vendas

- [ ] VEN-01 Propostas Comerciais (`/app/vendas/propostas`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-02 PDV (`/app/vendas/pdv`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-03 Expedição (`/app/vendas/expedicao`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-04 Comissões (`/app/vendas/comissoes`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-05 Painel de Automações (`/app/vendas/automacoes`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-06 Devolução de Venda (`/app/vendas/devolucoes`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] VEN-07 Relatórios de Vendas (`/app/vendas/relatorios`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).

## 3) Serviços

- [ ] SRV-01 Contratos (`/app/servicos/contratos`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] SRV-02 Notas de Serviço (`/app/servicos/notas`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] SRV-03 Cobranças (serviços) (`/app/servicos/cobrancas`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).

## 4) Configurações e Suporte

- [ ] CFG-05 Menu “Configurações” deve navegar para `'/app/configuracoes'` (hoje está `href: '#'`, mas a rota existe em `src/routes/app.routes.tsx`).
- [ ] SUP-01 Página “Suporte” (`/app/suporte`): implementar ou ocultar/remover do menu (hoje está `href: '#'`).
- [ ] SUP-02 “Sair” (logout): confirmar que o item do menu executa logout (não precisa rota; hoje está `href: '#'`).

## 5) Higiene final do menu (anti-bug)

- [ ] MENU-01 Nenhum item clicável com `href: '#'` sem handler (evitar “cliques mortos”).
- [ ] MENU-02 Itens ocultados devem estar alinhados com RBAC/PlanGuard (não aparecer no menu se o usuário não tem permissão).
- [ ] MENU-03 Rodar varredura de console em PROD e DEV após ajustes do menu (sem erros de rota/React Router).

