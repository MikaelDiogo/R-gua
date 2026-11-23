# 06 · Funil

## O que é o Funil

O Funil (também chamado de pipeline) é um **quadro de colunas** para acompanhar os editais em que você tem interesse. Cada edital é um **cartão**, e cada coluna é uma **etapa** da disputa. Você move o cartão de uma coluna para outra conforme avança. Assim, de relance, você sabe o que está em análise, o que já tem proposta enviada e o que está para vencer o prazo.

Pense numa lista de tarefas do tipo "a fazer, fazendo, feito", só que cada tarefa é um edital e as colunas seguem o caminho de uma licitação. O Funil é **seu**: cada conta tem o seu.

Abra pelo menu **Funil**.

## Quando usar

Sempre que um edital te interessar: guarde-o no Funil em vez de depender de abas abertas ou de anotações. É a resposta a "o que preciso fazer esta semana?".

## Como colocar um edital no Funil

- Na tela do edital: **Vou disputar**.
- Nos resultados do [Chat de IA](02-chat-de-ia.md): **Salvar no funil**.
- Nos [alertas](10-monitores-e-alertas.md): **Salvar no funil**.

O cartão novo entra na coluna **Descoberto**. Salvar de novo o mesmo edital não cria cartão duplicado. Depois de salvo, o botão vira **Abrir no funil**.

Atenção ao nome: o botão da tela do edital se chama **Vou disputar**, mas o cartão cai em **Descoberto**. Você é quem o move para a coluna **Vou disputar** quando decidir.

## As colunas (etapas)

| Coluna | Quando mover o cartão para cá |
|---|---|
| **Descoberto** | Entrada. O edital foi guardado, mas você ainda não analisou. |
| **Em análise** | Você está lendo o edital, vendo se cumpre a habilitação e se o preço fecha. |
| **Vou disputar** | Você decidiu disputar e está preparando a proposta. |
| **Proposta enviada** | Você já enviou a proposta pelo portal do órgão e aguarda a sessão. |
| **Em disputa** | A sessão começou: lances, julgamento ou habilitação em andamento. |
| **Homologada** | Você **ganhou** e a licitação foi concluída. |
| **Perdida** | Você participou e não ganhou. |

Mais duas saídas, na lista **Encerrados**, embaixo do quadro:

- **Desistência:** você enviou proposta (ou já estava adiantado) e decidiu não seguir.
- **Descartado:** você viu o edital e decidiu que não serve, **antes** de enviar proposta.

O Funil **não tem** a coluna "Recurso em prazo". Se você recorrer, deixe o cartão onde está e registre na nota.

### Regras de movimento

O servidor confere cada movimento. Você pode mover livremente entre as etapas de trabalho (voltar e avançar), mas:

- **Homologada** só vale a partir de **Em disputa**.
- **Perdida** só vale a partir de **Proposta enviada** ou **Em disputa**.
- **Descartado** só vale a partir de **Descoberto**, **Em análise** ou **Vou disputar**. Depois de enviar a proposta use **Desistência**.
- Um cartão que já terminou (Homologada, Perdida, Desistência ou Descartado) só pode ser **reaberto**, e volta para **Em análise**.

Se você tentar um movimento proibido, a tela mostra o motivo escrito pelo servidor. Algumas dessas mensagens ainda usam as palavras antigas "Ganho" e "Perdido": "Ganho" é a coluna **Homologada**.

## Como mover um cartão

Há três jeitos:

1. **Arrastar:** pegue o cartão e solte na coluna de destino. Para descartar, solte-o sobre a faixa **Encerrados**: aparece "Solte aqui para descartar".
2. **Menu "Mover para…":** em cada cartão, escolha a etapa no menu. Ele também oferece "Encerrar como" Desistência ou Descartado.
3. **Teclado:** foque o cartão (Tab) e use **Alt + seta para a direita ou esquerda** para avançar ou voltar uma etapa.

No celular (menos de 768 px) o quadro vira uma lista agrupada por etapa, sem rolagem lateral, e você usa o menu "Mover para…".

## O cartão

Cada cartão mostra o objeto, o órgão e a UF, o **valor estimado**, a [régua de prazos](04-buscador.md#como-ler-a-régua-de-prazos) (em miniatura) e o **responsável** (um círculo com as iniciais; a cor é sempre a mesma para a mesma pessoa).

- **Prazo vencido:** o cartão ganha uma borda vermelha.
- **Responsável:** clique em "Definir responsável" (ou no nome) para escrever quem cuida do edital. É só um texto livre; ele não envia nada a ninguém.
- Ao abrir os detalhes do cartão: **Responsável**, **Notas** ("Anotações sobre este edital") e os atalhos **Precificar** e **Recurso ou impugnação**. Clique em **Salvar** para guardar. Enquanto houver mudança não salva a tela avisa "Alterações não salvas".
- Cada coluna mostra a **soma dos valores estimados** dos seus cartões. Cartões sem valor ficam fora da soma; passe o mouse sobre o total para ver quantos são.

## Filtros do quadro

- **Buscar no quadro:** por palavras do cartão.
- **Responsável:** Todos, uma pessoa ou "Sem responsável".
- **Prazo:** Todos, "Crítico (hoje ou amanhã)", "Em breve (até 5 dias úteis)", "Em dia", "Encerrado" ou "Sem prazo informado".

O cabeçalho resume: "N editais em andamento, M com prazo chegando."

## Estados e mensagens

| Situação | O que aparece |
|---|---|
| Funil vazio | "Seu funil está vazio. Busque editais e salve no funil para acompanhar prazos e responsáveis." com **Buscar editais**. |
| Coluna sem cartão | "Nenhum card nesta etapa." (ou "Nenhum card com este filtro."). |
| Lista de encerrados vazia | "Desistências e descartados aparecem aqui." |
| Sem conexão | "Sem conexão com o servidor. Nada foi salvo; tente de novo." |
| Conflito (409) | Alguém (você em outra aba) mudou o cartão antes. Recarregue e tente de novo. |

## Limites conhecidos

- O Funil guarda **o que você move**. Ele não consulta o resultado no portal do órgão: você precisa atualizar a etapa.
- Não há notificação por e-mail de prazo chegando. Use um [Monitor](10-monitores-e-alertas.md) para saber de editais novos.
- Não há compartilhamento do mesmo Funil entre contas: cada conta tem o seu.
- Não existe a etapa "Recurso em prazo".
