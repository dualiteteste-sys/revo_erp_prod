# Manual prático (não técnico) — Vídeos de Indústria (OP/OB)
Exemplo guia: **Parafuso sextavado 6mm x 20mm** (produção e beneficiamento).

> Objetivo deste manual: permitir que você grave vídeos curtos “no caminho feliz”, cobrindo **todas** as funcionalidades do módulo de Indústria já entregues.  
> Quando algo sair do esperado, você me diz **o número da etapa** + o que ocorreu (print/console) e eu já sei onde ajustar.

## Notas rápidas (como gravar)
- Duração sugerida: **45–90s por etapa**.
- Estrutura fixa por etapa: **(1) Título → (2) Função/Importância → (3) O que aparece na tela/Comportamento → (4) Como validar**.
- Cenário:
  - **OP (Industrialização):** produzir internamente (cliente opcional).
  - **OB (Beneficiamento):** processar **material do cliente** (cliente obrigatório; usa “Materiais de Clientes” e referência de documento quando existir).

---

# Parte 1 — Preparação do cenário (cadastros)

## 1. Visão geral do fluxo (Indústria)
1 - **Título do recurso:** Mapa do fluxo Indústria (do cadastro ao chão de fábrica).
2 - **Função e importância:** contextualiza para stakeholders “como a fábrica roda”: cadastro → ordem (OP/OB) → execução (operações) → apontamento (tela do operador) → planejamento (PCP).
3 - **Como deve se comportar (o que aparece na tela):**
   - No menu lateral, abrir **Indústria** e mostrar os itens (ordem de preenchimento): **Dashboard Produção**, **Materiais de Clientes**, **Centros de Trabalho**, **Fichas Técnicas / BOM**, **Roteiros**, **OP / OB**, **Execução (Operações)**, **Operadores**, **Tela do Operador**, **Chão de Fábrica**, **PCP e Capacidade**, **Planejamento (MRP)**, **Motivos da Qualidade**, **Planos de Inspeção**, **Automação**, **Lotes e Bloqueio**.
   - Comentar rapidamente: “Hoje vamos fabricar/beneficiar um parafuso M6x20 e acompanhar até a execução.”
4 - **Como validar:**
   - Cada tela abre sem travar e com título visível.
   - Não aparece tela em branco/erro vermelho ao navegar.

## 2. Cliente (obrigatório para OB)
1 - **Título do recurso:** Cadastro de Cliente (para beneficiamento).
2 - **Função e importância:** no beneficiamento, o cliente é quem “dona” do material; isso habilita rastreabilidade, vínculo do material do cliente e (quando aplicável) referência a NF-e/pedido.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Cadastros → Clientes e Fornecedores**.
   - Criar um cliente de demo, por exemplo: **“Metalúrgica Alfa (Demo)”**.
   - Salvar e voltar para a lista.
4 - **Como validar:**
   - O cliente aparece na listagem.
   - Ao criar uma OB mais adiante, o cliente aparece no autocomplete de **Cliente**.

## 3. Produto interno (o “Parafuso M6x20”)
1 - **Título do recurso:** Cadastro do Produto (base para OP/OB, roteiro e BOM).
2 - **Função e importância:** o produto é o “pivô” do processo: ele conecta ficha técnica (materiais), roteiro (etapas), ordens (OP/OB) e execução (operações).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Cadastros → Produtos**.
   - Criar o produto **“Parafuso sextavado 6mm x 20mm”** (unidade: **un**).
   - Salvar.
   - Observação para o vídeo: no caso de **OB**, esse produto representa o **“serviço/produto interno”** que será aplicado ao material do cliente.
4 - **Como validar:**
   - O produto aparece na listagem.
   - Mais adiante ele aparece no autocomplete de **Produto/Serviço Interno** (OB) ou **Produto Final** (OP).

