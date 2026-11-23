# Medições da Fase 0

Números medidos contra a API real do PNCP, que substituem estimativas dos docs (docs/13 Fase 0). Dados brutos em `pncp-volume.json`; o script é `packages/ingestion/scripts/measure-volume.mjs` (retomável, nunca grava falha como zero).

## Volume de contratações (14 dias, 20/10 a 02/11/2026; 182 células dia × modalidade, 0 falhas)

Contagem por **data de publicação** no PNCP (`/v1/contratacoes/publicacao`).

| Medida | Valor |
|---|---|
| Total nos 14 dias | 47.962 |
| Dia útil típico (mediana) | 5.682 |
| Faixa nos dias úteis cheios | 5.338 a 6.234 |
| Fim de semana | 10 a 88 por dia |
| Páginas de 50 por dia útil cheio (= chamadas de coleta) | ~121 |

Dias fora do padrão, **sem explicação confirmada**: 30/10 (sexta) com 1.681, e 02/11 (segunda, feriado de Finados) com 94. Antes de usar a mediana para projetar, repetir a medição em outra quinzena e conferir se o PNCP corrige/atrasa a publicação desses dias.

| Modalidade | Soma em 14 dias | Mediana/dia | Parte |
|---|---|---|---|
| 8 Dispensa | 22.902 | 2.638 | 48% |
| 6 Pregão eletrônico | 13.236 | 1.544 | 28% |
| 9 Inexigibilidade | 8.326 | 900 | 17% |
| 4 Concorrência eletrônica | 2.335 | 256 | 5% |
| 12 Credenciamento | 682 | 71 | 1% |
| 7 Pregão presencial | 266 | 26 | |
| 5 Concorrência presencial | 107 | 10 | |
| 1, 3, 10, 11, 13 | 108 | | |
| 2 Diálogo competitivo | 0 | 0 | |

## O que isso muda

- **Backfill:** a ~121 chamadas por dia útil, a 10 chamadas/min são ~12 min por dia útil; 90 dias (~64 úteis) levam **cerca de 13 h** de coleta contínua, e um ano cerca de 2 dias. A 12/min, ~11 h por 90 dias. Confirma o plano de começar pelo mais recente e de usar os arquivos de dados abertos para o histórico (docs/05 §2). O limite real do PNCP em rajada ainda não foi medido.
- **Ordem de grandeza anual:** ~5.700/dia útil × ~250 dias ≈ **1,4 milhão de contratações por ano**. Com `halfvec(1024)` (2 KB/vetor), são ~2,9 GB de vetores por ano antes do overhead do HNSW, coerente com a conta de docs/11 §4.
- **Conjunto quente:** 33.646 contratações com propostas abertas (até +365 dias) ≈ 70 MB de vetores. Cabe em RAM com folga; o gargalo do índice está no conjunto frio, não no quente.
- **Composição:** 76% do volume é dispensa e pregão. Dispensa tem texto curto e valor baixo, então o precificador e a qualidade de busca vão depender muito de como tratar esse grupo.

## Ainda não medido (Fase 0)

Tamanho médio do texto do objeto, itens por contratação, % com documentos, latência e recall do HNSW, comparação BGE-M3 × alternativas, limite real de rajada do PNCP. Dependem do backfill de amostra e do Postgres com as tabelas.
