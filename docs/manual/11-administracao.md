# 11 · Administração

> Esta área existe **só para administradores**. Quem não é administrador não vê o item "Administração" no menu e, se abrir o endereço `/admin`, recebe "página não encontrada".

## Para que serve

O Régua não tem cadastro público. É aqui que o administrador **dá acesso** a outras pessoas: cria contas, redefine senhas de quem esqueceu e remove contas de quem saiu.

Abra pelo menu **Administração** (ícone de cadeado, na parte de baixo do menu lateral).

## Conceitos

- **Administrador:** pode criar, redefinir e excluir contas. Só administradores acessam esta área.
- **Usuário:** usa o Régua normalmente, sem acesso a esta área.
- Cada conta é **separada**: o Funil, as propostas, as peças e os monitores de uma conta não aparecem para as outras, nem para o administrador na tela.

## A lista de contas

A tabela mostra, para cada conta: **Usuário**, **Papel** (Administrador ou Usuário), **Criada em** e **Último acesso** (traço quando a conta ainda não entrou). Em cima, "N conta(s)" e a hora da leitura.

## Criar uma conta

1. Clique em **Criar conta**.
2. Preencha:
   - **Usuário:** de 3 a 32 caracteres; só minúsculas, números, ponto, hífen e sublinhado; começa com letra ou número. Exemplos: `maria.silva`, `joao-2`.
   - **Nome (opcional):** o nome que aparece no menu.
   - **Papel:** **Usuário** ou **Administrador** ("Administradores criam e removem contas").
   - **Senha (opcional):** pelo menos 10 caracteres. **Deixe vazio para gerar uma senha forte.**
3. Clique em **Criar conta** (ou em **Criar com senha gerada**, quando o campo de senha está vazio).
4. Aparece **Conta criada** com a senha. **Anote agora: não será mostrada de novo.** Use o botão de copiar. Entregue a senha à pessoa por um canal seguro e peça que ela a troque em **Alterar senha** no primeiro acesso.

A senha é guardada só como um código embaralhado (hash): nem o administrador consegue ver uma senha depois dessa tela.

Regras de senha aplicadas aqui: mínimo de 10 caracteres, sem o nome de usuário dentro e fora da lista de senhas fracas (por exemplo `admin`, `senha`, `123456`, `regua`).

Mensagens:

- "O usuário "x" já existe." Escolha outro nome.
- "A senha não pode conter o nome de usuário." / "Essa senha é fraca demais. Escolha outra."

## Redefinir a senha de alguém

1. Na linha da conta, clique em **Redefinir senha**.
2. O Régua gera uma senha nova e a mostra **uma vez** ("Senha redefinida"). Anote e entregue à pessoa.

Ao redefinir, **as sessões abertas dessa conta são encerradas**: a pessoa precisa entrar de novo com a senha nova. Se o administrador redefinir a **própria** senha por aqui, a sessão dele também cai.

## Excluir uma conta

1. Clique em **Excluir** na linha da conta.
2. Confirme em **Excluir agora** (ou cancele).

**Atenção: excluir apaga junto, para sempre, o Funil, as propostas, as peças e os monitores daquela conta.** Não há como desfazer.

Regras:

- Você **não pode excluir a própria conta** ("Você não pode excluir a própria conta").
- O **último administrador não pode ser excluído** ("Este é o último administrador e não pode ser excluído"). Crie outro administrador antes.

## Trocar a senha do admin inicial

Em produção, o servidor **recusa subir** se existir usuário com senha fraca (inclusive a conta `admin` com a senha `admin`). Antes de colocar o sistema no ar, troque a senha do administrador. Se você tem acesso ao servidor, o comando é `user reset admin` (veja `docs/12-infra-deploy.md`).

## Estados

| Situação | O que aparece |
|---|---|
| Carregando | Esqueleto da tabela. |
| Sem contas | "Nenhuma conta. Use "Criar conta" para dar acesso a alguém." |
| Falha ao atualizar | "Não consegui atualizar a lista" (a lista antiga continua na tela). |
| Sem permissão | "Sem permissão" (você não é administrador). |

## Limites conhecidos

- Não há convite por e-mail nem redefinição de senha por e-mail: **tudo é feito aqui**, com a senha mostrada uma vez.
- Não há papéis intermediários (só Usuário e Administrador).
- Não há registro de auditoria visível na tela. O servidor registra em log quem criou, redefiniu ou excluiu uma conta, sem as senhas.
- A lista não tem busca nem paginação.
