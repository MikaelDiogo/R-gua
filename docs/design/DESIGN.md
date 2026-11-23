# Régua — DESIGN.md

Fonte: o sistema de design Régua (`regua-design-system.html`), traduzido para este repositório em `tokens.css` (tokens) e `regua.css` (componentes `rg-*`). Os dois arquivos são idênticos em `docs/design/` e `apps/web/src/styles/`. Se o sistema mudar, mude os dois lugares no mesmo commit.

Este arquivo diz **como parecer**. `CLAUDE.md` diz como construir.

## Identidade

- **Nome:** Régua, escrito sempre com o acento agudo. Frase de apoio: "Licitações públicas lidas, disputadas e com prazo à vista."
- **Marca:** monograma de três barras de prazo cortadas pela linha de hoje (barras em `ink`, linha em `accent`) e, ao lado, o nome em Newsreader. Arquivos: `logo-regua.svg`, `apps/web/src/app/icon.svg` (favicon: monograma branco sobre quadrado `accent`). Componentes: `Mark` e `Logo` em `components/Icon.tsx`.
- **Tema claro apenas.** Não há tema escuro.
- Sistema fechado: sem planos, sem cadeados de plano, sem troca de empresa, sem cadastro público.

## Atmosfera

- Mesa de trabalho organizada, não painel de marketing. Calma, densa, legível. Papel quente com texto escuro, serifa nos títulos, um único acento verde-petróleo.
- Cerca de 5% dos pixels de uma tela têm cor, ou menos. A cor mora nos dados principais e na ação principal; o chrome é neutro.

## Voz e texto

- Português do Brasil, no jargão de quem disputa licitação: edital, órgão, objeto, pregão eletrônico, propostas até, habilitação, impugnação, homologada.
- Etapas do funil, com estes nomes: Em análise, Vou disputar, Proposta enviada, Em disputa, Homologada, Perdida, Recurso em prazo. Nada de rótulos genéricos ("Itens", "Registros", "Status", "Ativo").
- Botões começam pelo verbo: "Vou disputar", "Gerar proposta", "Salvar no funil", "Analisar com IA", "Tentar de novo".
- Frases curtas, sem ponto de exclamação, sem emoji. Sem "Bem-vindo de volta". A saudação do chat usa só o primeiro nome.
- Datas em dd/mm/aaaa (dd/mm quando o ano é óbvio); prazos relativos como "em 2 dias". Valores em R$ com milhar por ponto e centavos por vírgula: R$ 184.000,00.
- Dados fictícios só em teste; tela real mostra o que o servidor devolveu.

## Cor

Tokens em `tokens.css`. Nunca use valor solto.

| Papel             | Tokens                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Fundos            | `canvas` (página), `surface` (barra lateral, mensagem do usuário, grupos), `card` (cartões, tabelas, menus, compositor) |
| Linhas            | `hairline` (decorativa, 1px), `line-strong` (borda de controle, passa 3:1)                |
| Texto             | `ink` (títulos, números), `body` (corrido), `muted` (rótulos, legendas, metadados)        |
| Acento            | `accent`, `accent-active`, `accent-soft`, `on-accent`; `focus` = `accent`                 |
| Estados           | `success`, `warning`, `error`, `info`, cada um com `-soft`                                |
| Pessoas da equipe | `tone-clay`, `tone-sky`, `tone-rose`, `tone-moss`, `tone-sand`, `tone-slate` (iniciais em `ink`) |

