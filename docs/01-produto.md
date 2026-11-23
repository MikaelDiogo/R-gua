# 01 — Produto e escopo

## 1. Proposta de valor

Empresas que vendem ao governo perdem tempo em três pontos: achar editais relevantes, ler documentos longos e controlar prazos e peças. O produto reduz cada um deles: busca precisa, IA que lê o edital, pipeline com prazos.

## 2. Personas

| Persona                                         | Objetivo                                             | Dor principal                                   |
| ----------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Licitante de pequena empresa (dono ou 1 pessoa) | Achar editais certos sem pagar caro                  | Falta de tempo, planilhas, medo de perder prazo |
| Analista de licitações em empresa média         | Volume: acompanhar dezenas de editais ao mesmo tempo | Ler editais, padronizar propostas               |
| Consultoria / assessoria                        | Atender vários clientes (CNPJs)                      | Separar dados por cliente, relatórios           |
| Administrador da conta                          | Controlar usuários, plano e cobrança                 | Visibilidade e custo                            |

## 3. Jornadas principais

1. **Descoberta:** define perfil da empresa (segmentos, UFs, faixa de valor) → recebe radar → refina busca → salva busca como monitor.
2. **Qualificação:** abre edital → vê resumo, exigências, riscos, compatibilidade → decide entrar ou descartar.
3. **Disputa:** move card no Kanban → atribui responsável → gera proposta → precifica → acompanha prazos.
4. **Pós-sessão:** gera minuta de recurso ou impugnação → revisa → exporta.

## 4. Requisitos funcionais

Prioridade: **M** = MVP, **P2/P3/P4** = fases seguintes (ver `13-roadmap-mvp.md`).

### 4.1 Conta, tenancy e planos

- RF-01 (M) Cadastro, login, recuperação de senha, convite de usuários.
- RF-02 (M) Organização (tenant) com papéis: `owner`, `admin`, `member`, `viewer`.
- RF-03 (M) Planos Básico / Middle / Advanced com _entitlements_ aplicados no servidor.
- RF-04 (M) Teste grátis com limites de uso.
- RF-05 (P4) Multiempresa: várias empresas (CNPJs) sob uma organização, com perfis separados.

### 4.2 Busca

- RF-10 (M) Busca por texto livre com filtros: órgão, UF/município, modalidade, faixa de valor, status, janela de prazo, esfera, data de publicação.
- RF-11 (M) Busca híbrida (lexical + semântica) com ordenação por relevância ou por prazo.
- RF-12 (M) Facetas com contagem (UF, modalidade, faixa de valor).
- RF-13 (M) Destaque de trechos que casaram e explicação do motivo do resultado.
- RF-14 (M) Histórico de buscas e buscas salvas.
- RF-15 (M) Sugestões de termos e correções (digitação, sinônimos do domínio).
- RF-16 (M) Favoritos e pastas.
- RF-17 (P2) Busca em linguagem natural ("pregões de TI em CE acima de 200 mil abrindo esta semana") traduzida para `SearchIntent`.

### 4.3 Monitores e alertas

- RF-20 (P2) Monitor = busca salva + perfil + canais de notificação.
- RF-21 (P2) Alerta para editais novos e para alterações em editais acompanhados (prazo, retificação, anulação).
- RF-22 (P2) Canais: e-mail, push web; WhatsApp como opcional (P3).

### 4.4 Gestão (Kanban)

- RF-30 (M) Pipeline com colunas configuráveis por organização.
- RF-31 (M) Card por edital, com responsável, prazos, notas, anexos, histórico.
- RF-32 (M) Transições validadas no servidor (ver `04-servidor-autoritativo.md`).
- RF-33 (M) Alertas de prazo calculados no servidor.
- RF-34 (P3) Relatórios de desempenho (taxa de sucesso, valor em propostas).

### 4.5 IA

- RF-40 (P2) Leitor de edital: resumo estruturado, exigências de habilitação, riscos, datas, itens.
- RF-41 (P2) "Pergunte ao edital": perguntas em linguagem natural com citação de cláusula/página.
- RF-42 (P2) Compatibilidade (0–100) entre edital e perfil da empresa, com justificativa.
- RF-43 (P3) Gerador de propostas a partir do edital e do perfil.
- RF-44 (P3) Minutas de recurso e impugnação com base em fundamentação jurídica.
- RF-45 (P3) Precificador: benchmark por item em histórico, margem, cenário de lance.

### 4.6 Plataforma

