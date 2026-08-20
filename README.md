# Planilha Nexora — V1

Aplicação local em HTML + CSS + JavaScript, preparada para migração/sincronização com Supabase.

## Como abrir

1. Extraia o ZIP.
2. Abra `index.html` no navegador.
3. A V1 funciona sem internet e sem instalação de dependências.

## O que já está implementado

- Dashboard operacional.
- XAUUSD como ativo inicial.
- Pontos Nexora separados da unidade técnica do MT5.
- Conversão pontos → US$ e US$ → pontos.
- Cálculo dependente do lote.
- Perfis: Conservador, Moderado, Moderado 1 e Agressivo.
- Regra de lote por US$100 com arredondamento para baixo.
- Stop operacional configurável, padrão 500 pontos.
- Meta de pontos configurável.
- Lançamento detalhado e rápido de operações.
- Resultado líquido informado pelo MT5.
- Comissão.
- Custo de execução implícito = bruto calculado - líquido MT5.
- Sessões independentes.
- Diário operacional.
- Capital: depósitos e saques separados da performance.
- Performance, win rate e drawdown estimado.
- Simulador composto e linear com 100% de acerto hipotético.
- Cadastro inicial de ativos e possibilidade de adicionar outros.
- Backup/exportação JSON e importação.
- Schema SQL preparado para Supabase.

## Observação importante sobre custos

O sistema não chama automaticamente toda diferença entre resultado bruto e líquido de "spread". O MT5 pode refletir spread, comissão, swap e outros ajustes. Por isso a V1 usa o termo `custo de execução implícito`.

## Próxima etapa recomendada

1. Validar os cálculos da V1 com 5–10 operações reais do seu MT5.
2. Ajustar os parâmetros dos ativos adicionais.
3. Adicionar vínculo de operação → sessão.
4. Conectar Supabase/Auth.
5. Adicionar importação do histórico do MT5.
6. Depois construir integração automática, se a plataforma escolhida disponibilizar o mecanismo adequado.


## V1.2 — Projeção por etapa e registro manual de sessões

A página Projeção & Objetivos foi ajustada para trabalhar com a etapa atual do capital.

Exemplo:
- Meta principal: US$15.000
- Saldo atual: US$100
- Próxima meta: US$200
- Busca diária: 30%
- Meta financeira do dia: US$30

A Nexora passa a informar automaticamente, para cada perfil operacional:
- lote de entrada projetado;
- valor da busca diária;
- Pontos Nexora necessários para atingir a busca líquida, considerando a comissão cadastrada;
- sessões projetadas até a próxima etapa;
- sessões projetadas até a meta principal.

O usuário registra manualmente cada sessão realizada, informando resultado positivo ou negativo, quantidade de sessões e, opcionalmente, os pontos reais. O realizado permanece separado da projeção.

A integração com Supabase será feita na próxima etapa, preservando essa estrutura para sincronização entre celular, computador, Bot e banco central.


## Regra final da projeção

A busca diária padrão da Nexora é **30% do saldo atual**. O percentual permanece constante; o valor financeiro não.

Exemplo:

- Saldo US$100 → busca US$30 → saldo projetado US$130
- Saldo US$130 → busca US$39 → saldo projetado US$169
- Saldo US$169 → busca US$50,70 → saldo projetado US$219,70

Ao registrar manualmente uma sessão, o resultado real passa a atualizar o saldo de referência. A próxima sessão recalcula automaticamente:

**novo saldo → 30% de busca → novo lote → novos pontos necessários.**


## V1.3 — Escala de lote e sessões integradas
- Moderado: US$100=0,05; US$150=0,07; US$200=0,10; US$250=0,12; US$300=0,15.
- Sessão é o contêiner das operações.
- Operações vinculadas à sessão e resumo automático ao encerrar.
- Projeção em formato de planilha, com busca percentual dinâmica e sessões restantes.
- Sessões e operações podem ser editadas depois do registro.