- `accent` só para: a ação principal (uma por tela), o chip de modo ligado, links, a compatibilidade e outros dados principais, a linha de hoje na régua.
- Cores de estado só em estados e prazos, com o fundo pálido do mesmo nome e **sempre com palavra ao lado**.
- Separe com linha de 1px ou degrau de tom, nunca com sombra. Sem violeta e sem gradiente.
- **Vidro (decisão do dono do produto):** o efeito translúcido estilo iOS (`.rg-glass`, `.rg-glass-field`, `.wk-glass`, tokens `--glass-*`) vale em todo o sistema, mas SÓ nestas superfícies: **barra lateral** (`--glass-side`, desfoca a aura), **campos de formulário** (`--glass-bg-field`: filtros, propostas, precificador, recursos, monitores, administração, alterar senha e login), campo de busca e compositor do chat, barra de entrada fixa do chat, popovers e menus, painéis flutuantes (criar conta, senha gerada, cartão do login), barra superior móvel e gaveta (mais opaca, 92%). Botões secundários, chips e sugestões são translúcidos sem blur. **Nunca** em cartões de dados, tabelas, listas, KPIs ou texto corrido: esses ficam sólidos (`card`) por cima da aura. Blur só em elementos pequenos ou fixos (campos 10px, painéis e sidebar 18px). Texto sobre vidro mantém 4,5:1. Fallback sólido sem `backdrop-filter`, com `prefers-contrast: more` e com `prefers-reduced-transparency: reduce` (nesse caso a aura também some).
- **Aura:** o fundo de TODAS as telas (`body`, `background-attachment: fixed`) tem radiais suaves em `accent-soft`, `tone-sky` e `tone-sand`, para o vidro ter o que desfocar. Fica parada ao rolar e nunca carrega informação.

## Tipografia

Duas famílias, carregadas pelo `next/font` no `layout.tsx` (auto-hospedadas; sem requisição ao Google no navegador): **Newsreader** (`--font-serif`, 400 e 500) para títulos e **Instrument Sans** (`--font-sans`, 400, 500 e 600) para a interface. Monoespaçada só em código.

| Nome            | Especificação                         | Uso                                              |
| --------------- | ------------------------------------- | ------------------------------------------------ |
| `greeting`      | Newsreader 32px, 400, -0,5px          | Só a saudação do chat vazio                      |
| `page-title`    | Newsreader 24px, 400, -0,3px          | Título de cada tela de trabalho; nunca maior     |
| `section-title` | Newsreader 18px, 400                  | Blocos internos                                  |
| `kpi`           | Instrument Sans 28px, 500             | Números-chave                                    |
| `body`          | 14px, 400, entrelinha 1,5             | Interface e respostas                            |
| `caption`       | 13px                                  | Metadados                                        |
| `label`         | 12px, 500                             | Rótulos de campo, cabeçalho de tabela e de grupo |

Todo número em tabela, KPI ou régua usa `font-variant-numeric: tabular-nums`; números de tabela alinham à direita.

## Forma, espaço e profundidade

- Raios: `radius-xs` 4px (barras da régua, selos, tags), `radius-sm` 8px (botões, campos, itens de menu), `radius-md` 12px (cartões, tabelas, faixas), `radius-lg` 16px (compositor, janelas), `radius-pill` (chips de modo, sugestões, avatares).
- Espaço só em `space-1` a `space-12` (4, 8, 12, 16, 24, 32, 48). Padding de cartão `space-4` ou `space-6`; entre blocos `space-8`.
- Cartões não têm sombra. `shadow-composer` só no compositor; `shadow-menu` em menus, janelas, gaveta e cartão sendo arrastado.
- Medidas: `sidebar-width` 260, `topbar-height` 56, `control-height` 36, `touch-target` 44, `chat-column` 720, `ruler-bar` 20, `ruler-days` 14.

- **Foco de campos:** o anel (`--ring`, 3px, accent a 28%) aparece no CONTÊINER (`:focus-within`) com o raio do próprio componente (campos da busca e compositor: `radius-lg`), nunca como um retângulo do navegador no input interno. Inputs soltos usam borda `accent` + `--ring`, que seguem o raio do campo. Botões e links mantêm o anel sólido de 2px.
## Layout

- Barra lateral de 260px, conteúdo à direita. Chat em coluna central de no máximo 720px.
- Cada tela responde a uma pergunta, e o maior bloco responde primeiro. Em 1440×900 todo bloco mostra o título e as primeiras linhas acima da dobra.
- Navegação discreta: item ativo em `card` com contorno `hairline`, nunca em cor. Grupos da barra: **Trabalho** (Chat de IA, Radar, Buscador, Funil), **Documentos** (Propostas, Precificador, Recursos e impugnações), **Acompanhar** (Monitores, Alertas com contagem de não lidos). No rodapé: Configurações, usuário, Alterar senha e Sair.
- Tabelas com linhas finas `hairline`, cabeçalho sem fundo, sem zebra.

