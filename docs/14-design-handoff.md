# 14 — Design handoff (awesome-design-md + taste skill)

O visual será definido por um **`DESIGN.md`** (formato do _awesome-design-md_) e aplicado na implementação com a **taste skill**. Este documento define o contrato entre o design e o código, para que trocar o estilo não exija mudar componentes.

## 1. As duas peças

| Peça                                     | O que é                                                                                                                                                                                                                                                                              | Papel aqui                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **awesome-design-md** (VoltAgent)        | Coleção de arquivos `DESIGN.md` no formato do Google Stitch: tema e atmosfera, paleta com papéis, tipografia, componentes e estados, layout e espaçamento, elevação, boas práticas/anti-padrões, responsivo e guia de prompts. Cada um vem com `preview.html` e `preview-dark.html`. | Fonte do sistema visual. Escolher um como base e **adaptar** para uma identidade própria. |
| **taste skill** (`leonxlnx/taste-skill`) | Skill para agente de código que gera frontend com preferências estéticas embutidas e três controles: _design variance_, _motion intensity_, _visual density_.                                                                                                                        | Guia de execução ao gerar telas a partir do `DESIGN.md`.                                  |

Instalação da skill (no repositório do projeto):
```
npx -y skills add leonxlnx/taste-skill --skill design-taste-frontend-v1 --agent claude-code
```

## 2. Onde os arquivos ficam

```
docs/design/
├── DESIGN.md            # sistema visual adaptado (fonte da verdade do visual)
├── preview.html         # opcional, para revisão
└── taste-settings.md    # valores escolhidos dos controles da taste skill e justificativa
apps/web/src/styles/tokens.css   # tokens gerados a partir do DESIGN.md
```

`CLAUDE.md` da raiz diz **como construir**; `docs/design/DESIGN.md` diz **como parecer**.

## 3. Regras de identidade

- **Não usar** marca, logotipo, cores, ilustrações, fotos ou textos do LicitaHub.
- Os `DESIGN.md` do awesome-design-md descrevem estilos inspirados em marcas reais. Usar como **ponto de partida** e trocar nome, logotipo, paleta-chave e tipografia de marca para não se passar por outra empresa.
- Nome e logotipo próprios do produto ficam a definir.

## 4. Configuração sugerida da taste skill para este produto

É um app de trabalho com muitos dados, usado por horas. Sugestão inicial (ajustar com o design):

| Controle         | Padrão da skill | Sugestão                                            | Motivo                                                                                              |
| ---------------- | --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Design variance  | 8               | **4–5** no app, **7–8** na landing                  | App precisa de previsibilidade; landing pode ser expressiva                                         |
| Motion intensity | 6               | **3** no app, **6** na landing                      | Animação só para feedback (arrastar card, carregar resultado), respeitando `prefers-reduced-motion` |
| Visual density   | 4               | **6–7** em busca/Kanban, **4** em leitura de edital | Listas densas para varrer; leitura arejada                                                          |

## 5. Tokens obrigatórios (o DESIGN.md precisa fornecer)

- **Cores semânticas** (claro e escuro): `bg`, `surface`, `surface-raised`, `border`, `text`, `text-muted`, `primary`, `primary-contrast`, `focus`, `success`, `warning`, `danger`, `info`.
- **Cores de domínio:** status de prazo (`deadline-ok`, `deadline-soon`, `deadline-critical`, `deadline-closed`), nível de risco (`risk-low/medium/high`), estados do Kanban, `match-lexical`, `match-semantic`, `highlight` (marcação de termo encontrado), `ai-generated` (selo de conteúdo de IA).
- **Tipografia:** família de texto e de números (tabulares para valores e datas), escala, pesos.
- **Espaçamento, raios, elevação, z-index, durações e curvas de animação.**
- Contraste mínimo WCAG 2.2 AA em todos os pares texto/fundo, inclusive no escuro.

## 6. Componentes e estados que o design precisa cobrir

| Componente               | Estados/variações obrigatórios                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de busca universal | vazio, digitando, sugestões, consulta em linguagem natural convertida em chips, seletor de IA ("IA: … ▾")                                    |
| Chips de filtro          | ativo, removível, sugerido pela IA (editável)                                                                                                |
| Card de resultado        | normal, compacto, com destaque de termos, "por que apareceu", prazo (4 níveis), selo de qualidade de dado, favorito                          |
| Facetas                  | contagem exata e aproximada                                                                                                                  |
| Detalhe do edital        | abas: resumo IA, exigências, itens, documentos, perguntas                                                                                    |
| Resposta de IA           | streaming, citação clicável (abre página/trecho), "não consta no edital", erro, provedor/modelo que respondeu, selo "rascunho gerado por IA" |
| Kanban                   | coluna, card, arrastando, transição recusada pelo servidor (reverte com mensagem), conflito de versão                                        |
| Configurações → IA       | adicionar provedor, testar chave (ok/falha), chave mascarada, modelos por função, custo estimado                                             |
| Alertas                  | lista, digest, não lido                                                                                                                      |
| Estados globais          | carregando (skeleton), vazio com ação, erro com ação, **degradado** (ex.: busca semântica indisponível), offline                             |
| Plano                    | recurso bloqueado pelo plano (com explicação e upgrade), cota quase esgotada                                                                 |

## 7. Telas (MVP → P2)

Landing pública · Cadastro/onboarding (3 perguntas) · Radar/Início · Busca · Detalhe do edital · Kanban · Alertas · Configurações (organização, membros, plano, **IA**) · Peças geradas (P3) · Precificador (P3).

## 8. Regras para o agente que implementa a UI

1. Ler `docs/design/DESIGN.md` e `taste-settings.md` antes de criar qualquer componente.
2. Usar **só tokens**; nada de cor, espaçamento ou fonte fixos no componente.
3. A UI **reflete** o servidor: nunca esconder um botão como única forma de permissão, nunca calcular prazo, preço ou cota no cliente (`04`).
4. Atualização otimista só com reconciliação: se o servidor recusar, reverter e mostrar a mensagem do problema (`code` do RFC 9457).
5. Todo componente com estados de carregando, vazio, erro e degradado.
6. Acessibilidade: foco visível, navegação por teclado no Kanban (mover card sem mouse), `aria-live` para streaming de IA.
7. Antes de entregar uma tela: conferir nos temas claro e escuro, em celular e desktop, e com movimento reduzido.