## V1.3.1 — Correção de inicialização
Restauradas as rotinas de Operações e Calculadora que foram removidas acidentalmente na V1.3. A aplicação volta a inicializar todas as páginas antes de renderizar o Dashboard.


## V1.4 — Configurações centralizadas e tabelas de lote

- Busca mínima diária configurável; padrão 20%.
- Lote mínimo configurável; padrão 0,01.
- Tabelas independentes e editáveis por perfil.
- Perfis: Conservador, Moderado, Moderado 1 (recomendado) e Agressivo.
- Abaixo de US$100 não há sugestão automática de lote.
- Depósitos e saques movidos para Configurações > Depósitos e saques.
- Cadastro de ativos movido para Configurações > Ativos.
- Menu lateral reduzido, removendo Capital e Ativos.


## V1.5 — Fluxo operacional refinado

- Dashboard sem escala de lote.
- Performance integrada ao Dashboard; menu Performance removido.
- Evolução operacional por sessão com percentual e resultado geral.
- Gráfico consolidado por dia operacional.
- Sessão operacional com abertura e encerramento; sessão numerada sequencialmente por dia.
- Histórico definitivo somente após encerramento da sessão.
- Seleção de sessão exibe quantidade de operações e resultado final.
- Edição de sessão e operações concentrada em Sessão operacional.
- Operações bloqueadas enquanto não houver sessão aberta.
- Operações sem histórico próprio na página; última operação permanece no rodapé.
- Projeção baseada no projeto: saldo inicial → metas secundárias → meta principal.
- Quantidade de metas secundárias configurável.
- Diário operacional livre e opcional por data.
- Configurações centralizam gerenciamento, projeto, lotes, capital e ativos.
- Projeto pode ser criado novamente ou excluído pelas Configurações.


## V1.6 — Ajuste fino de Projeção e Sessão Operacional

- A projeção agora possui seleção explícita da busca diária (%) usada no cálculo.
- A projeção usa o perfil de gerenciamento/lote selecionado para calcular lote e pontos de referência.
- Metas secundárias são geradas a partir da meta principal e podem ser ajustadas individualmente.
- Cada meta secundária possui período previsto em sessões e estimativa aproximada em semanas.
- O período previsto pode ser alterado manualmente pelo usuário.
- O status da etapa pode ser avançado manualmente pelo usuário.
- A projeção operacional recalcula busca em US$, lote e pontos conforme o saldo projetado.
- A Sessão Operacional passou a mostrar busca em US$, lote sugerido e o plano registrado da sessão.
- Abertura e encerramento continuam sendo o único fluxo de controle da sessão.


## V1.7 — Projeção real x planejada e Configurações

- Tabs de Configurações redesenhadas com ícones, títulos, descrições e estado ativo.
- Aba Geral explicitamente disponível.
- Correção do salvamento da aba Projeto: o formulário agora é vinculado depois que a aba é renderizada.
- Novo projeto e exclusão do projeto atual movidos/centralizados na aba Projeto com fluxo funcional.
- Projeção operacional passa a usar cada sessão operacional real como fonte de verdade.
- Cada linha mostra: saldo inicial do dia, busca %, % real, busca em US$, resultado real, lote, pontos, saldo em win, saldo em loss, saldo real e status.
- Resultado acima/abaixo da projeção altera automaticamente o saldo de partida da próxima sessão projetada.
- Status de linhas futuras pode ser avançado manualmente.
- Lote de entrada é calculado a partir do saldo inicial daquela sessão e do perfil configurado.


## V1.8 — Saldo acumulado correto

- Saldo atual passa a ser calculado como: saldo inicial do projeto + depósitos - saques + soma de todos os resultados líquidos das operações.
- A base não depende mais de um saldo operacional antigo que poderia fazer a projeção mostrar apenas o lucro.
- Dashboard passa a mostrar saldo atual, resultado acumulado e performance calculados sobre o capital inicial do projeto.
- Projeção operacional utiliza o saldo acumulado real como ponto de partida de cada sessão.
- Sessões reais propagam seus ganhos e perdas para a próxima linha da projeção.
- Depósitos e saques registrados também entram no cálculo do saldo.