- RF-50 (M) Cobrança recorrente e gestão de assinatura via provedor de pagamento (o servidor decide o estado do plano a partir dos webhooks).
- RF-51 (M) API pública para integrações (token por organização) — escopo mínimo no MVP, ampliação em P3.
- RF-52 (M) Exportações (CSV/PDF) com permissão checada no servidor.

## 5. Matriz de entitlements

Avaliada exclusivamente no servidor (`EntitlementService`). Valores numéricos de cota são sugestões iniciais.

| Capacidade                           | Teste    | Básico | Middle      | Advanced       |
| ------------------------------------ | -------- | ------ | ----------- | -------------- |
| Busca + filtros                      | sim      | sim    | sim         | sim            |
| Kanban                               | sim      | sim    | sim         | sim            |
| Precificador                         | limitado | sim    | sim         | sim            |
| Monitores                            | 1        | 0      | 10          | 30 por empresa |
| IA leitora de editais (análises/mês) | 3        | 0      | 100         | 300            |
| Perguntas ao edital (mensagens/mês)  | 10       | 0      | 500         | 1500           |
| Gerador de propostas                 | 1        | 0      | sim         | sim            |
| IA recursos/impugnações              | 0        | 0      | sim         | sim            |
| Empresas (CNPJs)                     | 1        | 1      | 1           | N              |
| Suporte                              | e-mail   | e-mail | prioritário | prioritário    |

## 6. Fora de escopo (por ora)

- Robô de lances e participação automática em disputas em portais (exige credenciais do licitante e tem risco regulatório e contratual com os portais).
- Cadastro/credenciamento do fornecedor em portais.
- Aplicativo móvel nativo (a web deve ser responsiva).

## 7. Onde queremos ser melhores que a referência

| Ponto                  | Referência (o que o site mostra)                | Nosso alvo                                                                                    |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| IA                     | Uma IA embutida, sem escolha                    | **Escolha de provedor e modelo**, BYOK, troca de chave pela tela (`16-provedores-ia.md`)      |
| Transparência da busca | "Precisão de filtro 98%" (sem método publicado) | Cada resultado diz **por que** apareceu; qualidade medida por conjunto de avaliação (`06` §9) |
| Confiança na IA        | Resumo do edital                                | Toda afirmação **com citação** de página/cláusula; "não consta no edital" quando não há       |
| Status das fontes      | Não informado                                   | Frescor do índice e falhas de fonte visíveis; lista vazia nunca esconde erro                  |
| Linguagem natural      | "Sugestões inteligentes"                        | Pergunta em português vira filtros editáveis (chips)                                          |
| Precificador           | Benchmark                                       | Benchmark com tamanho da amostra e grau de confiança                                          |
| Integração             | "APIs"                                          | API pública documentada (OpenAPI) e webhooks                                                  |

## 8. Usabilidade (requisitos mensuráveis)

- RNF-UX-01 **Onboarding em até 2 minutos:** cadastro → 3 perguntas (o que vende, onde atua, faixa de valor) → radar já preenchido. Sem tela vazia.
- RNF-UX-02 **Uma caixa de busca** que aceita palavra, número de edital, CNPJ ou frase; os filtros aparecem como chips removíveis.
- RNF-UX-03 **No máximo 3 cliques** do resultado ao card no Kanban, e 1 clique para "analisar com IA".
- RNF-UX-04 **Estados claros** em toda tela: carregando (skeleton), vazio (com sugestão de ação), erro (com o que fazer), degradado (ex.: "busca semântica indisponível, mostrando busca por palavras").
- RNF-UX-05 **Atalhos de teclado** para quem usa muito (`/` busca, `j/k` navegar, `a` analisar, `k` mover para o Kanban).
- RNF-UX-06 **Responsivo** e utilizável no celular para consultar alertas e prazos.
- RNF-UX-07 **Acessibilidade** WCAG 2.2 AA (contraste, foco visível, navegação por teclado, leitor de tela).
- RNF-UX-08 **Linguagem do licitante:** termos do mercado (pregão, habilitação, ata de registro de preços), sem jargão técnico de IA na interface.
- RNF-UX-09 **Trocar a IA** em até 2 cliques na barra de pesquisa; trocar a chave em uma tela, com botão "Testar".
- Validação: teste de usabilidade com 5 licitantes reais por fase, medindo tempo de tarefa e taxa de sucesso.

## 9. Métricas de produto

Taxa de ativação (primeira busca salva em 24h), editais analisados por usuário/semana, tempo até primeiro alerta útil, retenção D30, conversão teste → pago, precisão percebida dos alertas (thumbs up/down).
