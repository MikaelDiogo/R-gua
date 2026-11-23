# 16 — Provedores de IA plugáveis (troca de chave e de modelo)

Requisito: **trocar a chave de API e o provedor de IA com facilidade, e escolher com qual IA pesquisar/analisar**, sem mudar código nem fazer deploy.

## 1. Princípios

1. **Nenhum provedor é especial no código.** O domínio fala com a porta `LlmGateway`; cada provedor é um adaptador.
2. **Configuração, não código.** Provedor, modelo, chave e roteamento por tarefa são dados no banco, editáveis na tela de Configurações → IA.
3. **Chave só no servidor.** A chave é enviada uma vez, criptografada, testada e nunca mais devolvida ao cliente (só os 4 últimos caracteres).
4. **O cliente escolhe entre opções permitidas, o servidor decide.** O usuário escolhe um "perfil de IA" de uma lista que o servidor montou; o servidor valida permissão, plano, capacidade do modelo e orçamento.
5. **Trocar o LLM não quebra a busca.** Embeddings do índice são uma escolha separada (ver §7).

## 2. Provedores suportados

| Provedor                                              | Adaptador             | Observação                                                                   |
| ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| Anthropic (Claude)                                    | nativo                | Padrão sugerido da plataforma                                                |
| OpenAI                                                | nativo                |                                                                              |
| Google (Gemini)                                       | nativo                |                                                                              |
| Groq                                                  | compatível com OpenAI | Baixa latência; bom para entendimento de consulta                            |
| OpenRouter                                            | compatível com OpenAI | Um acesso a muitos modelos                                                   |
| Ollama / vLLM / LM Studio (local ou servidor próprio) | compatível com OpenAI | Dados não saem do ambiente; qualidade depende do modelo                      |
| "Personalizado (compatível com OpenAI)"               | genérico              | Qualquer `base_url` + chave (ex.: Azure OpenAI, DeepSeek, Mistral, Maritaca) |

Implementação sugerida no TypeScript: **Vercel AI SDK (`ai` + `@ai-sdk/*`)** dentro dos adaptadores. Ele já unifica streaming, saída estruturada com zod e _tool calling_ entre provedores. Alternativa: **LiteLLM** como proxy separado (mais um serviço para operar). A porta `LlmGateway` isola essa escolha, e trocar de biblioteca não muda o domínio.

## 3. Porta e capacidades

```ts
interface LlmGateway {
  generateObject<T>(req: {
    task: AiTask;
    schema: ZodType<T>;
    system: string;
    input: LlmInput;
    profileId?: string;
  }): Promise<LlmResult<T>>;
  streamText(req: {
    task: AiTask;
    system: string;
    input: LlmInput;
    profileId?: string;
  }): AsyncIterable<LlmStreamEvent>;
  testConnection(credentialId: string): Promise<ConnectionTestResult>;
  listModels(credentialId: string): Promise<ModelInfo[]>;
}

type AiTask =
  | 'query_understanding'
  | 'classification'
  | 'edital_analysis'
  | 'qa'
  | 'compatibility'
  | 'proposal'
  | 'legal_draft'
  | 'search_summary';
```

Cada modelo cadastrado tem um **perfil de capacidades**, preenchido automaticamente quando possível e editável pelo admin:

| Capacidade                                                 | Uso                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `context_tokens`                                           | Decide chunking/map-reduce do edital                           |
| `structured_output` (nativo / via tool / só JSON em texto) | Extração com schema; sem suporte nativo usa reparo + validação |
| `streaming`                                                | Q&A e redação                                                  |
| `tool_calling`                                             | Busca agentiva (P3)                                            |
| `prompt_caching`                                           | Redução de custo quando houver                                 |
| `price_in/out` (por 1M tokens)                             | Estimativa de custo e orçamento                                |

O servidor **recusa** usar um modelo numa tarefa para a qual ele não tem capacidade mínima (ex.: modelo com 8K de contexto em análise completa de edital → usa map-reduce ou recusa com mensagem clara).

## 4. Onde as chaves vivem

Dois níveis, combináveis:

| Nível                  | Quem configura                                                                     | Para quê                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Plataforma**         | Operador (você), via variáveis de ambiente/secret manager ou painel de super-admin | Chaves padrão que atendem todos os clientes, com custo embutido no plano    |
| **Organização (BYOK)** | Admin da organização, na tela Configurações → IA                                   | Cliente usa a própria chave e o próprio provedor; consumo sai da conta dele |

Resolução por chamada: **escolha do usuário (se permitida) → padrão da organização → padrão da plataforma**, sempre filtrando por capacidade da tarefa e plano.

### Armazenamento seguro

- Tabela `ai_credentials`: `id, org_id (NULL = plataforma), provider, base_url, label, key_ciphertext, key_last4, data_key_id, status, last_tested_at, created_by`.
- **Criptografia em envelope:** chave cifrada com AES-256-GCM usando uma _data key_, que por sua vez é cifrada por uma chave mestra no KMS/secret manager. A chave mestra nunca fica no banco.
- RLS por `org_id`; só papéis `owner`/`admin` criam, trocam ou apagam credenciais.
- A API nunca retorna a chave; logs e traces têm _redaction_ de qualquer coisa parecida com chave.
- Rotação: "trocar chave" cria nova versão, testa, ativa e só então desativa a antiga (sem downtime). Auditoria de cada ação.
- `base_url` personalizado passa por lista de bloqueio de SSRF (sem IPs privados/metadata de nuvem) na plataforma em nuvem; endpoints locais (Ollama) só em instalação self-hosted ou por túnel explicitamente autorizado.