## 4. Materiais de Clientes (núcleo do beneficiamento)
1 - **Título do recurso:** Materiais de Clientes.
2 - **Função e importância:** permite representar o “mesmo item” com o **código/nome do cliente**, mantendo o vínculo com o produto interno. Isso deixa o beneficiamento natural e evita cadastros duplicados.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Materiais de Clientes**.
   - (Opcional p/ acelerar) clicar em **Popular Dados** para criar exemplos.
   - Mostrar que existe **busca**, filtro **Ativos/Inativos/Todos** e **paginação**.
   - Clicar em **Novo Material**.
   - Selecionar o cliente (ex.: **Metalúrgica Alfa (Demo)**).
   - Vincular ao produto interno **Parafuso sextavado 6mm x 20mm**.
   - Preencher:
     - **Código do cliente** (ex.: `CLI-PARAF-M6X20`)
     - **Nome do cliente** (ex.: “Parafuso M6x20 bruto p/ beneficiamento”)
     - **Unidade** (ex.: `un`)
   - Salvar.
   - (Opcional) Demonstrar **exclusão** de um item (com confirmação).
4 - **Como validar:**
   - O material aparece na listagem de Materiais de Clientes.
   - Ao criar uma OB, o campo **Material do Cliente** encontra esse item e, ao selecionar, preenche automaticamente o produto interno.
   - Filtros/paginação funcionam e, ao excluir, o item some da lista.

## 5. Centros de Trabalho (CT) — onde a operação acontece
1 - **Título do recurso:** Centros de Trabalho (CT) + capacidade base.
2 - **Função e importância:** CT é o “recurso” que executa as etapas. É a base para: roteiros, fila do operador, execução e capacidade finita (PCP).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Centros de Trabalho** → **Novo Centro**.
   - (Opcional p/ acelerar) clicar em **Popular Dados** para criar exemplos.
   - Criar dois CTs (exemplo):
     - **CT Ponta** (tipo de uso: “Beneficiamento” ou “Ambos”)
     - **CT Rosca** (tipo de uso: “Beneficiamento” ou “Ambos”)
   - Definir **Capacidade disponível (horas/dia)** (ex.: 8) e revisar o **Calendário semanal** (Seg–Sex com capacidade, fim de semana zerado, se for o caso).
   - Ajustar **APS (horizonte congelado) → Freeze (dias)** (ex.: 3) para demonstrar o “lock” operacional do curto prazo.
   - (Opcional) Demonstrar **Clonar** e **Excluir** CT (com confirmação).
4 - **Como validar:**
   - Os CTs aparecem na listagem.
   - Ao criar o roteiro (próxima etapa), os CTs aparecem como opção.
   - Ao reabrir o CT, o valor de **Freeze (dias)** permanece salvo.

## 6. Roteiro de Beneficiamento (processo “Ponta + Rosca”)
1 - **Título do recurso:** Roteiros (sequência de etapas).
2 - **Função e importância:** o roteiro define “como fabricar/beneficiar” (etapas, CT, setup e ciclo). Ele é a base para gerar as operações e alimentar PCP/capacidade.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Roteiros** → **Novo Roteiro**.
   - (Opcional p/ acelerar) clicar em **Popular Dados** para criar exemplos.
   - Mostrar o filtro de **Tipo** (Produção / Beneficiamento) na listagem.
   - Selecionar o produto **Parafuso sextavado 6mm x 20mm**.
   - Em **Tipo**, escolher **Beneficiamento**.
   - Preencher um **Código** (ex.: `ROT-PONTA-ROSCA`) e **Descrição** (ex.: “Ponta + Rosca”).
   - Salvar e ir para a aba **Etapas**.
   - Adicionar 2 etapas (exemplo):
     - Seq. **10** → **Centro de Trabalho: CT Ponta** → Setup (min) e Ciclo (min/un) (valores pequenos para demo).
     - Seq. **20** → **Centro de Trabalho: CT Rosca** → Setup (min) e Ciclo (min/un).
   - Mostrar que a tela exibe **un/h** calculado automaticamente conforme o ciclo.
   - (Opcional) Demonstrar **Clonar** roteiro (cópia com etapas) e **Excluir** (com confirmação).
4 - **Como validar:**
   - O roteiro aparece na listagem e pode ser filtrado por **Tipo = Beneficiamento**.
   - Ao abrir a OB depois, o botão **Selecionar Roteiro** lista o roteiro “Ponta + Rosca”.
   - Ao clonar, o novo roteiro abre como “(Cópia)” e pode ser salvo como nova versão/processo.

---

# Parte 2 — Estrutura (BOM) + criação da OP/OB + geração de operações

