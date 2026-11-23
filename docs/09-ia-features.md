# 09 — Funcionalidades de IA

## 1. Princípios

1. **Extrair antes de gerar.** Primeiro transformar o edital em dados estruturados (com citação); depois resumir, comparar e redigir a partir desses dados.
2. **Toda afirmação sobre o edital cita a origem** (`doc_id`, página, seção). Sem citação, o servidor não exibe como fato.
3. **Saída sempre validada por schema** (zod). Falhou? Um retry com a mensagem de erro; falhou de novo → `ai_run.failed`, sem texto livre "tentando adivinhar".
4. **Rascunho, não parecer.** Peças jurídicas e propostas são apoio; revisão humana é obrigatória e explícita na interface.
5. **Orçamento controlado:** cota por plano, teto por execução, custo registrado por `ai_run`.
6. **Dados do edital são não confiáveis** (`10-seguranca-lgpd.md` §4).

## 2. Funções de modelo (qualquer provedor)

| Função       | Tarefas                                                   | Exigência mínima                             |
| ------------ | --------------------------------------------------------- | -------------------------------------------- |
| **Rápido**   | Entendimento de consulta, classificação, extração simples | Baixa latência, saída estruturada            |
| **Analista** | Análise do edital, Q&A, compatibilidade                   | Contexto longo, saída estruturada, streaming |
| **Redator**  | Propostas, recursos, impugnações                          | Boa redação em português, streaming          |

Cada função aponta para um modelo de **qualquer provedor configurado** (Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama…), definido na tela Configurações → IA e, quando permitido, trocado pelo usuário em cada pesquisa ou conversa. Detalhes em `16-provedores-ia.md`. `ai_runs` registra `provider`, `model_id` e `credential_id`. **Nenhum ID de modelo nem provedor fixo no código.** Prompt caching é usado quando o provedor oferece.

## 3. Leitor de edital (RF-40)

Entrada: `procurement_id`. Saída (`EditalAnalysis`), cada campo com `citations[]`:

```ts
const EditalAnalysis = z.object({
  summary: z.string(), // 5–8 linhas
  object: z.string(),
  key_dates: z.array(
    z.object({ label: z.string(), at: z.string().datetime().nullable(), citations: Cits }),
  ),
  eligibility: z.array(Requirement), // habilitação jurídica, fiscal, técnica, econômica
  technical_requirements: z.array(Requirement),
  proposal_requirements: z.array(Requirement), // documentos e forma da proposta
  items: z.array(
    z.object({
      number: z.number(),
      description: z.string(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
    }),
  ),
  risks: z.array(
    z.object({
      level: z.enum(['low', 'medium', 'high']),
      description: z.string(),
      citations: Cits,
    }),
  ),
  clauses_of_attention: z.array(
    z.object({ topic: z.string(), text_excerpt: z.string().max(300), citations: Cits }),
  ),
  unknowns: z.array(z.string()), // o que o edital não esclarece
});
```

Pipeline: documentos processados → _map_ por seção (extração com schema parcial) → _reduce_ (consolidação, deduplicação) → validação de citações (cada `chunk_id` existe) → persistência. Documentos muito longos usam mapa por blocos e consolidação, nunca um único prompt gigante sem estrutura.

## 4. Pergunte ao edital (RF-41)

Descrito em `06-busca-ia.md` §10. Regras adicionais: histórico de conversa curto (últimas N trocas, resumido); respostas começam pela conclusão e depois justificam; quando a informação não está no edital, a resposta diz isso e não preenche com conhecimento geral sem sinalizar.

## 5. Compatibilidade edital × empresa (RF-42)

- Entrada: edital analisado + perfil da empresa (segmentos, atestados, certidões, UFs, porte).
- Saída: nota 0–100 **derivada de critérios explícitos** (cada critério com peso, status `meets | partial | missing | unknown` e citação do requisito). A nota é calculada **no servidor** a partir dos critérios; o modelo não "inventa" o número.
- Uso: ordenar o radar, explicar "por que este edital serve" e priorizar o Kanban.

