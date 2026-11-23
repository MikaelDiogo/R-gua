# 07 · Propostas

## Para que serve

A proposta é o documento em que você diz **quanto cobra** e **em que condições entrega**. Este módulo responde: **a proposta está pronta para enviar?** Você informa o **seu preço** por item e o Régua gera um **rascunho** com a carta-proposta, a descrição técnica, as declarações e as condições, e o total calculado. Depois você revisa, edita e baixa em Word.

Abra pelo menu **Propostas**. A lista mostra as que você já gerou, com busca ("Objeto ou órgão") e ordem (**Mais recentes**, **Maior valor**, **Órgão (A a Z)**). Para criar uma proposta, abra o edital e clique em **Gerar proposta**. O botão **Buscar um edital**, no alto da lista, leva ao [Buscador](04-buscador.md) para você achar o edital.

## Quando usar

Depois de decidir disputar e de ter definido o seu preço (veja o [Precificador](08-precificador.md)). A proposta é julgada: preço acima do limite, declaração faltando ou item esquecido podem **desclassificar** você.

## Passo a passo

### 1. Escolher o edital

Se você abrir a criação sem um edital escolhido, aparece **Qual edital?**: digite palavras do objeto (por exemplo "notebook") ou o identificador do edital e clique em **Buscar**. A busca traz editais abertos. Se não houver nenhum: "Nenhum edital aberto com essas palavras. A base ainda é uma parte do PNCP." Tente outros termos ou use o [Buscador](04-buscador.md). Se você veio pelo botão **Gerar proposta** do edital, esta escolha já vem feita.

Se você já tem proposta para o mesmo edital, a tela avisa e lista as anteriores. **Gerar outra cria uma nova, sem apagar as anteriores.**

### 2. Seus preços (passo "Seus preços")

O Régua busca os itens do edital no PNCP ("Buscando os itens do edital no PNCP…"). Aparece uma tabela:

| Coluna | O que é |
|---|---|
| Nº e Descrição | O item do edital. |
| Valor de referência do órgão | Quanto o órgão estimou para uma unidade. É o seu teto de bom senso. |
| **Seu preço unitário** | Você preenche. |
| Total (prévia) | Preço × quantidade. Só uma prévia: **o servidor recalcula** ao gerar. |

Preencha o preço dos itens que você vai disputar e clique em **Continuar**. **Itens sem preço ficam como [PREENCHER]** na proposta.

Se o PNCP não trouxe itens: "O PNCP não trouxe itens para este edital." (e, quando é falha de busca: "Isso não quer dizer que o edital não tenha itens.").

### 3. Gerar o rascunho (passo "Gerar rascunho")

Veja o resumo: **Itens com preço** e **Total (prévia)**. Em **Observações para a IA (opcional)** escreva condições que devem entrar no texto, por exemplo "prazo de entrega em 15 dias; garantia de 12 meses". Clique em **Gerar rascunho**. Leva de **20 a 90 segundos**; você pode cancelar. Aceita até um número limitado de preços por proposta; se passar, os últimos ficam como [PREENCHER] e a tela avisa.

## A tela da proposta (o rascunho)

No alto, o selo **Rascunho gerado por IA** e o lembrete: "Revisar antes de enviar. Confira preços, datas e declarações com o edital."

### Pontos de atenção

Acima do texto há a caixa **Antes de enviar: N pontos de atenção**. O servidor escreve cada ponto, por exemplo:

- "Item N sem preço informado."
- "Item N: seu preço (R$ X) está acima do valor de referência do órgão (R$ Y); pode levar à desclassificação."
- "Item N sem quantidade no edital: o total é o próprio preço informado."
- "O preço do item N foi ignorado: o edital não tem esse item."
- "As declarações são modelos padrão: confira com o edital e com o jurídico."
- "Perfil da empresa incompleto…": como o Régua **não tem** cadastro de empresa, este aviso aparece sempre. Quer dizer que os dados da sua empresa (razão social, CNPJ, representante) entram como [PREENCHER].

### As seções do texto

- **Carta-proposta**
- **Descrição técnica do objeto**
- **Declarações**
- **Validade e condições**

Cada seção tem **Editar** e **Concluir edição**. Edite à vontade: o texto é seu.

### [PREENCHER]

Tudo o que a IA **não pode inventar** vira `[PREENCHER: …]`: razão social, CNPJ, endereço, nome do representante, dados bancários. A tela conta as pendências ("N pendências [PREENCHER]") e mostra **Sem pendências** quando zeram. **Preencha todas antes de enviar** ao órgão.

### Itens e preços

A tabela final traz **Descrição**, **Preço unitário**, **Referência do órgão** e **Total**, e a linha **Total da proposta**. Os números são **somados pelo servidor**. Um item com preço acima da referência ganha a etiqueta **Acima da referência**.

## Salvar e baixar o Word

1. Edite o que precisar e clique em **Salvar alterações**. Enquanto há mudança não salva, aparece "Há alterações não salvas" e o botão de baixar fica como **Salve para baixar**.
2. Depois de salvar ("Alterações salvas"), clique em **Baixar DOCX**. O arquivo abre no Word.
3. Se ainda houver [PREENCHER], a tela avisa: "O DOCX sai com N pendências [PREENCHER]. Preencha antes de enviar ao órgão."

Se alguém (você mesmo, em outra aba) editou a mesma proposta antes, o salvamento é recusado por conflito e a tela guarda **Seu texto antes do conflito (não foi salvo)**: copie o que precisar, recarregue e refaça.

## Estados e mensagens

| Situação | O que aparece |
|---|---|
| Nenhuma proposta | "Você ainda não tem propostas. Abra um edital e clique em Gerar proposta." |
| Falha ao buscar itens | "Não foi possível buscar os itens no PNCP." com nova tentativa. |
| Gerando | "Gerando…" com o tempo estimado. |
| Erro da IA | Faixa de erro com o motivo (limite de uso, IA indisponível etc.) e **Tentar de novo**. |

## Exemplo

Pregão eletrônico 045/2026, notebooks, Prefeitura de Vale Verde (CE), valor de referência R$ 4.600,00 por unidade, 40 unidades. Seu preço: R$ 4.350,00. O total sai R$ 174.000,00. Como o preço está abaixo da referência, não há aviso de "Acima da referência". Os dados da empresa ficam como [PREENCHER] até você completar no Word.

## Limites conhecidos

- **O Régua não envia a proposta ao órgão.** O envio é feito no portal onde a licitação acontece.
- **Não há cadastro de empresa:** os dados da sua empresa sempre entram como [PREENCHER].
- A tela é de **coluna única**: não há edição lado a lado do edital e do rascunho.
- As declarações são **modelos padrão**. Confira com o edital e com um profissional.
- A IA pode errar o texto. O número final (total) é calculado pelo servidor, não pela IA.
- Não há versões salvas lado a lado: cada "Gerar rascunho" cria uma proposta nova.
