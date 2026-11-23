# 11 — Observabilidade, SLOs e performance

## 1. SLOs iniciais (metas — revisar após a Fase 0)

| Serviço            | SLI                                                              | Meta                                    |
| ------------------ | ---------------------------------------------------------------- | --------------------------------------- |
| API (geral)        | Disponibilidade mensal                                           | 99,5%                                   |
| Busca              | Latência p95 sem rerank / com rerank                             | < 300 ms / < 500 ms                     |
| Busca              | Taxa de erro (5xx)                                               | < 0,5%                                  |
| Detalhe do edital  | p95                                                              | < 200 ms                                |
| Pergunta ao edital | Tempo até o 1º token (p95)                                       | < 2,5 s (depende do provedor escolhido) |
| Análise de edital  | Conclusão p95                                                    | < 90 s para edital de até ~100 páginas  |
| Ingestão           | Atraso entre publicação no PNCP e disponibilidade na busca (p95) | < 30 min                                |
| Alertas            | Atraso entre ingestão e alerta enviado (p95)                     | < 10 min                                |

## 2. Telemetria

- **OpenTelemetry** em API, workers e sidecar: traces com spans por etapa da busca (`understand`, `lexical`, `vector`, `fuse`, `rerank`, `snippets`, `facets`) e por chamada externa (PNCP, embeddings, LLM com provedor/modelo).
- **Métricas** (Prometheus): latência por etapa, cache hit rate, tamanho dos índices HNSW e BM25, memória do Postgres, filas (profundidade, idade do job mais antigo), taxa de 429 do PNCP, custo de IA por organização/provedor, tokens por tarefa, taxa de falha de schema da IA.
- **Logs** estruturados (JSON) com `request_id`, `org_id` (hash), sem dados pessoais nem chaves.
- **Painéis:** busca, ingestão (frescor por fonte), IA (custo, latência, qualidade por provedor), negócio (ativação, buscas, análises).

## 3. Qualidade de busca em produção

- Painel com: taxa de zero resultados, CTR na primeira página, posição média do clique, salvamentos/ações por busca, consultas mais frequentes sem clique.
- Revisão semanal das piores consultas e inclusão no conjunto de avaliação (`06` §9).

## 4. Capacidade (estimativa — medir na Fase 0)

Fórmula de memória aproximada do índice vetorial: `N × dims × bytes_por_dim × fator_HNSW`. Com `halfvec(1024)` são 2 KB por vetor antes do overhead do grafo. Exemplo: 1 milhão de vetores ≈ 2 GB de dados + overhead do HNSW (variável conforme `m`). Isso justifica:
- conjunto **quente** pequeno e residente em RAM;
- conjunto frio com índice separado e orçamento próprio;
- chunks de documentos (RAG) embutidos só para editais abertos/solicitados.

Validar com medição real: tamanho de índice, tempo de build, recall × latência por `ef_search`.

## 5. Testes de carga

- Ferramenta: k6 (ou equivalente), com mistura realista de consultas (do conjunto de avaliação), filtros e paginação.
- Cenários: pico de manhã (busca + alertas), reindexação em paralelo com tráfego, provedor de IA lento, PNCP em 429.
- Gate: release que piore p95 de busca acima de 10% precisa de justificativa.

## 6. Alertas operacionais

Frescor de ingestão acima do limiar; taxa de `schema_mismatch` do PNCP; circuit breaker aberto; filas acumulando; erro de busca > limiar; custo de IA diário acima do orçamento; credencial BYOK falhando repetidamente (avisar o admin da organização); certificado/expiração de segredos.
