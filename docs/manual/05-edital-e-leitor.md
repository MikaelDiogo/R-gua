# 05 · Edital e Leitor de editais

## Para que serve

A tela do edital responde: **vale a pena disputar este?** Reúne os dados-chave, os documentos oficiais e a leitura feita pela IA, que separa exigências, prazos e riscos **com a página de onde saiu cada informação**.

Chegue a ela clicando no objeto de um edital no Buscador, no Radar, no Funil, nos alertas ou no chat.

## Conceito: o edital é a lei da licitação

Tudo o que vale na disputa está no edital e nos anexos (termo de referência, minuta de contrato, modelos de declaração). Quem não cumpre o que o edital pede é inabilitado ou desclassificado. Por isso o Régua insiste em mostrar de onde veio cada afirmação.

## A parte de cima da tela

- O **título** (por exemplo "Pregão - Eletrônico 045/2026"), o órgão e o local.
- Os botões de ação, abaixo.
- Avisos, quando houver:
  - **Edital revogado:** o órgão cancelou. Não há prazo.
  - **Edital suspenso:** confira no portal de origem antes de preparar proposta.
  - **Edital possivelmente alterado:** as datas parecem incorretas; confira o prazo no portal.
  - **Prazo encerrado:** você ainda pode ler o edital e acompanhar o resultado.