## V1.9 — Plano operacional diário e custos

- Dashboard exibe permanentemente saldo atual, meta diária em %, busca líquida em US$, lote sugerido e pontos necessários.
- Pontos da meta diária são calculados sobre o valor bruto necessário para cobrir a comissão configurada do ativo e ainda entregar a busca líquida desejada.
- Projeção operacional até a meta principal remove lote e pontos da tabela; esses parâmetros continuam calculados internamente e aparecem onde a operação é planejada/registrada.
- Para sessões já realizadas, Saldo se Win/Saldo se Loss passa a mostrar somente o cenário compatível com o resultado real; o saldo real alcançado permanece visível.
- O saldo atual continua baseado no resultado líquido efetivamente registrado nas operações. Isso evita descontar a comissão duas vezes quando o valor informado no lançamento vier do campo líquido do MT5.
- Dashboard e Projeção recalculam o saldo antes de renderizar.


## V2.0 — Gerenciamentos operacionais

Nova camada separada do perfil financeiro/lote:
- Scalping
- Reversão
- Continuação de tendência

Cada modalidade possui parâmetros próprios e editáveis:
- busca diária (%)
- pontos mínimos e máximos
- Take padrão
- Stop padrão
- máximo de operações
- risco/retorno
- perda máxima diária (%)

A Sessão Operacional passa a registrar qual gerenciamento operacional foi selecionado, mantendo separado o perfil financeiro responsável pelo lote.


## V2.1 — Plano de entradas multi-estratégia

Camada comum para todas as modalidades:
- lote-base por perfil financeiro ou por capital;
- máximo de entradas por ideia operacional;
- exposição máxima acumulada;
- espaçamento entre entradas em pontos;
- numeração das entradas;
- bloqueio quando o limite de entradas ou exposição é atingido;
- planejamento de meta líquida e comissão;
- visualização do plano na Sessão Operacional e na página Operações.

O Scalping foi configurado inicialmente com modelo por capital:
US$10 → 0,01 lote, com até 3 entradas e exposição máxima de 0,03 lote.
Os valores são editáveis em Configurações → Gerenciamentos.


## V2.1.1 — Correção de runtime

- Corrigida referência de variáveis do plano de operação que estava sendo usada no Dashboard fora do escopo.
- Dashboard agora usa seu próprio plano operacional calculado.
- Sessão ativa calcula o plano usando o saldo inicial real daquela sessão.
- Lançamento rápido usa o mesmo lote-base planejado e numeração de entrada do gerenciamento ativo.


## V2.2 — Registro de operação simplificado

A página Operações agora possui uma única opção de registro:
- Data
- Hora
- Ativo
- Direção
- Resultado líquido (US$)
- Comissão (US$)
- Quantidade de lotes (opcional)
- Pontos +/− (opcional)
- Observação (opcional), orientando a informar preço de entrada/saída, contexto ou comentário relevante.

O registro continua obrigatoriamente vinculado a uma sessão operacional aberta.

Após salvar:
- todos os dados ficam acessíveis;
- a operação aparece no histórico;
- há ação de editar;
- lote e pontos podem permanecer vazios;
- qualquer campo do registro pode ser alterado posteriormente.


## V2.3 — Projeção proporcional automática

- Tabelas de lote passam a começar em US$10, com níveis US$10, 25, 50, 75 e depois incrementos de US$25.
- Projeção usa automaticamente o perfil de lote selecionado.
- Metas secundárias deixam de depender de valores digitados manualmente.
- São geradas automaticamente em progressão proporcional (geométrica) entre o saldo inicial e a meta principal.
- Cada etapa informa crescimento percentual, busca diária, lote de referência, pontos de referência e quantidade estimada de sessões para atingir a etapa.
- A projeção continua sendo recalculada conforme saldo, percentual de busca, ativo e perfil selecionado.
- A quantidade de sessões/dias não define as metas; ela é apenas uma consequência calculada da projeção.


