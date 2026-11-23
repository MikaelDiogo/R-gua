# 15 — Riscos, premissas e perguntas abertas

## 1. Premissas

| #   | Premissa                                                                                     | Como validar                                                |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P1  | O PNCP concentra a maior parte das licitações relevantes                                     | Comparar amostra de portais privados com o PNCP na Fase 0/2 |
| P2  | O volume cabe em um Postgres bem dimensionado com conjunto quente em RAM                     | Medições da Fase 0 (`11` §4)                                |
| P3  | Busca híbrida supera lexical pura no nosso domínio                                           | Conjunto de avaliação (`06` §9)                             |
| P4  | BGE-M3 é bom o bastante em português de editais                                              | Comparação com alternativas na Fase 0                       |
| P5  | O custo de IA por análise cabe nos preços de planos semelhantes aos da referência (R$69–149) | Medir custo por análise por provedor; ajustar cotas         |
| P6  | Usuários aceitam IA como rascunho com citação                                                | Testes de usabilidade                                       |

## 2. Riscos

| Risco                                                            | Impacto                         | Mitigação                                                                                              |
| ---------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| API do PNCP muda comportamento, limites ou schema                | Ingestão para ou corrompe dados | Validação de schema, status por fonte, fixtures, detector de filtro ignorado, alertas                  |
| Rate limit do PNCP torna o backfill lento                        | Atraso no lançamento            | Começar pelo mais recente; dados abertos para histórico; paralelismo conservador                       |
| Qualidade ruim dos dados (datas, valores, descrições)            | Busca e precificador enganosos  | `quality_flags`, penalização, avisos na UI, amostra/confiança no precificador                          |
| Licença AGPL do `pg_search` incompatível com o modelo de negócio | Troca de componente             | Porta `LexicalRetriever` com fallback FTS; avaliar licença comercial; `pg_textsearch` como alternativa |
| Provedor de banco gerenciado não suporta `pg_search`             | Operar Postgres próprio         | Decidir na Fase 0; VM com backups testados                                                             |
| Prompt injection via edital                                      | Respostas manipuladas           | `10` §4, testes adversariais                                                                           |
| Alucinação jurídica (jurisprudência inexistente)                 | Dano ao cliente e reputacional  | Citações só do corpus curado verificado; aviso de rascunho                                             |
| Custo de IA acima do previsto                                    | Margem negativa                 | Cotas, cache, modelos por função, BYOK, painel de custo                                                |
| BYOK expõe chave do cliente                                      | Incidente grave                 | Envelope + KMS, sem retorno ao cliente, redaction, auditoria                                           |
| Termos de uso de portais privados proíbem coleta                 | Risco jurídico                  | Só fontes com API/feeds oficiais ou acordo; revisão jurídica por portal                                |
| Concorrência madura (Effecti, ConLicitação, outros)              | Diferenciação fraca             | Foco nos diferenciais de `01` §7: escolha de IA, transparência, citações, UX                           |

## 3. Perguntas abertas (decisão humana)

1. Nome e identidade visual do produto (qual `DESIGN.md` base?).
2. Modelo de distribuição: SaaS apenas, ou também instalação on-premise/self-hosted (afeta licença AGPL e suporte a Ollama local)?
3. Orçamento de infraestrutura e de GPU para embeddings/rerank.
4. Provedor de nuvem e provedor de pagamento.
5. Quais portais entram e quando (Compras.gov.br na P2 já previsto)?
6. Corpus jurídico para recursos/impugnações: construir, licenciar ou parceria com especialistas?
7. BYOK: liberado em todos os planos ou só no Middle/Advanced? A IA da plataforma continua incluída quando o cliente usa a própria chave?
8. Política de retenção de `ai_runs` e documentos dos clientes.
9. Escopo da API pública no MVP.
