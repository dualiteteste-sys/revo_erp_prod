# Guia de Diagnóstico e Solução de Problemas com Git e GitHub

Este guia fornece um passo a passo detalhado para diagnosticar e resolver os problemas mais comuns ao tentar enviar (`push`) alterações de um projeto local para um repositório remoto no GitHub.

---

### Passo 1: Verifique o Status do Repositório Local

O primeiro comando a ser executado é sempre o `git status`. Ele mostra a situação atual do seu repositório local e informa o que o Git está "vendo".

```shell
git status
```

**Como interpretar o resultado:**

*   **"Changes not staged for commit" (em vermelho):** Você tem arquivos modificados, mas eles ainda não foram preparados para o próximo commit.
    *   **Ação:** Use `git add <arquivo>` ou `git add .` para prepará-los.
*   **"Changes to be committed" (em verde):** Os arquivos estão preparados ("staged") e prontos para serem commitados.
    *   **Ação:** Prossiga para o `git commit`.
*   **"Untracked files" (em vermelho):** Existem arquivos novos no seu projeto que o Git ainda não está rastreando.
    *   **Ação:** Se devem ser versionados, use `git add <arquivo>`. Se não, adicione-os ao `.gitignore`.
*   **"nothing to commit, working tree clean":** Tudo está em dia. Não há alterações para enviar. Se você acha que deveria haver, verifique se salvou seus arquivos no editor de código.

---

### Passo 2: Analise o Arquivo `.gitignore`

Este arquivo é crucial para evitar que arquivos desnecessários ou sensíveis (como senhas) sejam enviados para o repositório.

**Verifique se seu `.gitignore` inclui, no mínimo:**

```
# Dependências
/node_modules

# Arquivos de build
/dist
/build

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Arquivos de ambiente
.env
.env.local
.env.*.local

# Arquivos de sistema
.DS_Store
Thumbs.db
```

**Problema comum:** Se você já commitou um arquivo que deveria ter sido ignorado (como `.env`), você precisa removê-lo do cache do Git:

```shell
# Remove o arquivo do rastreamento do Git, mas o mantém no seu disco local
git rm --cached .env
# Adiciona o .gitignore atualizado
git add .gitignore
# Cria um commit para registrar a remoção
git commit -m "fix: para de rastrear arquivo .env"
```

---

### Passo 3: Adicione e Commite as Alterações Corretamente

Esta é a sequência padrão para registrar um "snapshot" das suas alterações.

1.  **Adicione todos os arquivos modificados e novos ao "stage":**

    ```shell
    git add .
    ```

2.  **Crie um commit com uma mensagem clara e padronizada:**

    Use o padrão "Conventional Commits". Isso torna o histórico mais legível.

    ```shell
    # Exemplo para uma nova funcionalidade
    git commit -m "feat: implementa formulário de cadastro de produtos"

    # Exemplo para uma correção de bug
    git commit -m "fix: corrige validação de e-mail no login"
    ```

---

### Passo 4: Verifique a Configuração do Repositório Remoto e do Branch

Antes de enviar, confirme para onde você está enviando.

1.  **Verifique os repositórios remotos configurados:**

    ```shell
    git remote -v
    ```

    O resultado deve mostrar as URLs de `fetch` (buscar) e `push` (enviar) para o `origin`, que geralmente aponta para seu repositório no GitHub.

    ```
    origin  git@github.com:seu-usuario/seu-repositorio.git (fetch)
    origin  git@github.com:seu-usuario/seu-repositorio.git (push)
    ```

2.  **Verifique em qual branch você está trabalhando:**

    ```shell
    git branch
    ```

    O branch atual será destacado com um asterisco (`*`). Ex: `* main`.

---

### Passo 5: Envie as Alterações (`git push`) e Solucione Erros

Este é o comando que envia seus commits locais para o repositório remoto.

```shell
git push origin <nome-do-branch>

# Exemplo:
git push origin main
```

**Erros Comuns e Suas Soluções:**

*   **Erro de Autenticação (`Authentication failed`):**
    *   **Causa:** Sua máquina não conseguiu se autenticar no GitHub. O uso de senhas foi descontinuado.
    *   **Solução:** Configure um **Personal Access Token (PAT)** no GitHub e use-o no lugar da sua senha, ou configure uma **chave SSH**. A chave SSH é o método mais seguro e recomendado.

*   **Históricos Divergentes (`! [rejected] ... error: failed to push some refs ...`):**
    *   **Causa:** Alguém enviou alterações para o mesmo branch enquanto você trabalhava localmente. Seus históricos estão diferentes.
    *   **Solução:** Primeiro, puxe as alterações remotas e aplique as suas por cima com `--rebase`. Isso mantém o histórico linear e limpo.

    ```shell
    # Puxa as alterações do repositório remoto e reaplica seus commits locais no topo
    git pull --rebase origin <nome-do-branch>
    ```

    Após o `pull --rebase`, pode ser necessário resolver conflitos. Depois de resolvidos, tente o `git push` novamente.

*   **Branch Remoto Não Encontrado (`src refspec <nome-do-branch> does not match any`):**
    *   **Causa:** Você está tentando enviar para um branch que não existe no repositório remoto, ou digitou o nome errado.
    *   **Solução:** Se for um branch novo, use o comando `--set-upstream` (ou `-u`) para criar o branch no repositório remoto e vincular seu branch local a ele.

    ```shell
    git push --set-upstream origin <nome-do-branch-novo>
    ```

---

### Passo 6: Sequência Completa de Comandos (Resumo)

Aqui está uma sequência completa que você pode seguir para garantir um envio bem-sucedido:

```shell
# 1. Verifique o que foi alterado
git status

# 2. Adicione todas as alterações ao stage
git add .

# 3. Crie um commit com uma mensagem clara
git commit -m "feat: adiciona guia de diagnóstico do Git"

# 4. Sincronize com o repositório remoto para evitar conflitos
# O --rebase é uma boa prática para manter o histórico limpo
git pull --rebase origin main

# 5. Envie seus commits para o GitHub
git push origin main
```

Seguindo estes passos, você poderá diagnosticar e resolver a grande maioria dos problemas ao enviar seu código.
