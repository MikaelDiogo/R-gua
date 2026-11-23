# 08 — API (HTTP e SSE)

Contrato fonte da verdade: schemas zod em `packages/contracts` → OpenAPI gerado → cliente TypeScript gerado para o front. O front não escreve tipos à mão.

## 1. Convenções

- Base: `/v1`. Versionamento por prefixo; mudanças incompatíveis criam `/v2`.
- JSON, `snake_case` nos campos expostos, datas em ISO-8601 UTC.
- Autenticação: sessão por cookie `HttpOnly; Secure; SameSite=Lax` para o web; token Bearer por organização para a API pública.
- Organização ativa vem do token/sessão. Rotas aninhadas por `org` **não** aceitam `org_id` no corpo.
- Erros: `application/problem+json` (RFC 9457) com `type`, `title`, `status`, `detail`, `code` estável e `request_id`.
- Todas as respostas relevantes trazem `server_now`.
- Mutations: `Idempotency-Key` obrigatório; recursos versionados exigem `If-Match: <version>`.
- Rate limit: cabeçalhos `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; `429` com `Retry-After`.
- Paginação por cursor opaco: `?cursor=...&limit=...` → `{ items, next_cursor }`.
- `unknown keys` em corpo de entrada são **rejeitadas** (`.strict()`).

## 2. Códigos de erro de domínio (exemplos)

| `code`                 | HTTP | Significado                                       |
| ---------------------- | ---- | ------------------------------------------------- |
| `validation_failed`    | 422  | Entrada inválida                                  |
| `unauthenticated`      | 401  | Sem sessão válida                                 |
| `forbidden`            | 403  | Papel insuficiente                                |
| `plan_required`        | 402  | Recurso não incluso no plano                      |
| `quota_exceeded`       | 429  | Cota do período esgotada                          |
| `version_conflict`     | 409  | `If-Match` desatualizado; corpo traz estado atual |
| `invalid_transition`   | 409  | Transição de estado não permitida                 |
| `idempotency_mismatch` | 422  | Mesma chave com corpo diferente                   |
| `source_unavailable`   | 503  | Dependência indisponível (com `meta.source`)      |

## 3. Endpoints

### 3.1 Autenticação e conta

| Método e rota                                       | Descrição                                                 |
| --------------------------------------------------- | --------------------------------------------------------- |
| `POST /v1/auth/register`                            | Cria usuário + organização (teste grátis)                 |
| `POST /v1/auth/login` / `POST /v1/auth/logout`      | Sessão                                                    |
| `POST /v1/auth/password/reset-request`, `.../reset` | Recuperação                                               |
| `GET /v1/me`                                        | Usuário, organização ativa, papel, plano, cotas restantes |
| `GET/POST/PATCH/DELETE /v1/org/members`             | Gestão de membros e convites (admin+)                     |
| `GET /v1/org/subscription`                          | Estado do plano (somente leitura; alterado por webhook)   |
| `POST /v1/billing/checkout-session`                 | Cria sessão de pagamento no provedor                      |
| `POST /v1/webhooks/billing`                         | Webhook do provedor (assinatura verificada, sem sessão)   |

### 3.2 Busca e editais

| Método e rota                         | Descrição                                               |
| ------------------------------------- | ------------------------------------------------------- |
| `POST /v1/search`                     | Corpo: `SearchIntent`. Resposta: itens, facetas, `meta` |
| `GET /v1/search/suggest?q=`           | Sugestões e correções                                   |
| `GET /v1/procurements/{id}`           | Detalhe do edital (dados normalizados)                  |
| `GET /v1/procurements/{id}/items`     | Itens                                                   |
| `GET /v1/procurements/{id}/documents` | Documentos e status de processamento                    |
| `GET/POST/DELETE /v1/saved-searches`  | Buscas salvas                                           |
| `GET/POST/DELETE /v1/favorites`       | Favoritos e pastas                                      |

`POST` para busca é intencional (corpo estruturado e possivelmente sensível), mas é **segura e idempotente** por contrato: não exige `Idempotency-Key`.

Exemplo de resposta de `/v1/search`:

```json
{
  "items": [
    {
      "id": "…",
      "numero_controle_pncp": "…",
      "object": "Aquisição de microcomputadores portáteis…",
      "organ": { "cnpj": "…", "name": "…", "uf": "CE" },
      "modality": 6,
      "estimated_value": 245000.0,
      "proposals_close_at": "2026-11-12T17:00:00Z",
      "highlights": [{ "field": "object", "html": "…<mark>notebook</mark>…" }],
      "match": "both",
      "explain": { "lexical_rank": 3, "semantic_rank": 1, "boosts": ["open", "deadline_soon"] }
    }
  ],
  "facets": { "uf": [{ "value": "CE", "count": 112 }] },
  "next_cursor": "…",
  "meta": {
    "total_estimate": 1840,
    "total_exact": false,
    "legs": { "lexical": "ok", "semantic": "ok", "rerank": "skipped" },
    "degraded": [],
    "index_freshness_at": "2026-11-03T12:10:00Z",
    "took_ms": 212
  },
  "server_now": "2026-11-03T12:14:31Z"
}
```

### 3.3 Pipeline (Kanban)

| Método e rota                                | Descrição                                          |
| -------------------------------------------- | -------------------------------------------------- |
| `GET /v1/pipeline`                           | Colunas e cards (filtros por responsável, empresa) |
| `POST /v1/pipeline/cards`                    | Criar card a partir de `procurement_id`            |
| `POST /v1/pipeline/cards/{id}/commands/move` | Comando de transição `{ to_state }` (`If-Match`)   |
| `PATCH /v1/pipeline/cards/{id}`              | Notas, responsável (`If-Match`)                    |
| `GET /v1/pipeline/cards/{id}/history`        | Histórico                                          |

### 3.4 Monitores e alertas

| Método e rota                        | Descrição                                     |
| ------------------------------------ | --------------------------------------------- |
| `GET/POST/PATCH/DELETE /v1/monitors` | Monitores                                     |
| `GET /v1/alerts`                     | Alertas (cursor), `POST /v1/alerts/{id}/read` |

### 3.5 IA

| Método e rota                                        | Descrição                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POST /v1/ai/analyses`                               | Pede análise de edital `{ procurement_id }` → `202 { run_id }`                      |
| `GET /v1/ai/runs/{id}`                               | Estado e resultado validado                                                         |
| `GET /v1/ai/runs/{id}/events`                        | **SSE** de progresso e tokens                                                       |
| `POST /v1/ai/qa`                                     | Pergunta ao edital `{ procurement_id, question, thread_id? }` → resposta em **SSE** |
| `POST /v1/ai/proposals` / `appeals` / `impugnations` | Geração de peça (rascunho) → `202`                                                  |
| `POST /v1/ai/compatibility`                          | Compatibilidade edital × perfil                                                     |
| `POST /v1/pricing/benchmarks`                        | Benchmark de preços por item/descrição                                              |
| `POST /v1/pricing/simulations`                       | Simulação de margem (entradas → resultado calculado no servidor)                    |