## 7. Roteiro de Produção (para demonstrar “fabricação” e planos de inspeção)
1 - **Título do recurso:** Roteiro de Produção (variação do processo).
2 - **Função e importância:** permite demonstrar **fabricação (OP)** usando o mesmo produto, e habilita vincular **Planos de Inspeção** ao roteiro/etapa.
3 - **Como deve se comportar (o que aparece na tela):**
   - Em **Indústria → Roteiros**, clicar em **Novo Roteiro**.
   - Selecionar o produto **Parafuso sextavado 6mm x 20mm**.
   - Em **Tipo**, escolher **Produção**.
   - Preencher:
     - Código (ex.: `ROT-PROD-PARAFUSO`)
     - Descrição (ex.: “Produção - Ponta + Rosca”)
   - Salvar e, em **Etapas**, adicionar as mesmas 2 etapas (CT Ponta e CT Rosca) para fins de demo.
4 - **Como validar:**
   - O roteiro aparece na listagem com **Tipo = Produção**.
   - Em uma OP (tipo Industrialização), o seletor de roteiro lista este roteiro.

## 8. Fichas Técnicas / BOM (produção e beneficiamento)
1 - **Título do recurso:** Fichas Técnicas (BOM) + versões + padrão.
2 - **Função e importância:** define insumos/consumos e quantidades padrão; acelera a criação de ordens com consistência e rastreabilidade.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Fichas Técnicas / BOM**.
   - (Opcional p/ acelerar) clicar em **Popular Dados** para criar exemplos.
   - Clicar em **Nova Ficha Técnica**.
   - Selecionar o produto **Parafuso sextavado 6mm x 20mm**.
   - Em **Tipo**, escolher:
     - **Produção** (quando for fabricar internamente), ou
     - **Beneficiamento** (quando for serviço/consumo interno durante o processamento do material do cliente).
   - Preencher **Código**, **Versão**, **Descrição** e marcar indicação de **Padrão** conforme o tipo.
   - Salvar e ir para a aba **Componentes**.
   - Adicionar 1–3 componentes (ex.: “Óleo de corte”, “Embalagem”, “Matriz rosca M6”) e ajustar **quantidade**, **unidade**, **perda** e **obrigatório**.
   - Mostrar clonagem: na listagem, usar **Clonar** para gerar uma nova versão rapidamente.
4 - **Como validar:**
   - A BOM aparece na listagem e pode ser filtrada por **Tipo**.
   - Ao aplicar na ordem (passos seguintes), os componentes entram automaticamente na aba **Insumos / Componentes**.

## 9. OP / OB (unificado): lista, kanban, filtros e criação via Wizard
1 - **Título do recurso:** OP / OB (tela única) com filtros + visão Kanban.
2 - **Função e importância:** centraliza ordens de industrialização e beneficiamento em uma UX única; melhora produtividade (lista/kanban, busca, ações rápidas).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → OP / OB**.
   - Mostrar:
     - Alternância **Lista/Kanban**.
     - Campo de busca (número, produto, cliente).
     - Seletor de **Tipo** (Industrialização / Beneficiamento).
     - Filtro de **Status** (na visão de lista).
   - Selecionar **Tipo = Beneficiamento** e clicar em **Nova Ordem**.
   - Confirmar que aparece o **Wizard de Beneficiamento (3 passos)**:
     - Passo 1: escolher **Cliente**.
     - Passo 2: escolher **Material do Cliente** (opcional, mas recomendado) e preencher **Quantidade**.
     - Passo 3: revisar dados e salvar.
   - Mostrar os links úteis no beneficiamento:
     - **Cadastrar material** (leva para Materiais de Clientes).
     - **Importar XML (NF-e)** (atalho para criação rápida via nota).
   - Alternar para **Kanban** e mostrar:
     - Colunas por status.
     - Arrastar uma ordem entre colunas (drag-and-drop).
     - Menu de ações rápidas (mudar status / ajustar prioridade / duplicar).
4 - **Como validar:**
   - A ordem criada aparece na lista e no kanban (com badge **BEN**).
   - Ao arrastar no kanban, o status muda e aparece um toast de sucesso.
   - “Duplicar” cria uma nova ordem com número diferente e abre o formulário.

