# 10 · Monitores e alertas

## Para que serve

Um **monitor** é uma busca que fica guardada e **trabalha sozinha**: ele procura editais que combinem com o que você definiu e avisa quando aparece um **novo** ou quando muda um que ele já tinha visto. Você não precisa lembrar de buscar todo dia.

Os avisos chegam como **alertas**, na tela **Alertas**, dentro do Régua.

> **Atenção: o envio de alertas por e-mail ainda não está implementado.** Por enquanto os avisos aparecem só em **Alertas**, dentro do Régua. Esse mesmo aviso aparece fixo no rodapé da tela de Monitores e no passo 3 do assistente de criação. Para ver os alertas, você precisa abrir o sistema.

Abra pelo menu **Monitores** (os seus monitores) e **Alertas** (os avisos). Ao lado de "Alertas" aparece um número quando há alertas **não lidos**.

## Quando usar

- Você vende algo recorrente (por exemplo, "notebook", "merenda escolar") e quer saber de cada edital novo do ramo.
- Você acompanha um órgão específico.
- Quer garantir que não perde editais com um assunto específico, como LGPD.

## A tela de Monitores

No alto há uma frase que explica a tela: "Um monitor vigia o PNCP por você e avisa em Alertas quando surge edital novo com o que você procura." O botão principal é **Criar monitor**.

### Resumo

Três números:

- **Monitores ativos:** quantos estão rodando. Embaixo diz "Todos rodando" ou "N em pausa".
- **Editais que casam agora:** a soma dos editais que cada monitor encontra neste momento. Um mesmo edital pode ser contado em mais de um monitor. Se algum monitor não respondeu, a tela avisa "Somando os que responderam; algum monitor não respondeu." e mostra traço enquanto conta. **Nunca mostra zero no lugar de uma falha.**
- **Alertas não lidos:** quantos alertas você ainda não viu, com o atalho **Ver em Alertas**.

### Tabela de monitores

Uma linha por monitor, com as colunas:

- **Monitor:** o nome e, embaixo, o que ele procura, em etiquetas pequenas (palavras, estado, valor etc.).
- **Situação:** **Ativo** ou **Pausado**. O monitor criado pelo sistema leva também a etiqueta **Fixo** (veja "O monitor fixo de LGPD").
- **Casam agora:** quantos editais combinam hoje (traço se não deu para contar).
- **Novos:** quantos alertas novos esse monitor tem para você ler (destacado quando é maior que zero).
- **Última execução:** quando o monitor rodou pela última vez ("hoje 01:02").

À direita de cada linha:

- **Abrir:** abre a tela do monitor. A linha inteira também é clicável.
- **⋯ (três pontinhos):** um menu com **Executar agora**, **Pausar** (ou **Ativar**), **Editar** e **Excluir**. **Excluir** pede confirmação ("Excluir “nome”?") e **apaga também os alertas** do monitor. No monitor fixo, a confirmação lembra que o sistema o cria de novo no seu próximo login.

No celular, cada linha vira um bloco empilhado, sem rolar para o lado.

### Sem monitores ainda

A tela diz "Você ainda não tem monitores." e mostra **três atalhos** de um clique. Cada um abre o assistente de criação **já preenchido**, para você só conferir e criar:

- **Notebooks e informática**
- **Medicamentos e saúde**
- **Assessoria jurídica e LGPD**

### Rodapé

No fim da tela fica o aviso fixo: "Envio de alertas por e-mail ainda não está implementado. Por enquanto os avisos aparecem só em Alertas, dentro do Régua."

## Criar um monitor

Há três caminhos: o botão **Criar monitor** na tela de Monitores, um dos **três atalhos** de exemplo (tela vazia) ou **Criar monitor com esta busca**, no [Buscador](04-buscador.md) (o assistente já vem com a sua busca).

O assistente mostra "Passo X de 3" e tem **três passos**. À direita fica sempre a prévia **O que casa hoje**: quantos editais já combinam e três exemplos. A prévia fica visível enquanto você rola a página. Se a contagem falhar, ela diz que falhou, nunca "0 editais".

### Passo 1 · O que procurar

- **Palavras-chave:** num campo grande. Por exemplo "notebook, ar condicionado, merenda escolar".
- **Ou comece por um exemplo:** vários exemplos clicáveis. Ao clicar, o campo é preenchido e você ainda pode editar.

### Passo 2 · Onde e quanto

- **Estado:** Ceará e Piauí (botões com a sigla; clique para ligar ou desligar).
- **Órgão (opcional):** digite parte do nome do órgão e marque.
- **Modalidade (opcional):** o jeito de disputar. Sem marcar nenhuma, vale qualquer uma. As mais comuns aparecem primeiro, cada uma com uma explicação curta, e as demais ficam em **Outras modalidades**.
- **Valor mínimo (R$)** e **Valor máximo (R$)**.
- **Encerramento a partir de** e **Encerramento até:** faixa de datas do prazo das propostas.
- **Só editais com propostas abertas.**

### Passo 3 · Como avisar