## V2.3.1 — Correção de inicialização

Corrigida a normalização das tabelas de lote para aceitar e limpar registros antigos, vazios ou inválidos antes de acessar `balance` e `lot`. Isso elimina o erro `Cannot read properties of undefined (reading 'balance')` apresentado no console.


## V2.4 — Redesign da Projeção e Objetivos

- Primeiro dia operacional definido no projeto.
- Calendário operacional de segunda a sexta, pulando automaticamente fins de semana e dias sem operação registrada.
- Projeção diária com saldo inicial do dia, busca %, busca US$, resultado WIN/LOSS, lucro/perda, saldo final e crescimento %.
- Saldo diário real é acumulado pelo resultado líquido do dia; o primeiro dia usa o saldo inicial do projeto.
- Metas secundárias fixadas em 10 etapas iguais.
- Removidas as referências de lote e pontos das metas secundárias.
- Parâmetros da projeção agora incluem gerenciamento operacional, perfil de lote, ativo, busca e primeiro dia.
- Destaque visual para a projeção do próximo dia, com saldo, busca %, busca US$, lote, pontos de referência e saldo projetado.
- Novo visual da página mantendo a identidade azul Nexora.


## V2.5 — Dashboard + Sessão Operacional

- Dashboard redesenhado com saldo, operações, objetivo geral e diário, crescimento, win/loss, gráfico mensal completo e visão anual.
- Ticker de mercado no topo com dados públicos de S&P 500, Nasdaq, Dow Jones, FTSE, Nikkei, ouro, petróleo, USD/BRL e referência cambial.
- Nenhum dado de Investing.com é utilizado.
- Sessão Operacional passa a captar diretamente da projeção: perfil financeiro, busca %, busca US$, lote de entrada e pontos de referência.
- Removidos da visualização da Sessão Operacional: máximo de entradas, exposição máxima e pontos de stop.
- Configurações receberam padronização visual e o gerenciamento operacional voltou a ter binding funcional para salvar os parâmetros.
- Perfis financeiros agora também aceitam saldos a partir de US$10 na sugestão automática.


## V2.6 — Navegação, pontos de referência e temas

- O nome da aplicação passa a ser Gerenciamento NEXORA.
- Menu lateral reorganizado na sequência: Dashboard; Projeções e Objetivos; Sessão Operacional; Operações; Diário Operacional; Configurações; Calculadora.
- Menu lateral pode ser recolhido/expandido.
- Exportar backup e Importar backup foram movidos para o menu lateral.
- Removidos os controles de backup do topo.
- Removido o indicador “Modo local ativo”.
- Sessão Operacional passa a usar exatamente os pontos de referência calculados pela projeção do dia, considerando saldo, busca, gerenciamento, perfil, lote e custos.
- Títulos das páginas foram profissionalizados.
- Adicionados modos claro e escuro, com preferência persistida no navegador.


## V2.7 — Responsive híbrido / WebView

- Corrigido o comportamento em celulares e WebViews, incluindo wrappers como AppsGeyser.
- Desativado o text autosizing que fazia títulos e componentes crescerem desproporcionalmente.
- Menu lateral vira drawer no celular, com abertura pelo botão ☰ e fechamento ao selecionar uma página.
- Conteúdo passa a ocupar 100% da largura do telefone.
- Grids, cards, formulários, gráficos e indicadores foram adaptados para telas pequenas.
- Tabelas permanecem horizontalmente roláveis quando a quantidade de colunas exige isso.
- Dashboard, Projeções, Sessão Operacional e Configurações recebem layout mobile específico.
- Mantido o menu lateral completo no celular; não há mais uma barra lateral estreita e inutilizável ocupando parte da tela.
