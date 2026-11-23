# 13 — Roadmap por fases

Cada fase tem critérios de saída verificáveis. Prazos dependem do tamanho da equipe e não são fixados aqui.

## Fase 0 — Fundações e medições

- Monorepo, CI, docker compose com Postgres + `pg_search` + `pgvector`, Redis, TEI.
- Conector PNCP com rate limit, status explícito, fixtures gravadas e detector de filtro ignorado.
- Backfill de amostra (ex.: 60–90 dias) e medições: volume/dia, tamanho de texto, itens, % com documentos.
- Primeira versão do conjunto de avaliação de busca (≥ 150 consultas julgadas).
- Benchmarks: lexical vs. vetorial vs. híbrido; BGE-M3 vs. 1–2 alternativas; latência e recall do HNSW nos nossos dados.
- Verificar licença do `pg_search` e suporte no provedor de banco.

**Saída:** relatório com números medidos que substituem as estimativas dos docs; decisão confirmada (ou revisada) dos ADR-002/003/004.

## Fase 1 — MVP (Básico)

- Identidade, organizações, papéis, RLS, auditoria.
- Busca híbrida com filtros, facetas, destaque, explicação, cursor, buscas salvas, favoritos.
- Detalhe do edital, itens e documentos.
- Kanban com máquina de estados autoritativa, prazos e alertas de prazo.
- Planos, entitlements, teste grátis, cobrança por webhook.
- **Camada `LlmGateway` multi-provedor** e tela Configurações → IA (credenciais de plataforma; BYOK pode ficar para a P2 se apertar).
- Onboarding de 2 minutos (`01` §8).

**Saída:** SLOs de busca cumpridos em staging; `nDCG@10` do híbrido acima do lexical puro no conjunto de avaliação; teste de usabilidade com 5 licitantes com ≥ 80% de sucesso nas tarefas principais; testes de autoridade (`04` §10) verdes.

## Fase 2 — IA e radar (Middle)

- Monitores e alertas (novos, alterados, prazo) com digest.
- Leitor de edital com citações; "pergunte ao edital" com SSE; compatibilidade com perfil.
- Busca em linguagem natural → chips de filtro.
- **BYOK**, escolha de IA por pesquisa e painel de custo/qualidade por provedor.
- Conector Compras.gov.br (dados abertos).

**Saída:** conjunto dourado de IA com taxa de citação válida ≥ meta definida; custo médio por análise dentro do orçamento do plano; alertas p95 < 10 min.

## Fase 3 — Peças e precificação

- Gerador de propostas com exportação DOCX/PDF.
- Recursos e impugnações com corpus jurídico curado.
- Precificador com benchmark e simulação.
- Conectores de portais privados (conforme termos de uso).
- Relatórios de desempenho; API pública ampliada e webhooks; "comparar respostas" entre IAs.

## Fase 4 — Escala e expansão

- Multiempresa completo (Advanced).
- Mapa mercadológico (tendências por setor/região).
- Diários oficiais; CEIS/CNEP.
- Reavaliar ADR-002 conforme volume (réplica dedicada, conjunto frio fora do Postgres se necessário).

## Ordem sugerida para um agente de código

`packages/contracts` → migrations base + RLS → `identity`/`organizations` → conector PNCP + ingestão → `procurement_search` + busca lexical → embeddings + perna vetorial + RRF → `search-eval` → API de busca → web (busca) → pipeline → billing/entitlements → `ai-providers` → IA.