## A régua de prazos

Elemento que só este produto tem: faixa de 14 dias a partir de hoje em que cada edital é uma barra até o encerramento das propostas. Componente `DeadlineRuler` (`components/ui.tsx`).

- **O servidor calcula tudo.** `deadline.calendar_days` (dias corridos até encerrar), `deadline.level` e `deadline.label` vêm da API (`computeDeadline`, `packages/domain`). A tela só desenha: largura da barra = (`calendar_days` + 1) / 14, no máximo 100%, com "+" quando passa de 14 dias.
- Hoje é uma linha de 1px em `accent` à esquerda. A barra é `accent`; vira `warning` com 3 dias corridos ou menos (ou nível crítico); prazo encerrado não tem barra e o texto fica em `error`; prazo desconhecido mostra só o texto.
- O texto (`label`) aparece sempre: a cor reforça, não informa sozinha.
- Versão `mini` (10px) em listas, tabelas, cartões do funil e cartões do chat. A faixa com números de dia só aparece quando a página passa `today` (o `server_now` da leitura).

## Chat e modos de pesquisa

- O chat de IA (`/chat`) tem anexo (PDF de edital) à esquerda, chips **PNCP** e **Web** abaixo do texto e enviar à direita. PNCP e Web são independentes: só um, os dois ou nenhum; os dois desligados não é permitido (o servidor responde 422).
- **PNCP:** texto curto, linha de filtros aplicados e cartões de edital com "Salvar no funil", "Analisar com IA" e "Abrir no PNCP". **Web:** texto com citações numeradas em `info` e lista de fontes. Resultados da web levam o selo "Fora da nossa base · não verificado". Em conflito, o PNCP é o oficial e vem primeiro.
- Estados obrigatórios: pesquisando (etapas visíveis), sem resultados (o PNCP responde 204 sem corpo; trate como vazio, com sugestões), API fora do ar (faixa de erro e "Tentar de novo"), limite de uso de IA (sem bloquear o histórico).
- IA é rascunho com citação: sem trecho de suporte, "não consta no edital".

## Estados honestos

- Zero é 0. Dado ausente é um traço `muted` (—), com `title` dizendo por quê (`Dash` em `components/ui.tsx`).
- Seção vazia mantém a moldura, mostra a contagem 0 e diz o que fazer (`rg-empty`).
- `429` ou erro de fonte nunca vira "nenhum resultado". Degradação aparece em faixa `warning` (`StateBlock kind="degraded"`); erro, em faixa `error`.
- Todo componente tem carregando (barras cinza no tamanho real, sem brilho), vazio, erro e degradado.

## Iconografia

- Poucos ícones de traço (1,5 a 1,75px, cantos arredondados, `currentColor`, 16–18px), em `components/Icon.tsx` e `NavIcons.tsx`. Sem ícone dentro de círculo colorido, sem emoji, sem ilustração em estados vazios.

## Acessibilidade

- Texto passa 4,5:1 sobre os fundos citados; bordas de controle e marcas passam 3:1.
- Foco visível em todo controle: anel sólido de 2px em `focus`, afastado 2px. Tudo operável por teclado.
- Alvos de toque de 44px abaixo de 1024px.
- Estado nunca só por cor: chips têm ponto cheio ou vazio; tags e prazos têm texto.
- Respeite `prefers-reduced-motion`.

## Responsivo

- 1440 e 1024: barra lateral aberta. Abaixo de 1024px: topbar de 56px com botão de menu que abre a gaveta (rótulos de texto, alvos de 44px).
- 390: o chat ocupa a tela, o compositor fica fixo embaixo e os chips rolam na horizontal se faltar espaço. O funil vira lista agrupada por etapa. Sem rolagem horizontal da página.

## O que evitar

