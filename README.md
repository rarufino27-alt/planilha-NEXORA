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
