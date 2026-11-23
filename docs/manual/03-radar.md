# 03 · Radar

## Para que serve

O Radar responde a uma pergunta: **o que chegou hoje que vale disputar?** Mostra três números e a lista dos editais com o prazo mais próximo.

Abra pelo menu **Radar**. A tela inicial do Régua, ao entrar, é o [Chat de IA](02-chat-de-ia.md); o logotipo também leva ao chat.

## Quando usar

No começo do dia, para ver o que mudou. Ele não substitui a busca: é um resumo. **Só entram editais de Ceará e Piauí**: o subtítulo diz "N editais com propostas abertas em Ceará e Piauí", e os números e a lista nunca contam editais de outros estados.

## O que a tela mostra

### Três números

- **Novos hoje:** quantos editais foram publicados no PNCP **hoje** (entre os que o Régua já coletou).
- **Vencem esta semana:** quantos editais com propostas abertas têm o prazo de encerramento nos próximos 7 dias.
- **Valor em propostas:** a soma do valor estimado dos editais **do seu Funil** que estão nas etapas "Vou disputar", "Proposta enviada" ou "Em disputa". Embaixo, "N no seu funil" diz quantos são. Se nenhum desses editais tem valor estimado, aparece um traço (—): o órgão não informou o valor. Os dois primeiros números são do sistema inteiro; este terceiro é só seu.

### Prazos mais próximos

Uma lista dos editais abertos que encerram primeiro. Cada linha traz o objeto (clique para abrir o edital; texto em caixa alta aparece em frase normal e a lista mostra até 3 linhas do objeto), o órgão, a UF, a modalidade, o valor estimado (ou traço, quando o órgão não informou) e a [régua de prazos](04-buscador.md#como-ler-a-régua-de-prazos). **Ver todos** abre o Buscador já filtrado para os próximos 7 dias, do prazo mais próximo ao mais distante.

### Encerramentos por semana

Barras mostrando quantos editais abertos encerram em cada semana ("Semana de 02/11" é a semana que começa nessa data).

### O que já foi coletado

Diz quantos editais o Régua tem guardados e a data do mais antigo. **Só o que está nessa base aparece na busca.**

## Estados e mensagens

| Situação | O que aparece |
|---|---|
| Ainda não há editais coletados | "Ainda não há editais coletados. Quando a coleta do PNCP rodar, eles aparecem aqui." |
| Sem prazo próximo | "Sem editais novos com prazo se aproximando", com o botão **Abrir o Buscador**. |
| O Funil não respondeu | "O funil não respondeu": o terceiro número vira traço até a próxima leitura. |
| Falha geral | Uma faixa de erro com **Tentar de novo**. |

O botão **Perguntar no chat** leva ao [Chat de IA](02-chat-de-ia.md).

## Limites conhecidos

- **Não há "compatibilidade" por edital no Radar.** Esse percentual só aparece nos resultados do Chat de IA.
- Os números dependem da base: se a coleta do PNCP não rodou há algum tempo, "Novos hoje" pode estar baixo sem que o PNCP esteja parado.
- Não há relatórios de desempenho (taxa de sucesso, gráficos por período) nem mapa por região.