## 10. Ordem: Insumos/Componentes e Entregas (controle operacional)
1 - **Título do recurso:** Componentes + Entregas parciais/finais.
2 - **Função e importância:** registra insumos do processo e acompanhamento de entregas; ajuda a acompanhar saldo planejado x entregue.
3 - **Como deve se comportar (o que aparece na tela):**
   - Após salvar uma OB pela primeira vez, o sistema deve:
     - Te levar para a aba **Insumos / Componentes**.
     - Abrir o modal **Aplicar BOM** (atalho).
   - No modal, escolher a BOM e clicar em **Substituir** (ou **Adicionar**).
   - Confirmar e observar a lista de componentes preenchida.
   - Editar um componente (quantidade/unidade) e remover outro.
   - Ir para a aba **Entregas** e registrar uma entrega parcial (data + quantidade + documento/observação).
4 - **Como validar:**
   - Componentes aparecem imediatamente após aplicar a BOM.
   - A entrega aparece na tabela e o “Saldo restante” diminui corretamente.
   - Ao tentar entregar mais que o saldo, o sistema bloqueia e mostra mensagem.

## 11. Ordem: Processo (Roteiro) + Gerar Operações (Execução)
1 - **Título do recurso:** Aplicar roteiro na ordem e gerar operações.
2 - **Função e importância:** transforma planejamento (ordem) em execução (operações por CT), conectando com Execução/Operador/PCP.
3 - **Como deve se comportar (o que aparece na tela):**
   - Voltar para **Dados Gerais** da ordem e localizar a seção **Processo**.
   - Clicar em **Selecionar Roteiro** e escolher “Ponta + Rosca” (beneficiamento).
   - Confirmar que o campo “Roteiro aplicado” mostra o roteiro selecionado.
   - No rodapé, clicar em **Gerar operações**.
   - O sistema deve gerar as operações e abrir automaticamente **Indústria → Execução (Operações)** já filtrando pela ordem (busca).
4 - **Como validar:**
   - Aparece toast “Operações geradas (X)”.
   - Na Execução, aparecem 2 operações (CT Ponta e CT Rosca) para a ordem.
   - Ao voltar para a ordem, aparece “Execução gerada” e o botão **Abrir Execução**.

---

# Parte 3 — Execução (MES light): Execução, Operador e Chão de Fábrica

## 12. Execução (Operações): lista, filtros e Kanban (status em tempo real)
1 - **Título do recurso:** Execução (Operações) + Kanban de operações.
2 - **Função e importância:** monitora e move operações ao longo dos estados (planejada/liberada/em execução/…); dá visibilidade rápida do “chão”.
3 - **Como deve se comportar (o que aparece na tela):**
   - Em **Indústria → Execução (Operações)**, mostrar:
     - Busca por ordem/produto/cliente.
     - Filtro por **Centro de Trabalho** e **Status**.
     - Alternância **Lista/Kanban**.
   - Na visão Kanban:
     - Arrastar uma operação de **Planejada → Liberada**.
     - Mostrar que o cartão mantém ordem, produto, CT e barra de progresso.
4 - **Como validar:**
   - A operação muda de coluna e aparece toast de sucesso.
   - Ao atualizar a página, o status permanece.

## 13. Operadores: cadastro e credencial (QR/PIN) para a Tela do Operador
1 - **Título do recurso:** Operadores (gestão de acesso do chão).
2 - **Função e importância:** cria operadores com PIN e centros permitidos; habilita login rápido e controle por CT.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Operadores**.
   - Criar um operador (nome + PIN) e vincular aos CTs (CT Ponta, CT Rosca).
   - Salvar e confirmar que ele aparece na lista.
   - Clicar em **Imprimir credencial** para gerar um QR e (opcionalmente) atualizar o PIN antes de imprimir.
4 - **Como validar:**
   - O operador aparece como **Ativo**.
   - A credencial mostra QR e dados do operador.

## 14. Tela do Operador: login, fila por CT e apontamentos (iniciar/pausar/concluir)
1 - **Título do recurso:** Tela do Operador (kiosk).
2 - **Função e importância:** executa a produção/beneficiamento no dia a dia com poucos cliques; registra produção e refugo.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Tela do Operador**.
   - Fazer login com **Nome/E-mail + PIN** (ou ler QR do crachá).
   - Selecionar o **Centro de Trabalho** e verificar a fila.
   - Na operação atual:
     - Clicar **Iniciar**.
     - Clicar **Pausar** e registrar quantidades (boa/refugo) + observação.
     - Clicar **Concluir** e registrar quantidade boa (e refugo, se houver).
   - Mostrar o bloco “Instruções de trabalho” (documentos por operação), abrindo um documento se existir.
