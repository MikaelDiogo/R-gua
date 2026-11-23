# 04 — Servidor autoritativo

"Autoritativo" aqui significa: **o servidor é a única fonte de verdade e o único lugar onde regras são aplicadas.** O cliente pode ser modificado, automatizado ou malicioso; nada que ele diga é verdade por si só.

## 1. O que o cliente pode e não pode fazer

| O cliente PODE                                                           | O cliente NÃO PODE                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| Enviar **intenções** ("mover card X para a coluna Y", "buscar isto")     | Enviar resultados, estados finais ou campos calculados |
| Guardar cache e estado de UI                                             | Decidir permissão, plano, cota ou preço                |
| Prever resultado (atualização otimista) e **reconciliar** com a resposta | Enviar SQL, DSL de busca, prompt ou nome de modelo     |
| Mostrar relógio/contagem regressiva                                      | Ser a referência de tempo de prazo                     |

## 2. Modelo de comando

Toda mutação é um **comando** com:

- `Idempotency-Key` (UUID) — repetir o mesmo comando devolve o mesmo resultado, sem duplicar efeito.
- Versão esperada (`If-Match` com a `version` do recurso) — controle otimista de concorrência; conflito retorna `409` com o estado atual.
- Identidade e organização vindas **do token**, nunca do corpo.

Fluxo no servidor, em ordem fixa:
1. Autenticar → resolver usuário e organização ativa.
2. Validar entrada (zod) e rejeitar campos desconhecidos.
3. Autorizar (papel + propriedade do recurso + RLS).
4. Checar entitlements e cotas.
5. Executar regra de domínio (transição de estado, cálculo).
6. Persistir em transação, com evento em _outbox_.
7. Responder com o **estado resultante** (o cliente substitui o seu).

## 3. Máquinas de estado (exemplos)

### Card do pipeline

```
descoberto → em_analise → em_preparacao → proposta_enviada → em_disputa → (ganho | perdido | desistencia)
                     └──────────────→ descartado
```

- Transições permitidas ficam em uma tabela no domínio, não no front.
- Algumas exigem pré-condição: `proposta_enviada` exige proposta anexada; `em_disputa` exige data de sessão válida.
- Reabrir um card terminal exige papel `admin`.

### Assinatura

`trial → active → past_due → canceled`. O estado muda **somente** por webhook verificado do provedor de pagamento, nunca por chamada do cliente.

## 4. Tempo

- O relógio do servidor (UTC) é o único autoritativo para prazos, alertas e expiração.
- Prazos de edital vêm do PNCP e são normalizados; o cálculo de "faltam N dias úteis" usa calendário de feriados mantido no servidor.
- O cliente exibe contagem regressiva calculada a partir de `server_now` retornado em toda resposta relevante (corrige deriva do relógio do dispositivo).

## 5. Campos calculados e dados derivados

Calculados só no servidor e somente leitura para o cliente: pontuação de compatibilidade, status de prazo, cotas restantes, margem do precificador, totais de relatórios, _score_ de busca. O cliente envia **parâmetros** (ex.: custo e margem desejada), o servidor devolve o resultado.

## 6. Busca autoritativa

O cliente nunca monta consulta. Envia `SearchIntent` (`08-api.md`). O servidor:
- limita `limit`, profundidade de paginação, número de filtros e tamanho de texto;
- aplica escopo de organização e cotas do plano (ex.: janela de histórico);
- escolhe os índices, pesos e se usa rerank (por plano e carga);
- registra a consulta para métricas e histórico.

## 7. Eventos em tempo real (servidor → cliente)

Canal SSE por usuário/organização com eventos versionados: `card.updated`, `alert.created`, `ai_run.progress`, `ai_run.completed`, `quota.updated`. O cliente trata o evento como **dica para rebuscar** ou aplica o estado completo enviado; nunca confirma nada por conta própria.

## 8. Auditoria

Log append-only (`audit_log`) para: login, mudança de papel, convite, mudança de plano, transição de card, exportação, geração de peça por IA, acesso administrativo. Registra quem, quando (relógio do servidor), o que, de onde, antes/depois.

## 9. Anti-padrões proibidos

| Anti-padrão                                     | Correção                                                 |
| ----------------------------------------------- | -------------------------------------------------------- |
| `POST /cards {status: "ganho", orgId: ...}`     | Comando `move-card` com id do card; org vem do token     |
| Front calcula e envia o preço final             | Front envia entradas; servidor calcula                   |
| Esconder botão como única barreira de permissão | Checagem de permissão no servidor; a UI só reflete       |
| Cliente decide se tem cota de IA                | Servidor decide e responde `402/429` com problema tipado |
| Confiar em `Date.now()` do cliente              | Usar `server_now`                                        |
| Confirmar pagamento pelo redirect de sucesso    | Só por webhook assinado                                  |
| Prompt montado no front                         | Servidor monta a partir de templates versionados         |

## 10. Testes que provam a autoridade

- Teste de contrato: toda rota de mutação rejeita corpo com campos extras e ignora `orgId`/`userId`/`status` enviados pelo cliente.
- Teste de RLS: usuário da org A nunca lê dados da org B, mesmo com ids válidos.
- Teste de idempotência: repetir cada comando 2× produz um único efeito.
- Teste de concorrência: duas transições simultâneas, uma vence e a outra recebe `409`.
- Teste de entitlements por plano em todas as rotas gated.