## 6. Gerador de propostas (RF-43)

1. O servidor monta o contexto: itens do edital, requisitos de proposta, perfil da empresa, preços informados pelo usuário.
2. O modelo redige seções (carta-proposta, declarações padrão, descrição técnica) a partir de **modelos de documento versionados**; campos desconhecidos viram marcadores `[PREENCHER: …]` e não texto inventado.
3. Verificações determinísticas no servidor: valores somam, itens batem com o edital, prazos e validade coerentes.
4. Exporta para DOCX/PDF; marca d'água/rodapé "Rascunho gerado por IA — revisar antes de enviar".

## 7. Recursos e impugnações (RF-44)

- Entrada: cláusula(s) do edital ou ato do pregoeiro/comissão, fatos e objetivo do usuário.
- Base de conhecimento jurídico: corpus **curado** (lei 14.133/2021, jurisprudência de tribunais de contas, orientações do órgão de controle) com procedência e data. O modelo só cita fontes recuperadas desse corpus, com identificador verificável pelo servidor; **citação que não existir no corpus é removida e sinalizada**.
- Saída: minuta estruturada (cabimento, fatos, fundamentos, pedidos), com checklist de prazos (o prazo de impugnação/recurso é calculado no servidor a partir das datas do edital).
- Aviso permanente: a minuta não substitui assessoria jurídica; o usuário (ou advogado) revisa.
- Pendência de produto: montar e licenciar o corpus jurídico (ver `15-riscos-e-premissas.md`).

## 8. Precificador (RF-45)

Não depende só de LLM; é majoritariamente dados + estatística:

1. **Benchmark por item:** busca híbrida nos itens do histórico (conjunto frio), agrupando descrições equivalentes (similaridade vetorial + CATMAT quando houver).
2. **Estatística robusta:** mediana, quartis e remoção de _outliers_ (preços zero, unidades divergentes, valores absurdos), com `n` amostral e data da amostra. Alertar quando `n` é pequeno ou os dados têm `quality_flags`.
3. **Simulação de margem:** o usuário informa custo, impostos e margem; o **servidor** calcula preço-alvo, preço mínimo viável e cenários de lance.
4. **IA como assistente:** explica a faixa e sugere normalização de unidades; nunca produz o número final por conta própria.
5. A qualidade dos dados do PNCP é irregular (descrições e unidades de medida sem padronização); o precificador deve expor o grau de confiança da amostra.

## 9. Radar e monitores

- Monitores executam o `SearchIntent` salvo contra **somente os registros novos ou alterados** desde `last_run_at` (evento de ingestão), não contra toda a base.
- Compatibilidade calculada só para candidatos que passaram do corte inicial (barato primeiro, IA depois).
- Alertas agrupados em resumo (digest) por organização e canal, com limite de volume para evitar fadiga.

## 10. Controle de custo e qualidade

- Cota por plano e `max_tokens` por tipo de execução; cache por `hash(documento, versão do prompt, modelo)`.
- `ai_runs` guarda tokens, custo, `prompt_version`, `model_id`, latência; painel de custo por organização.
- **Avaliação de prompts:** conjunto dourado de editais anotados por especialistas; métricas de extração (precisão/recall de requisitos e datas), taxa de citação válida, taxa de recusa correta ("não consta no edital"). Mudança de prompt ou modelo passa por essa avaliação antes de ir a produção.
- _Feature flags_ para liberar novos prompts/modelos gradualmente.

## 11. Falhas e honestidade

| Situação                                         | Comportamento                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| PDF ilegível / OCR ruim                          | Análise parcial com aviso; nada de preencher lacunas               |
| Saída fora do schema após retry                  | `failed`; usuário vê erro claro; cota não é debitada               |
| LLM indisponível                                 | Fila com retry; usuário é avisado do atraso                        |
| Conflito entre documentos (edital × retificação) | Priorizar o mais recente e listar o conflito em `unknowns`/`risks` |