4 - **Como validar:**
   - A operação troca de status e os números “Produzido/Refugo” atualizam.
   - A próxima operação aparece automaticamente como “ordem atual”.
   - Em **Execução**, o status/progresso da operação reflete o que foi apontado.

## 15. Chão de Fábrica: visão geral, Andon, TV mode e replanejamento de operação
1 - **Título do recurso:** Chão de Fábrica (gestão visual + replanejamento).
2 - **Função e importância:** dá visão gerencial (gargalos, atrasos, bloqueios) e permite agir (replanejar operação entre CTs).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Chão de Fábrica**.
   - Mostrar modos:
     - **Overview** (KPIs por centro: em execução, fila, bloqueadas, concluídas hoje, utilização, atrasadas).
     - **Andon** (alertas/visão de exceções).
     - **Fila** (lista de operações do CT).
   - Ativar **TV mode** e **Auto-refresh** (se disponível) para exibir em telão.
   - Em **Fila**, selecionar uma operação e usar a opção de **mover/replanejar** para outro CT (quando aplicável).
4 - **Como validar:**
   - O overview carrega sem erro e mostra os CTs com status.
   - Ao replanejar, a operação aparece no novo CT e a Execução reflete a mudança.

---

# Parte 4 — Planejamento: PCP & Capacidade (APS, Gantt, ATP/CTP)

## 16. PCP & Capacidade: visão integrada + alertas + ATP/CTP + estoque projetado
1 - **Título do recurso:** PCP - Visão integrada.
2 - **Função e importância:** mostra gargalos, capacidade finita, riscos de atraso, ATP/CTP e estoque projetado para decisões rápidas.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → PCP & Capacidade**.
   - Ajustar **período** (data inicial/final) e clicar **Atualizar**.
   - Mostrar:
     - KPIs (OTIF, lead time real x planejado, % refugo, aderência de ciclo).
     - Alertas (capacidade excedida, faltas no ATP, ruptura projetada) com botões de ação.
     - Tabela **ATP/CTP por produto** (clicar no produto Parafuso e ver o detalhe abaixo).
     - Gráfico de **Estoque projetado** (se houver dados).
4 - **Como validar:**
   - KPIs e tabelas carregam sem tela em branco.
   - Clicar em um alerta leva para o destino (ex.: Gantt ou MRP).

## 17. PCP: Gantt + APS (sequenciamento), lock/freeze e replanejamento por sobrecarga
1 - **Título do recurso:** APS (capacidade finita) + Gantt + replanejamento.
2 - **Função e importância:** “organiza a fila” respeitando capacidade e horizonte congelado; permite simular (preview), aplicar e desfazer (undo).
3 - **Como deve se comportar (o que aparece na tela):**
   - No PCP, ir para a seção **Gantt simplificado** e usar filtros (CT, status, APS).
   - Clicar em **Sequenciar** no CT (abre modal do APS):
     - Rodar **Preview** (não altera nada) e mostrar a lista de mudanças.
     - Rodar **Aplicar** (gera run e atualiza previsões).
     - Usar **Desfazer último** para voltar (quando aplicável).
     - Em “Sequência manual (drag-and-drop)”, rearrastar e clicar **Salvar ordem**.
     - Se necessário, usar o **Lock** (bloquear operação para APS) e validar que ela não é movida.
   - Mostrar também:
     - **APS: Sequenciar todos** (modal de lote com Preview/Aplicar + Undo por CT).
     - **Replan: sobrecarga** (mover operações de menor prioridade para dias com folga; respeita freeze/locked).
4 - **Como validar:**
   - Após aplicar APS, as datas no Gantt mudam e aparece toast de sucesso.
   - Undo restaura (quando permitido).
   - Replan mostra preview e, ao aplicar, reduz a sobrecarga (quando há folga no período).

---

# Parte 5 — Planejamento de insumos: MRP (Faltas)