## 5. Experiência de troca (UX)

Tela **Configurações → IA**, em 3 passos:

1. **Adicionar provedor:** escolher na lista (ícone + nome), colar a chave, clicar **Testar**. O servidor faz uma chamada mínima e lista os modelos disponíveis.
2. **Escolher modelos por função:** três seletores simples, com recomendação pré-preenchida:
   - _Rápido_ (entendimento de consulta, classificação)
   - _Analista_ (leitura de edital, perguntas, compatibilidade)
   - _Redator_ (propostas, recursos, impugnações)
     Cada um mostra custo estimado por análise e aviso se faltar capacidade.
3. **Política de escolha:** "membros podem escolher a IA em cada pesquisa" (sim/não) e orçamento mensal por provedor.

Na **barra de pesquisa e no painel de IA do edital**, um seletor compacto "IA: Claude · Analista ▾" deixa o usuário trocar o perfil naquela pesquisa/conversa. A resposta mostra qual provedor e modelo respondeu. Opção "comparar respostas" (P3): roda a mesma pergunta em 2 perfis lado a lado.

## 6. Contrato de API

| Método e rota                         | Descrição                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /v1/ai/providers`                | Catálogo de provedores suportados (nome, campos necessários)                 |
| `GET /v1/ai/credentials`              | Credenciais da org (sem chave; `key_last4`, status, último teste)            |
| `POST /v1/ai/credentials`             | `{ provider, api_key, base_url?, label }` → testa e salva (admin+)           |
| `POST /v1/ai/credentials/{id}/rotate` | Nova chave com teste antes de ativar                                         |
| `POST /v1/ai/credentials/{id}/test`   | Teste de conexão                                                             |
| `DELETE /v1/ai/credentials/{id}`      | Revoga (falha se for a única usada por um perfil ativo, com mensagem)        |
| `GET /v1/ai/models?credential_id=`    | Modelos disponíveis + capacidades                                            |
| `GET/PUT /v1/ai/routing`              | Modelo por função (rápido/analista/redator) e política de escolha            |
| `GET /v1/ai/profiles`                 | Perfis que **este usuário** pode escolher agora (já filtrados pelo servidor) |

Rotas de IA existentes (`/v1/search`, `/v1/ai/qa`, `/v1/ai/analyses`…) aceitam `ai_profile_id` opcional. O servidor valida e registra em `ai_runs.provider`, `ai_runs.model_id`, `ai_runs.credential_id`.

## 7. Embeddings e reranker: escolha separada

- O índice de busca precisa que **documentos e consultas usem o mesmo modelo de embedding**. Trocar o embedding exige reindexar todo o conjunto.
- Por isso o embedding é **configuração da plataforma**, não da pesquisa do usuário. Padrão: BGE-M3 auto-hospedado (`03-stack.md` ADR-004). Também plugável por adaptador (`EmbeddingProvider`: TEI local, OpenAI, Cohere, Voyage, Gemini), mas a troca é uma operação planejada:
  1. criar nova coluna/tabela de vetores com `embedding_model` novo;
  2. reindexar em background;
  3. rodar o conjunto de avaliação (`06` §9);
  4. virar a chave por _feature flag_;
  5. remover os vetores antigos.
- O usuário escolhe livremente a IA que **entende a pergunta, resume, analisa e redige**. A recuperação continua estável e rápida.

## 8. Prompts portáveis entre provedores

- Templates de prompt versionados (`prompt_version`) com partes por provedor só quando necessário (ex.: formato de cache, _tool use_).
- Saída estruturada sempre validada por zod no servidor, independentemente do provedor; se o provedor não tiver modo estruturado nativo, usar instrução + reparo + validação.
- O conjunto dourado de avaliação de IA (`09` §10) roda **por perfil de modelo**. O painel mostra qualidade, latência e custo por provedor, para o admin escolher com dados.

## 9. Resiliência entre provedores

- Timeout, retry e circuit breaker **por credencial**.
- _Fallback_ opcional configurável: se o provedor primário falhar ou atingir limite, usar o secundário e marcar `meta.fallback_used`. Desligado por padrão para BYOK, porque o cliente pode não querer que os dados vão para outro provedor.
- Erros do provedor viram problemas tipados claros: `ai_provider_auth_failed` (chave inválida/expirada), `ai_provider_quota` (cota do cliente no provedor), `ai_model_unsupported_task`, `ai_provider_unavailable`.

## 10. LGPD e dados enviados

- A tela mostra, para cada provedor, onde os dados são processados e um link para a política do provedor. Escolher o provedor é decisão do admin da organização.
- Opção "somente provedores sem retenção / locais" para organizações sensíveis.
- Antes de enviar ao LLM, remover dados pessoais desnecessários (já mascarados na ingestão, `05` §10).
