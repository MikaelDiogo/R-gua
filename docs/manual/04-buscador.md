# 04 · Buscador

## Para que serve

O Buscador responde: **que editais existem para o que eu vendo?** Você digita palavras e refina com filtros. Ao contrário do [Chat de IA](02-chat-de-ia.md), aqui não há IA decidindo: a busca é por palavras e pelos filtros que você escolhe, e o resultado vem rápido.

Abra pelo menu **Buscador**.

## Quando usar

- Você sabe o que procura (palavra-chave, número do pregão, CNPJ do órgão).
- Quer controlar valor, prazo, estado ou modalidade com precisão.
- Quer percorrer todos os editais de um órgão ou de uma faixa de valor.

## Passo a passo

1. Digite no campo "Palavra-chave, número do pregão, CNPJ ou uma frase" e aperte **Enter**. Em qualquer lugar da tela, a tecla **/** leva o cursor ao campo.
2. Use os **Filtros** à esquerda (veja abaixo). Cada mudança atualiza a lista.
3. Escolha a ordem em **Ordenar por**.
4. Clique no objeto de um edital para abri-lo ([05](05-edital-e-leitor.md)).

Na tela estreita (celular), os filtros ficam atrás do botão **Filtros (n)**, em que n é quantos filtros estão ligados.

## O campo de busca: sugestões e buscas recentes

Ao clicar no campo aparecem:

- **Você quis dizer:** correção quando a palavra parece errada.
- **Favoritas** e **Buscas recentes:** o histórico do que você já buscou, neste navegador. A estrela favorita uma busca (ela fica no topo); o **x** apaga uma. **Limpar histórico** apaga tudo.
- Sugestões de termos conforme você digita.
- "com filtros" marca as buscas que guardaram filtros além do texto.

Use as setas ↑ e ↓ para andar pela lista e Enter para escolher.

## Os filtros

| Filtro | O que faz |
|---|---|
| **Órgão** | Digite pelo menos 2 letras do nome do órgão ou prefeitura e marque um ou mais. |
| **Valor** | Atalhos "Até R$ 50 mil", "R$ 50 mil a R$ 500 mil", "Acima de R$ 500 mil" ou valores mínimo e máximo à mão. |
| **Prazo** | "Encerra hoje", "Em até 7 dias", "Em até 30 dias" ou "Escolher datas" (de/até). Aqui o prazo é o fim do recebimento de propostas. |
| **UF** | Ceará e Piauí, com a contagem de editais de cada um. |
| **Modalidade** | Pregão (eletrônico ou presencial), Concorrência, Dispensa, Inexigibilidade, Credenciamento e outras, com contagem. |
| **Situação** | "Só propostas abertas" (ligado por padrão). Desligue para incluir editais já encerrados: aparece o chip "Inclui encerrados". |

Os filtros ligados aparecem como **chips** acima da lista, cada um com um **x** para remover. **Limpar filtros** tira todos de uma vez.

**Criar monitor com esta busca** (botão no alto, quando há filtros ou texto) leva ao assistente de [Monitores](10-monitores-e-alertas.md) já preenchido com a sua busca.

## Ordenação

- **Relevância** (padrão): os mais parecidos com as palavras primeiro.
- **Prazo mais próximo**
- **Publicação mais recente**
- **Maior valor**

## A lista de resultados

O objeto de cada edital aparece em frase normal (se o órgão o escreveu TODO EM CAIXA ALTA, o Régua ajusta só na tela) e limitado a **3 linhas**. Clique nele para ver o texto inteiro na tela do edital.

É uma tabela com as colunas **Objeto e órgão**, **UF**, **Modalidade**, **Valor estimado** (à direita) e **Propostas até** (com a régua de prazos). Em cada linha, uma etiqueta mostra por que o edital apareceu: **Por palavra** (os termos estão no texto) ou, quando a busca por sentido estiver ligada, **Por sentido** ou **Palavra e sentido**. Etiquetas de aviso:

- **Revogado**, **Suspenso**, **Encerrado:** a situação do edital.
- **Valor não confiável:** o órgão não informou o valor estimado, ou ele parece errado.
- **Datas suspeitas:** as datas parecem incorretas, confira no PNCP.

No pé há a paginação, com escolha de quantos resultados por página. Acima da lista aparece quantos editais combinam e "índice atualizado às HH:MM".

## Como ler a régua de prazos

A régua mostra **quanto tempo falta para enviar a proposta**. Ela aparece no Buscador, no Radar, no Funil, nos cartões do chat e na tela do edital (nesta, inteira).

- A faixa tem **14 dias**, começando em **hoje**. A linha vertical fina à esquerda é hoje.
- A **barra** vai de hoje até o dia do encerramento. Quanto mais curta, mais perto o prazo. Se o prazo passa de 14 dias, a barra vai até o fim e mostra um **+**.
- A barra fica **âmbar (warning)** quando faltam 3 dias corridos ou menos, ou quando o prazo é crítico (hoje ou amanhã útil).
- **Prazo encerrado não tem barra:** só o texto, em vermelho.
- Embaixo da barra sempre há **o texto do prazo**, escrito pelo servidor. Exemplos: "encerra em 3 dias úteis · qui 12/11 17:00", "encerra hoje · 17:00", "encerrado em 02/11", "prazo não informado". A cor só reforça; o que vale é o texto.

Os dias são contados no **horário de Brasília** e, nas contas em dias úteis, só entram os feriados nacionais (feriados estaduais e municipais **não** entram). Em caso de dúvida, o prazo oficial é o do edital.

## Estados e mensagens

| Situação | O que aparece |
|---|---|
| Carregando | "Buscando…" |
| Sem resultados | "Nenhum edital encontrado." com **Limpar filtros**. Quer dizer que a busca respondeu e não há editais coletados com esses critérios. |
| Busca incompleta | "A busca não respondeu por completo.": uma parte falhou, então a lista vazia **não** quer dizer que não existam editais. **Tentar de novo**. |
| Recursos fora do ar | "Busca com recursos indisponíveis": a lista pode estar incompleta. |
| Erro | Faixa de erro com **Tentar de novo**. |

## Limites conhecidos

- **A base é uma parte do PNCP** (Ceará e Piauí). Editais fora dela não aparecem.
- **Não há buscas salvas no servidor.** O que existe é o histórico e as favoritas, guardados neste navegador. Para ser avisado de editais novos, crie um [Monitor](10-monitores-e-alertas.md).
- Não há "favoritos" nem pastas de editais. Para acompanhar um edital, leve-o ao [Funil](06-funil.md).
- Busca por sentido (semântica) depende de um componente que pode estar desligado: nesse caso vale só a busca por palavras.
