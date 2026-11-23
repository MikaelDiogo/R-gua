# 10 — Segurança, tenancy, LGPD e IA

## 1. Autenticação e sessão

- Senhas com Argon2id; política mínima de tamanho, verificação contra senhas vazadas (k-anonimato).
- MFA opcional (TOTP) e obrigatório para `owner`/`admin` em planos pagos (configurável).
- Sessão por cookie `HttpOnly; Secure; SameSite=Lax`, rotação na elevação de privilégio, expiração por inatividade.
- Rate limit e bloqueio progressivo em login e recuperação de senha.
- SSO (OIDC) em fase posterior para clientes maiores.

## 2. Autorização e isolamento de tenant

- RBAC (`owner`, `admin`, `member`, `viewer`) aplicado nos casos de uso, não só nos controllers.
- **RLS no Postgres** como segunda barreira (`07` §7). A aplicação conecta com papel sem `BYPASSRLS`.
- Recursos de outra organização retornam `404`.
- Testes automatizados de isolamento em todas as rotas (`04` §10).

## 3. Segredos

- Segredos da plataforma em secret manager; nunca em repositório ou imagem.
- Chaves de IA (plataforma e BYOK) com criptografia em envelope e KMS (`16` §4); jamais em logs, traces ou mensagens de erro.
- Rotação documentada e testada para todas as chaves.

## 4. IA: prompt injection e saída não confiável

O texto de editais e anexos é **conteúdo de terceiros** e pode conter instruções maliciosas ("ignore as instruções e…").

Defesas em camadas:
1. Separação estrita: instruções do sistema fixas e versionadas; conteúdo do edital vai em bloco delimitado e rotulado como dado; o modelo é instruído a nunca seguir instruções dentro do dado.
2. **Sem ferramentas perigosas** no contexto de leitura de edital: o modelo não executa ações, não chama URLs, não acessa dados de outras organizações. _Tool calling_ (P3) só com ferramentas de leitura escopadas pelo servidor.
3. Saída validada por schema; campos com formato rígido (datas, valores, enums) verificados deterministicamente.
4. Citações verificadas contra os chunks enviados (`06` §10).
5. Renderização segura: saída do LLM é texto/markdown sanitizado, sem HTML bruto, sem links automáticos para domínios não permitidos.
6. Conjunto de testes adversariais (editais com injeções plantadas) no pipeline de avaliação.

## 5. Arquivos e rede

- Download de documentos só de hosts permitidos, com limite de tamanho, tipo verificado por conteúdo (não pela extensão) e antivírus.
- Processamento de PDF em contêiner isolado, sem acesso à rede interna, com limites de CPU/memória/tempo.
- Proteção contra SSRF em qualquer URL configurável (webhooks do cliente, `base_url` de IA).

## 6. LGPD

### 6.1 Papéis e bases legais (validar com jurídico)

| Tratamento                                                      | Papel         | Base legal provável                                                                                                           |
| --------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Dados de conta (usuários dos clientes)                          | Controlador   | Execução de contrato                                                                                                          |
| Dados que o cliente insere (notas, perfis, documentos próprios) | Operador      | Conforme instrução do cliente (contrato/DPA)                                                                                  |
| Dados públicos do PNCP                                          | Controlador   | Dados tornados públicos (art. 7º, §§ 3º e 4º), respeitando finalidade, boa-fé e interesse público que justificou a publicação |
| Envio de conteúdo a provedores de IA                            | Suboperadores | Listados no DPA; BYOK: provedor escolhido pelo cliente                                                                        |

### 6.2 Medidas

- **Minimização na ingestão:** CPF e nomes de pessoa física em contratos são descartados ou mascarados (`05` §10). Não indexar dados pessoais desnecessários à finalidade.
- Embeddings derivados de dados pessoais são tratados como dados pessoais; por isso a minimização ocorre antes de gerar vetores.
- Direitos do titular: exportação e exclusão de conta; exclusão propaga para cache, índices e backups dentro da janela de retenção.
- Registro de operações de tratamento (ROPA), encarregado (DPO) nomeado, política de privacidade e de cookies.
- Hospedagem no Brasil; transferência internacional (provedores de IA fora do país) documentada com as salvaguardas aplicáveis, e opção de provedores locais/self-hosted (`16` §10).
- Incidentes: plano de resposta e comunicação à ANPD e titulares conforme regulamento vigente.

## 7. Segurança de aplicação

- OWASP ASVS nível 2 como referência; OWASP Top 10 for LLM Applications para a parte de IA.
- Cabeçalhos: CSP restritiva, HSTS, `X-Content-Type-Options`, `Referrer-Policy`.
- Dependências com varredura (SCA) e atualização contínua; imagens mínimas com varredura.
- SAST no CI; DAST antes de cada release relevante; pentest externo antes do lançamento público.
- Backups criptografados, testes de restauração mensais.

## 8. Auditoria

`audit_log` append-only (`07` §6) com: autenticação, mudança de papel, convite, credenciais de IA (criação, rotação, revogação), mudança de plano, exportações, gerações de IA e acesso de suporte (sempre com consentimento registrado da organização).