- O **Objeto** e etiquetas (**Registro de preços** quando o edital é SRP). Se o órgão escreveu o objeto TODO EM CAIXA ALTA, o Régua o mostra em frase normal para facilitar a leitura. Nas listas (Buscador, Radar, Funil, chat, alertas) o objeto aparece limitado a **3 linhas**; aqui está o texto inteiro.
- Os dados-chave (**Valor estimado**, **Propostas até** e **Situação**) e a **régua de prazos** inteira ([como ler](04-buscador.md#como-ler-a-régua-de-prazos)).

### Botões de ação

- **Vou disputar:** coloca o edital no [Funil](06-funil.md) (coluna "Descoberto"; depois você o move para "Vou disputar" quando decidir). Depois de salvar, vira **Abrir no funil**. Antes da leitura pela IA ele é o botão principal; depois da leitura, o principal passa a ser **Gerar proposta**.
- **Gerar proposta:** abre [Propostas](07-propostas.md) com este edital.
- **Precificar:** abre o [Precificador](08-precificador.md) com este edital.
- **Gerar recurso ou impugnação:** abre [Recursos e impugnações](09-recursos-e-impugnacoes.md) com este edital.
- **Ler PDF do edital:** abre o PDF numa **nova aba** (veja abaixo).
- **Abrir no portal de origem:** abre a página do edital no site onde ele foi publicado.

## Ler o PDF do edital

1. Clique em **Ler PDF do edital**.
2. Se os documentos já foram coletados, o PDF abre direto numa nova aba, sem baixar nada à mão. O Régua escolhe, nesta ordem: o PDF do tipo "edital"; qualquer documento chamado "edital"; o primeiro PDF da lista; e, por último, o primeiro documento que existir.
3. Se ainda não foram coletados, o botão mostra **Coletando…**, busca os arquivos no PNCP e depois abre.
4. Se o PNCP não tiver PDF cadastrado, aparece "O PNCP não tem PDF cadastrado para este edital. Abra pelo portal de origem."

**Atenção:** quando o PNCP não publica o edital, o botão abre o documento que existir, que pode ser só um **termo de participação** ou outro anexo. O Régua avisa isso no Leitor (veja abaixo). Nesse caso, confira o edital no **portal de origem**.

Se o arquivo vier compactado (ZIP), o Régua abre o primeiro PDF de dentro dele. Se não houver PDF, o servidor responde que o formato não é aceito.

## As abas

### Dados do edital

Número de controle no PNCP, número do edital e do processo, ano e sequencial, **Situação no PNCP**, **Registro de preços** (Sim ou Não), esfera (Federal, Estadual ou Municipal), unidade compradora, CNPJ do órgão, **Publicado em**, **Propostas a partir de** e **Propostas até**. Campo que o órgão não informou aparece como traço (—).

### Leitor de editais

A leitura pela IA. Passo a passo:

1. Clique em **Ler com IA**. Leva de **20 a 90 segundos**: o Régua coleta os documentos do PNCP, lê o texto e a IA organiza.
2. Você pode clicar em **Cancelar** durante a leitura.
3. O resultado aparece em duas colunas: o **Documento** à esquerda e a análise à direita.

A análise tem estas seções:

- **Resumo:** o que está sendo contratado, quem contrata, modalidade, critério de julgamento e valor.
- **Datas importantes:** abertura de propostas, sessão, prazo para impugnar e pedir esclarecimentos, entrega, vigência.
- **Habilitação:** documentos exigidos para poder contratar. Cada item diz se o texto o dá como **Obrigatório** ou "Não indica".
- **Exigências técnicas:** o que o objeto precisa ter.
- **O que a proposta precisa ter:** documentos, forma, validade e prazo de entrega.
- **Riscos:** com nível **Risco baixo**, **Risco médio** ou **Risco alto**. Alto só quando o texto sustenta gravidade.
- **Cláusulas que merecem atenção:** trechos para ler com calma.
- **O que o edital não esclarece:** o que **não consta** no texto e que você deve confirmar. A IA é instruída a **nunca preencher lacuna com conhecimento geral**: se o edital não diz, ela diz que não consta.

No alto da análise há o selo **Rascunho gerado por IA**, o modelo usado, o tempo, "resultado guardado" (quando a leitura já tinha sido feita antes) e "N de M citações conferidas no edital".

### Citações: como saber se a IA não inventou

Cada afirmação traz a **citação**: o nome do documento, a **página** e o **trecho copiado**. O servidor confere se o trecho existe mesmo naquela página:

- **conferido no edital** (verde): o trecho foi encontrado.
- **não conferido** (amarelo): o trecho **não foi encontrado**. Trate a afirmação com desconfiança e abra o PDF.

Clique numa citação (por exemplo "p. 12"): o painel **Documento** rola até o trecho e o marca. Cada citação também tem **Abrir no PDF (página N)**, que abre o PDF naquela página.

O painel **Documento** mostra só os trechos citados pela análise, agrupados por documento e página. Ele **não é** o texto completo do edital: para ler tudo, use **Ler PDF do edital**.

#### Estados do Leitor

| Situação | O que aparece |
|---|---|
| Antes da leitura | Texto de apresentação e o botão **Ler com IA**. |
| Lendo | "Lendo os documentos do edital…" com **Cancelar**. |
| Sem texto lido | "Não consegui ler o texto deste edital." com o motivo. Quando o PNCP só tem anexos que não são o edital, o motivo é "O PNCP não lista edital nem termo de referência para esta contratação.": **não há edital para a IA ler**, e ela não inventa um resumo. Outros motivos: PDF escaneado (sem OCR), documento grande demais, formato que não sei ler, ou falha ao baixar. Abra os documentos no PNCP. |
| Leitura parcial | "O edital é longo: a análise usou só o começo do texto. O que vem depois pode não estar na análise." Leia o resto no PDF. |
| Erro | Mensagem do problema e tentativa de novo. |

Para refazer a leitura, use **Analisar de novo**, no fim da análise.

### Itens

A lista de itens do edital, vinda do PNCP: **Descrição**, **Quantidade**, **Unidade**, **Valor unitário** e **Valor total**. Item sem valor mostra "O órgão não informou o valor deste item no PNCP". Se o PNCP não trouxe itens: "O PNCP não trouxe itens para este edital." Os itens são a base do [Precificador](08-precificador.md) e das [Propostas](07-propostas.md).

### Documentos

Os arquivos do edital, cada um com um estado de leitura:

| Estado | Quer dizer |
|---|---|
| Texto lido | A IA consegue ler. |
| Ainda não lido | Falta a coleta do texto. |
| Sem texto: leitura por OCR ainda não disponível | PDF escaneado (imagem): o Régua **não** lê. Abra o PDF e leia à mão. |
| Grande demais para ler | Passou do tamanho máximo aceito. |
| Não foi possível ler | Falha na leitura. |
| Formato que a Régua não lê | Tipo de arquivo não suportado. |

Cada documento tem o botão **Ler PDF**.

### Perguntas

Reservada para perguntar ao edital e receber a resposta com a página citada. **Ainda não está disponível**: o campo está desabilitado.

## Limites conhecidos

- **Sem OCR:** PDF escaneado, sem texto, não é lido pela IA.
- Edital muito longo é lido só no começo ("Leitura parcial").
- A IA erra. Use a leitura para **acelerar** e as citações para **conferir**.
- A aba **Perguntas** ainda não funciona.
- O Régua mostra os dados que o PNCP traz. Se o órgão cadastrou errado, o Régua repete o erro e avisa só quando o dado parece suspeito.