### 3.5.1 Provedores de IA

Rotas de credenciais, modelos, roteamento e perfis em `16-provedores-ia.md` §6. As rotas de IA e `/v1/search` aceitam `ai_profile_id` opcional, validado no servidor; a resposta informa `meta.ai = { provider, model, fallback_used }`.

### 3.6 Eventos em tempo real

| Rota             | Descrição                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/events` | SSE por usuário/organização. Eventos: `card.updated`, `alert.created`, `ai_run.progress`, `ai_run.completed`, `quota.updated`. Suporta `Last-Event-ID` |

## 4. Contrato SSE

```
event: ai_run.progress
id: 18273
data: {"run_id":"…","stage":"extracting_requirements","pct":40}

event: qa.token
data: {"delta":"O edital exige…"}

event: qa.citation
data: {"chunk_id":"…","page":12,"section":"7.2"}

event: qa.done
data: {"answer_id":"…","usage":{"tokens_in":3100,"tokens_out":420}}
```

- `Content-Type: text/event-stream`, `Cache-Control: no-store`, _heartbeat_ a cada ~15 s.
- O cliente reconecta com `Last-Event-ID`; o servidor reenvia eventos persistidos do `ai_run` quando aplicável.
- Se o cliente fechar a conexão, o `ai_run` continua e o resultado fica disponível por `GET /v1/ai/runs/{id}`.

## 5. Validação e segurança nas bordas

- Limites de tamanho de corpo por rota; `q` ≤ 500 caracteres; `question` ≤ 2000.
- CORS restrito ao domínio do web; CSRF com _double submit_ ou `SameSite` + cabeçalho customizado nas mutations por cookie.
- Respostas nunca incluem dados de outra organização; `404` (não `403`) para recurso de outra organização.
- Webhooks: verificar assinatura, janela de tempo e idempotência por `event_id`.

## 6. Compatibilidade e evolução

- Campos novos são aditivos; remoções só em nova versão com _deprecation window_ e cabeçalho `Sunset`.
- Enums do contrato aceitam valores desconhecidos no cliente (o gerador deve tratar como `unknown`).
- Testes de contrato comparam o OpenAPI gerado com o snapshot no repositório; mudança sem atualização do snapshot falha o CI.
