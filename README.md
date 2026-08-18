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
