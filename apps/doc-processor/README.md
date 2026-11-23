# doc-processor

Sidecar Python (ADR-008). Recebe um documento (PDF), devolve texto por página/seção e chunks com metadados. **Nenhuma regra de negócio aqui.**

- Roda em contêiner isolado, sem acesso à rede interna, com limites de CPU, memória e tempo (`docs/10` §5).
- Verifica o tipo pelo conteúdo, não pela extensão; OCR só quando o PDF não tem texto.
- Contrato HTTP/fila a definir na Fase 2 (leitor de edital). Até lá este diretório só reserva o lugar.