## 18. MRP: parâmetros por item + faltas + ações e histórico
1 - **Título do recurso:** Faltas & MRP (demanda líquida e tratamento).
2 - **Função e importância:** detecta faltas e registra ações (transferência/RC/OC/ajuste), criando rastreabilidade do “o que fizemos para resolver”.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Planejamento (MRP)**.
   - Em “Parâmetros por item”, cadastrar/editar:
     - Lead time, lote mínimo, múltiplo, estoque de segurança, política FIFO/FEFO.
   - Em “Demandas”, filtrar por status e abrir uma demanda:
     - Registrar uma **Ação** (ex.: transferência interna) com quantidade e data prometida.
     - Abrir **Histórico** para ver as ações registradas.
     - (Se existir vínculo) usar **Reprocessar OP** para recalcular a demanda da ordem.
4 - **Como validar:**
   - Ao salvar parâmetros, a linha aparece/atualiza na lista.
   - Ao registrar ação, a demanda muda para “respondida” (ou equivalente) e o histórico mostra o registro.

---

# Parte 6 — Qualidade: motivos, planos e lotes/bloqueios

## 19. Qualidade: motivos, planos de inspeção e lotes/bloqueios
1 - **Título do recurso:** Qualidade (cadastros + controle).
2 - **Função e importância:** padroniza motivos (refugo/bloqueio/devolução), define planos de inspeção (IP/IF) e controla lotes com bloqueio/liberação.
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Motivos de Qualidade**:
     - Criar 1 motivo de **refugo** (ex.: “Dimensão fora da tolerância”).
   - Ir em **Indústria → Planos de Inspeção**:
     - Criar um plano (IP ou IF) para o produto “Parafuso…”.
     - (Opcional) Vincular ao **roteiro de produção** e a uma **etapa**.
     - Adicionar **características** (descrição, tolerâncias, unidade, instrumento).
   - Ir em **Indústria → Lotes & Bloqueios**:
     - Filtrar por status e abrir “Alterar status” de um lote (quando existir) para registrar observação e mudar para “Em análise/Bloqueado/Aprovado”.
4 - **Como validar:**
   - Motivo e plano aparecem na listagem após salvar.
   - Características aparecem dentro do plano.
   - Em Lotes, a mudança de status atualiza o badge e fica registrada com observação.

---

# Parte 7 — Automação e UX moderna

## 20. Automação: auto-avanço e alertas de exceção
1 - **Título do recurso:** Automação (Chão de Fábrica).
2 - **Função e importância:** reduz trabalho manual e aumenta previsibilidade (auto-avanço; alertas por parada/refugo).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Automação**.
   - Ajustar:
     - **Auto-avançar próxima operação** (ligado).
     - **Alerta de parada** (minutos).
     - **Alerta/Bloqueio por refugo** (%).
   - Salvar e voltar para a **Tela do Operador**:
     - Concluir uma operação e observar a próxima etapa sendo liberada automaticamente (quando aplicável).
4 - **Como validar:**
   - Toast “Regras de automação atualizadas”.
   - Efeito prático visível no fluxo (ex.: próxima operação aparece como pronta/na fila).

## 21. Dashboard Produção + atalhos modernos (Command Palette e NF-e)
1 - **Título do recurso:** Dashboard Industrial + atalhos produtivos.
2 - **Função e importância:** dá visão executiva (KPIs) e acelera a operação (atalhos para criar OP/OB).
3 - **Como deve se comportar (o que aparece na tela):**
   - Ir em **Indústria → Dashboard Produção** e mostrar cards + gráficos por status.
   - Pressionar **Ctrl/Cmd + K** para abrir a **Command Palette**:
     - Buscar “Nova Ordem (Beneficiamento)” e abrir direto o wizard.
     - Mostrar a seção “Recentes”.
   - (Atalho alternativo) Ir em **Suprimentos → Importar XML**:
     - Importar um XML (NF-e) e, nos itens, usar **Criar OB** para abrir a ordem já pré-preenchida (cliente/produto/quantidade/documento).
4 - **Como validar:**
   - Dashboard carrega sem erro e os gráficos renderizam.
   - A Command Palette abre/fecha e navega corretamente para a tela escolhida.
   - O CTA “Criar OB” a partir do XML abre OP/OB já preenchida com os dados do item.

---

## Como reportar bugs (modelo rápido)
Quando acontecer algo inesperado durante a gravação, me envie:
- **Etapa X** (número do manual)
- **O que você fez** (passos rápidos)
- **O que esperava ver**
- **O que apareceu** (print/vídeo curto) + erros do console (se houver)