Emoji, gradiente, vidro fora de campos, popovers e barras flutuantes (nunca em cartões de dados nem tabelas), ícone em círculo colorido, sparkline em KPI, zebra em tabela, "Bem-vindo de volta", cabeçalho gigante em tela de trabalho (título até 24px), o coral do Claude ou qualquer paleta de assistente conhecido, e copiar texto, marca, imagem ou código de sites de referência.

## Telas

| Tela                    | Rota                      | Pergunta que responde                         | Estados                                                        |
| ----------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Chat de IA              | `/chat`                   | O que você quer achar ou resolver?            | vazio, pesquisando, sem resultado, API fora do ar, limite de IA |
| Radar de oportunidades  | `/`                       | O que chegou hoje que vale disputar?          | carregando, sem editais novos, erro, funil indisponível (degradado) |
| Buscador de licitações  | `/busca`                  | Que editais existem para o que eu vendo?      | carregando, sem resultados, filtros salvos                     |
| Detalhe do edital       | `/editais/[id]`           | Vale a pena disputar este?                    | edital alterado, prazo encerrado, sem anexos                   |
| Funil (Kanban)          | `/pipeline`               | O que preciso fazer esta semana?              | coluna vazia, arrastando, prazo vencido                        |
| Leitor de editais       | `/editais/[id]` (análise) | O que este edital exige e onde está o risco?  | lendo, falha de leitura, arquivo não suportado                 |
| Propostas               | `/propostas`              | A proposta está pronta para enviar?           | rascunho, gerando, revisada                                    |
| Precificador            | `/precificador`           | Qual preço ganha com margem?                  | sem histórico para o item, margem negativa                     |
| Recursos e impugnações  | `/recursos`               | Que minuta devo protocolar?                   | gerando, sem base encontrada                                   |
| Monitores e alertas     | `/monitores`, `/alertas`  | O que mudou no que eu acompanho?              | sem monitores, sem alertas, erro                               |
| Alterar senha           | `/configuracoes/senha`    | Como troco minha senha?                       | salvando, erro, sucesso                                        |
| Entrada                 | `/login`                  | Quem está entrando?                           | erro de credencial, limite de tentativas                       |

- **Administração (`/admin`):** só administradores. Tabela de contas (usuário, papel, criada em, último acesso), "Criar conta" (usuário, nome, papel, senha opcional; sem senha, o servidor gera uma e ela aparece UMA vez, com botão Copiar e o aviso "Anote agora: não será mostrada de novo"), "Redefinir senha" e "Excluir" com confirmação (desabilitado para a própria conta). Usuário comum vê 404; sem permissão na API mostra "Sem permissão".
- **Ler PDF do edital:** botão no detalhe do edital e nos cartões do chat. Abre o PDF numa nova aba (`/api/procurements/{id}/documents/{n}/file`); se os documentos ainda não foram coletados, mostra "Coletando…" e abre em seguida. No Leitor de editais, cada citação oferece "Abrir no PDF" na página citada (`#page=N`).
## Implementação no web

- `apps/web/src/styles/tokens.css` (tokens), `regua.css` (componentes `rg-*`), `app/globals.css` (reset, casca, cabeçalho de página, estados e primitivos `.btn`, `.field`, `.panel`, `.pill`) e `styles/legacy.css`.
- **`legacy.css` e o bloco "Compatibilidade" de `tokens.css` são temporários**: guardam nomes do sistema visual anterior para telas ainda não migradas. Cada tela migrada deixa de usá-los; quando nada mais referenciar, apague os dois.
- Segurança de cabeçalhos (`next.config.mjs`): CSP restrita a `'self'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS em produção. Nada vem de CDN em tempo de execução.
- **Proteção de rota:** `middleware.ts` leva ao login quem não tem o cookie `regua_session`; a API valida de verdade. Resposta 401 em qualquer chamada leva a `/login?next=`.
- A tela de entrada usa Mantine retematizado (cor primária `accent`, fonte Instrument Sans); as demais telas não usam Mantine.
- A UI reflete o servidor: prazo, cota, preço e compatibilidade nunca são calculados no cliente.
