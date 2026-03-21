# Validacao Antigravity — Revo ERP

> Leia este arquivo e execute os passos abaixo no browser.
> Apos concluir, reporte o resultado no formato indicado.

## Contexto

PR de performance e UX:
1. Charts do dashboard agora usam `useMemo` + `React.memo` (menos re-renders)
2. Hooks de lista (produtos, parceiros, tesouraria) agora tem `staleTime` (menos API calls)
3. Animacoes de charts reduzidas de 2s para 800ms
4. "Criar novo fornecedor/cliente" dentro de "Criar conta igual" agora abre SideSheet (nao modal atras)

## Credenciais

- URL: http://localhost:5173/auth/login
- Email: teste60@revosp.com.br
- Senha: Cristo@158

## Passos

### Teste 1: Dashboard carrega sem erro
1. Apos login, navegar para o Dashboard principal
2. Verificar que os graficos carregam normalmente (sem tela branca ou erro)
3. Observar que as animacoes sao mais rapidas (~800ms)

### Teste 2: Produtos e Parceiros carregam
1. Navegar para Cadastros > Produtos
2. Verificar que a lista carrega
3. Navegar para Cadastros > Parceiros
4. Verificar que a lista carrega
5. Voltar para Produtos — deve carregar instantaneamente (cache de 5 min)

### Teste 3: Tesouraria funciona
1. Navegar para Financeiro > Tesouraria
2. Selecionar uma conta corrente
3. Verificar que movimentacoes carregam

### Teste 4: Criar conta igual (SideSheet fix)
1. Na Tesouraria, ir para a aba Conciliacao
2. Selecionar um item do extrato bancario (debito)
3. Clicar em "Criar conta igual"
4. No SideSheet "Criar Conta a Pagar":
   a. No campo Fornecedor, digitar um nome que NAO existe (ex: "TesteAntigravity123")
   b. Clicar em "+ Criar novo fornecedor"
   c. Verificar que abre um SEGUNDO SideSheet (mais estreito, 720px) por cima do primeiro
   d. O campo Nome deve vir preenchido com "TesteAntigravity123"
   e. Preencher CNPJ: 00.000.000/0001-00, clicar Salvar
   f. Verificar que o SideSheet do fornecedor fecha e o nome aparece selecionado no campo Fornecedor
5. Cancelar o SideSheet de conta a pagar (nao precisa salvar a conta)

### Teste 5: Criar conta igual (credito)
1. Selecionar um item do extrato bancario tipo CREDITO
2. Clicar em "Criar conta igual"
3. Verificar que abre "Criar Conta a Receber" (nao "a Pagar")
4. Cancelar

## Formato de Relatorio

```
## Resultado da Validacao

| Teste | Status | Observacao |
|-------|--------|------------|
| 1. Dashboard | OK/FALHA | ... |
| 2. Produtos/Parceiros | OK/FALHA | ... |
| 3. Tesouraria | OK/FALHA | ... |
| 4. Criar conta + fornecedor | OK/FALHA | ... |
| 5. Criar conta (credito) | OK/FALHA | ... |

### Bugs encontrados
- (listar se houver)

### Screenshots
- (anexar se relevante)
```