- **Nome do monitor:** um nome que você reconheça.
- **Quando avisar:** **Na hora** (cada edital novo ou alterado vira alerta assim que o monitor roda) ou **Resumo diário** (os alertas do dia chegam juntos, uma vez por dia).
- **Onde avisar:** **No sistema (aba Alertas)**, sempre ligado. **E-mail** aparece com o rótulo **Em breve** e está **desabilitado**: não aceita nem guarda nenhum endereço.
- Embaixo, o aviso fixo de que o envio por e-mail ainda não está implementado.

Use **Voltar** e **Continuar** para andar entre os passos. No último, clique em **Criar monitor** (ou **Salvar alterações**, se estiver editando). Mensagens do assistente que você pode ver:

- "Informe palavras ou ao menos um filtro, para o monitor saber o que procurar."
- "Dê um nome ao monitor."
- "O valor mínimo é maior que o máximo."
- "A data inicial é depois da final."

Quando você cria, os editais que **já casam** viram o ponto de partida: eles **não** geram alerta. Só o que for **novo** depois disso, ou **alterado**, gera.

## A tela de um monitor

- Cabeçalho com o nome, a situação (**Ativo** ou **Pausado**), como avisa ("Avisa na hora" ou "Resumo diário") e as etiquetas do que ele procura.
- **Executar agora:** roda o monitor na hora. A resposta diz, por exemplo, "Executado agora: nada novo desde a última vez." ou "Executado agora: 2 novos, 1 alterado."
- **Editar**, **Pausar** (ou **Ativar**) e **Excluir**. Excluir pede confirmação e **apaga também os alertas** do monitor.
- Os **alertas novos** desse monitor, acima da tabela, com **Marcar todos como lidos**.
- **Editais que casam agora:** uma tabela com a régua de prazos de cada edital. Os que chegaram depois da criação do monitor levam a etiqueta **Novo**.

Estados: "Nenhum edital casa agora." (quando a busca respondeu) ou "A busca não respondeu por completo": isso não quer dizer que não existam editais; tente executar de novo.

### Com que frequência o monitor roda

O servidor roda os monitores **a cada 10 minutos**, enquanto está ligado. Um monitor "Resumo diário" é executado no máximo uma vez por dia. Pausar um monitor interrompe a execução.

## O monitor fixo de LGPD

Toda conta tem, automaticamente, o monitor **"Assessoria jurídica em LGPD (automático)"**, que acompanha editais sobre "proteção de dados" ou LGPD (Lei Geral de Proteção de Dados). Ele é criado no primeiro login e aparece com a etiqueta **Fixo**. Você pode pausar ou excluir como qualquer outro, mas o sistema o recria quando você entrar de novo.

## Alertas

Abra pelo menu **Alertas**. A tela lista os avisos, e você escolhe como ver:

- **Não lidos** (com a contagem) e **Todos**: alterna entre os que você ainda não viu e todos.
- **Por dia** e **Por monitor**: agrupa a lista por dia ou separa por monitor.
- **Todos os monitores:** um seletor para ver só um monitor.
- **Marcar todos como lidos** (botão secundário). Com um monitor escolhido, o botão vira **Marcar desta página como lidos**.

Cada alerta é uma linha com:

- A etiqueta **Novo** (edital que apareceu) ou **Alterado** (o edital mudou) e o ponto de "não lido".
- O objeto do edital (até 3 linhas), o órgão e a régua de prazos.
- **Abrir edital:** leva à tela do edital ([05](05-edital-e-leitor.md)).
- **Salvar no funil:** coloca o edital no [Funil](06-funil.md).
- **Marcar como lido:** tira o alerta da lista de não lidos.

Sem alertas: "Nenhum alerta novo." ou "Nenhum alerta ainda.", com a explicação de que os alertas aparecem quando um monitor achar edital novo ou mudança em um edital acompanhado.

## Exemplo

Você cria o monitor "Notebooks CE e PI" com a palavra "notebook", estados CE e PI e "Só editais com propostas abertas". Escolhe **Na hora**. Na manhã seguinte, abre **Alertas** e vê "Novo: Aquisição de notebooks… Prefeitura de Vale Verde". Você clica em **Abrir edital**, lê com a IA e, se interessar, clica em **Salvar no funil**.

## Limites conhecidos

- **O envio de alertas por e-mail ainda não existe.** O aviso fixo no rodapé da tela de Monitores diz isso. O campo **E-mail** do passo 3 está desabilitado, com o rótulo "Em breve", e não guarda nenhum endereço. Os alertas só aparecem dentro do Régua; o número ao lado de "Alertas" no menu mostra quantos você ainda não leu.
- O monitor só enxerga os editais que **estão na base** do Régua (Ceará e Piauí, parte do PNCP). Se o servidor ficar desligado, os monitores não rodam enquanto isso.
- A coluna **Casam agora** é um cálculo da própria tela, monitor por monitor. Se uma leitura falhar, aparece traço, e a soma pode contar duas vezes o mesmo edital.
- Não há **histórico de execuções** de cada monitor: só a data da última execução.
- Não há alerta de **prazo chegando** para os editais do seu Funil: isso é só pela régua de prazos do cartão.
- O "Resumo diário" agrupa por dia dentro do sistema; ele não envia um resumo fora dele.
