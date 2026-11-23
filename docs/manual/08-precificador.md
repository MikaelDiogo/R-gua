# 08 · Precificador

## Para que serve

O Precificador responde: **qual preço ganha com margem?** Ele tem duas partes:

1. **Faixa de preço por item:** compara os itens do edital com itens parecidos de outras contratações já guardadas na base e mostra o mínimo, a mediana e o máximo praticados.
2. **Simulador de margem:** a partir do **seu custo**, calcula o preço que entrega a margem que você quer.

Abra pelo menu **Precificador** ou pelo botão **Precificar** (na tela do edital e nos cartões do Funil). Se vier pelo menu, escolha o edital em "Escolha o edital para ver a faixa de preço".

## Conceitos

- **Referência do órgão (valor unitário):** quanto o órgão estimou por unidade no edital. Em geral é o teto: proposta acima dele pode ser desclassificada.
- **Mediana:** o valor do meio quando você ordena os preços. É menos enganada por valores muito altos ou muito baixos do que a média.
- **Quartis (1º a 3º):** a faixa onde ficam os 50% de preços do meio. É uma "zona normal" de preço.
- **Margem:** quanto do **preço de venda** vira lucro. Aqui a margem é **sobre o preço**, não sobre o custo (margem líquida).
- **Prejuízo:** vender abaixo do custo, contando impostos. O Régua escreve a palavra "prejuízo" quando o lucro é negativo.

## Faixa de preço por item

Ao escolher o edital, o Régua busca os itens no PNCP ("Buscando os itens do edital no PNCP…") e compara. A tabela traz, por item:

| Coluna | O que é |
|---|---|
| **Nº** e **Item** | O item do edital. |
| **Valor no edital (R$/un.)** | A referência do órgão. |
| **Amostras** | Quantos itens parecidos (mesma unidade) foram usados na comparação. |
| **Mediana (R$/un.)** | O preço do meio. |
| **1º a 3º quartil** | A zona normal de preço. |
| **Mín. a máx.** | Os extremos (depois de descartar valores muito fora da curva). |
| **Confiança** | Em palavras: **Alta**, **Média**, **Baixa** ou **Sem amostra**. |

Todos os valores são em reais **por unidade de medida do item**.

### Como ler a confiança

- **Sem amostra:** não há item parecido na base. Nenhum número é mostrado ("Ainda não há itens parecidos na base para comparar."). **Não é erro**: a base tem poucos itens coletados. Use só o valor do edital e o seu custo.
- **Baixa:** menos de 5 amostras ou preços muito dispersos. "Amostra pequena ou muito dispersa: use só como referência."
- **Média:** amostra razoável e preços razoavelmente juntos.
- **Alta:** 15 ou mais amostras com preços bem próximos.

Quando houver valores muito fora da curva, a tela avisa "N valor(es) muito fora da curva foram descartados." Se a base é pequena, aparece o aviso "A base de comparação ainda é pequena (N itens de outras contratações). Onde a confiança for baixa ou não houver amostra, use o número só como pista, não como preço final."

Para usar isso na proposta, clique em **Usar no preço da proposta**.

## Simulador de margem

Preencha:

| Campo | O que colocar |
|---|---|
| **Custo por unidade (R$)** | O que você paga para entregar uma unidade (compra, frete, tudo). Maior que zero. |
| **Impostos (%)** | Percentual de impostos sobre a venda (0 a 100). |
| **Margem sobre o preço (%)** | Quanto você quer de lucro, sobre o preço de venda. |
| **Quantidade** | Quantas unidades. Maior que zero. |
| **Referência por unidade (opcional)** | O valor do edital, para o Régua dizer se o seu preço cabe. |

Clique em **Calcular**. O servidor faz a conta (a IA nunca produz o número final):

- **Preço-alvo por unidade:** o preço que dá a margem pedida. A fórmula é preço = custo ÷ (1 − (impostos + margem)).
- Etiqueta **Cabe no valor de referência** ou **Acima do valor de referência**.
- **Preço mínimo (sem prejuízo):** abaixo disso você perde dinheiro.
- **Total no preço-alvo** e **Lucro no preço-alvo**.
- **Cenários de lance:** quatro linhas com preço unitário, margem e lucro: **Sem lucro (empate)**, **Lance agressivo** (metade da margem), **Preço-alvo** e **Com folga** (uma vez e meia a margem).

Os cenários servem para a sessão de disputa: você sabe até onde pode descer sem entrar no prejuízo.

### Mensagens do simulador

- "Informe o custo unitário (maior que zero)."
- "Impostos: use um percentual entre 0 e 100."
- "Informe a margem desejada em percentual."
- "A quantidade precisa ser maior que zero."
- "Impostos e margem somam 100% ou mais: não existe preço que entregue isso. Reduza um dos dois."

## Exemplo

Notebook com custo de R$ 3.600,00, impostos de 10% e margem de 15%. O preço-alvo é 3.600 ÷ (1 − 0,25) = R$ 4.800,00. Se o edital estima R$ 4.600,00 por unidade, aparece **Acima do valor de referência**: nesse preço você seria desclassificado. Reduza a margem ou procure um custo menor até caber.

## Estados e mensagens

| Situação | O que aparece |
|---|---|
| Edital sem itens | "Este edital não tem itens para comparar. O PNCP não trouxe itens, então não há o que precificar aqui. Use o simulador abaixo." |
| Erro | Faixa de erro com **Tentar de novo**. |
| Lucro negativo | O valor aparece em vermelho com a palavra "prejuízo". |

## Limites conhecidos

- A comparação usa **só os itens que o Régua já coletou** (Ceará e Piauí). Com a base pequena, a maioria dos itens aparece com confiança baixa ou **Sem amostra**.
- A comparação procura itens **parecidos pela descrição e pela unidade**: itens de especificações diferentes podem ser tratados como parecidos. Leia a mediana como **pista**.
- O preço não considera frete, prazo de pagamento nem custos específicos do órgão: ponha tudo no **custo por unidade**.
- Não há histórico de simulações salvas.
